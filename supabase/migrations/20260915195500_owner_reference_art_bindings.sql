begin;

create or replace function private.can_attach_media_target(
  p_campaign_id uuid,
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_field text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then return false; end if;
  if not private.is_campaign_member(p_campaign_id, p_user_id) then return false; end if;

  if p_target_type = 'reference_art' then
    return p_target_id = p_campaign_id
      and private.is_campaign_owner(p_campaign_id, p_user_id)
      and p_target_field ~ '^(class:[a-z0-9-]+|subclass:[a-z0-9-]+:[a-z0-9-]+):(preview|hero)$';
  end if;

  if p_target_type = 'campaign_gallery' then
    if p_target_id is null then
      return private.can_manage_campaign(p_campaign_id, p_user_id);
    end if;

    return private.can_manage_campaign(p_campaign_id, p_user_id)
      or exists (
        select 1
        from public.characters c
        where c.id = p_target_id
          and c.campaign_id = p_campaign_id
          and private.can_view_character(c.id, p_user_id)
          and c.assigned_user_id = p_user_id
      );
  end if;

  if p_target_id is null then return false; end if;

  if p_target_type = 'character' then
    if p_target_field not in ('avatar','avatar_url','panel_avatar','portrait','art') then
      return false;
    end if;

    return exists (
      select 1
      from public.characters c
      where c.id = p_target_id
        and c.campaign_id = p_campaign_id
        and private.can_view_character(c.id, p_user_id)
        and (
          private.can_manage_character(c.id, p_user_id)
          or c.assigned_user_id = p_user_id
        )
    );
  end if;

  if p_target_type = 'location' then
    if p_target_field not in ('image','image_url','hero','cover','panel') then
      return false;
    end if;
    return exists (
      select 1
      from public.locations l
      where l.id = p_target_id
        and l.campaign_id = p_campaign_id
        and private.can_manage_location(l.id, p_user_id)
    );
  end if;

  if p_target_type = 'reference_definition' then
    if p_target_field not in ('icon','preview','image','hero','art') then
      return false;
    end if;
    return private.can_manage_campaign(p_campaign_id, p_user_id)
      and exists (
        select 1
        from public.reference_definitions d
        where d.id = p_target_id
          and d.scope = 'campaign'
          and d.campaign_id = p_campaign_id
      );
  end if;

  return false;
end;
$$;

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
        or (
          b.target_type = 'reference_art'
          and b.target_id = v_asset.campaign_id
          and private.is_campaign_member(v_asset.campaign_id, p_user_id)
        )
      )
  );
end;
$$;

create or replace function public.list_reference_media_v1(
  p_campaign_id uuid
)
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
as $$
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
$$;

revoke all on function public.list_reference_media_v1(uuid)
from public, anon;
grant execute on function public.list_reference_media_v1(uuid)
to authenticated;

commit;
