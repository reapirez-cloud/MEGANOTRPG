drop policy if exists npc_identity_fingerprints_manager_read
  on public.npc_identity_fingerprints;
create policy npc_identity_fingerprints_manager_read
on public.npc_identity_fingerprints
for select to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and (
    select private.can_manage_character(
      character_id,
      (select auth.uid())
    )
  )
);

drop policy if exists npc_identity_versions_manager_read
  on public.npc_identity_fingerprint_versions;
create policy npc_identity_versions_manager_read
on public.npc_identity_fingerprint_versions
for select to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and (
    select private.can_manage_character(
      character_id,
      (select auth.uid())
    )
  )
);

drop policy if exists npc_identity_evolution_manager_read
  on public.npc_identity_evolution_receipts;
create policy npc_identity_evolution_manager_read
on public.npc_identity_evolution_receipts
for select to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and (
    select private.can_manage_character(
      character_id,
      (select auth.uid())
    )
  )
);

drop policy if exists npc_identity_observations_manager_or_observer_read
  on public.npc_identity_observations;
create policy npc_identity_observations_manager_or_observer_read
on public.npc_identity_observations
for select to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and (
    (
      select private.can_manage_campaign(
        campaign_id,
        (select auth.uid())
      )
    )
    or observer_character_id = (
      select private.active_character_for_user(
        campaign_id,
        (select auth.uid())
      )
    )
  )
);
