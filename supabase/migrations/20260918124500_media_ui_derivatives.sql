alter table public.media_assets
  add column if not exists ui_storage_path text,
  add column if not exists ui_mime_type text,
  add column if not exists ui_width integer,
  add column if not exists ui_height integer,
  add column if not exists ui_updated_at timestamptz;

create unique index if not exists media_bindings_one_active_target_idx
  on public.media_bindings (campaign_id, target_type, target_id, target_field)
  where is_active = true;

create or replace function public.set_media_ui_derivative_v1(
  p_asset_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_asset public.media_assets%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select *
  into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;

  if not found then
    raise exception 'media_asset_not_found';
  end if;

  if not private.can_manage_campaign(v_asset.campaign_id, v_user_id) then
    raise exception 'campaign_manage_denied';
  end if;

  if v_asset.profile <> 'tiny_icon' and v_asset.purpose <> 'icon' then
    raise exception 'media_ui_derivative_not_icon';
  end if;

  if p_storage_path is null
     or p_storage_path not like v_asset.campaign_id::text || '/' || v_user_id::text || '/%' then
    raise exception 'media_ui_derivative_path_denied';
  end if;

  if p_mime_type not in ('image/png', 'image/webp', 'image/jpeg') then
    raise exception 'media_ui_derivative_mime_invalid';
  end if;

  if greatest(coalesce(p_width, 0), coalesce(p_height, 0)) > 512
     or least(coalesce(p_width, 0), coalesce(p_height, 0)) < 1 then
    raise exception 'media_ui_derivative_dimensions_invalid';
  end if;

  update public.media_assets
  set ui_storage_path = p_storage_path,
      ui_mime_type = p_mime_type,
      ui_width = p_width,
      ui_height = p_height,
      ui_updated_at = now(),
      updated_at = now()
  where id = p_asset_id;

  return jsonb_build_object(
    'asset_id', p_asset_id,
    'ui_storage_path', p_storage_path,
    'ui_mime_type', p_mime_type,
    'ui_width', p_width,
    'ui_height', p_height
  );
end;
$function$;

revoke all on function public.set_media_ui_derivative_v1(uuid, text, text, integer, integer) from public;
grant execute on function public.set_media_ui_derivative_v1(uuid, text, text, integer, integer) to authenticated;

drop function if exists public.list_reference_media_v1(uuid);

create function public.list_reference_media_v1(p_campaign_id uuid)
returns table(
  target_field text,
  asset_id uuid,
  storage_path text,
  ui_storage_path text,
  ui_mime_type text,
  ui_width integer,
  ui_height integer,
  presentation jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    b.target_field,
    b.asset_id,
    a.storage_path,
    a.ui_storage_path,
    a.ui_mime_type,
    a.ui_width,
    a.ui_height,
    b.presentation
  from public.media_bindings b
  join public.media_assets a on a.id = b.asset_id
  where b.campaign_id = p_campaign_id
    and b.target_type = 'reference_art'
    and b.target_id = p_campaign_id
    and b.is_active = true
    and private.is_campaign_member(p_campaign_id, auth.uid())
    and private.can_read_media_asset(a.id, auth.uid());
$function$;

revoke all on function public.list_reference_media_v1(uuid) from public;
grant execute on function public.list_reference_media_v1(uuid) to authenticated;
