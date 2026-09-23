-- AI GM runtime Stage 1: durable in-game chat turns.
--
-- A player-authored PC message may reserve exactly one conversation_turn job.
-- The Edge Function processes that job asynchronously and publishes the result
-- back into the canonical chat as the campaign narrator. No player-facing RPC
-- can mint GM authority or publish narrator messages directly.

create unique index if not exists agent_jobs_game_chat_source_unique
  on public.agent_jobs ((input ->> 'source_chat_message_id'))
  where job_type = 'conversation_turn'
    and input ->> 'surface' = 'game_chat_v1'
    and input ? 'source_chat_message_id';

create or replace function private.reserve_ai_gm_chat_turn_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_source_chat_message_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.chat_messages%rowtype;
  v_room public.chat_rooms%rowtype;
  v_character public.characters%rowtype;
  v_manager_user_id uuid;
  v_job_id uuid;
  v_status text;
begin
  if p_campaign_id is null or p_user_id is null or p_source_chat_message_id is null then
    raise exception 'campaign, user and source message are required';
  end if;

  select *
    into v_message
  from public.chat_messages
  where id = p_source_chat_message_id;

  if v_message.id is null then
    raise exception 'source_chat_message_not_found';
  end if;

  if v_message.user_id is distinct from p_user_id then
    raise exception 'source_chat_message_not_owned';
  end if;

  if v_message.character_id is null then
    raise exception 'source_chat_message_requires_pc';
  end if;

  if v_message.event_kind is not null then
    raise exception 'stage1_text_message_required';
  end if;

  if nullif(btrim(v_message.body), '') is null then
    raise exception 'source_chat_message_empty';
  end if;

  select *
    into v_room
  from public.chat_rooms
  where id = v_message.room_id;

  if v_room.id is null or v_room.campaign_id <> p_campaign_id then
    raise exception 'source_chat_room_campaign_mismatch';
  end if;

  if v_room.category <> 'game'
     or v_room.room_state <> 'open'
     or v_room.is_read_only
     or v_room.scene_state <> 'active'
  then
    raise exception 'source_chat_room_not_active';
  end if;

  select *
    into v_character
  from public.characters
  where id = v_message.character_id
    and campaign_id = p_campaign_id;

  if v_character.id is null
     or v_character.character_type <> 'pc'
     or v_character.assigned_user_id is distinct from p_user_id
     or v_character.life_state <> 'alive'
  then
    raise exception 'source_chat_message_requires_owned_live_pc';
  end if;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
  ) then
    raise exception 'campaign_membership_required';
  end if;

  select cm.user_id
    into v_manager_user_id
  from public.campaign_members cm
  where cm.campaign_id = p_campaign_id
    and (cm.is_owner = true or cm.role = 'gm')
  order by cm.is_owner desc, cm.created_at asc
  limit 1;

  if v_manager_user_id is null then
    raise exception 'campaign_manager_required_for_ai_gm';
  end if;

  begin
    insert into public.agent_jobs (
      campaign_id,
      thread_id,
      requested_by,
      agent_key,
      job_type,
      status,
      input,
      result,
      requested_outputs,
      completed_outputs
    )
    values (
      p_campaign_id,
      null,
      p_user_id,
      'voss',
      'conversation_turn',
      'queued',
      jsonb_build_object(
        'surface', 'game_chat_v1',
        'source_chat_message_id', v_message.id::text,
        'room_id', v_message.room_id::text,
        'source_character_id', v_message.character_id::text,
        'request_user_id', p_user_id::text,
        'manager_user_id', v_manager_user_id::text,
        'original_message', v_message.body,
        'original_author_name', v_message.author_name,
        'room_title', v_room.title,
        'location_id', v_room.location_id,
        'campaign_day', v_room.campaign_day,
        'day_period', v_room.day_period,
        'source_created_at', v_message.created_at
      ),
      jsonb_build_object('surface', 'game_chat_v1'),
      1,
      0
    )
    returning id, status into v_job_id, v_status;
  exception
    when unique_violation then
      select j.id, j.status
        into v_job_id, v_status
      from public.agent_jobs j
      where j.job_type = 'conversation_turn'
        and j.campaign_id = p_campaign_id
        and j.input ->> 'surface' = 'game_chat_v1'
        and j.input ->> 'source_chat_message_id' = p_source_chat_message_id::text
      order by j.created_at desc
      limit 1;
  end;

  if v_job_id is null then
    raise exception 'ai_gm_turn_reservation_failed';
  end if;

  return jsonb_build_object(
    'job_id', v_job_id,
    'status', v_status,
    'room_id', v_message.room_id,
    'source_chat_message_id', v_message.id
  );
end;
$$;

revoke all on function private.reserve_ai_gm_chat_turn_v1(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function private.reserve_ai_gm_chat_turn_v1(uuid, uuid, bigint)
  to service_role;

-- Keep the normal authenticated chat identity rules intact. The only auth-less
-- insert accepted by this trigger is a service-role transaction explicitly
-- marked by private.publish_ai_gm_message_v1, and it still must name a real
-- campaign manager as the narrator owner.
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
         or new.character_id is not null
         or not exists (
           select 1
           from public.campaign_members cm
           where cm.campaign_id = v_campaign_id
             and cm.user_id = new.user_id
             and (cm.is_owner = true or cm.role = 'gm')
         )
      then
        raise exception 'Invalid AI GM narrator identity';
      end if;

      new.client_id := new.user_id;
      new.character_id := null;
      new.author_name := 'Рассказчик';
      new.author_avatar_url := null;
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

create or replace function private.publish_ai_gm_message_v1(
  p_job_id uuid,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_room_id uuid;
  v_manager_user_id uuid;
  v_existing_message_id bigint;
  v_message_id bigint;
begin
  if p_job_id is null or nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'job and body are required';
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

  v_room_id := nullif(v_job.input ->> 'room_id', '')::uuid;
  v_manager_user_id := nullif(v_job.input ->> 'manager_user_id', '')::uuid;

  if v_room_id is null or v_manager_user_id is null then
    raise exception 'ai_gm_turn_identity_missing';
  end if;

  if not exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id = r.campaign_id
     and cm.user_id = v_manager_user_id
    where r.id = v_room_id
      and r.campaign_id = v_job.campaign_id
      and r.category = 'game'
      and r.room_state = 'open'
      and r.is_read_only = false
      and r.scene_state = 'active'
      and (cm.is_owner = true or cm.role = 'gm')
  ) then
    raise exception 'ai_gm_turn_manager_or_room_invalid';
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
    v_room_id,
    v_manager_user_id,
    v_manager_user_id,
    null,
    'Рассказчик',
    left(btrim(p_body), 4000)
  )
  returning id into v_message_id;

  update public.agent_jobs
  set result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'reply_message_id', v_message_id
      ),
      updated_at = now()
  where id = p_job_id;

  return v_message_id;
end;
$$;

revoke all on function private.publish_ai_gm_message_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function private.publish_ai_gm_message_v1(uuid, text)
  to service_role;

comment on function private.reserve_ai_gm_chat_turn_v1(uuid, uuid, bigint)
  is 'Stage 1 AI GM runtime: atomically reserves one durable GM turn per player-authored PC chat message.';
comment on function private.publish_ai_gm_message_v1(uuid, text)
  is 'Stage 1 AI GM runtime: service-role-only idempotent narrator publication for a reserved GM turn.';
