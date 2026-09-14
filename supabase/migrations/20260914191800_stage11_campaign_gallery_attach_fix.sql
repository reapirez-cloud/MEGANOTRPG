-- Stage 11 follow-up: campaign gallery attachment may target the general gallery.

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

revoke all on function private.can_attach_media_target(uuid, uuid, text, uuid, text) from public;
grant execute on function private.can_attach_media_target(uuid, uuid, text, uuid, text) to service_role;
