create table public.ai_read_tool_runs (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb
    check (jsonb_typeof(arguments) = 'object'),
  result_meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_meta) = 'object'),
  created_at timestamptz not null default now(),
  check (length(btrim(tool_name)) between 1 and 96)
);

create index ai_read_tool_runs_thread_created_idx
  on public.ai_read_tool_runs (thread_id, created_at desc);

create index ai_read_tool_runs_user_created_idx
  on public.ai_read_tool_runs (user_id, created_at desc);

alter table public.ai_read_tool_runs enable row level security;

create policy ai_read_tool_runs_read_own
on public.ai_read_tool_runs
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.ai_threads t
    where t.id = ai_read_tool_runs.thread_id
      and t.user_id = (select auth.uid())
      and t.campaign_id = ai_read_tool_runs.campaign_id
      and private.is_campaign_member(t.campaign_id, (select auth.uid()))
  )
);

revoke all on public.ai_read_tool_runs from public, anon, authenticated;
grant select on public.ai_read_tool_runs to authenticated;
