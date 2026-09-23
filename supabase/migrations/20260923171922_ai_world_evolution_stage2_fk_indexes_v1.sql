-- CLASS_MIGRATION_SCOPE: infrastructure
-- Cover Stage 2 foreign-key paths surfaced by the Supabase performance advisor.

create index ai_background_daily_runs_world_roll_receipt_idx
  on public.ai_background_daily_runs(world_roll_receipt_id)
  where world_roll_receipt_id is not null;

create index ai_background_rolls_run_campaign_day_fk_idx
  on public.ai_background_rolls(run_id, campaign_id, campaign_day);

create index ai_background_events_run_campaign_day_fk_idx
  on public.ai_background_events(run_id, campaign_id, effective_game_day);

create index ai_background_snapshots_run_campaign_day_fk_idx
  on public.ai_background_entity_snapshots(run_id, campaign_id, through_game_day);

create index ai_background_snapshots_source_event_idx
  on public.ai_background_entity_snapshots(source_event_id)
  where source_event_id is not null;
