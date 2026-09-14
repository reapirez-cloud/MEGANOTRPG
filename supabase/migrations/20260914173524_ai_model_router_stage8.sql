alter table public.ai_models
  add column reasoning_tier smallint not null default 3
    check (reasoning_tier between 1 and 5),
  add column latency_tier smallint not null default 3
    check (latency_tier between 1 and 5);

create table public.ai_agent_model_routes (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  agent_key text not null,
  task_key text not null
    check (task_key in (
      'general',
      'reference_read',
      'memory_read',
      'memory_write',
      'workshop',
      'draft_edit'
    )),
  mode text not null default 'auto'
    check (mode in ('auto','primary','base','fixed')),
  selected_model_id uuid references public.ai_models(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, agent_key, task_key),
  check (length(btrim(agent_key)) between 1 and 64),
  check (mode <> 'fixed' or selected_model_id is not null)
);

create index ai_agent_model_routes_selected_model_idx
  on public.ai_agent_model_routes (selected_model_id)
  where selected_model_id is not null;

alter table public.ai_agent_model_routes enable row level security;

create policy ai_agent_model_routes_manager_read
on public.ai_agent_model_routes
for select
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
);

create policy ai_agent_model_routes_manager_insert
on public.ai_agent_model_routes
for insert
to authenticated
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy ai_agent_model_routes_manager_update
on public.ai_agent_model_routes
for update
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
)
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy ai_agent_model_routes_manager_delete
on public.ai_agent_model_routes
for delete
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
);

revoke all on public.ai_agent_model_routes from public, anon, authenticated;
grant select, insert, update, delete on public.ai_agent_model_routes to authenticated;
grant select, insert, update, delete on public.ai_agent_model_routes to service_role;

create table public.ai_model_route_runs (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.ai_threads(id) on delete set null,
  agent_key text not null,
  task_key text not null
    check (task_key in (
      'general',
      'reference_read',
      'memory_read',
      'memory_write',
      'workshop',
      'draft_edit'
    )),
  model_id uuid references public.ai_models(id) on delete set null,
  route_mode text not null
    check (route_mode in ('base_lock','auto','primary','base','fixed','fallback')),
  reason text not null default '',
  degraded boolean not null default false,
  created_at timestamptz not null default now(),
  check (length(btrim(agent_key)) between 1 and 64),
  check (length(reason) <= 2000)
);

create index ai_model_route_runs_campaign_created_idx
  on public.ai_model_route_runs (campaign_id, created_at desc, id desc);
create index ai_model_route_runs_user_created_idx
  on public.ai_model_route_runs (user_id, created_at desc, id desc);

alter table public.ai_model_route_runs enable row level security;

create policy ai_model_route_runs_read_own_or_manager
on public.ai_model_route_runs
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_campaign_manager(campaign_id, (select auth.uid()))
);

revoke all on public.ai_model_route_runs from public, anon, authenticated;
grant select on public.ai_model_route_runs to authenticated;
grant select, insert, update, delete on public.ai_model_route_runs to service_role;

alter table public.ai_messages
  add column task_key text
    check (
      task_key is null
      or task_key in (
        'general',
        'reference_read',
        'memory_read',
        'memory_write',
        'workshop',
        'draft_edit'
      )
    );
