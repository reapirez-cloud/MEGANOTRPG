begin;

create or replace function public.list_campaign_generated_media_admin_v1(
  p_campaign_id uuid
)
returns table(
  id uuid,
  source_job_id uuid,
  purpose text,
  profile text,
  status text,
  storage_bucket text,
  storage_path text,
  width integer,
  height integer,
  variant_index smallint,
  prompt text,
  saved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  has_active_binding boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'admin_required';
  end if;

  return query
  select
    a.id,
    a.source_job_id,
    a.purpose,
    a.profile,
    a.status,
    a.storage_bucket,
    a.storage_path,
    a.width,
    a.height,
    a.variant_index,
    a.prompt,
    a.saved_at,
    a.expires_at,
    a.created_at,
    exists (
      select 1
      from public.media_bindings b
      where b.asset_id = a.id
        and b.is_active = true
    )
  from public.media_assets a
  where a.campaign_id = p_campaign_id
    and a.source_job_id is not null
    and a.provider_key <> 'manual-upload'
  order by a.created_at desc
  limit 500;
end;
$$;

create or replace function public.delete_generated_media_admin_v1(
  p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  select * into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;

  if not found then
    raise exception 'media_asset_not_found';
  end if;

  if not private.is_campaign_owner(v_asset.campaign_id, auth.uid()) then
    raise exception 'admin_required';
  end if;

  if v_asset.source_job_id is null or v_asset.provider_key = 'manual-upload' then
    raise exception 'generated_media_required';
  end if;

  if v_asset.status = 'attached'
     or v_asset.attached_at is not null
     or exists (
       select 1
       from public.media_bindings b
       where b.asset_id = v_asset.id
         and b.is_active = true
     ) then
    raise exception 'attached_media_cannot_be_deleted';
  end if;

  delete from public.media_assets
  where id = v_asset.id;

  return jsonb_build_object(
    'deleted', true,
    'asset_id', v_asset.id,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path
  );
end;
$$;

create or replace function public.bind_reference_media_upload_v1(
  p_campaign_id uuid,
  p_target_field text,
  p_storage_path text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_purpose text,
  p_profile text,
  p_presentation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset_id uuid;
  v_art_item_id uuid;
  v_result jsonb;
  v_system_icon boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.is_campaign_owner(p_campaign_id, v_user_id) then
    raise exception 'owner_required';
  end if;

  if p_storage_path is null
     or p_storage_path not like p_campaign_id::text || '/' || v_user_id::text || '/%' then
    raise exception 'manual_media_path_denied';
  end if;

  if not private.is_valid_media_presentation(coalesce(p_presentation, '{}'::jsonb)) then
    raise exception 'media_presentation_invalid';
  end if;

  if not private.can_attach_media_target(
    p_campaign_id,
    v_user_id,
    'reference_art',
    p_campaign_id,
    p_target_field
  ) then
    raise exception 'media_attach_denied';
  end if;

  if p_purpose not in ('icon','ui_preview','portrait','panel','hero_art','master_art')
     or p_profile not in ('tiny_icon','ui_preview','portrait','panel','hero_art','master_art') then
    raise exception 'manual_media_profile_invalid';
  end if;

  v_system_icon :=
    p_target_field ~ '^class:[a-z0-9-]+:(resource|spell_slot)$'
    or p_target_field ~ '^resource:[a-z0-9_-]+$';

  if v_system_icon then
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
      v_user_id,
      'manual-upload',
      'system-reference-icon',
      'icon',
      'tiny_icon',
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
      jsonb_build_object(
        'source', 'system_reference_icon',
        'manual_upload', true,
        'target_field', p_target_field
      ),
      now(),
      now(),
      null
    )
    returning id into v_asset_id;

    insert into public.campaign_art_items (
      campaign_id,
      uploaded_by,
      character_id,
      location_id,
      title,
      caption,
      image_url,
      kind,
      collection,
      asset_id
    ) values (
      p_campaign_id,
      v_user_id,
      null,
      null,
      left(regexp_replace(p_storage_path, '^.*/', ''), 120),
      '',
      p_storage_path,
      'art',
      'system',
      v_asset_id
    )
    returning id into v_art_item_id;

    insert into public.media_bindings (
      campaign_id,
      asset_id,
      target_type,
      target_id,
      target_field,
      created_by,
      is_active,
      presentation
    ) values (
      p_campaign_id,
      v_asset_id,
      'campaign_art',
      v_art_item_id,
      'source',
      v_user_id,
      true,
      '{}'::jsonb
    );
  else
    v_asset_id := public.register_manual_media_v1(
      p_campaign_id,
      p_storage_path,
      p_mime_type,
      p_width,
      p_height,
      p_purpose,
      p_profile
    );
  end if;

  v_result := public.bind_media_presentation_v1(
    v_asset_id,
    'reference_art',
    p_campaign_id,
    p_target_field,
    p_presentation
  );

  return v_result || jsonb_build_object(
    'system_art_item_id', v_art_item_id,
    'atomic_upload', true
  );
end;
$$;

insert into public.campaign_art_items (
  campaign_id,
  uploaded_by,
  character_id,
  location_id,
  title,
  caption,
  image_url,
  kind,
  collection,
  asset_id
)
select
  a.campaign_id,
  a.created_by,
  null,
  null,
  left(regexp_replace(a.storage_path, '^.*/', ''), 120),
  '',
  a.storage_path,
  'art',
  'system',
  a.id
from public.media_assets a
where a.model_key = 'meganot-original-class-icon'
  and not exists (
    select 1
    from public.campaign_art_items item
    where item.asset_id = a.id
      and item.collection = 'system'
  );

insert into public.media_bindings (
  campaign_id,
  asset_id,
  target_type,
  target_id,
  target_field,
  created_by,
  is_active,
  presentation
)
select
  item.campaign_id,
  item.asset_id,
  'campaign_art',
  item.id,
  'source',
  item.uploaded_by,
  true,
  '{}'::jsonb
from public.campaign_art_items item
where item.collection = 'system'
  and item.asset_id is not null
  and exists (
    select 1
    from public.media_assets a
    where a.id = item.asset_id
      and a.model_key = 'meganot-original-class-icon'
  )
  and not exists (
    select 1
    from public.media_bindings b
    where b.asset_id = item.asset_id
      and b.target_type = 'campaign_art'
      and b.target_id = item.id
      and b.target_field = 'source'
      and b.is_active = true
  );

revoke all on function public.bind_reference_media_upload_v1(
  uuid,text,text,text,integer,integer,text,text,jsonb
) from public, anon;
grant execute on function public.bind_reference_media_upload_v1(
  uuid,text,text,text,integer,integer,text,text,jsonb
) to authenticated;

commit;
