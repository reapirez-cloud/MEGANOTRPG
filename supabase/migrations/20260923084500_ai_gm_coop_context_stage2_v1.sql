-- AI GM runtime Stage 2: cooperative scene awareness and canonical NPC interjections.
--
-- This keeps the Stage 1 service-role boundary, but allows the runtime to publish
-- exactly one canonical NPC interjection when that NPC is physically present
-- with the source player character. Player-facing callers still cannot invoke
-- either publication RPC directly.

create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_role text;
  v_is_owner boolean;
  v_active_character_id uuid;
  v_can_manage boolean;
  v_actor_id uuid;
  v_character public.characters%rowtype;
begin
  if auth.uid() is null then
    if current_setting('meganot.ai_gm_runtime', true) = 'on' then
      select r.campaign_id
        into v_campaign_id
      from public.chat_rooms r
      where r.id = new.room_id;

      if v_campaign_id is null
         or new.user_id is null
         or not exists (
           select 1
           from public.campaign_members cm
           where cm.campaign_id = v_campaign_id
             and cm.user_id = new.user_id
             and (cm.is_owner = true or cm.role = 'gm')
         )
      then
        raise exception 'Invalid AI GM message identity';
      end if;

      new.client_id := new.user_id;

      if new.character_id is null then
        new.author_name := 'Рассказчик';
        new.author_avatar_url := null;
        return new;
      end if;

      select c.*
        into v_character
      from public.characters c
      where c.id = new.character_id
        and c.campaign_id = v_campaign_id
        and c.character_type = 'npc'
        and c.life_state = 'alive'
        and c.publication_state = 'campaign';

      if v_character.id is null then
        raise exception 'Invalid AI GM NPC identity';
      end if;

      new.character_id := v_character.id;
      new.author_name := v_character.name;
      new.author_avatar_url := v_character.avatar_url;
      return new;
    end if;

    raise exception 'Authentication required';
  end if;

  select r.campaign_id, cm.role, cm.is_owner, cm.active_character_id
    into v_campaign_id, v_role, v_is_owner, v_active_character_id
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  where r.id = new.room_id;

  if v_campaign_id is null then
    raise exception 'Campaign membership required';
  end if;

  v_can_manage := v_is_owner or v_role = 'gm';

  if v_can_manage then
    new.user_id := auth.uid();
    new.client_id := auth.uid();

    if new.character_id is null then
      new.character_id := null;
      new.author_name := 'Рассказчик';
      new.author_avatar_url := null;
      return new;
    end if;

    select c.*
      into v_character
    from public.characters c
    where c.id = new.character_id
      and c.campaign_id = v_campaign_id
      and c.life_state = 'alive';

    if v_character.id is null then
      raise exception 'This character is not available as your chat actor';
    end if;

    if v_role = 'player'
       and v_character.character_type = 'pc'
       and v_character.assigned_user_id = auth.uid()
       and (
         v_active_character_id = v_character.id
         or exists (
           select 1
           from public.chat_rooms r
           where r.id = new.room_id
             and r.room_type = 'character'
             and r.character_id = v_character.id
         )
       )
    then
      new.character_id := v_character.id;
      new.author_name := v_character.name;
      new.author_avatar_url := v_character.avatar_url;
      return new;
    end if;

    if v_character.character_type = 'npc'
       and exists (
         select 1
         from public.chat_actor_bindings cab
         where cab.campaign_id = v_campaign_id
           and cab.user_id = auth.uid()
           and cab.character_id = v_character.id
       )
    then
      new.character_id := v_character.id;
      new.author_name := v_character.name;
      new.author_avatar_url := v_character.avatar_url;
      return new;
    end if;

    raise exception 'This character is not available as your chat actor';
  end if;

  v_actor_id := private.chat_player_actor_for_room(new.room_id, auth.uid());

  if v_actor_id is null then
    raise exception 'Your active character cannot act in this chat';
  end if;

  if new.character_id is not null and new.character_id <> v_actor_id then
    raise exception 'This character is not available as your chat actor';
  end if;

  select c.*
    into v_character
  from public.characters c
  where c.id = v_actor_id;

  new.user_id := auth.uid();
  new.client_id := auth.uid();
  new.character_id := v_character.id;
  new.author_name := v_character.name;
  new.author_avatar_url := v_character.avatar_url;
  return new;
end;
$$;

create or replace function public.publish_ai_gm_npc_message_v2(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_room public.chat_rooms%rowtype;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_npc_location_id uuid;
  v_existing_message_id bigint;
  v_message_id bigint;
begin
  if p_job_id is null
     or p_npc_character_id is null
     or nullif(btrim(coalesce(p_body, '')), '') is null
  then
    raise exception 'job, npc and body are required';
  end if;

  select *
    into v_job
  from public.agent_jobs
  where id = p_job_id
    and job_type = 'conversation_turn'
    and input ->> 'surface' = 'game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  v_existing_message_id :=
    nullif(v_job.result ->> 'reply_message_id', '')::bigint;

  if v_existing_message_id is not null then
    return v_existing_message_id;
  end if;

  if v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  select *
    into v_room
  from public.chat_rooms r
  where r.id = nullif(v_job.input ->> 'room_id', '')::uuid
    and r.campaign_id = v_job.campaign_id;

  v_manager_user_id := nullif(v_job.input ->> 'manager_user_id', '')::uuid;
  v_source_character_id :=
    nullif(v_job.input ->> 'source_character_id', '')::uuid;

  if v_room.id is null
     or v_manager_user_id is null
     or v_source_character_id is null
  then
    raise exception 'ai_gm_turn_identity_missing';
  end if;

  if v_room.category <> 'game'
     or v_room.room_state <> 'open'
     or v_room.is_read_only
     or v_room.scene_state <> 'active'
     or not exists (
       select 1
       from public.campaign_members cm
       where cm.campaign_id = v_job.campaign_id
         and cm.user_id = v_manager_user_id
         and (cm.is_owner = true or cm.role = 'gm')
     )
  then
    raise exception 'ai_gm_turn_manager_or_room_invalid';
  end if;

  select cws.location_id
    into v_source_location_id
  from public.character_world_state cws
  where cws.campaign_id = v_job.campaign_id
    and cws.character_id = v_source_character_id;

  v_source_location_id := coalesce(v_source_location_id, v_room.location_id);

  if v_source_location_id is null then
    raise exception 'ai_gm_source_location_unknown';
  end if;

  select cws.location_id
    into v_npc_location_id
  from public.character_world_state cws
  join public.characters c
    on c.id = cws.character_id
   and c.campaign_id = cws.campaign_id
  where cws.campaign_id = v_job.campaign_id
    and cws.character_id = p_npc_character_id
    and c.character_type = 'npc'
    and c.life_state = 'alive'
    and c.publication_state = 'campaign';

  if v_npc_location_id is null
     or v_npc_location_id <> v_source_location_id
  then
    raise exception 'ai_gm_npc_not_present_with_source_character';
  end if;

  perform set_config('meganot.ai_gm_runtime', 'on', true);

  insert into public.chat_messages (
    room_id,
    client_id,
    user_id,
    character_id,
    author_name,
    body
  )
  values (
    v_room.id,
    v_manager_user_id,
    v_manager_user_id,
    p_npc_character_id,
    'NPC',
    left(btrim(p_body), 4000)
  )
  returning id into v_message_id;

  update public.agent_jobs
  set result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'reply_message_id', v_message_id,
        'reply_character_id', p_npc_character_id,
        'reply_kind', 'npc_interjection'
      ),
      updated_at = now()
  where id = p_job_id;

  return v_message_id;
end;
$$;

revoke all on function public.publish_ai_gm_npc_message_v2(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_ai_gm_npc_message_v2(uuid, uuid, text)
  to service_role;

comment on function public.publish_ai_gm_npc_message_v2(uuid, uuid, text)
  is 'Stage 2 cooperative AI GM: service-role-only canonical NPC interjection; NPC must be alive and physically co-located with the source PC.';
