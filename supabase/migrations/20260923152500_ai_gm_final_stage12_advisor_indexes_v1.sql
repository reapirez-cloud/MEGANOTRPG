-- AI GM Stage 12 final advisor cleanup: cover remaining AI-GM foreign keys.

create index if not exists ai_gm_dawn_receipts_location_idx
  on private.ai_gm_dawn_receipts(location_id);

create index if not exists ai_gm_dawn_receipts_message_idx
  on private.ai_gm_dawn_receipts(message_id)
  where message_id is not null;

create index if not exists ai_gm_room_maintenance_state_dispatch_job_idx
  on public.ai_gm_room_maintenance_state(last_dispatched_job_id)
  where last_dispatched_job_id is not null;
