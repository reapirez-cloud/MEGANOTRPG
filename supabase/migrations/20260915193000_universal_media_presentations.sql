begin;

alter table public.media_bindings
  add column if not exists presentation jsonb not null default '{}'::jsonb;

create or replace function private.is_valid_media_presentation(
  p_presentation jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_shape text;
  v_aspect numeric;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
begin
  if p_presentation is null or jsonb_typeof(p_presentation) <> 'object' then
    return false;
  end if;

  if p_presentation = '{}'::jsonb then
    return true;
  end if;

  if p_presentation->>'version' <> '1' then
    return false;
  end if;

  v_shape := p_presentation->>'shape';
  if v_shape not in ('rect', 'square', 'circle') then
    return false;
  end if;

  if jsonb_typeof(p_presentation->'aspectRatio') <> 'number'
     or jsonb_typeof(p_presentation->'crop') <> 'object'
     or jsonb_typeof(p_presentation->'crop'->'x') <> 'number'
     or jsonb_typeof(p_presentation->'crop'->'y') <> 'number'
     or jsonb_typeof(p_presentation->'crop'->'width') <> 'number'
     or jsonb_typeof(p_presentation->'crop'->'height') <> 'number' then
    return false;
  end if;

  begin
    v_aspect := (p_presentation->>'aspectRatio')::numeric;
    v_x := (p_presentation->'crop'->>'x')::numeric;
    v_y := (p_presentation->'crop'->>'y')::numeric;
    v_width := (p_presentation->'crop'->>'width')::numeric;
    v_height := (p_presentation->'crop'->>'height')::numeric;
  exception when others then
    return false;
  end;

  if v_aspect <= 0 or v_aspect > 12
     or v_x < 0 or v_y < 0
     or v_width <= 0 or v_height <= 0
     or v_width > 1 or v_height > 1
     or v_x + v_width > 1.000001
     or v_y + v_height > 1.000001 then
    return false;
  end if;

  if v_shape in ('square', 'circle') and abs(v_aspect - 1) > 0.001 then
    return false;
  end if;

  return true;
end;
$$;

alter table public.media_bindings
  drop constraint if exists media_bindings_presentation_check;

alter table public.media_bindings
  add constraint media_bindings_presentation_check
  check (private.is_valid_media_presentation(presentation));

create or replace function public.register_manual_media_v1(
  p_campaign_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_purpose text default 'portrait',
  p_profile text default 'portrait'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.is_campaign_member(p_campaign_id, v_user_id) then
    raise exception 'campaign_access_denied';
  end if;

  if p_storage_path is null
     or p_storage_path not like p_campaign_id::text || '/' || v_user_id::text || '/%' then
    raise exception 'manual_media_path_denied';
  end if;

  if p_purpose not in ('icon','ui_preview','portrait','panel','hero_art','master_art')
     or p_profile not in ('tiny_icon','ui_preview','portrait','panel','hero_art','master_art') then
    raise exception 'manual_media_profile_invalid';
  end if;

  select id into v_asset_id
  from public.media_assets
  where storage_path = p_storage_path;

  if found then
    if not exists (
      select 1
      from public.media_assets a
      where a.id = v_asset_id
        and a.campaign_id = p_campaign_id
        and a.created_by = v_user_id
    ) then
      raise exception 'manual_media_path_in_use';
    end if;
    return v_asset_id;
  end if;

  insert into public.media_assets (
    campaign_id, created_by, provider_key, model_key, purpose, profile, status,
    storage_bucket, storage_path, mime_type, width, height, variant_index, prompt,
    review, saved_at, expires_at
  ) values (
    p_campaign_id, v_user_id, 'manual-upload', 'meganot-media-player',
    p_purpose, p_profile, 'reviewed', 'campaign-media', p_storage_path,
    case
      when p_mime_type in ('image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif')
        then p_mime_type
      else 'image/webp'
    end,
    greatest(1, coalesce(p_width, 1)),
    greatest(1, coalesce(p_height, 1)),
    1, '',
    jsonb_build_object('source', 'snake_media_player', 'manual_upload', true),
    now(), null
  )
  returning id into v_asset_id;

  return v_asset_id;
end;
$$;

create or replace function public.bind_media_presentation_v1(
  p_asset_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_field text,
  p_presentation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_user_id uuid := auth.uid();
  v_binding_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.is_valid_media_presentation(coalesce(p_presentation, '{}'::jsonb)) then
    raise exception 'media_presentation_invalid';
  end if;

  select * into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;

  if not found then
    raise exception 'media_asset_not_found';
  end if;

  if not private.can_read_media_asset(v_asset.id, v_user_id) then
    raise exception 'media_asset_access_denied';
  end if;

  if not private.can_attach_media_target(
    v_asset.campaign_id, v_user_id, p_target_type, p_target_id, p_target_field
  ) then
    raise exception 'media_attach_denied';
  end if;

  update public.media_bindings
  set is_active = false
  where campaign_id = v_asset.campaign_id
    and target_type = p_target_type
    and target_id = p_target_id
    and target_field = p_target_field
    and is_active = true;

  insert into public.media_bindings (
    campaign_id, asset_id, target_type, target_id, target_field,
    created_by, is_active, presentation
  ) values (
    v_asset.campaign_id, v_asset.id, p_target_type, p_target_id, p_target_field,
    v_user_id, true, coalesce(p_presentation, '{}'::jsonb)
  )
  returning id into v_binding_id;

  update public.media_assets
  set status = 'attached',
      attached_at = coalesce(attached_at, now()),
      saved_at = coalesce(saved_at, now()),
      expires_at = null,
      garbage_marked_at = null,
      updated_at = now()
  where id = v_asset.id;

  return jsonb_build_object(
    'binding_id', v_binding_id,
    'asset_id', v_asset.id,
    'storage_path', v_asset.storage_path,
    'presentation', coalesce(p_presentation, '{}'::jsonb)
  );
end;
$$;

create or replace function public.list_character_media_presentations_v1(
  p_campaign_id uuid
)
returns table(
  character_id uuid,
  target_field text,
  asset_id uuid,
  storage_path text,
  presentation jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.target_id,
    b.target_field,
    b.asset_id,
    a.storage_path,
    b.presentation
  from public.media_bindings b
  join public.media_assets a on a.id = b.asset_id
  where b.campaign_id = p_campaign_id
    and b.target_type = 'character'
    and b.target_field in ('avatar', 'avatar_url', 'panel_avatar')
    and b.is_active = true
    and private.is_campaign_member(p_campaign_id, auth.uid())
    and private.can_read_media_asset(a.id, auth.uid());
$$;

revoke all on function public.register_manual_media_v1(uuid,text,text,integer,integer,text,text)
from public, anon;
grant execute on function public.register_manual_media_v1(uuid,text,text,integer,integer,text,text)
to authenticated;

revoke all on function public.bind_media_presentation_v1(uuid,text,uuid,text,jsonb)
from public, anon;
grant execute on function public.bind_media_presentation_v1(uuid,text,uuid,text,jsonb)
to authenticated;

revoke all on function public.list_character_media_presentations_v1(uuid)
from public, anon;
grant execute on function public.list_character_media_presentations_v1(uuid)
to authenticated;

commit;
