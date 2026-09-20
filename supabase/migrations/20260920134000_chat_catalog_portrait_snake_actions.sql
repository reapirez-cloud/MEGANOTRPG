begin;

create or replace function public.delete_game_scene_v1(
  p_room_id uuid,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.chat_rooms%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'larisa'
       or v_existing.command_kind <> 'world.scene_delete'
       or v_existing.aggregate_id <> p_room_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select *
  into v_room
  from public.chat_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Scene not found';
  end if;

  if v_room.room_type <> 'scene' then
    raise exception 'Only scene rooms can be deleted';
  end if;

  if not private.can_manage_campaign(v_room.campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  v_result := jsonb_build_object(
    'roomId', v_room.id,
    'campaignId', v_room.campaign_id,
    'locationId', v_room.location_id,
    'title', v_room.title
  );

  delete from public.chat_rooms
  where id = v_room.id
    and room_type = 'scene';

  insert into public.engine_command_receipts(
    command_id,
    campaign_id,
    engine,
    command_kind,
    aggregate_id,
    result,
    created_by
  ) values (
    p_command_id,
    v_room.campaign_id,
    'larisa',
    'world.scene_delete',
    v_room.id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.delete_game_scene_v1(uuid, uuid)
from public, anon;
grant execute on function public.delete_game_scene_v1(uuid, uuid)
to authenticated;

create or replace function public.bind_chat_room_preview_upload_v1(
  p_room_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_presentation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.chat_rooms%rowtype;
  v_user_id uuid := auth.uid();
  v_asset_id uuid;
  v_binding_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select *
  into v_room
  from public.chat_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'chat_room_not_found';
  end if;

  if v_room.room_type not in ('character', 'scene') then
    raise exception 'chat_preview_target_not_supported';
  end if;

  if not private.can_manage_campaign(v_room.campaign_id, v_user_id) then
    raise exception 'campaign_manage_denied';
  end if;

  if p_storage_path is null
     or p_storage_path not like v_room.campaign_id::text || '/' || v_user_id::text || '/%' then
    raise exception 'chat_preview_path_denied';
  end if;

  if not private.is_valid_media_presentation(coalesce(p_presentation, '{}'::jsonb)) then
    raise exception 'media_presentation_invalid';
  end if;

  v_asset_id := public.register_manual_media_v1(
    v_room.campaign_id,
    p_storage_path,
    p_mime_type,
    p_width,
    p_height,
    'ui_preview',
    'ui_preview'
  );

  update public.media_bindings
  set is_active = false
  where campaign_id = v_room.campaign_id
    and target_type = 'chat_room'
    and target_id = v_room.id
    and target_field = 'preview'
    and is_active = true;

  insert into public.media_bindings(
    campaign_id,
    asset_id,
    target_type,
    target_id,
    target_field,
    created_by,
    is_active,
    presentation
  ) values (
    v_room.campaign_id,
    v_asset_id,
    'chat_room',
    v_room.id,
    'preview',
    v_user_id,
    true,
    coalesce(p_presentation, '{}'::jsonb)
  )
  returning id into v_binding_id;

  update public.media_assets
  set status = 'attached',
      attached_at = coalesce(attached_at, now()),
      saved_at = coalesce(saved_at, now()),
      expires_at = null,
      garbage_marked_at = null,
      updated_at = now()
  where id = v_asset_id;

  update public.chat_rooms
  set avatar_url = p_storage_path,
      updated_at = now()
  where id = v_room.id;

  return jsonb_build_object(
    'bindingId', v_binding_id,
    'assetId', v_asset_id,
    'roomId', v_room.id,
    'storagePath', p_storage_path,
    'presentation', coalesce(p_presentation, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.bind_chat_room_preview_upload_v1(
  uuid, text, text, integer, integer, jsonb
) from public, anon;
grant execute on function public.bind_chat_room_preview_upload_v1(
  uuid, text, text, integer, integer, jsonb
) to authenticated;

create or replace function public.list_chat_room_preview_media_v1(
  p_campaign_id uuid
)
returns table(
  room_id uuid,
  asset_id uuid,
  storage_path text,
  presentation jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    b.target_id as room_id,
    b.asset_id,
    a.storage_path,
    b.presentation
  from public.media_bindings b
  join public.media_assets a
    on a.id = b.asset_id
  join public.chat_rooms r
    on r.id = b.target_id
   and r.campaign_id = b.campaign_id
  where b.campaign_id = p_campaign_id
    and b.target_type = 'chat_room'
    and b.target_field = 'preview'
    and b.is_active = true
    and private.can_read_chat_room(r.id, auth.uid())
    and private.can_read_media_asset(a.id, auth.uid());
$function$;

revoke all on function public.list_chat_room_preview_media_v1(uuid)
from public, anon;
grant execute on function public.list_chat_room_preview_media_v1(uuid)
to authenticated;

commit;
