-- AI GM Stage 3 follow-up: durable provenance for generated summaries.

alter table public.campaign_memory_summaries
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.campaign_memory_summaries
  drop constraint if exists campaign_memory_summaries_provenance_check;

alter table public.campaign_memory_summaries
  add constraint campaign_memory_summaries_provenance_check
  check (jsonb_typeof(provenance) = 'object');
