-- CLASS_MIGRATION_SCOPE: infrastructure
-- Stage 6 follow-up: cover composite scene-actor receipt foreign keys
-- in the exact FK column order reported by the Supabase performance advisor.

create index ai_scene_actor_command_receipts_actor_campaign_fk_idx
  on public.ai_scene_actor_command_receipts(actor_id,campaign_id);

create index ai_scene_actor_damage_receipts_actor_campaign_fk_idx
  on public.ai_scene_actor_damage_receipts(actor_id,campaign_id);
