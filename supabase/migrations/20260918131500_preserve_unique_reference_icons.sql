drop function if exists public.set_media_ui_derivative_v1(uuid, text, text, integer, integer);

drop function if exists public.list_reference_media_v1(uuid);

create function public.list_reference_media_v1(p_campaign_id uuid)
returns table(
  target_field text,
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
    b.target_field,
    b.asset_id,
    a.storage_path,
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

alter table public.media_assets
  drop column if exists ui_storage_path,
  drop column if exists ui_mime_type,
  drop column if exists ui_width,
  drop column if exists ui_height,
  drop column if exists ui_updated_at;
