-- CLASS_MIGRATION_SCOPE: infrastructure
-- Stage 12 hardening: explicit client deny policy and removal of redundant source-event index.

drop index if exists public.ai_background_snapshots_source_event_idx;

create policy ai_background_entity_snapshots_deny_client
on public.ai_background_entity_snapshots
for all
to anon, authenticated
using(false)
with check(false);
