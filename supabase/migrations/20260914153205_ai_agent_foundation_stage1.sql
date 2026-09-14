create or replace function private.is_campaign_manager(
  p_campaign_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and (cm.role = 'gm' or cm.is_owner = true)
  );
$$;

revoke all on function private.is_campaign_manager(uuid, uuid) from public;
grant execute on function private.is_campaign_manager(uuid, uuid) to authenticated;

create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null default 'openai-compatible',
  model_key text not null unique,
  display_name text not null,
  enabled boolean not null default true,
  is_base boolean not null default false,
  gm_selectable boolean not null default true,
  supports_tools boolean not null default false,
  supports_json boolean not null default false,
  supports_streaming boolean not null default true,
  context_window integer,
  cost_tier smallint not null default 1 check (cost_tier between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(model_key)) > 0),
  check (length(btrim(display_name)) > 0),
  check (context_window is null or context_window > 0)
);

create unique index ai_models_one_base_idx
  on public.ai_models ((is_base))
  where is_base = true;

create table public.ai_agent_settings (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  agent_key text not null,
  selected_model_id uuid references public.ai_models(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, agent_key),
  check (length(btrim(agent_key)) between 1 and 64)
);

create index ai_agent_settings_selected_model_idx
  on public.ai_agent_settings (selected_model_id)
  where selected_model_id is not null;

create table public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_key text not null default 'voss',
  title text not null default 'Восс',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id, agent_key),
  check (length(btrim(agent_key)) between 1 and 64),
  check (length(btrim(title)) between 1 and 120)
);

create index ai_threads_user_campaign_idx
  on public.ai_threads (user_id, campaign_id, updated_at desc);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  model_id uuid references public.ai_models(id) on delete set null,
  view_context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(view_context) = 'object'),
  created_at timestamptz not null default now(),
  check (length(btrim(body)) > 0)
);

create index ai_messages_thread_created_idx
  on public.ai_messages (thread_id, created_at, id);

insert into public.ai_models (
  provider_key,
  model_key,
  display_name,
  enabled,
  is_base,
  gm_selectable,
  supports_tools,
  supports_json,
  supports_streaming,
  cost_tier
)
values (
  'openai-compatible',
  '__default__',
  'Базовая модель',
  true,
  true,
  true,
  false,
  false,
  true,
  1
);

alter table public.ai_models enable row level security;
alter table public.ai_agent_settings enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_models_read
on public.ai_models
for select
to authenticated
using (
  enabled = true
  and (
    is_base = true
    or exists (
      select 1
      from public.campaign_members cm
      where cm.user_id = (select auth.uid())
        and (cm.role = 'gm' or cm.is_owner = true)
    )
  )
);

create policy ai_agent_settings_read
on public.ai_agent_settings
for select
to authenticated
using (
  private.is_campaign_member(campaign_id, (select auth.uid()))
);

create policy ai_agent_settings_insert
on public.ai_agent_settings
for insert
to authenticated
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy ai_agent_settings_update
on public.ai_agent_settings
for update
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
)
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy ai_threads_read_own
on public.ai_threads
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
);

create policy ai_messages_read_own
on public.ai_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.ai_threads t
    where t.id = ai_messages.thread_id
      and t.user_id = (select auth.uid())
      and private.is_campaign_member(t.campaign_id, (select auth.uid()))
  )
);

revoke all on public.ai_models from anon;
revoke all on public.ai_agent_settings from anon;
revoke all on public.ai_threads from anon;
revoke all on public.ai_messages from anon;

grant select on public.ai_models to authenticated;
grant select, insert, update on public.ai_agent_settings to authenticated;
grant select on public.ai_threads to authenticated;
grant select on public.ai_messages to authenticated;
