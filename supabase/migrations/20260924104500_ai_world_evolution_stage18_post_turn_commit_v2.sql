-- AI World Evolution Stage 18 rebuilt from scratch.
-- Removes the abandoned v1 gate and replaces it with a durable per-intent queue.
-- Core rule: the visible GM answer and the post-turn gate are committed atomically.
-- Junior execution is one persisted operation per intent; ambiguous crashes never auto-replay mutations.

create extension if not exists pgcrypto with schema extensions;

-- Delete abandoned Stage 18 v1 objects if an environment still has them.
drop trigger if exists ai_gm_post_turn_gate on public.chat_messages;
drop function if exists private.ai_gm_post_turn_gate_trigger();
drop function if exists public.create_ai_gm_post_turn_commit_v1(
  uuid,uuid,uuid,bigint,bigint,uuid,uuid,text,text,jsonb
);
drop table if exists public.ai_gm_turn_commit_gates;

create table if not exists public.ai_gm_post_turn_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  parent_job_id uuid not null references public.agent_jobs(id) on delete cascade,
  source_message_id bigint not null references public.chat_messages(id) on delete restrict,
  reply_message_id bigint not null references public.chat_messages(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  source_character_id uuid references public.characters(id) on delete set null,
  state text not null default 'queued'
    check (state in ('queued','running','recovery_required','completed','cancelled')),
  published_answer text not null check (length(published_answer) between 1 and 16000),
  dispatch_count integer not null default 0 check (dispatch_count >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_dispatched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (parent_job_id),
  unique (reply_message_id)
);

create index if not exists ai_gm_post_turn_jobs_room_state_idx
  on public.ai_gm_post_turn_jobs(room_id,state,created_at desc);

create index if not exists ai_gm_post_turn_jobs_stale_running_idx
  on public.ai_gm_post_turn_jobs(lease_expires_at)
  where state='running';

alter table public.ai_gm_post_turn_jobs enable row level security;
revoke all on table public.ai_gm_post_turn_jobs from public, anon, authenticated;
grant all on table public.ai_gm_post_turn_jobs to service_role;

create policy ai_gm_post_turn_jobs_no_direct_reads
  on public.ai_gm_post_turn_jobs
  for select
  to authenticated
  using (false);

create table if not exists public.ai_gm_post_turn_intents (
  id uuid primary key default extensions.gen_random_uuid(),
  job_id uuid not null references public.ai_gm_post_turn_jobs(id) on delete cascade,
  intent_index smallint not null check (intent_index between 1 and 12),
  intent_key text not null check (
    length(intent_key) between 1 and 96
    and intent_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  kind text not null check (
    kind in ('location','npc','quest','memory','canonical_state','binding')
  ),
  instruction text not null check (length(instruction) between 1 and 1600),
  evidence text not null default '' check (length(evidence) <= 1600),
  state text not null default 'pending'
    check (state in ('pending','executing','retry_wait','recovery_required','completed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  planned_tool_name text,
  planned_args jsonb,
  plan_fingerprint text check (
    plan_fingerprint is null or plan_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  worker_model_key text,
  execution_started_at timestamptz,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(job_id,intent_index),
  unique(job_id,intent_key)
);

create index if not exists ai_gm_post_turn_intents_job_state_idx
  on public.ai_gm_post_turn_intents(job_id,state,intent_index);

alter table public.ai_gm_post_turn_intents enable row level security;
revoke all on table public.ai_gm_post_turn_intents from public, anon, authenticated;
grant all on table public.ai_gm_post_turn_intents to service_role;

create policy ai_gm_post_turn_intents_no_direct_reads
  on public.ai_gm_post_turn_intents
  for select
  to authenticated
  using (false);

create table if not exists private.ai_gm_post_turn_dispatch_config (
  singleton boolean primary key default true check (singleton),
  project_url text,
  dispatch_token text not null default encode(extensions.gen_random_bytes(32),'hex'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.ai_gm_post_turn_dispatch_config(singleton,project_url,enabled)
select true, c.project_url, c.enabled
from private.ai_gm_roll_resume_dispatch_config c
where c.singleton=true
on conflict (singleton) do update
set project_url=excluded.project_url,
    enabled=excluded.enabled,
    updated_at=now();

create or replace function public.verify_ai_gm_post_turn_dispatch_v2(p_token text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (
      select c.enabled is true
        and nullif(trim(c.dispatch_token),'') is not null
        and extensions.crypt(coalesce(p_token,''), extensions.crypt(c.dispatch_token, extensions.gen_salt('bf'))) =
            extensions.crypt(c.dispatch_token, extensions.crypt(c.dispatch_token, extensions.gen_salt('bf')))
      from private.ai_gm_post_turn_dispatch_config c
      where c.singleton=true
    ),
    false
  );
$$;

-- Replace the needlessly expensive crypt comparison above with constant text comparison
-- in a service-only verifier. The token never leaves server-to-server dispatch.
create or replace function public.verify_ai_gm_post_turn_dispatch_v2(p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_config private.ai_gm_post_turn_dispatch_config%rowtype;
begin
  if auth.role() <> 'service_role' then
    return false;
  end if;

  select * into v_config
  from private.ai_gm_post_turn_dispatch_config
  where singleton=true;

  return v_config.enabled is true
    and nullif(trim(v_config.dispatch_token),'') is not null
    and p_token = v_config.dispatch_token;
end;
$$;

revoke all on function public.verify_ai_gm_post_turn_dispatch_v2(text)
  from public, anon, authenticated;
grant execute on function public.verify_ai_gm_post_turn_dispatch_v2(text)
  to service_role;

create or replace function private.dispatch_ai_gm_post_turn_v2(p_job_id uuid)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.ai_gm_post_turn_jobs%rowtype;
  v_config private.ai_gm_post_turn_dispatch_config%rowtype;
  v_request_id bigint;
begin
  select * into v_job
  from public.ai_gm_post_turn_jobs
  where id=p_job_id
  for update;

  if v_job.id is null
     or v_job.state in ('completed','cancelled','recovery_required')
  then
    return null;
  end if;

  if v_job.last_dispatched_at is not null
     and v_job.last_dispatched_at > now() - interval '2 seconds'
  then
    return null;
  end if;

  select * into v_config
  from private.ai_gm_post_turn_dispatch_config
  where singleton=true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(trim(v_config.project_url),'') is null
     or nullif(trim(v_config.dispatch_token),'') is null
  then
    return null;
  end if;

  update public.ai_gm_post_turn_jobs
  set last_dispatched_at=now(),
      dispatch_count=dispatch_count+1,
      updated_at=now()
  where id=p_job_id;

  select net.http_post(
    url := rtrim(v_config.project_url,'/') || '/functions/v1/ai-gm-post-turn',
    body := jsonb_build_object(
      'jobId',p_job_id::text,
      'campaignId',v_job.campaign_id::text,
      'dispatchToken',v_config.dispatch_token
    ),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 90000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.dispatch_ai_gm_post_turn_v2(uuid)
  from public, anon, authenticated;

create or replace function private.enqueue_ai_gm_post_turn_v2(
  p_parent_job_id uuid,
  p_reply_message_id bigint,
  p_published_answer text,
  p_post_turn_intents jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_parent public.agent_jobs%rowtype;
  v_existing public.ai_gm_post_turn_jobs%rowtype;
  v_job_id uuid;
  v_room_id uuid;
  v_source_message_id bigint;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_item jsonb;
  v_ordinal bigint;
  v_key text;
  v_kind text;
  v_instruction text;
  v_evidence text;
begin
  if jsonb_typeof(coalesce(p_post_turn_intents,'[]'::jsonb)) <> 'array' then
    raise exception 'stage18_post_turn_intents_must_be_array';
  end if;

  if jsonb_array_length(coalesce(p_post_turn_intents,'[]'::jsonb)) = 0 then
    return null;
  end if;

  if jsonb_array_length(p_post_turn_intents) > 12 then
    raise exception 'stage18_post_turn_intents_too_many';
  end if;

  select * into v_parent
  from public.agent_jobs
  where id=p_parent_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_parent.id is null then
    raise exception 'stage18_parent_turn_not_found';
  end if;

  if v_parent.status <> 'running' then
    raise exception 'stage18_parent_turn_not_running';
  end if;

  select * into v_existing
  from public.ai_gm_post_turn_jobs
  where parent_job_id=p_parent_job_id
  for update;

  if v_existing.id is not null then
    if v_existing.reply_message_id <> p_reply_message_id then
      raise exception 'stage18_parent_turn_reply_conflict';
    end if;
    return v_existing.id;
  end if;

  v_room_id := nullif(v_parent.input->>'room_id','')::uuid;
  v_source_message_id := nullif(v_parent.input->>'source_chat_message_id','')::bigint;
  v_manager_user_id := nullif(v_parent.input->>'manager_user_id','')::uuid;
  v_source_character_id := nullif(v_parent.input->>'source_character_id','')::uuid;

  if v_room_id is null
     or v_source_message_id is null
     or v_manager_user_id is null
  then
    raise exception 'stage18_parent_identity_missing';
  end if;

  if not exists (
    select 1
    from public.chat_messages m
    where m.id=p_reply_message_id
      and m.room_id=v_room_id
  ) then
    raise exception 'stage18_reply_message_missing';
  end if;

  insert into public.ai_gm_post_turn_jobs(
    campaign_id,room_id,parent_job_id,source_message_id,reply_message_id,
    requested_by,source_character_id,state,published_answer
  )
  values(
    v_parent.campaign_id,v_room_id,v_parent.id,v_source_message_id,p_reply_message_id,
    v_manager_user_id,v_source_character_id,'queued',
    left(btrim(coalesce(p_published_answer,'')),16000)
  )
  returning id into v_job_id;

  for v_item,v_ordinal in
    select value,ordinality
    from jsonb_array_elements(p_post_turn_intents) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'stage18_post_turn_intent_invalid';
    end if;

    v_key := lower(btrim(coalesce(v_item->>'intent_key','')));
    v_kind := lower(btrim(coalesce(v_item->>'kind','')));
    v_instruction := btrim(coalesce(v_item->>'instruction',''));
    v_evidence := btrim(coalesce(v_item->>'evidence',''));

    if v_key !~ '^[a-z0-9][a-z0-9._:-]{0,95}$' then
      raise exception 'stage18_post_turn_intent_key_invalid';
    end if;

    if v_kind not in ('location','npc','quest','memory','canonical_state','binding') then
      raise exception 'stage18_post_turn_intent_kind_invalid';
    end if;

    if length(v_instruction) < 1 or length(v_instruction) > 1600 then
      raise exception 'stage18_post_turn_intent_instruction_invalid';
    end if;

    if length(v_evidence) > 1600 then
      raise exception 'stage18_post_turn_intent_evidence_invalid';
    end if;

    insert into public.ai_gm_post_turn_intents(
      job_id,intent_index,intent_key,kind,instruction,evidence
    )
    values(
      v_job_id,v_ordinal::smallint,v_key,v_kind,v_instruction,v_evidence
    );
  end loop;

  perform private.dispatch_ai_gm_post_turn_v2(v_job_id);
  return v_job_id;
end;
$$;

revoke all on function private.enqueue_ai_gm_post_turn_v2(uuid,bigint,text,jsonb)
  from public, anon, authenticated;

create or replace function public.publish_ai_gm_message_stage18_v2(
  p_job_id uuid,
  p_body text,
  p_post_turn_intents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_message_id bigint;
  v_post_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  v_message_id := public.publish_ai_gm_message_v1(p_job_id,p_body);

  v_post_job_id := private.enqueue_ai_gm_post_turn_v2(
    p_job_id,
    v_message_id,
    p_body,
    coalesce(p_post_turn_intents,'[]'::jsonb)
  );

  return jsonb_build_object(
    'reply_message_id',v_message_id,
    'post_turn_job_id',v_post_job_id,
    'post_turn_intent_count',jsonb_array_length(coalesce(p_post_turn_intents,'[]'::jsonb))
  );
end;
$$;

revoke all on function public.publish_ai_gm_message_stage18_v2(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_ai_gm_message_stage18_v2(uuid,text,jsonb)
  to service_role;

create or replace function public.publish_ai_gm_npc_message_stage18_v2(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_body text,
  p_post_turn_intents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_message_id bigint;
  v_post_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  v_message_id := public.publish_ai_gm_npc_message_v2(
    p_job_id,p_npc_character_id,p_body
  );

  v_post_job_id := private.enqueue_ai_gm_post_turn_v2(
    p_job_id,
    v_message_id,
    p_body,
    coalesce(p_post_turn_intents,'[]'::jsonb)
  );

  return jsonb_build_object(
    'reply_message_id',v_message_id,
    'post_turn_job_id',v_post_job_id,
    'post_turn_intent_count',jsonb_array_length(coalesce(p_post_turn_intents,'[]'::jsonb))
  );
end;
$$;

revoke all on function public.publish_ai_gm_npc_message_stage18_v2(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_ai_gm_npc_message_stage18_v2(uuid,uuid,text,jsonb)
  to service_role;

create or replace function public.publish_ai_gm_turn_messages_stage18_v2(
  p_job_id uuid,
  p_messages jsonb,
  p_post_turn_intents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ids jsonb;
  v_last_id bigint;
  v_answer text;
  v_post_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  v_ids := public.publish_ai_gm_turn_messages_v1(p_job_id,p_messages);

  select value::text::bigint into v_last_id
  from jsonb_array_elements(v_ids)
  with ordinality
  order by ordinality desc
  limit 1;

  select left(string_agg(coalesce(value->>'body',''), E'\n\n' order by ordinality),16000)
  into v_answer
  from jsonb_array_elements(p_messages) with ordinality;

  if v_last_id is null then
    raise exception 'stage18_dialogue_reply_missing';
  end if;

  v_post_job_id := private.enqueue_ai_gm_post_turn_v2(
    p_job_id,
    v_last_id,
    coalesce(v_answer,''),
    coalesce(p_post_turn_intents,'[]'::jsonb)
  );

  return jsonb_build_object(
    'reply_message_ids',v_ids,
    'reply_message_id',v_last_id,
    'post_turn_job_id',v_post_job_id,
    'post_turn_intent_count',jsonb_array_length(coalesce(p_post_turn_intents,'[]'::jsonb))
  );
end;
$$;

revoke all on function public.publish_ai_gm_turn_messages_stage18_v2(uuid,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_ai_gm_turn_messages_stage18_v2(uuid,jsonb,jsonb)
  to service_role;

create or replace function public.claim_ai_gm_post_turn_job_v2(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.ai_gm_post_turn_jobs%rowtype;
  v_intent public.ai_gm_post_turn_intents%rowtype;
  v_lease uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.ai_gm_post_turn_jobs
  where id=p_job_id
  for update;

  if v_job.id is null then
    raise exception 'stage18_post_turn_job_not_found';
  end if;

  if v_job.state in ('completed','cancelled','recovery_required') then
    return jsonb_build_object('claimed',false,'state',v_job.state,'job_id',v_job.id);
  end if;

  if v_job.state='running' then
    if v_job.lease_expires_at is not null and v_job.lease_expires_at > now() then
      return jsonb_build_object('claimed',false,'state','running','job_id',v_job.id);
    end if;

    if exists (
      select 1
      from public.ai_gm_post_turn_intents i
      where i.job_id=v_job.id
        and i.state='executing'
    ) then
      update public.ai_gm_post_turn_intents
      set state='recovery_required',
          last_error='stage18_ambiguous_stale_execution',
          updated_at=now()
      where job_id=v_job.id
        and state='executing';

      update public.ai_gm_post_turn_jobs
      set state='recovery_required',
          lease_token=null,
          lease_expires_at=null,
          last_error='stage18_ambiguous_stale_execution',
          updated_at=now()
      where id=v_job.id;

      return jsonb_build_object(
        'claimed',false,
        'state','recovery_required',
        'job_id',v_job.id,
        'error','stage18_ambiguous_stale_execution'
      );
    end if;

    update public.ai_gm_post_turn_jobs
    set state='queued',
        lease_token=null,
        lease_expires_at=null,
        last_error='stage18_stale_before_execution_requeued',
        updated_at=now()
    where id=v_job.id;

    v_job.state := 'queued';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intents
  where job_id=v_job.id
    and state in ('pending','retry_wait')
  order by intent_index
  limit 1
  for update;

  if v_intent.id is null then
    if not exists (
      select 1
      from public.ai_gm_post_turn_intents i
      where i.job_id=v_job.id
        and i.state <> 'completed'
    ) then
      update public.ai_gm_post_turn_jobs
      set state='completed',
          lease_token=null,
          lease_expires_at=null,
          completed_at=coalesce(completed_at,now()),
          updated_at=now(),
          last_error=null
      where id=v_job.id;

      return jsonb_build_object('claimed',false,'state','completed','job_id',v_job.id);
    end if;

    return jsonb_build_object('claimed',false,'state',v_job.state,'job_id',v_job.id);
  end if;

  if v_intent.attempt_count >= 3 then
    update public.ai_gm_post_turn_intents
    set state='recovery_required',
        last_error=coalesce(last_error,'stage18_intent_retry_limit'),
        updated_at=now()
    where id=v_intent.id;

    update public.ai_gm_post_turn_jobs
    set state='recovery_required',
        lease_token=null,
        lease_expires_at=null,
        last_error='stage18_intent_retry_limit',
        updated_at=now()
    where id=v_job.id;

    return jsonb_build_object(
      'claimed',false,'state','recovery_required','job_id',v_job.id,
      'intent_id',v_intent.id,'error','stage18_intent_retry_limit'
    );
  end if;

  v_lease := extensions.gen_random_uuid();

  update public.ai_gm_post_turn_jobs
  set state='running',
      lease_token=v_lease,
      lease_expires_at=now()+interval '3 minutes',
      updated_at=now()
  where id=v_job.id;

  return jsonb_build_object(
    'claimed',true,
    'state','running',
    'job_id',v_job.id,
    'campaign_id',v_job.campaign_id,
    'room_id',v_job.room_id,
    'parent_job_id',v_job.parent_job_id,
    'source_message_id',v_job.source_message_id,
    'reply_message_id',v_job.reply_message_id,
    'requested_by',v_job.requested_by,
    'source_character_id',v_job.source_character_id,
    'published_answer',v_job.published_answer,
    'lease_token',v_lease,
    'intent',jsonb_build_object(
      'id',v_intent.id,
      'intent_index',v_intent.intent_index,
      'intent_key',v_intent.intent_key,
      'kind',v_intent.kind,
      'instruction',v_intent.instruction,
      'evidence',v_intent.evidence,
      'attempt_count',v_intent.attempt_count,
      'last_error',v_intent.last_error
    )
  );
end;
$$;

revoke all on function public.claim_ai_gm_post_turn_job_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_gm_post_turn_job_v2(uuid)
  to service_role;

create or replace function public.begin_ai_gm_post_turn_intent_v2(
  p_job_id uuid,
  p_intent_id uuid,
  p_lease_token uuid,
  p_tool_name text,
  p_tool_args jsonb,
  p_worker_model_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.ai_gm_post_turn_jobs%rowtype;
  v_intent public.ai_gm_post_turn_intents%rowtype;
  v_fingerprint text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.ai_gm_post_turn_jobs
  where id=p_job_id
  for update;

  if v_job.id is null
     or v_job.state <> 'running'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= now()
  then
    raise exception 'stage18_post_turn_lease_invalid';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intents
  where id=p_intent_id
    and job_id=p_job_id
  for update;

  if v_intent.id is null then
    raise exception 'stage18_post_turn_intent_not_found';
  end if;

  if v_intent.state='completed' then
    return jsonb_build_object('state','completed','result',v_intent.result);
  end if;

  if v_intent.state='executing' then
    raise exception 'stage18_post_turn_intent_already_executing';
  end if;

  if v_intent.state='recovery_required' then
    raise exception 'stage18_post_turn_intent_recovery_required';
  end if;

  if v_intent.state not in ('pending','retry_wait') then
    raise exception 'stage18_post_turn_intent_state_invalid';
  end if;

  if v_intent.attempt_count >= 3 then
    raise exception 'stage18_intent_retry_limit';
  end if;

  if nullif(trim(coalesce(p_tool_name,'')),'') is null then
    raise exception 'stage18_tool_name_required';
  end if;

  if jsonb_typeof(coalesce(p_tool_args,'{}'::jsonb)) <> 'object' then
    raise exception 'stage18_tool_args_must_be_object';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'job_id',p_job_id,
          'intent_id',p_intent_id,
          'attempt',v_intent.attempt_count+1,
          'tool_name',p_tool_name,
          'tool_args',coalesce(p_tool_args,'{}'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  update public.ai_gm_post_turn_intents
  set state='executing',
      attempt_count=attempt_count+1,
      planned_tool_name=left(trim(p_tool_name),120),
      planned_args=coalesce(p_tool_args,'{}'::jsonb),
      plan_fingerprint=v_fingerprint,
      worker_model_key=left(trim(coalesce(p_worker_model_key,'')),160),
      execution_started_at=now(),
      last_error=null,
      updated_at=now()
  where id=p_intent_id;

  return jsonb_build_object(
    'state','executing',
    'plan_fingerprint',v_fingerprint,
    'attempt',v_intent.attempt_count+1
  );
end;
$$;

revoke all on function public.begin_ai_gm_post_turn_intent_v2(uuid,uuid,uuid,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.begin_ai_gm_post_turn_intent_v2(uuid,uuid,uuid,text,jsonb,text)
  to service_role;

create or replace function public.complete_ai_gm_post_turn_intent_v2(
  p_job_id uuid,
  p_intent_id uuid,
  p_lease_token uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.ai_gm_post_turn_jobs%rowtype;
  v_intent public.ai_gm_post_turn_intents%rowtype;
  v_remaining integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.ai_gm_post_turn_jobs
  where id=p_job_id
  for update;

  if v_job.id is null
     or v_job.state <> 'running'
     or v_job.lease_token is distinct from p_lease_token
  then
    raise exception 'stage18_post_turn_lease_invalid';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intents
  where id=p_intent_id and job_id=p_job_id
  for update;

  if v_intent.id is null then
    raise exception 'stage18_post_turn_intent_not_found';
  end if;

  if v_intent.state='completed' then
    return jsonb_build_object('state','completed','job_state',v_job.state);
  end if;

  if v_intent.state <> 'executing' then
    raise exception 'stage18_post_turn_intent_not_executing';
  end if;

  update public.ai_gm_post_turn_intents
  set state='completed',
      result=coalesce(p_result,'{}'::jsonb),
      completed_at=now(),
      updated_at=now(),
      last_error=null
  where id=p_intent_id;

  select count(*) into v_remaining
  from public.ai_gm_post_turn_intents
  where job_id=p_job_id
    and state <> 'completed';

  if v_remaining=0 then
    update public.ai_gm_post_turn_jobs
    set state='completed',
        lease_token=null,
        lease_expires_at=null,
        completed_at=now(),
        updated_at=now(),
        last_error=null
    where id=p_job_id;

    return jsonb_build_object('state','completed','job_state','completed','remaining',0);
  end if;

  update public.ai_gm_post_turn_jobs
  set state='queued',
      lease_token=null,
      lease_expires_at=null,
      updated_at=now()
  where id=p_job_id;

  perform private.dispatch_ai_gm_post_turn_v2(p_job_id);

  return jsonb_build_object('state','completed','job_state','queued','remaining',v_remaining);
end;
$$;

revoke all on function public.complete_ai_gm_post_turn_intent_v2(uuid,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_ai_gm_post_turn_intent_v2(uuid,uuid,uuid,jsonb)
  to service_role;

create or replace function public.fail_ai_gm_post_turn_intent_v2(
  p_job_id uuid,
  p_intent_id uuid,
  p_lease_token uuid,
  p_error text,
  p_ambiguous boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.ai_gm_post_turn_jobs%rowtype;
  v_intent public.ai_gm_post_turn_intents%rowtype;
  v_error text := left(coalesce(p_error,'stage18_post_turn_intent_failed'),500);
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.ai_gm_post_turn_jobs
  where id=p_job_id
  for update;

  if v_job.id is null
     or v_job.state <> 'running'
     or v_job.lease_token is distinct from p_lease_token
  then
    raise exception 'stage18_post_turn_lease_invalid';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intents
  where id=p_intent_id and job_id=p_job_id
  for update;

  if v_intent.id is null then
    raise exception 'stage18_post_turn_intent_not_found';
  end if;

  if p_ambiguous is true or v_intent.attempt_count >= 3 then
    update public.ai_gm_post_turn_intents
    set state='recovery_required',
        last_error=v_error,
        updated_at=now()
    where id=p_intent_id;

    update public.ai_gm_post_turn_jobs
    set state='recovery_required',
        lease_token=null,
        lease_expires_at=null,
        last_error=v_error,
        updated_at=now()
    where id=p_job_id;

    return jsonb_build_object(
      'intent_state','recovery_required',
      'job_state','recovery_required'
    );
  end if;

  update public.ai_gm_post_turn_intents
  set state='retry_wait',
      last_error=v_error,
      execution_started_at=null,
      updated_at=now()
  where id=p_intent_id;

  update public.ai_gm_post_turn_jobs
  set state='queued',
      lease_token=null,
      lease_expires_at=null,
      last_error=v_error,
      updated_at=now()
  where id=p_job_id;

  perform private.dispatch_ai_gm_post_turn_v2(p_job_id);

  return jsonb_build_object(
    'intent_state','retry_wait',
    'job_state','queued'
  );
end;
$$;

revoke all on function public.fail_ai_gm_post_turn_intent_v2(uuid,uuid,uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.fail_ai_gm_post_turn_intent_v2(uuid,uuid,uuid,text,boolean)
  to service_role;

create or replace function public.fail_ai_gm_post_turn_planning_v2(
  p_job_id uuid,
  p_intent_id uuid,
  p_lease_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.ai_gm_post_turn_jobs%rowtype;
  v_intent public.ai_gm_post_turn_intents%rowtype;
  v_error text := left(coalesce(p_error,'stage18_post_turn_planning_failed'),500);
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.ai_gm_post_turn_jobs
  where id=p_job_id
  for update;

  if v_job.id is null
     or v_job.state <> 'running'
     or v_job.lease_token is distinct from p_lease_token
  then
    raise exception 'stage18_post_turn_lease_invalid';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intents
  where id=p_intent_id and job_id=p_job_id
  for update;

  if v_intent.id is null then
    raise exception 'stage18_post_turn_intent_not_found';
  end if;

  update public.ai_gm_post_turn_intents
  set state='recovery_required',
      last_error=v_error,
      updated_at=now()
  where id=p_intent_id;

  update public.ai_gm_post_turn_jobs
  set state='recovery_required',
      lease_token=null,
      lease_expires_at=null,
      last_error=v_error,
      updated_at=now()
  where id=p_job_id;

  return jsonb_build_object(
    'intent_state','recovery_required',
    'job_state','recovery_required'
  );
end;
$$;

revoke all on function public.fail_ai_gm_post_turn_planning_v2(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_gm_post_turn_planning_v2(uuid,uuid,uuid,text)
  to service_role;

create or replace function public.recover_ai_gm_post_turn_intent_v2(
  p_intent_id uuid,
  p_action text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent public.ai_gm_post_turn_intents%rowtype;
  v_job public.ai_gm_post_turn_jobs%rowtype;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_remaining integer;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intents
  where id=p_intent_id
  for update;

  if v_intent.id is null then
    raise exception 'stage18_post_turn_intent_not_found';
  end if;

  select * into v_job
  from public.ai_gm_post_turn_jobs
  where id=v_intent.job_id
  for update;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id=v_job.campaign_id
      and cm.user_id=v_user_id
      and (cm.is_owner=true or cm.role='gm')
  ) then
    raise exception 'stage18_recovery_requires_gm';
  end if;

  if v_intent.state <> 'recovery_required' then
    raise exception 'stage18_intent_not_recovery_required';
  end if;

  if v_action='retry' then
    update public.ai_gm_post_turn_intents
    set state='retry_wait',
        planned_tool_name=null,
        planned_args=null,
        plan_fingerprint=null,
        worker_model_key=null,
        execution_started_at=null,
        last_error=left('manual_retry: ' || coalesce(p_note,''),500),
        updated_at=now()
    where id=v_intent.id;

    update public.ai_gm_post_turn_jobs
    set state='queued',
        lease_token=null,
        lease_expires_at=null,
        last_error=null,
        updated_at=now()
    where id=v_job.id;

    perform private.dispatch_ai_gm_post_turn_v2(v_job.id);

    return jsonb_build_object('job_id',v_job.id,'intent_id',v_intent.id,'state','queued');
  end if;

  if v_action='accept_applied' then
    update public.ai_gm_post_turn_intents
    set state='completed',
        result=coalesce(result,'{}'::jsonb) || jsonb_build_object(
          'manual_recovery','accept_applied',
          'recovered_by',v_user_id,
          'note',left(coalesce(p_note,''),1000),
          'recovered_at',now()
        ),
        completed_at=coalesce(completed_at,now()),
        updated_at=now(),
        last_error=null
    where id=v_intent.id;

    select count(*) into v_remaining
    from public.ai_gm_post_turn_intents
    where job_id=v_job.id
      and state <> 'completed';

    if v_remaining=0 then
      update public.ai_gm_post_turn_jobs
      set state='completed',
          lease_token=null,
          lease_expires_at=null,
          last_error=null,
          completed_at=coalesce(completed_at,now()),
          updated_at=now()
      where id=v_job.id;
    else
      update public.ai_gm_post_turn_jobs
      set state='queued',
          lease_token=null,
          lease_expires_at=null,
          last_error=null,
          updated_at=now()
      where id=v_job.id;
      perform private.dispatch_ai_gm_post_turn_v2(v_job.id);
    end if;

    return jsonb_build_object(
      'job_id',v_job.id,
      'intent_id',v_intent.id,
      'state',case when v_remaining=0 then 'completed' else 'queued' end
    );
  end if;

  raise exception 'stage18_recovery_action_invalid';
end;
$$;

revoke all on function public.recover_ai_gm_post_turn_intent_v2(uuid,text,text)
  from public, anon;
grant execute on function public.recover_ai_gm_post_turn_intent_v2(uuid,text,text)
  to authenticated;

create or replace function public.ensure_ai_gm_post_turn_dispatch_v2(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.ai_gm_post_turn_jobs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  select * into v_job
  from public.ai_gm_post_turn_jobs
  where room_id=p_room_id
    and state in ('queued','running','recovery_required')
  order by created_at desc
  limit 1;

  if v_job.id is null then
    return jsonb_build_object('active',false,'room_id',p_room_id);
  end if;

  if v_job.state='queued'
     or (
       v_job.state='running'
       and (v_job.lease_expires_at is null or v_job.lease_expires_at <= now())
     )
  then
    perform private.dispatch_ai_gm_post_turn_v2(v_job.id);
  end if;

  return jsonb_build_object(
    'active',true,
    'room_id',p_room_id,
    'job_id',v_job.id,
    'state',v_job.state
  );
end;
$$;

revoke all on function public.ensure_ai_gm_post_turn_dispatch_v2(uuid)
  from public, anon;
grant execute on function public.ensure_ai_gm_post_turn_dispatch_v2(uuid)
  to authenticated;

create or replace function private.ai_gm_turn_gate_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_post_job public.ai_gm_post_turn_jobs%rowtype;
begin
  if current_setting('meganot.ai_gm_runtime',true)='on'
     or auth.role()='service_role'
  then
    return new;
  end if;

  if new.character_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id=r.campaign_id
     and cm.user_id=auth.uid()
    where r.id=new.room_id
      and (cm.is_owner=true or cm.role='gm')
  ) then
    return new;
  end if;

  select * into v_post_job
  from public.ai_gm_post_turn_jobs j
  where j.room_id=new.room_id
    and j.state in ('queued','running','recovery_required')
  order by j.created_at desc
  limit 1;

  if v_post_job.id is not null then
    if v_post_job.state='queued'
       or (
         v_post_job.state='running'
         and (v_post_job.lease_expires_at is null or v_post_job.lease_expires_at <= now())
       )
    then
      perform private.dispatch_ai_gm_post_turn_v2(v_post_job.id);
    end if;

    if v_post_job.state='recovery_required' then
      raise exception 'ai_gm_post_turn_recovery_required';
    end if;

    raise exception 'ai_gm_post_turn_commit_in_progress';
  end if;

  if exists (
    select 1
    from public.agent_jobs j
    where j.job_type='conversation_turn'
      and j.input->>'surface'='game_chat_v1'
      and j.input->>'room_id'=new.room_id::text
      and j.status='waiting_for_user'
  ) then
    raise exception 'ai_gm_roll_wait_in_progress';
  end if;

  return new;
end;
$$;

drop trigger if exists ai_gm_turn_gate_v2 on public.chat_messages;
create trigger ai_gm_turn_gate_v2
before insert on public.chat_messages
for each row
execute function private.ai_gm_turn_gate_v2();

create or replace function public.get_ai_gm_room_status_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.chat_rooms%rowtype;
  v_job public.agent_jobs%rowtype;
  v_post public.ai_gm_post_turn_jobs%rowtype;
  v_total integer;
  v_done integer;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_room
  from public.chat_rooms r
  where r.id=p_room_id;

  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  select * into v_post
  from public.ai_gm_post_turn_jobs j
  where j.room_id=p_room_id
    and j.state in ('queued','running','recovery_required')
  order by j.created_at desc
  limit 1;

  if v_post.id is not null then
    select count(*), count(*) filter (where state='completed')
      into v_total,v_done
    from public.ai_gm_post_turn_intents
    where job_id=v_post.id;

    return jsonb_build_object(
      'active',true,
      'phase',case
        when v_post.state='recovery_required' then 'post_turn_recovery'
        else 'post_turn_commit'
      end,
      'label',case
        when v_post.state='recovery_required' then 'Синхронизация мира требует проверки'
        else 'Младший шуршит…'
      end,
      'send_locked',true,
      'room_id',p_room_id,
      'post_turn_job_id',v_post.id,
      'post_turn_state',v_post.state,
      'completed_intents',v_done,
      'total_intents',v_total,
      'error_code',case
        when v_post.state='recovery_required' then 'stage18_post_turn_recovery_required'
        else null
      end,
      'error_message',v_post.last_error,
      'updated_at',v_post.updated_at,
      'runtime_stage',18
    );
  end if;

  select * into v_job
  from public.agent_jobs j
  where j.campaign_id=v_room.campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
    and j.input->>'room_id'=p_room_id::text
  order by j.created_at desc,j.id desc
  limit 1;

  if v_job.id is null then
    return jsonb_build_object(
      'active',false,
      'phase','idle',
      'label','ИИ-ГМ готов',
      'send_locked',false,
      'room_id',p_room_id,
      'runtime_stage',18
    );
  end if;

  return jsonb_build_object(
    'active',v_job.status in ('queued','running','waiting_for_user'),
    'phase',case
      when v_job.status='queued' then 'queued'
      when v_job.status='running' then coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
      when v_job.status='waiting_for_user' then 'waiting_for_roll'
      when v_job.status='failed' then 'failed'
      when v_job.status='cancelled' then 'cancelled'
      when v_job.status='completed' then 'completed'
      else v_job.status
    end,
    'label',case
      when v_job.status='queued' then 'ИИ-ГМ запускается'
      when v_job.status='running' then 'ИИ-ГМ думает'
      when v_job.status='waiting_for_user' then 'ИИ-ГМ ждёт бросок'
      when v_job.status='failed' then 'Ошибка хода ИИ-ГМ'
      when v_job.status='cancelled' then 'Ход ИИ-ГМ отменён'
      when v_job.status='completed' then 'Ход ИИ-ГМ завершён'
      else 'ИИ-ГМ: '||v_job.status
    end,
    'send_locked',v_job.status='waiting_for_user',
    'room_id',p_room_id,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',18
  );
end;
$$;

revoke all on function public.get_ai_gm_room_status_v1(uuid) from public, anon;
grant execute on function public.get_ai_gm_room_status_v1(uuid) to authenticated;

comment on table public.ai_gm_post_turn_jobs is
  'Stage 18 durable post-response world commit queue. A row is also the server-owned free-form turn gate.';
comment on table public.ai_gm_post_turn_intents is
  'Stage 18 per-intent execution receipts. executing is never blindly replayed after lease loss; ambiguous work requires explicit recovery.';
