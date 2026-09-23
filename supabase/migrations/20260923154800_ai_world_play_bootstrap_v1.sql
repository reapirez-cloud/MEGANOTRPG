-- Experimental AI world: first playable character bootstrap.

create or replace function public.open_ai_world_slot_v2(
  p_slot_id uuid
)
returns table(
  campaign_id uuid,
  role text,
  is_owner boolean,
  active_character_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.ai_world_slots%rowtype;
  v_campaign_id uuid;
  v_title text;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if p_slot_id is null then raise exception 'slot_required'; end if;

  select * into v_slot
  from public.ai_world_slots s
  where s.id = p_slot_id
    and s.owner_user_id = v_user_id
  for update;

  if v_slot.id is null then raise exception 'ai_world_slot_not_found'; end if;

  v_title := coalesce(
    nullif(btrim(v_slot.name), ''),
    'ИИ мир · Слот ' || lpad(v_slot.slot_index::text, 2, '0')
  );
  v_campaign_id := v_slot.campaign_id;

  if v_campaign_id is null then
    insert into public.campaigns(slug,title,summary,rules_summary)
    values(
      'ai-world-' || replace(v_slot.id::text, '-', ''),
      v_title,
      '',
      ''
    )
    returning id into v_campaign_id;

    update public.ai_world_slots
    set campaign_id = v_campaign_id,
        updated_at = now()
    where id = v_slot.id;
  else
    update public.campaigns
    set title = v_title
    where id = v_campaign_id;
  end if;

  insert into public.campaign_members(campaign_id,user_id,role,is_owner)
  values(v_campaign_id,v_user_id,'player',true)
  on conflict(campaign_id,user_id) do update set
    role = 'player',
    is_owner = true;

  return query
  select cm.campaign_id,cm.role,cm.is_owner,cm.active_character_id
  from public.campaign_members cm
  where cm.campaign_id = v_campaign_id
    and cm.user_id = v_user_id;
end;
$$;

create or replace function public.create_ai_world_player_character_v1(
  p_campaign_id uuid,
  p_name text,
  p_class_template_id uuid,
  p_level integer default 1,
  p_bio text default ''
)
returns table(
  character_id uuid,
  room_id uuid,
  active_character_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.ai_world_slots%rowtype;
  v_class public.rule_templates%rowtype;
  v_character_id uuid;
  v_room_id uuid;
  v_level integer := greatest(1, least(coalesce(p_level,1),30));
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if p_campaign_id is null then raise exception 'campaign_required'; end if;

  select * into v_slot
  from public.ai_world_slots s
  where s.campaign_id = p_campaign_id
    and s.owner_user_id = v_user_id
  for update;

  if v_slot.id is null then raise exception 'ai_world_owner_required'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception 'character_name_required';
  end if;
  if char_length(btrim(p_name)) > 120 then
    raise exception 'character_name_too_long';
  end if;

  select * into v_class
  from public.rule_templates t
  where t.id = p_class_template_id
    and t.campaign_id = p_campaign_id
    and t.kind = 'class'
    and t.is_active = true;

  if v_class.id is null then raise exception 'ai_world_class_required'; end if;

  update public.campaign_members
  set role='player',is_owner=true
  where campaign_id=p_campaign_id and user_id=v_user_id;

  if not found then raise exception 'campaign_membership_required'; end if;

  v_character_id := public.create_campaign_character_v2(
    p_campaign_id,
    btrim(p_name),
    v_class.name,
    v_level,
    btrim(coalesce(p_bio,'')),
    null,
    v_user_id,
    'pc',
    'campaign',
    'always'
  );

  perform public.assign_character_template_v2(
    v_character_id,
    v_class.id,
    v_level,
    '{}'::jsonb
  );

  perform public.set_campaign_active_character(
    p_campaign_id,
    v_user_id,
    v_character_id
  );

  select r.id into v_room_id
  from public.chat_rooms r
  where r.campaign_id=p_campaign_id
    and r.character_id=v_character_id
    and r.room_type='character'
  order by r.created_at
  limit 1;

  if v_room_id is null then
    v_room_id := private.ensure_character_chat_room(v_character_id);
  end if;
  if v_room_id is null then raise exception 'ai_world_character_room_missing'; end if;

  return query select v_character_id,v_room_id,v_character_id;
end;
$$;

revoke all on function public.create_ai_world_player_character_v1(
  uuid,text,uuid,integer,text
) from public,anon;
grant execute on function public.create_ai_world_player_character_v1(
  uuid,text,uuid,integer,text
) to authenticated;

comment on function public.create_ai_world_player_character_v1(
  uuid,text,uuid,integer,text
) is
  'Atomic first-player bootstrap for an owned experimental AI world: published PC, class runtime, active character and personal game room.';
