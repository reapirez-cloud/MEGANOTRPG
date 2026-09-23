-- AI GM Stage 3: allow the async world worker to finish before pg_net records a timeout.

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
