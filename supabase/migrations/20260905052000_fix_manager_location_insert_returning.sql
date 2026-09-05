-- INSERT ... RETURNING also evaluates the SELECT policy. Check manager access
-- against the candidate row directly; the stable visibility helper queries the
-- locations table and cannot see a row created by the same statement yet.
drop policy if exists locations_member_read on public.locations;
create policy locations_member_read
on public.locations
for select
to authenticated
using (
  (select private.can_manage_campaign(campaign_id))
  or (select private.can_view_location(id))
);
