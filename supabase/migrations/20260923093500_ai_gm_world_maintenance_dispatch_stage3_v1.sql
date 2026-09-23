-- AI GM Stage 3 dispatch: asynchronously wake the fixed world worker.
--
-- pg_net only enqueues the HTTP request inside the chat-message transaction;
-- the request starts after commit, so chat inserts are not blocked by the LLM.
-- The Edge Function uses a random DB-held dispatch token as custom auth.

create extension if not exists pg_net;

alter table public.ai_gm_room_maintenance_state
  add column if not exists last_dispatched_job_id uuid
  references public.agent_jobs(id) on delete set null;

alter table public.ai_gm_room_maintenance_state
  add column if not exists last_dispatch_at timestamptz;

create table if not exists private.ai_gm_maintenance_dispatch_config (
  singleton boolean primary key default true,
  project_url text,
  dispatch_token text not null default encode(gen_random_bytes(32), 'hex'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint ai_gm_maintenance_dispatch_singleton_check
    check (singleton = true)
);

insert into private.ai_gm_maintenance_dispatch_config (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.verify_ai_gm_maintenance_dispatch_v1(
  p_token text
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from private.ai_gm_maintenance_dispatch_config cfg
    where cfg.singleton = true
      and cfg.enabled = true
      and p_token is not null
      and length(p_token) >= 32
      and cfg.dispatch_token = p_token
  );
$$;

revoke all on function public.verify_ai_gm_maintenance_dispatch_v1(text)
  from public, anon, authenticated;
grant execute on function public.verify_ai_gm_maintenance_dispatch_v1(text)
  to service_role;

create or replace function private.dispatch_ai_gm_maintenance_job_v1(
  p_job_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_state public.ai_gm_room_maintenance_state%rowtype;
  v_config private.ai_gm_maintenance_dispatch_config%rowtype;
  v_room_id uuid;
  v_request_id bigint;
begin
  if p_job_id is null then
    return null;
  end if;

  select *
    into v_job
  from public.agent_jobs
  where id = p_job_id
    and job_type = 'world_maintenance'
    and input ->> 'surface' = 'world_maintenance_v1'
  for update;

  if v_job.id is null or v_job.status <> 'queued' then
    return null;
  end if;

  v_room_id := nullif(v_job.input ->> 'maintenance_room_id', '')::uuid;
  if v_room_id is null then
    return null;
  end if;

  select *
    into v_state
  from public.ai_gm_room_maintenance_state
  where room_id = v_room_id
  for update;

  if v_state.room_id is null then
    return null;
  end if;

  if v_state.last_dispatched_job_id = p_job_id
     and v_state.last_dispatch_at is not null
     and v_state.last_dispatch_at > now() - interval '30 seconds'
  then
    return null;
  end if;

  select *
    into v_config
  from private.ai_gm_maintenance_dispatch_config
  where singleton = true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(btrim(v_config.project_url), '') is null
     or nullif(btrim(v_config.dispatch_token), '') is null
  then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_config.project_url, '/') || '/functions/v1/world-maintenance',
    body := jsonb_build_object(
      'campaignId', v_job.campaign_id::text,
      'roomId', v_room_id::text,
      'dispatchToken', v_config.dispatch_token
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 90000
  )
  into v_request_id;

  if v_request_id is not null then
    update public.ai_gm_room_maintenance_state
    set last_dispatched_job_id = p_job_id,
        last_dispatch_at = now(),
        updated_at = now()
    where room_id = v_room_id;
  end if;

  return v_request_id;
end;
$$;

create or replace function public.dispatch_ai_gm_maintenance_job_v1(
  p_job_id uuid
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select private.dispatch_ai_gm_maintenance_job_v1(p_job_id);
$$;

revoke all on function public.dispatch_ai_gm_maintenance_job_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.dispatch_ai_gm_maintenance_job_v1(uuid)
  to service_role;

create or replace function private.reserve_ai_gm_room_maintenance_on_message_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  v_job_id := private.reserve_ai_gm_room_maintenance_v1(new.room_id);

  if v_job_id is not null then
    perform private.dispatch_ai_gm_maintenance_job_v1(v_job_id);
  end if;

  return new;
end;
$$;

comment on function private.dispatch_ai_gm_maintenance_job_v1(uuid) is
  'Stage 3 async dispatcher: wakes the world-maintenance Edge Function for one queued durable job via pg_net.';

comment on function public.verify_ai_gm_maintenance_dispatch_v1(text) is
  'Service-role-only verification for the database-held world-maintenance dispatch token.';
