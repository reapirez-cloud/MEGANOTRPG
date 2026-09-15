begin;

alter table public.campaign_art_items
  add column if not exists asset_id uuid null references public.media_assets(id) on delete set null;

create index if not exists campaign_art_items_asset_idx
  on public.campaign_art_items(asset_id)
  where asset_id is not null;

create or replace function public.register_system_media_v1(
  p_campaign_id uuid,
  p_art_item_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_width integer,
  p_height integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.campaign_art_items%rowtype;
  v_asset_id uuid;
begin
  if auth.uid() is null
     or not private.is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'owner_required';
  end if;

  select * into v_item
  from public.campaign_art_items
  where id = p_art_item_id
    and campaign_id = p_campaign_id
    and collection = 'system'
  for update;

  if not found then
    raise exception 'system_media_item_not_found';
  end if;

  if v_item.uploaded_by is distinct from auth.uid() then
    raise exception 'system_media_owner_required';
  end if;

  if v_item.image_url <> p_storage_path then
    raise exception 'system_media_path_mismatch';
  end if;

  if v_item.asset_id is not null then
    return v_item.asset_id;
  end if;

  insert into public.media_assets (
    campaign_id,
    created_by,
    provider_key,
    model_key,
    purpose,
    profile,
    status,
    storage_bucket,
    storage_path,
    mime_type,
    width,
    height,
    variant_index,
    prompt,
    review,
    attached_at,
    saved_at,
    expires_at
  ) values (
    p_campaign_id,
    auth.uid(),
    'manual-upload',
    'system-library',
    'master_art',
    'master_art',
    'attached',
    'campaign-media',
    p_storage_path,
    case
      when p_mime_type in ('image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif')
        then p_mime_type
      else 'image/webp'
    end,
    greatest(1, coalesce(p_width, 1)),
    greatest(1, coalesce(p_height, 1)),
    1,
    '',
    jsonb_build_object('source', 'system_materials', 'manual_upload', true),
    now(),
    now(),
    null
  )
  returning id into v_asset_id;

  update public.campaign_art_items
  set asset_id = v_asset_id,
      updated_at = now()
  where id = v_item.id;

  insert into public.media_bindings (
    campaign_id,
    asset_id,
    target_type,
    target_id,
    target_field,
    created_by,
    is_active
  ) values (
    p_campaign_id,
    v_asset_id,
    'campaign_art',
    v_item.id,
    'source',
    auth.uid(),
    true
  );

  return v_asset_id;
end;
$$;

revoke all on function public.register_system_media_v1(uuid,uuid,text,text,integer,integer)
from public, anon;
grant execute on function public.register_system_media_v1(uuid,uuid,text,text,integer,integer)
to authenticated;

create or replace function public.delete_system_media_v1(
  p_art_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.campaign_art_items%rowtype;
  v_asset public.media_assets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  select * into v_item
  from public.campaign_art_items
  where id = p_art_item_id
    and collection = 'system'
  for update;

  if not found then
    raise exception 'system_media_item_not_found';
  end if;

  if not private.is_campaign_owner(v_item.campaign_id, auth.uid()) then
    raise exception 'owner_required';
  end if;

  if v_item.asset_id is not null then
    select * into v_asset
    from public.media_assets
    where id = v_item.asset_id;

    if exists (
      select 1
      from public.media_bindings b
      where b.asset_id = v_item.asset_id
        and b.is_active = true
        and not (
          b.target_type = 'campaign_art'
          and b.target_id = v_item.id
          and b.target_field = 'source'
        )
    ) then
      raise exception 'system_media_in_use';
    end if;

    delete from public.media_assets where id = v_item.asset_id;
  end if;

  delete from public.campaign_art_items where id = v_item.id;

  return jsonb_build_object(
    'deleted', true,
    'art_item_id', v_item.id,
    'asset_id', v_item.asset_id,
    'storage_bucket', 'campaign-media',
    'storage_path', v_item.image_url
  );
end;
$$;

revoke all on function public.delete_system_media_v1(uuid) from public, anon;
grant execute on function public.delete_system_media_v1(uuid) to authenticated;

create or replace function public.attach_system_media_v1(
  p_asset_id uuid,
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_field text,
  p_title text default '',
  p_caption text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_source public.campaign_art_items%rowtype;
  v_binding_id uuid;
  v_canonical_target_id uuid := p_target_id;
  v_collection text := 'world';
begin
  if p_user_id is null then
    raise exception 'authentication_required';
  end if;

  select * into v_asset
  from public.media_assets
  where id = p_asset_id;

  if not found then
    raise exception 'media_asset_not_found';
  end if;

  select * into v_source
  from public.campaign_art_items
  where campaign_id = v_asset.campaign_id
    and collection = 'system'
    and asset_id = v_asset.id
  limit 1;

  if not found then
    raise exception 'system_media_source_required';
  end if;

  if not private.is_campaign_owner(v_asset.campaign_id, p_user_id) then
    raise exception 'owner_required';
  end if;

  if p_target_type = 'campaign_gallery' then
    if not private.can_attach_media_target(
      v_asset.campaign_id,
      p_user_id,
      'campaign_gallery',
      p_target_id,
      'image'
    ) then
      raise exception 'media_attach_denied';
    end if;

    if p_target_id is not null then
      select case when c.character_type = 'npc' then 'npc' else 'player' end
        into v_collection
      from public.characters c
      where c.id = p_target_id
        and c.campaign_id = v_asset.campaign_id;

      v_collection := coalesce(v_collection, 'world');
    end if;

    insert into public.campaign_art_items (
      campaign_id,
      uploaded_by,
      title,
      image_url,
      character_id,
      caption,
      kind,
      collection,
      asset_id
    ) values (
      v_asset.campaign_id,
      p_user_id,
      left(coalesce(p_title, v_source.title, ''), 160),
      v_asset.storage_path,
      p_target_id,
      left(coalesce(p_caption, v_source.caption, ''), 1000),
      'art',
      v_collection,
      v_asset.id
    )
    returning id into v_canonical_target_id;

    p_target_type := 'campaign_art';
    p_target_field := 'image';
  elsif not private.can_attach_media_target(
    v_asset.campaign_id,
    p_user_id,
    p_target_type,
    p_target_id,
    p_target_field
  ) then
    raise exception 'media_attach_denied';
  end if;

  update public.media_bindings
  set is_active = false
  where campaign_id = v_asset.campaign_id
    and target_type = p_target_type
    and target_id = v_canonical_target_id
    and target_field = p_target_field
    and is_active = true;

  insert into public.media_bindings (
    campaign_id,
    asset_id,
    target_type,
    target_id,
    target_field,
    created_by,
    is_active
  ) values (
    v_asset.campaign_id,
    v_asset.id,
    p_target_type,
    v_canonical_target_id,
    p_target_field,
    p_user_id,
    true
  )
  returning id into v_binding_id;

  if p_target_type = 'character' and p_target_field in ('avatar','avatar_url') then
    update public.characters
    set avatar_url = v_asset.storage_path,
        updated_at = now()
    where id = v_canonical_target_id;
  elsif p_target_type = 'location' and p_target_field in ('image','image_url','hero','cover','panel') then
    update public.locations
    set image_url = v_asset.storage_path,
        updated_at = now()
    where id = v_canonical_target_id;
  end if;

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
    'target_type', p_target_type,
    'target_id', v_canonical_target_id,
    'target_field', p_target_field,
    'storage_path', v_asset.storage_path
  );
end;
$$;

revoke all on function public.attach_system_media_v1(uuid,uuid,text,uuid,text,text,text)
from public, anon, authenticated;
grant execute on function public.attach_system_media_v1(uuid,uuid,text,uuid,text,text,text)
to service_role;

commit;
