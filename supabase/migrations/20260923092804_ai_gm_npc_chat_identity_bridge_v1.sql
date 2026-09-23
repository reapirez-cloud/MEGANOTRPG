-- AI GM Stage 6: allow server-authorized NPC gameplay events to use
-- existing chat identity/card machinery without a manual chat_actor_binding.
-- Human-authored NPC chat keeps the existing binding requirement.

create or replace function private.npc_runtime_manager_claims_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_user_id is null then
    raise exception 'npc_runtime_manager_required';
  end if;

  perform set_config('meganot.ai_gm_runtime','on',true);
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub',p_user_id::text,
      'role','authenticated',
      'is_anonymous',false
    )::text,
    true
  );
end;
$function$;

create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_campaign_id uuid;
  v_role text;
  v_is_owner boolean;
  v_active_character_id uuid;
  v_can_manage boolean;
  v_actor_id uuid;
  v_runtime_user_id uuid;
  v_character public.characters%rowtype;
begin
  if current_setting('meganot.ai_gm_runtime', true) = 'on' then
    select r.campaign_id
      into v_campaign_id
    from public.chat_rooms r
    where r.id = new.room_id;

    v_runtime_user_id := coalesce(new.user_id, auth.uid());

    if v_campaign_id is null
       or v_runtime_user_id is null
       or not exists (
         select 1
         from public.campaign_members cm
         where cm.campaign_id = v_campaign_id
           and cm.user_id = v_runtime_user_id
           and (cm.is_owner = true or cm.role = 'gm')
       )
    then
      raise exception 'Invalid AI GM message identity';
    end if;

    new.user_id := v_runtime_user_id;
    new.client_id := v_runtime_user_id;

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

  if auth.uid() is null then
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
$function$;
