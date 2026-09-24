-- CLASS_MIGRATION_SCOPE: infrastructure
-- Stage 15 performance hardening for cooperative time catch-up foreign keys.

create index ai_player_time_catchup_location_fk_idx
  on public.ai_player_time_catchup_receipts(location_id);

create index ai_player_time_catchup_source_character_fk_idx
  on public.ai_player_time_catchup_receipts(source_character_id)
  where source_character_id is not null;
