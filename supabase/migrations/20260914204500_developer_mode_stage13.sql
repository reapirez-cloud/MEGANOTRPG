-- Stage 13: owner-only Developer Mode sessions, run journal and model visibility.
-- This migration never derives system-admin authority from campaign GM/owner roles.
-- System administrators are bootstrapped explicitly out-of-band in private.system_admin_users.

create extension if not exists pgcrypto;

alter table public.ai_agent_model_routes
  drop constraint if exists ai_agent_model_routes_task_key_check;
alter table public.ai_agent_model_routes
  add constraint ai_agent_model_routes_task_key_check
  check (task_key = any (array[
    'general'::text,
    'reference_read'::text,
    'memory_read'::text,
    'memory_write'::text,
    'workshop'::text,
    'draft_edit'::text,
    'mechanics_compile'::text,
    'developer'::text
  ]));

alter table public.ai_model_route_runs
  drop constraint if exists ai_model_route_runs_task_key_check;
alter table public.ai_model_route_runs
  add constraint ai_model_route_runs_task_key_check
  check (task_key = any (array[
    'general'::text,
    'reference_read'::text,
    'memory_read'::text,
    'memory_write'::text,
    'workshop'::text,
    'draft_edit'::text,
    'mechanics_compile'::text,
    'developer'::text
  ]));

alter table public.ai_messages
  drop constraint if exists ai_messages_task_key_check;
alter table public.ai_messages
  add constraint ai_messages_task_key_check
  check (
    task_key is null
    or task_key = any (array[
      'general'::text,
      'reference_read'::text,
      'memory_read'::text,
      'memory_write'::text,
      'workshop'::text,
      'draft_edit'::text,
      'mechanics_compile'::text,
      'developer'::text
    ])
  );

create table if not exists public.ai_dev_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  token_hash text not null,
  status text not null default 'active',
  base_branch text not null default 'dev',
  owner_override_model_id uuid null references public.ai_models(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  last_used_at timestamptz not null default now(),
  closed_at timestamptz null,
  constraint ai_dev_sessions_status_check
    check (status in ('active','revoked','expired')),
  constraint ai_dev_sessions_base_branch_check
    check (base_branch = 'dev'),
  constraint ai_dev_sessions_token_hash_check
    check (length(token_hash) = 64),
  constraint ai_dev_sessions_expiry_check
    check (expires_at > created_at)
);

create index if not exists ai_dev_sessions_user_status_idx
  on public.ai_dev_sessions(user_id,status,expires_at desc);

alter table public.ai_dev_sessions enable row level security;
revoke all on public.ai_dev_sessions from anon, authenticated;

create table if not exists public.ai_dev_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_dev_sessions(id) on delete restrict,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  agent_job_id uuid null unique references public.agent_jobs(id) on delete set null,
  title text not null,
  request_text text not null default '',
  summary text not null default '',
  base_branch text not null default 'dev',
  base_sha text not null,
  branch_name text null,
  state text not null default 'proposed',
  proposed_changes jsonb not null default '[]'::jsonb,
  diff_preview text not null default '',
  pr_number integer null,
  pr_url text null,
  head_sha text null,
  ci_state text not null default 'unknown',
  ci_url text null,
  preview_state text not null default 'none',
  preview_url text null,
  checks jsonb not null default '[]'::jsonb,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  branch_applied_at timestamptz null,
  merged_at timestamptz null,
  constraint ai_dev_runs_base_branch_check
    check (base_branch = 'dev'),
  constraint ai_dev_runs_base_sha_check
    check (base_sha ~ '^[0-9a-f]{40}$'),
  constraint ai_dev_runs_head_sha_check
    check (head_sha is null or head_sha ~ '^[0-9a-f]{40}$'),
  constraint ai_dev_runs_state_check
    check (state in (
      'proposed',
      'branch_applied',
      'checks_pending',
      'preview_ready',
      'merge_ready',
      'merged_dev',
      'failed',
      'cancelled',
      'stale'
    )),
  constraint ai_dev_runs_ci_state_check
    check (ci_state in ('unknown','pending','success','failure')),
  constraint ai_dev_runs_preview_state_check
    check (preview_state in ('none','unknown','pending','success','failure')),
  constraint ai_dev_runs_changes_array_check
    check (jsonb_typeof(proposed_changes) = 'array'),
  constraint ai_dev_runs_checks_array_check
    check (jsonb_typeof(checks) = 'array'),
  constraint ai_dev_runs_title_length_check
    check (char_length(title) between 1 and 240),
  constraint ai_dev_runs_request_length_check
    check (char_length(request_text) <= 12000),
  constraint ai_dev_runs_summary_length_check
    check (char_length(summary) <= 6000),
  constraint ai_dev_runs_diff_length_check
    check (char_length(diff_preview) <= 180000)
);

create index if not exists ai_dev_runs_creator_created_idx
  on public.ai_dev_runs(created_by,created_at desc);
create index if not exists ai_dev_runs_session_created_idx
  on public.ai_dev_runs(session_id,created_at desc);
create index if not exists ai_dev_runs_state_idx
  on public.ai_dev_runs(state,updated_at desc);

alter table public.ai_dev_runs enable row level security;
revoke insert, update, delete on public.ai_dev_runs from anon, authenticated;
grant select on public.ai_dev_runs to authenticated;

drop policy if exists ai_dev_runs_owner_read on public.ai_dev_runs;
create policy ai_dev_runs_owner_read
on public.ai_dev_runs
for select
to authenticated
using (
  created_by = (select auth.uid())
  and private.is_system_admin((select auth.uid()))
);

create or replace function public.my_system_admin_status_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin(auth.uid());
$$;

revoke all on function public.my_system_admin_status_v1() from public, anon;
grant execute on function public.my_system_admin_status_v1() to authenticated;

create or replace function public.open_ai_dev_session_v1(
  p_campaign_id uuid,
  p_owner_override_model_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.is_system_admin(v_user_id) then
    raise exception 'system_admin_required';
  end if;

  if p_campaign_id is null
     or not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_access_required';
  end if;

  if p_owner_override_model_id is not null and not exists (
    select 1
    from public.ai_models m
    where m.id = p_owner_override_model_id
      and m.enabled = true
      and m.model_kind = 'owner_override'
      and m.access_scope = 'system_admin'
      and m.supports_tools = true
  ) then
    raise exception 'owner_override_model_not_allowed';
  end if;

  update public.ai_dev_sessions
  set status = case
        when expires_at <= now() then 'expired'
        else 'revoked'
      end,
      closed_at = now()
  where user_id = v_user_id
    and status = 'active';

  v_token := encode(gen_random_bytes(32),'hex');
  v_expires_at := now() + interval '30 minutes';

  insert into public.ai_dev_sessions(
    user_id,
    campaign_id,
    token_hash,
    status,
    base_branch,
    owner_override_model_id,
    expires_at,
    last_used_at
  ) values (
    v_user_id,
    p_campaign_id,
    encode(digest(v_token,'sha256'),'hex'),
    'active',
    'dev',
    p_owner_override_model_id,
    v_expires_at,
    now()
  )
  returning id into v_session_id;

  return jsonb_build_object(
    'id',v_session_id,
    'campaign_id',p_campaign_id,
    'status','active',
    'base_branch','dev',
    'owner_override_model_id',p_owner_override_model_id,
    'token',v_token,
    'expires_at',v_expires_at
  );
end;
$$;

revoke all on function public.open_ai_dev_session_v1(uuid,uuid)
from public, anon;
grant execute on function public.open_ai_dev_session_v1(uuid,uuid)
to authenticated;

create or replace function public.read_my_ai_dev_session_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.ai_dev_sessions%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_system_admin(v_user_id) then raise exception 'system_admin_required'; end if;

  update public.ai_dev_sessions
  set status = 'expired',
      closed_at = coalesce(closed_at,now())
  where id = p_session_id
    and user_id = v_user_id
    and status = 'active'
    and expires_at <= now();

  select *
    into v_session
  from public.ai_dev_sessions
  where id = p_session_id
    and user_id = v_user_id;

  if not found then return null; end if;

  return jsonb_build_object(
    'id',v_session.id,
    'campaign_id',v_session.campaign_id,
    'status',v_session.status,
    'base_branch',v_session.base_branch,
    'owner_override_model_id',v_session.owner_override_model_id,
    'created_at',v_session.created_at,
    'expires_at',v_session.expires_at,
    'last_used_at',v_session.last_used_at,
    'closed_at',v_session.closed_at
  );
end;
$$;

revoke all on function public.read_my_ai_dev_session_v1(uuid)
from public, anon;
grant execute on function public.read_my_ai_dev_session_v1(uuid)
to authenticated;

create or replace function public.set_ai_dev_session_override_v1(
  p_session_id uuid,
  p_owner_override_model_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.ai_dev_sessions%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_system_admin(v_user_id) then raise exception 'system_admin_required'; end if;

  if p_owner_override_model_id is not null and not exists (
    select 1
    from public.ai_models m
    where m.id = p_owner_override_model_id
      and m.enabled = true
      and m.model_kind = 'owner_override'
      and m.access_scope = 'system_admin'
      and m.supports_tools = true
  ) then
    raise exception 'owner_override_model_not_allowed';
  end if;

  update public.ai_dev_sessions
  set owner_override_model_id = p_owner_override_model_id,
      last_used_at = now()
  where id = p_session_id
    and user_id = v_user_id
    and status = 'active'
    and expires_at > now()
  returning * into v_session;

  if not found then
    raise exception 'developer_session_not_active';
  end if;

  return jsonb_build_object(
    'id',v_session.id,
    'status',v_session.status,
    'owner_override_model_id',v_session.owner_override_model_id,
    'expires_at',v_session.expires_at
  );
end;
$$;

revoke all on function public.set_ai_dev_session_override_v1(uuid,uuid)
from public, anon;
grant execute on function public.set_ai_dev_session_override_v1(uuid,uuid)
to authenticated;

create or replace function public.close_ai_dev_session_v1(
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_system_admin(v_user_id) then raise exception 'system_admin_required'; end if;

  update public.ai_dev_sessions
  set status = 'revoked',
      closed_at = now()
  where id = p_session_id
    and user_id = v_user_id
    and status = 'active';

  return found;
end;
$$;

revoke all on function public.close_ai_dev_session_v1(uuid)
from public, anon;
grant execute on function public.close_ai_dev_session_v1(uuid)
to authenticated;

create or replace function public.validate_ai_dev_session_v1(
  p_session_id uuid,
  p_token text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid boolean := false;
begin
  if p_session_id is null or p_user_id is null or nullif(p_token,'') is null then
    return false;
  end if;

  if not private.is_system_admin(p_user_id) then
    return false;
  end if;

  update public.ai_dev_sessions
  set status = 'expired',
      closed_at = coalesce(closed_at,now())
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active'
    and expires_at <= now();

  select exists (
    select 1
    from public.ai_dev_sessions s
    where s.id = p_session_id
      and s.user_id = p_user_id
      and s.status = 'active'
      and s.expires_at > now()
      and s.token_hash = encode(digest(p_token,'sha256'),'hex')
  ) into v_valid;

  if v_valid then
    update public.ai_dev_sessions
    set last_used_at = now()
    where id = p_session_id;
  end if;

  return v_valid;
end;
$$;

revoke all on function public.validate_ai_dev_session_v1(uuid,text,uuid)
from public, anon, authenticated;
grant execute on function public.validate_ai_dev_session_v1(uuid,text,uuid)
to service_role;

drop policy if exists ai_models_read on public.ai_models;
create policy ai_models_read
on public.ai_models
for select
to authenticated
using (
  enabled = true
  and (
    (
      model_kind = 'agent'
      and access_scope = 'campaign'
      and (
        is_base = true
        or (
          gm_selectable = true
          and exists (
            select 1
            from public.campaign_members cm
            where cm.user_id = (select auth.uid())
              and (cm.role = 'gm' or cm.is_owner = true)
          )
        )
      )
    )
    or (
      model_kind = 'owner_override'
      and access_scope = 'system_admin'
      and private.is_system_admin((select auth.uid()))
    )
  )
);

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
  supports_vision,
  context_window,
  cost_tier,
  reasoning_tier,
  latency_tier,
  model_kind,
  access_scope
)
values (
  'astra-compatible',
  'astra-owner-override',
  'Astra · Owner override',
  false,
  false,
  false,
  true,
  true,
  true,
  true,
  null,
  5,
  5,
  4,
  'owner_override',
  'system_admin'
)
on conflict (model_key) do update set
  provider_key = excluded.provider_key,
  display_name = excluded.display_name,
  is_base = false,
  gm_selectable = false,
  supports_tools = excluded.supports_tools,
  supports_json = excluded.supports_json,
  supports_streaming = excluded.supports_streaming,
  supports_vision = excluded.supports_vision,
  model_kind = 'owner_override',
  access_scope = 'system_admin',
  updated_at = now();
