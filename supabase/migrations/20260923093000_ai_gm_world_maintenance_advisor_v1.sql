-- AI GM Stage 3 advisor follow-up.

create index if not exists ai_gm_room_maintenance_state_campaign_idx
  on public.ai_gm_room_maintenance_state (campaign_id);
