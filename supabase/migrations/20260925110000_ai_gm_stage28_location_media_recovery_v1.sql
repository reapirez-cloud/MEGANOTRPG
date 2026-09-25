-- Stage 28: recover AI-GM location media, expose persistent UI state and keep
-- generation retryable without coupling the client to private worker tables.

alter table private.ai_gm_media_lifecycle
  add column if not exists dispatch_attempts integer not null default 0,
  add column if not exists recovery_attempts integer not null default 0,
  add column if not exists last_dispatch_at timestamptz,
  add column if not exists last_recovery_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='private.ai_gm_media_lifecycle'::regclass
      and conname='ai_gm_media_lifecycle_dispatch_attempts_check'
  ) then
    alter table private.ai_gm_media_lifecycle
      add constraint ai_gm_media_lifecycle_dispatch_attempts_check
      check (dispatch_attempts >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='private.ai_gm_media_lifecycle'::regclass
      and conname='ai_gm_media_lifecycle_recovery_attempts_check'
  ) then
    alter table private.ai_gm_media_lifecycle
      add constraint ai_gm_media_lifecycle_recovery_attempts_check
      check (recovery_attempts >= 0);
  end if;
end
$$;

create index if not exists ai_gm_media_lifecycle_recovery_idx
  on private.ai_gm_media_lifecycle(status,last_dispatch_at,updated_at)
  where status in ('queued','running','failed','cancelled');

create or replace function private.dispatch_ai_gm_media_job_v1(
  p_job_id uuid
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_config private.ai_gm_media_dispatch_config%rowtype;
  v_request_id bigint;
begin
  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and agent_key='ai-gm-media-worker'
    and job_type='image_generate'
    and input->>'surface'='ai_gm_media_stage9_v1'
    and status='queued';

  if v_job.id is null then return null; end if;

  select * into v_config
  from private.ai_gm_media_dispatch_config
  where singleton=true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(trim(v_config.project_url),'') is null
  then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_config.project_url,'/') || '/functions/v1/ai-gm-media',
    body := jsonb_build_object(
      'jobId',p_job_id::text,
      'campaignId',v_job.campaign_id::text,
      'dispatchToken',v_config.dispatch_token
    ),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 90000
  )
  into v_request_id;

  update private.ai_gm_media_lifecycle
  set dispatch_attempts=dispatch_attempts+1,
      last_dispatch_at=now(),
      updated_at=now()
  where image_job_id=p_job_id;

  return v_request_id;
end;
$$;

revoke all on function private.dispatch_ai_gm_media_job_v1(uuid)
  from public,anon,authenticated;

create or replace function private.recover_ai_gm_media_target_v2(
  p_target_type text,
  p_target_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lifecycle private.ai_gm_media_lifecycle%rowtype;
  v_job public.agent_jobs%rowtype;
  v_job_id uuid;
  v_request_id bigint;
  v_finalize jsonb;
  v_has_asset boolean := false;
begin
  if p_target_type not in ('character','location') or p_target_id is null then
    return jsonb_build_object('status','invalid_target');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-gm-media-recover:'||p_target_type||':'||p_target_id::text,
      0
    )
  );

  select exists(
    select 1
    from public.media_bindings b
    join public.media_assets a on a.id=b.asset_id
    where b.target_type=p_target_type
      and b.target_id=p_target_id
      and b.is_active=true
      and a.status='attached'
      and (
        (p_target_type='character' and b.target_field in ('avatar','avatar_url'))
        or
        (p_target_type='location' and b.target_field in ('image','image_url','hero','cover','panel'))
      )
  ) into v_has_asset;

  select * into v_lifecycle
  from private.ai_gm_media_lifecycle l
  where l.target_type=p_target_type
    and l.target_id=p_target_id
  order by l.updated_at desc
  limit 1
  for update;

  if v_has_asset then
    if v_lifecycle.target_id is not null then
      update private.ai_gm_media_lifecycle
      set status='completed',
          last_error=null,
          completed_at=coalesce(completed_at,now()),
          updated_at=now()
      where target_type=p_target_type
        and target_id=p_target_id
        and target_field=v_lifecycle.target_field;
    end if;
    return jsonb_build_object(
      'status','completed',
      'target_type',p_target_type,
      'target_id',p_target_id,
      'reused_asset',true
    );
  end if;

  if v_lifecycle.target_id is null then
    v_job_id:=private.queue_ai_gm_media_target_v1(
      p_target_type,
      p_target_id,
      case when p_target_type='location' then 'location_first_visit' else 'npc_create' end,
      null
    );
    return jsonb_build_object(
      'status',case when v_job_id is null then 'not_queued' else 'queued' end,
      'target_type',p_target_type,
      'target_id',p_target_id,
      'job_id',v_job_id,
      'created_lifecycle',true
    );
  end if;

  if v_lifecycle.image_job_id is not null then
    select * into v_job
    from public.agent_jobs j
    where j.id=v_lifecycle.image_job_id
    for update;
  end if;

  if v_job.id is not null and v_job.status='completed' then
    v_finalize:=public.finalize_ai_gm_media_lifecycle_v1(v_job.id);
    if v_finalize->>'status'='completed' then
      return v_finalize || jsonb_build_object('recovered',true);
    end if;

    select * into v_lifecycle
    from private.ai_gm_media_lifecycle l
    where l.target_type=p_target_type
      and l.target_id=p_target_id
    order by l.updated_at desc
    limit 1
    for update;
  end if;

  if v_job.id is not null
     and v_job.status='running'
     and v_job.updated_at < now()-interval '15 minutes'
  then
    update public.agent_jobs
    set status='failed',
        error_code='ai_gm_media_worker_stale',
        error_message='AI-GM media worker exceeded the Stage 28 running watchdog.',
        completed_at=coalesce(completed_at,now()),
        updated_at=now()
    where id=v_job.id
      and status='running';

    update private.ai_gm_media_lifecycle
    set status='failed',
        last_error='ai_gm_media_worker_stale',
        updated_at=now()
    where target_type=p_target_type
      and target_id=p_target_id
      and target_field=v_lifecycle.target_field;

    v_job.status:='failed';
    v_lifecycle.status:='failed';
  end if;

  if v_job.id is not null and v_job.status='queued' then
    if p_force
       or v_lifecycle.last_dispatch_at is null
       or v_lifecycle.last_dispatch_at < now()-interval '2 minutes'
    then
      v_request_id:=private.dispatch_ai_gm_media_job_v1(v_job.id);
    end if;

    return jsonb_build_object(
      'status','queued',
      'target_type',p_target_type,
      'target_id',p_target_id,
      'job_id',v_job.id,
      'request_id',v_request_id,
      'redispatched',v_request_id is not null
    );
  end if;

  if v_job.id is not null and v_job.status='running' then
    return jsonb_build_object(
      'status','running',
      'target_type',p_target_type,
      'target_id',p_target_id,
      'job_id',v_job.id
    );
  end if;

  if v_job.id is not null and v_job.status in ('failed','cancelled') then
    update private.ai_gm_media_lifecycle
    set status=case when v_job.status='cancelled' then 'cancelled' else 'failed' end,
        last_error=left(
          coalesce(v_job.error_message,v_job.error_code,'image_job_failed'),
          1200
        ),
        updated_at=now()
    where target_type=p_target_type
      and target_id=p_target_id
      and target_field=v_lifecycle.target_field;

    v_lifecycle.status:=case
      when v_job.status='cancelled' then 'cancelled'
      else 'failed'
    end;
  end if;

  if v_job.id is null and v_lifecycle.status in ('queued','running') then
    update private.ai_gm_media_lifecycle
    set status='failed',
        last_error='image_job_missing',
        updated_at=now()
    where target_type=p_target_type
      and target_id=p_target_id
      and target_field=v_lifecycle.target_field;
    v_lifecycle.status:='failed';
  end if;

  if v_lifecycle.status in ('failed','cancelled','completed') then
    if not p_force and v_lifecycle.recovery_attempts >= 3 then
      return jsonb_build_object(
        'status','recovery_exhausted',
        'target_type',p_target_type,
        'target_id',p_target_id,
        'job_id',v_lifecycle.image_job_id,
        'recovery_attempts',v_lifecycle.recovery_attempts
      );
    end if;

    update private.ai_gm_media_lifecycle
    set status='failed',
        recovery_attempts=recovery_attempts+1,
        last_recovery_at=now(),
        updated_at=now()
    where target_type=p_target_type
      and target_id=p_target_id
      and target_field=v_lifecycle.target_field;

    v_job_id:=private.queue_ai_gm_media_target_v1(
      p_target_type,
      p_target_id,
      v_lifecycle.trigger_kind,
      v_lifecycle.source_character_id
    );

    return jsonb_build_object(
      'status',case when v_job_id is null then 'not_queued' else 'queued' end,
      'target_type',p_target_type,
      'target_id',p_target_id,
      'job_id',v_job_id,
      'requeued',v_job_id is not null
    );
  end if;

  return jsonb_build_object(
    'status',coalesce(v_lifecycle.status,'unknown'),
    'target_type',p_target_type,
    'target_id',p_target_id,
    'job_id',v_lifecycle.image_job_id
  );
end;
$$;

revoke all on function private.recover_ai_gm_media_target_v2(text,uuid,boolean)
  from public,anon,authenticated;

create or replace function private.recover_ai_gm_media_queue_core_v2(
  p_campaign_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row record;
  v_limit integer := greatest(1,least(coalesce(p_limit,20),100));
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  for v_row in
    select l.target_type,l.target_id
    from private.ai_gm_media_lifecycle l
    left join public.agent_jobs j on j.id=l.image_job_id
    where (p_campaign_id is null or l.campaign_id=p_campaign_id)
      and (
        (
          l.status='queued'
          and (
            l.last_dispatch_at is null
            or l.last_dispatch_at < now()-interval '2 minutes'
          )
        )
        or (
          l.status='running'
          and coalesce(j.updated_at,l.updated_at) < now()-interval '15 minutes'
        )
        or (
          l.status in ('failed','cancelled')
          and l.recovery_attempts < 3
        )
        or (
          j.status='completed'
          and l.status<>'completed'
        )
      )
    order by l.updated_at asc
    limit v_limit
  loop
    v_result:=private.recover_ai_gm_media_target_v2(
      v_row.target_type,
      v_row.target_id,
      false
    );
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'processed',jsonb_array_length(v_results),
    'results',v_results,
    'runtime_stage',28
  );
end;
$$;

revoke all on function private.recover_ai_gm_media_queue_core_v2(uuid,integer)
  from public,anon,authenticated;

create or replace function public.recover_ai_gm_media_queue_v2(
  p_campaign_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;

  return private.recover_ai_gm_media_queue_core_v2(p_campaign_id,p_limit);
end;
$$;

revoke all on function public.recover_ai_gm_media_queue_v2(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.recover_ai_gm_media_queue_v2(uuid,integer)
  to service_role;

create or replace function public.poke_ai_gm_media_recovery_v1(
  p_campaign_id uuid,
  p_limit integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or not private.is_campaign_member(p_campaign_id,v_user_id)
  then
    raise exception using errcode='42501',message='campaign_member_required';
  end if;

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    return jsonb_build_object('processed',0,'status','not_ai_world','runtime_stage',28);
  end if;

  return private.recover_ai_gm_media_queue_core_v2(
    p_campaign_id,
    greatest(1,least(coalesce(p_limit,8),20))
  );
end;
$$;

revoke all on function public.poke_ai_gm_media_recovery_v1(uuid,integer)
  from public,anon;
grant execute on function public.poke_ai_gm_media_recovery_v1(uuid,integer)
  to authenticated,service_role;

create or replace function public.retry_ai_gm_location_media_v1(
  p_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
begin
  select l.campaign_id into v_campaign_id
  from public.locations l
  where l.id=p_location_id
    and l.lifecycle_state='active';

  if v_campaign_id is null then
    raise exception using errcode='22023',message='location_not_found';
  end if;

  if v_user_id is null
     or not private.is_campaign_manager(v_campaign_id,v_user_id)
  then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;

  if not private.is_ai_world_campaign_v1(v_campaign_id) then
    raise exception using errcode='22023',message='ai_world_required';
  end if;

  return private.recover_ai_gm_media_target_v2(
    'location',
    p_location_id,
    true
  );
end;
$$;

revoke all on function public.retry_ai_gm_location_media_v1(uuid)
  from public,anon;
grant execute on function public.retry_ai_gm_location_media_v1(uuid)
  to authenticated,service_role;

create or replace function public.list_ai_gm_location_media_states_v1(
  p_campaign_id uuid
)
returns table(
  location_id uuid,
  status text,
  generation integer,
  last_error text,
  updated_at timestamptz,
  media_path text,
  media_width integer,
  media_height integer,
  can_retry boolean
)
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage boolean := false;
begin
  if v_user_id is null
     or not private.is_campaign_member(p_campaign_id,v_user_id)
  then
    raise exception using errcode='42501',message='campaign_member_required';
  end if;

  v_can_manage:=private.is_campaign_manager(p_campaign_id,v_user_id);

  return query
  select
    l.id,
    case
      when media.storage_path is not null
        or nullif(trim(coalesce(l.image_url,'')),'') is not null
        then 'completed'
      when lifecycle.status is not null then lifecycle.status
      else 'idle'
    end as status,
    coalesce(lifecycle.generation,0) as generation,
    case when v_can_manage then lifecycle.last_error else null end as last_error,
    coalesce(lifecycle.updated_at,l.updated_at) as updated_at,
    coalesce(media.storage_path,nullif(trim(coalesce(l.image_url,'')),'')) as media_path,
    media.width as media_width,
    media.height as media_height,
    (
      v_can_manage
      and (
        lifecycle.status in ('failed','cancelled')
        or (
          lifecycle.status='queued'
          and (
            lifecycle.last_dispatch_at is null
            or lifecycle.last_dispatch_at < now()-interval '3 minutes'
          )
        )
        or (
          lifecycle.status='running'
          and lifecycle.updated_at < now()-interval '15 minutes'
        )
      )
    ) as can_retry
  from public.locations l
  left join private.ai_gm_media_lifecycle lifecycle
    on lifecycle.target_type='location'
   and lifecycle.target_id=l.id
   and lifecycle.target_field='image_url'
  left join lateral (
    select a.storage_path,a.width,a.height
    from public.media_bindings b
    join public.media_assets a on a.id=b.asset_id
    where b.campaign_id=p_campaign_id
      and b.target_type='location'
      and b.target_id=l.id
      and b.is_active=true
      and b.target_field in ('image','image_url','hero','cover','panel')
      and a.status='attached'
    order by b.created_at desc
    limit 1
  ) media on true
  where l.campaign_id=p_campaign_id
    and l.lifecycle_state='active'
  order by l.sort_order,l.name,l.id;
end;
$$;

revoke all on function public.list_ai_gm_location_media_states_v1(uuid)
  from public,anon;
grant execute on function public.list_ai_gm_location_media_states_v1(uuid)
  to authenticated,service_role;

update private.ai_gm_media_dispatch_config
set enabled=(nullif(trim(project_url),'') is not null),
    updated_at=now()
where singleton=true;

do $$
declare
  v_row record;
begin
  for v_row in
    select distinct ws.location_id,c.id as character_id
    from public.character_world_state ws
    join public.characters c
      on c.id=ws.character_id
     and c.campaign_id=ws.campaign_id
    where ws.location_id is not null
      and c.character_type='pc'
      and c.life_state='alive'
      and c.publication_state='campaign'
      and private.is_ai_world_campaign_v1(c.campaign_id)
  loop
    perform private.queue_ai_gm_media_target_v1(
      'location',
      v_row.location_id,
      'location_first_visit',
      v_row.character_id
    );
  end loop;

  perform private.recover_ai_gm_media_queue_core_v2(null,100);
end
$$;
