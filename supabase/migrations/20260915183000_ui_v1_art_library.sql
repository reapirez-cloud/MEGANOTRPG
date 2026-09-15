begin;

alter table public.campaign_art_items
  add column if not exists collection text,
  add column if not exists location_id uuid null references public.locations(id) on delete set null;

update public.campaign_art_items item
set collection = case
  when item.kind = 'comic' then 'comics'
  when item.character_id is not null and exists (
    select 1 from public.characters c
    where c.id = item.character_id and c.character_type = 'npc'
  ) then 'npc'
  when item.character_id is not null then 'player'
  else 'world'
end
where item.collection is null;

alter table public.campaign_art_items
  alter column collection set default 'world',
  alter column collection set not null,
  drop constraint if exists campaign_art_items_collection_check;

alter table public.campaign_art_items
  add constraint campaign_art_items_collection_check
  check (collection in ('comics','world','npc','location','player','system'));

create index if not exists campaign_art_items_collection_idx
  on public.campaign_art_items(campaign_id, collection, created_at desc);

create index if not exists campaign_art_items_location_idx
  on public.campaign_art_items(location_id)
  where location_id is not null;

create or replace function private.is_campaign_owner(
  p_campaign_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and cm.is_owner = true
  );
$$;

create or replace function private.can_view_art_item(
  p_art_item_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_art_items item
    where item.id = p_art_item_id
      and private.is_campaign_member(item.campaign_id, p_user_id)
      and (
        item.collection <> 'system'
        or private.is_campaign_owner(item.campaign_id, p_user_id)
      )
      and (
        item.character_id is null
        or private.can_view_character(item.character_id, p_user_id)
      )
      and (
        item.location_id is null
        or private.can_view_location(item.location_id, p_user_id)
      )
  );
$$;

create or replace function private.can_edit_art_item(
  p_art_item_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_art_items item
    where item.id = p_art_item_id
      and (
        (
          item.collection = 'system'
          and private.is_campaign_owner(item.campaign_id, p_user_id)
        )
        or (
          item.collection <> 'system'
          and (
            item.uploaded_by = p_user_id
            or (
              item.character_id is null
              and item.location_id is null
              and private.can_manage_campaign(item.campaign_id, p_user_id)
            )
            or (
              item.character_id is not null
              and private.can_manage_character(item.character_id, p_user_id)
            )
            or (
              item.location_id is not null
              and private.can_manage_location(item.location_id, p_user_id)
            )
          )
        )
      )
  );
$$;

drop policy if exists campaign_art_items_member_read on public.campaign_art_items;
create policy campaign_art_items_member_read
on public.campaign_art_items
for select
to authenticated
using ((select private.can_view_art_item(campaign_art_items.id)));

drop policy if exists campaign_art_items_member_insert on public.campaign_art_items;
create policy campaign_art_items_member_insert
on public.campaign_art_items
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    (
      collection = 'system'
      and private.is_campaign_owner(campaign_id, (select auth.uid()))
      and character_id is null
      and location_id is null
    )
    or (
      collection <> 'system'
      and (
        (
          character_id is null
          and location_id is null
          and private.can_manage_campaign(campaign_id, (select auth.uid()))
        )
        or (
          character_id is not null
          and (
            private.is_assigned_character(character_id, (select auth.uid()))
            or private.can_manage_character(character_id, (select auth.uid()))
          )
        )
        or (
          location_id is not null
          and private.can_manage_location(location_id, (select auth.uid()))
        )
      )
    )
  )
);

drop policy if exists campaign_art_items_author_or_manager_update on public.campaign_art_items;
create policy campaign_art_items_author_or_manager_update
on public.campaign_art_items
for update
to authenticated
using ((select private.can_edit_art_item(campaign_art_items.id)))
with check ((select private.can_edit_art_item(campaign_art_items.id)));

create or replace function private.can_read_media_asset(
  p_asset_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
begin
  if p_user_id is null then return false; end if;

  select * into v_asset
  from public.media_assets
  where id = p_asset_id;

  if not found then return false; end if;
  if v_asset.created_by = p_user_id then return true; end if;

  return exists (
    select 1
    from public.media_bindings b
    where b.asset_id = p_asset_id
      and b.is_active = true
      and (
        (
          b.target_type = 'character'
          and private.can_view_character(b.target_id, p_user_id)
        )
        or (
          b.target_type = 'location'
          and private.can_view_location(b.target_id, p_user_id)
        )
        or (
          b.target_type = 'reference_definition'
          and exists (
            select 1
            from public.reference_definitions d
            where d.id = b.target_id
              and (
                d.scope = 'system'
                or (
                  d.campaign_id = v_asset.campaign_id
                  and private.is_campaign_member(v_asset.campaign_id, p_user_id)
                  and (
                    d.visibility = 'campaign'
                    or private.can_manage_campaign(v_asset.campaign_id, p_user_id)
                  )
                )
              )
          )
        )
        or (
          b.target_type = 'campaign_art'
          and private.can_view_art_item(b.target_id, p_user_id)
        )
      )
  );
end;
$$;

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
      select 1 from public.media_bindings b
      where b.asset_id = a.id and b.is_active = true
    )
  from public.media_assets a
  where a.campaign_id = p_campaign_id
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

  if v_asset.status = 'attached'
     or v_asset.attached_at is not null
     or exists (
       select 1 from public.media_bindings b
       where b.asset_id = v_asset.id and b.is_active = true
     ) then
    raise exception 'attached_media_cannot_be_deleted';
  end if;

  delete from public.media_assets where id = v_asset.id;

  return jsonb_build_object(
    'deleted', true,
    'asset_id', v_asset.id,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path
  );
end;
$$;

revoke all on function public.list_campaign_generated_media_admin_v1(uuid) from public, anon;
grant execute on function public.list_campaign_generated_media_admin_v1(uuid) to authenticated;

revoke all on function public.delete_generated_media_admin_v1(uuid) from public, anon;
grant execute on function public.delete_generated_media_admin_v1(uuid) to authenticated;

create or replace function private.can_delete_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 4
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and v_parts[3] = 'ai-assets' then
    v_campaign_id := v_parts[1]::uuid;
    return private.is_campaign_owner(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    v_owner_id := case
      when v_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then v_parts[2]::uuid
      else null
    end;

    if v_parts[3] = 'gm-private' then
      return v_owner_id = auth.uid()
        and private.can_manage_campaign(v_campaign_id, auth.uid());
    end if;

    return v_owner_id = auth.uid()
      or private.can_manage_campaign(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or exists (
        select 1
        from public.campaign_members mine
        join public.campaign_members theirs
          on theirs.campaign_id = mine.campaign_id
        where mine.user_id = auth.uid()
          and (mine.is_owner = true or mine.role = 'gm')
          and theirs.user_id = v_owner_id
      );
  end if;

  return false;
end;
$$;

commit;
