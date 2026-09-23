-- AI GM Stage 3: 45-message reconciliation/archive watermark.
--
-- Every GAME room counts all canonical chat_messages, regardless of author.
-- Each 45-message window reserves exactly one durable world_maintenance job.
-- Existing rooms start at the migration-time high-water mark so old history is
-- not unexpectedly replayed. New rooms start at zero and count from message 1.

alter table public.agent_jobs
  drop constraint if exists agent_jobs_job_type_check;

alter table public.agent_jobs
  add constraint agent_jobs_job_type_check
  check (
    job_type = any (
      array[
        'conversation_turn'::text,
        'image_generate'::text,
        'image_review'::text,
        'image_attach'::text,
        'draft_create'::text,
        'draft_revise'::text,
        'draft_apply'::text,
        'mechanics_compile'::text,
        'dev_patch'::text,
        'dev_test'::text,
        'dev_build'::text,
        'dev_preview'::text,
        'dev_deploy'::text,
        'world_maintenance'::text
      ]
    )
  );

create table if not exists public.ai_gm_room_maintenance_state (
  room_id uuid primary key references public.chat_rooms(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  watermark_message_id bigint not null default 0,
  last_reserved_message_id bigint,
  windows_completed integer not null default 0,
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_gm_room_maintenance_state_watermark_check
    check (watermark_message_id >= 0),
  constraint ai_gm_room_maintenance_state_windows_check
    check (windows_completed >= 0)
);

alter table public.ai_gm_room_maintenance_state enable row level security;

revoke all on table public.ai_gm_room_maintenance_state
  from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_gm_room_maintenance_state
  to service_role;

create unique index if not exists agent_jobs_world_maintenance_window_unique
  on public.agent_jobs (
    (input ->> 'maintenance_room_id'),
    (input ->> 'range_end_message_id')
  )
  where job_type = 'world_maintenance';

create index if not exists agent_jobs_world_maintenance_queue_idx
  on public.agent_jobs (campaign_id, status, created_at)
  where job_type = 'world_maintenance';

alter table public.campaign_memory_summaries
  add column if not exists maintenance_job_id uuid
  references public.agent_jobs(id) on delete set null;

alter table public.campaign_memory_facts
  add column if not exists maintenance_job_id uuid
  references public.agent_jobs(id) on delete set null;

create unique index if not exists campaign_memory_summaries_maintenance_job_unique
  on public.campaign_memory_summaries (maintenance_job_id)
  where maintenance_job_id is not null;

create index if not exists campaign_memory_facts_maintenance_job_idx
  on public.campaign_memory_facts (maintenance_job_id)
  where maintenance_job_id is not null;

-- Existing rooms start after current history. New rooms have no row yet and
-- will be initialized at zero by the first message trigger.
insert into public.ai_gm_room_maintenance_state (
  room_id,
  campaign_id,
  watermark_message_id,
  last_reserved_message_id
)
select
  r.id,
  r.campaign_id,
  coalesce(max(m.id), 0)::bigint,
  coalesce(max(m.id), 0)::bigint
from public.chat_rooms r
left join public.chat_messages m on m.room_id = r.id
where r.category = 'game'
group by r.id, r.campaign_id
on conflict (room_id) do nothing;

create or replace function private.reserve_ai_gm_room_maintenance_v1(
  p_room_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.chat_rooms%rowtype;
  v_state public.ai_gm_room_maintenance_state%rowtype;
  v_manager_user_id uuid;
  v_existing_job public.agent_jobs%rowtype;
  v_range_start bigint;
  v_range_end bigint;
  v_job_id uuid;
  v_retry_count integer;
begin
  if p_room_id is null then
    return null;
  end if;

  select *
    into v_room
  from public.chat_rooms
  where id = p_room_id;

  if v_room.id is null
     or v_room.category <> 'game'
  then
    return null;
  end if;

  insert into public.ai_gm_room_maintenance_state (
    room_id,
    campaign_id,
    watermark_message_id
  )
  values (
    v_room.id,
    v_room.campaign_id,
    0
  )
  on conflict (room_id) do nothing;

  select *
    into v_state
  from public.ai_gm_room_maintenance_state
  where room_id = v_room.id
  for update;

  select *
    into v_existing_job
  from public.agent_jobs j
  where j.job_type = 'world_maintenance'
    and j.campaign_id = v_room.campaign_id
    and j.input ->> 'maintenance_room_id' = v_room.id::text
    and j.status in ('queued', 'running')
  order by j.created_at asc
  limit 1;

  if v_existing_job.id is not null then
    return v_existing_job.id;
  end if;

  select m.id
    into v_range_end
  from public.chat_messages m
  where m.room_id = v_room.id
    and m.id > v_state.watermark_message_id
  order by m.id asc
  offset 44
  limit 1;

  if v_range_end is null then
    return null;
  end if;

  select min(m.id)
    into v_range_start
  from public.chat_messages m
  where m.room_id = v_room.id
    and m.id > v_state.watermark_message_id
    and m.id <= v_range_end;

  select *
    into v_existing_job
  from public.agent_jobs j
  where j.job_type = 'world_maintenance'
    and j.campaign_id = v_room.campaign_id
    and j.input ->> 'maintenance_room_id' = v_room.id::text
    and j.input ->> 'range_end_message_id' = v_range_end::text
  order by j.created_at desc
  limit 1
  for update;

  if v_existing_job.id is not null then
    if v_existing_job.status = 'completed' then
      return v_existing_job.id;
    end if;

    if v_existing_job.status = 'failed' then
      v_retry_count :=
        coalesce((v_existing_job.input ->> 'retry_count')::integer, 0);

      if v_retry_count < 2 then
        update public.agent_jobs
        set status = 'queued',
            input = input || jsonb_build_object(
              'retry_count', v_retry_count + 1
            ),
            result = '{}'::jsonb,
            error_code = null,
            error_message = null,
            started_at = null,
            completed_at = null,
            updated_at = now()
        where id = v_existing_job.id;

        return v_existing_job.id;
      end if;
    end if;

    return null;
  end if;

  select cm.user_id
    into v_manager_user_id
  from public.campaign_members cm
  where cm.campaign_id = v_room.campaign_id
    and (cm.is_owner = true or cm.role = 'gm')
  order by cm.is_owner desc, cm.created_at asc
  limit 1;

  if v_manager_user_id is null then
    return null;
  end if;

  insert into public.agent_jobs (
    campaign_id,
    thread_id,
    requested_by,
    agent_key,
    job_type,
    status,
    input,
    result,
    requested_outputs,
    completed_outputs
  )
  values (
    v_room.campaign_id,
    null,
    v_manager_user_id,
    'world-worker',
    'world_maintenance',
    'queued',
    jsonb_build_object(
      'surface', 'world_maintenance_v1',
      'maintenance_room_id', v_room.id::text,
      'previous_watermark_message_id', v_state.watermark_message_id::text,
      'range_start_message_id', v_range_start::text,
      'range_end_message_id', v_range_end::text,
      'message_count', 45,
      'context_limit', 50,
      'retry_count', 0
    ),
    '{}'::jsonb,
    1,
    0
  )
  returning id into v_job_id;

  update public.ai_gm_room_maintenance_state
  set last_reserved_message_id = v_range_end,
      updated_at = now()
  where room_id = v_room.id;

  return v_job_id;
exception
  when unique_violation then
    select j.id
      into v_job_id
    from public.agent_jobs j
    where j.job_type = 'world_maintenance'
      and j.campaign_id = v_room.campaign_id
      and j.input ->> 'maintenance_room_id' = v_room.id::text
      and j.input ->> 'range_end_message_id' = v_range_end::text
    order by j.created_at desc
    limit 1;

    return v_job_id;
end;
$$;

create or replace function private.reserve_ai_gm_room_maintenance_on_message_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reserve_ai_gm_room_maintenance_v1(new.room_id);
  return new;
end;
$$;

drop trigger if exists reserve_ai_gm_room_maintenance_on_message_v1
  on public.chat_messages;

create trigger reserve_ai_gm_room_maintenance_on_message_v1
after insert on public.chat_messages
for each row
execute function private.reserve_ai_gm_room_maintenance_on_message_v1();

create or replace function public.reserve_ai_gm_room_maintenance_v1(
  p_room_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.reserve_ai_gm_room_maintenance_v1(p_room_id);
$$;

revoke all on function public.reserve_ai_gm_room_maintenance_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_gm_room_maintenance_v1(uuid)
  to service_role;

create or replace function public.complete_ai_gm_room_maintenance_v1(
  p_job_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_state public.ai_gm_room_maintenance_state%rowtype;
  v_room_id uuid;
  v_previous_watermark bigint;
  v_range_end bigint;
  v_next_job_id uuid;
begin
  select *
    into v_job
  from public.agent_jobs
  where id = p_job_id
    and job_type = 'world_maintenance'
    and input ->> 'surface' = 'world_maintenance_v1'
  for update;

  if v_job.id is null then
    raise exception 'world_maintenance_job_not_found';
  end if;

  v_room_id := nullif(v_job.input ->> 'maintenance_room_id', '')::uuid;
  v_previous_watermark :=
    coalesce(nullif(v_job.input ->> 'previous_watermark_message_id', '')::bigint, 0);
  v_range_end :=
    nullif(v_job.input ->> 'range_end_message_id', '')::bigint;

  if v_room_id is null or v_range_end is null then
    raise exception 'world_maintenance_job_input_invalid';
  end if;

  select *
    into v_state
  from public.ai_gm_room_maintenance_state
  where room_id = v_room_id
  for update;

  if v_state.room_id is null then
    raise exception 'world_maintenance_state_missing';
  end if;

  if v_state.watermark_message_id = v_range_end
     and v_job.status = 'completed'
  then
    return jsonb_build_object(
      'completed', true,
      'idempotent', true,
      'watermark_message_id', v_range_end,
      'next_job_id', null
    );
  end if;

  if v_job.status <> 'running' then
    raise exception 'world_maintenance_job_not_running';
  end if;

  if v_state.watermark_message_id <> v_previous_watermark then
    raise exception 'world_maintenance_watermark_conflict';
  end if;

  update public.ai_gm_room_maintenance_state
  set watermark_message_id = v_range_end,
      windows_completed = windows_completed + 1,
      last_completed_at = now(),
      updated_at = now()
  where room_id = v_room_id;

  update public.agent_jobs
  set status = 'completed',
      result = coalesce(p_result, '{}'::jsonb),
      completed_outputs = 1,
      completed_at = now(),
      updated_at = now(),
      error_code = null,
      error_message = null
  where id = p_job_id;

  v_next_job_id :=
    private.reserve_ai_gm_room_maintenance_v1(v_room_id);

  return jsonb_build_object(
    'completed', true,
    'idempotent', false,
    'watermark_message_id', v_range_end,
    'next_job_id', v_next_job_id
  );
end;
$$;

revoke all on function public.complete_ai_gm_room_maintenance_v1(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_ai_gm_room_maintenance_v1(uuid, jsonb)
  to service_role;

comment on table public.ai_gm_room_maintenance_state is
  'AI GM Stage 3 per-room watermark. Every completed window advances exactly 45 chat messages; history is never deleted.';

comment on function private.reserve_ai_gm_room_maintenance_v1(uuid) is
  'Reserve exactly one durable 45-message world maintenance job for the next unprocessed room window.';

comment on function public.complete_ai_gm_room_maintenance_v1(uuid, jsonb) is
  'Atomically finish one maintenance job, advance its room watermark and reserve the next backlog window when present.';
