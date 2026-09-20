-- Freddy durable conversation-turn jobs.
--
-- Long GM/admin tasks can span multiple Edge Function invocations. The shared
-- agent_jobs table already provides owner-scoped durable job storage, so extend
-- its type allowlist with a conversation_turn job instead of inventing a second
-- queue surface.

alter table public.agent_jobs
  drop constraint if exists agent_jobs_job_type_check;

alter table public.agent_jobs
  add constraint agent_jobs_job_type_check check (
    job_type in (
      'conversation_turn',
      'image_generate','image_review','image_attach',
      'draft_create','draft_revise','draft_apply',
      'mechanics_compile',
      'dev_patch','dev_test','dev_build','dev_preview','dev_deploy'
    )
  );

create index if not exists agent_jobs_conversation_turn_active_idx
  on public.agent_jobs (campaign_id, requested_by, thread_id, created_at desc)
  where job_type = 'conversation_turn'
    and status in ('queued','running');
