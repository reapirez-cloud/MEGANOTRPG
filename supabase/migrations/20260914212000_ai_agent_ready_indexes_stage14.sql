-- Stage 14 READY audit: cover AI Agent Platform foreign keys flagged by the
-- Supabase performance advisor. These indexes are intentionally boring:
-- they protect FK checks/cascades and common joins as jobs, memory and media grow.

create index if not exists agent_jobs_thread_id_idx
  on public.agent_jobs(thread_id);

create index if not exists ai_agent_model_routes_updated_by_idx
  on public.ai_agent_model_routes(updated_by);

create index if not exists ai_agent_settings_updated_by_idx
  on public.ai_agent_settings(updated_by);

create index if not exists ai_dev_runs_campaign_id_idx
  on public.ai_dev_runs(campaign_id);

create index if not exists ai_dev_sessions_campaign_id_idx
  on public.ai_dev_sessions(campaign_id);

create index if not exists ai_dev_sessions_owner_override_model_id_idx
  on public.ai_dev_sessions(owner_override_model_id);

create index if not exists ai_draft_apply_runs_requested_by_idx
  on public.ai_draft_apply_runs(requested_by);

create index if not exists ai_draft_revisions_created_by_idx
  on public.ai_draft_revisions(created_by);

create index if not exists ai_drafts_applied_by_idx
  on public.ai_drafts(applied_by);

create index if not exists ai_drafts_thread_id_idx
  on public.ai_drafts(thread_id);

create index if not exists ai_mechanics_compilations_thread_id_idx
  on public.ai_mechanics_compilations(thread_id);

create index if not exists ai_messages_model_id_idx
  on public.ai_messages(model_id);

create index if not exists ai_model_route_runs_model_id_idx
  on public.ai_model_route_runs(model_id);

create index if not exists ai_model_route_runs_thread_id_idx
  on public.ai_model_route_runs(thread_id);

create index if not exists ai_read_tool_runs_campaign_id_idx
  on public.ai_read_tool_runs(campaign_id);

create index if not exists campaign_events_actor_character_id_idx
  on public.campaign_events(actor_character_id);

create index if not exists campaign_events_location_id_idx
  on public.campaign_events(location_id);

create index if not exists campaign_memory_facts_created_by_idx
  on public.campaign_memory_facts(created_by);

create index if not exists campaign_memory_facts_room_id_idx
  on public.campaign_memory_facts(room_id);

create index if not exists campaign_memory_facts_superseded_by_idx
  on public.campaign_memory_facts(superseded_by);

create index if not exists campaign_memory_summaries_created_by_idx
  on public.campaign_memory_summaries(created_by);

create index if not exists campaign_memory_summaries_model_id_idx
  on public.campaign_memory_summaries(model_id);

create index if not exists campaign_memory_summaries_room_id_idx
  on public.campaign_memory_summaries(room_id);

create index if not exists media_assets_campaign_id_idx
  on public.media_assets(campaign_id);

create index if not exists media_bindings_created_by_idx
  on public.media_bindings(created_by);

comment on table public.ai_dev_sessions is
  'Stage 13/14 service-mediated Developer Mode sessions. RLS intentionally has no direct client policy; authenticated access is through guarded RPCs only.';

comment on table public.engine_command_receipts is
  'Service-owned engine idempotency receipts. RLS intentionally has no direct client policy.';
