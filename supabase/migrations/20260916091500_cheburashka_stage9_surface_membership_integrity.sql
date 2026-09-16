-- Stage 9 integrity closure for scene membership ↔ selected Surface access.
-- Membership is current physical scene presence. Selected Surface access cannot
-- silently outlive that presence.

create or replace function private.validate_scene_participant_surface_access_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_room_id uuid;
  v_surface_id uuid;
begin
  for v_room_id in
    select distinct room_id
    from (
      values
        (case when tg_op <> 'INSERT' then old.room_id end),
        (case when tg_op <> 'DELETE' then new.room_id end)
    ) rooms(room_id)
    where room_id is not null
  loop
    for v_surface_id in
      select s.id from public.scene_surfaces s where s.room_id=v_room_id
    loop
      perform private.assert_scene_surface_v1(v_surface_id);
    end loop;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;
revoke execute on function private.validate_scene_participant_surface_access_v1()
from public,anon,authenticated;

drop trigger if exists scene_participants_validate_surface_access
on public.scene_participants;
create constraint trigger scene_participants_validate_surface_access
after insert or update or delete on public.scene_participants
deferrable initially deferred
for each row execute function private.validate_scene_participant_surface_access_v1();

create or replace function public.move_character_to_scene_v1(
  p_character_id uuid,
  p_room_id uuid,
  p_sync_location boolean default true,
  p_sync_time boolean default true,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_room public.chat_rooms%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if p_room_id is not null then
    select * into v_room from public.chat_rooms
    where id=p_room_id and campaign_id=v_campaign_id and room_type='scene' and scene_state='active';
    if not found then raise exception 'Target active scene not found'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('scene-character:'||p_character_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'larisa'
       or v_existing.command_kind<>'world.scene_move_character'
       or v_existing.aggregate_id<>p_character_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  delete from public.scene_surface_character_access access
  using public.scene_surfaces surface, public.scene_participants participant
  where access.surface_id=surface.id
    and participant.room_id=surface.room_id
    and participant.character_id=access.character_id
    and participant.character_id=p_character_id
    and surface.campaign_id=v_campaign_id
    and (p_room_id is null or surface.room_id<>p_room_id);

  delete from public.scene_participants p
  using public.chat_rooms r
  where p.room_id=r.id
    and p.character_id=p_character_id
    and r.campaign_id=v_campaign_id
    and r.room_type='scene';

  if p_room_id is not null then
    insert into public.scene_participants(room_id,character_id,added_by)
    values(p_room_id,p_character_id,auth.uid());

    if p_sync_location or p_sync_time then
      insert into public.character_world_state(
        character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by
      )
      values(
        p_character_id,v_campaign_id,
        case when p_sync_location then v_room.location_id else null end,
        case when p_sync_time then v_room.campaign_day else 1 end,
        case when p_sync_time then v_room.day_period else 'day' end,
        now(),auth.uid()
      )
      on conflict(character_id) do update set
        location_id=case when p_sync_location then v_room.location_id else public.character_world_state.location_id end,
        campaign_day=case when p_sync_time then v_room.campaign_day else public.character_world_state.campaign_day end,
        day_period=case when p_sync_time then v_room.day_period else public.character_world_state.day_period end,
        updated_at=now(),updated_by=auth.uid();
    end if;
  end if;

  v_result := jsonb_build_object(
    'characterId',p_character_id,
    'roomId',p_room_id,
    'locationId',case when p_room_id is null then null else v_room.location_id end
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign_id,'larisa','world.scene_move_character',
    p_character_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;

create or replace function public.set_scene_participants(
  p_room_id uuid,
  p_character_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
  from public.chat_rooms
  where id=p_room_id and room_type='scene' and scene_state='active';

  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if exists(
    select 1
    from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id)
    left join public.characters c on c.id=x.id and c.campaign_id=v_campaign_id
    where c.id is null
  ) then raise exception 'Participant belongs to another campaign'; end if;

  -- Remove selected-access grants when a character leaves either the target
  -- scene or another scene they are being moved out of.
  delete from public.scene_surface_character_access access
  using public.scene_surfaces surface, public.scene_participants participant
  where access.surface_id=surface.id
    and participant.room_id=surface.room_id
    and participant.character_id=access.character_id
    and surface.campaign_id=v_campaign_id
    and (
      (surface.room_id=p_room_id
       and not (participant.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))))
      or
      (surface.room_id<>p_room_id
       and participant.character_id=any(coalesce(p_character_ids,'{}'::uuid[])))
    );

  delete from public.scene_participants p
  using public.chat_rooms r
  where p.room_id=r.id
    and r.campaign_id=v_campaign_id
    and r.room_type='scene'
    and p.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
    and p.room_id<>p_room_id;

  delete from public.scene_participants where room_id=p_room_id;

  insert into public.scene_participants(room_id,character_id,added_by)
  select p_room_id,x.id,auth.uid()
  from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id)
  on conflict do nothing;
end;
$function$;

create or replace function public.set_chat_room_state(p_room_id uuid,p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_room_type text;
begin
  if p_state not in ('open','gm_only','closed') then raise exception 'Unsupported room state'; end if;
  select campaign_id,room_type into v_campaign_id,v_room_type
  from public.chat_rooms where id=p_room_id;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;

  update public.chat_rooms
  set room_state=p_state,
      closed_at=case when p_state='closed' then now() else null end,
      scene_state=case
        when room_type='scene' and p_state='closed' then 'closed'
        when room_type='scene' then 'active'
        else scene_state
      end,
      updated_at=now()
  where id=p_room_id;

  if v_room_type='scene' and p_state='closed' then
    delete from public.scene_surface_character_access access
    using public.scene_surfaces surface
    where access.surface_id=surface.id and surface.room_id=p_room_id;

    delete from public.scene_participants where room_id=p_room_id;
  end if;
end;
$function$;
