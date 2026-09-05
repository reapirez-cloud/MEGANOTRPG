-- A private world location means "GM-only", not "creator-only". Managers must
-- be able to read every location they can manage so INSERT ... RETURNING and
-- cross-GM editing use the same authority rule as the write policies.
create or replace function private.can_view_location(
  p_location_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.locations l
    where l.id = p_location_id
      and private.is_campaign_member(l.campaign_id, p_user_id)
      and (
        private.can_manage_campaign(l.campaign_id, p_user_id)
        or l.visibility_mode = 'always'
        or (
          l.visibility_mode = 'discover'
          and exists(
            select 1
            from public.character_location_discoveries d
            where d.character_id = private.active_character_for_user(l.campaign_id, p_user_id)
              and d.location_id = l.id
          )
        )
      )
  );
$$;

create or replace function private.can_view_location_link(
  p_link_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.location_links link
    join public.location_sections s on s.id = link.section_id
    join public.locations l on l.id = s.location_id
    where link.id = p_link_id
      and private.can_view_location(l.id, p_user_id)
      and private.can_view_location(link.target_location_id, p_user_id)
      and (
        private.can_manage_campaign(l.campaign_id, p_user_id)
        or link.visibility_mode = 'always'
        or (
          link.visibility_mode = 'discover'
          and exists(
            select 1
            from public.character_location_link_discoveries d
            where d.character_id = private.active_character_for_user(l.campaign_id, p_user_id)
              and d.location_link_id = link.id
          )
        )
      )
  );
$$;

revoke all on function private.can_view_location(uuid, uuid) from public, anon;
revoke all on function private.can_view_location_link(uuid, uuid) from public, anon;
grant execute on function private.can_view_location(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_location_link(uuid, uuid) to authenticated, service_role;
