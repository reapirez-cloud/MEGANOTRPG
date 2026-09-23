-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 10 hardening discovered by post-DDL advisors.

create index if not exists ai_background_candidates_run_campaign_day_fk_idx
  on public.ai_background_candidates(run_id,campaign_id,campaign_day);

create policy ai_background_dispatch_config_deny_client
on private.ai_background_dispatch_config
for all
to anon, authenticated
using (false)
with check (false);
