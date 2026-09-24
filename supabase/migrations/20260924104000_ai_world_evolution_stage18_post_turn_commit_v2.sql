-- Stage 18 redo: post-response junior world commit with atomic turn gate.
-- Removes the obsolete v1 gate/queue objects and replaces them with a dedicated,
-- retryable post-turn commit state machine. No agent_jobs pseudo-job type.

create extension if not exists pgcrypto with schema extensions;

-- Remove the audited-bad Stage 18 v1 objects completely.
drop trigger if exists ai_gm_post_turn_gate on public.chat_messages;
drop function if exists private.ai_gm_post_turn_gate_trigger();
drop function if exists public.create_ai_gm_post_turn_commit_v1(
  uuid,uuid,uuid,bigint,bigint,uuid,uuid,text,text,jsonb
);
drop function if exists public.get_ai_gm_room_status_v1(uuid);
drop table if exists public.ai_gm_turn_commit_gates cascade;

create table public.ai_gm_post_turn_commits (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  source_message_id bigint not null references public.chat_messages(id) on delete cascade,
  parent_job_id uuid not null unique references public.agent_jobs(id) on delete cascade,
  state text not null default 'queued'
    check (state in ('queued','running','retry_wait','completed','failed','cancelled')),
  intent_count integer not null default 0 check (intent_count between 0 and 16),
  completed_intents integer not null default 0 check (completed_intents >= 0),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_gm_post_turn_commit_counts_check
    check (completed_intents <= intent_count)
);

create index ai_gm_post_turn_commits_room_state_idx
  on public.ai_gm_post_turn_commits(room_id,state,created_at desc);
create index ai_gm_post_turn_commits_retry_idx
  on public.ai_gm_post_turn_commits(state,next_retry_at)
  where state in ('queued','retry_wait','running');

alter table public.ai_gm_post_turn_commits enable row level security;
revoke all on table public.ai_gm_post_turn_commits
  from public, anon, authenticated;

create table public.ai_gm_post_turn_intent_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  commit_id uuid not null references public.ai_gm_post_turn_commits(id) on delete cascade,
  intent_index smallint not null check (intent_index between 1 and 16),
  intent_key text not null check (length(intent_key) between 1 and 120),
  intent_kind text not null
    check (intent_kind in ('location','npc','quest','memory','binding','canonical_state')),
  instruction text not null check (length(instruction) between 1 and 2400),
  evidence text not null default '' check (length(evidence) <= 2400),
  state text not null default 'pending'
    check (state in ('pending','running','completed','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  worker_model_key text,
  tool_name text,
  tool_arguments jsonb,
  tool_result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(commit_id,intent_index),
  unique(commit_id,intent_key)
);

create index ai_gm_post_turn_intent_receipts_state_idx
  on public.ai_gm_post_turn_intent_receipts(commit_id,state,intent_index);

alter table public.ai_gm_post_turn_intent_receipts enable row level security;
revoke all on table public.ai_gm_post_turn_intent_receipts
  from public, anon, authenticated;

create or replace function private.ai_gm_turn_gate_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Server-owned GM output, requested rolls and mechanics explicitly mark
  -- their transaction as runtime traffic.
  if current_setting('meganot.ai_gm_runtime', true) = 'on' then
    return new;
  end if;

  -- Narrator/system messages do not represent a new player turn.
  if new.character_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.ai_gm_post_turn_commits c
    where c.room_id=new.room_id
      and c.state in ('queued','running','retry_wait','failed')
  ) then
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

revoke all on function private.ai_gm_turn_gate_v2()
  from public, anon, authenticated;

create trigger ai_gm_turn_gate_v2
before insert on public.chat_messages
for each row execute function private.ai_gm_turn_gate_v2();

create or replace function public.finalize_ai_gm_turn_v2(
  p_job_id uuid,
  p_messages jsonb,
  p_post_turn_intents jsonb,
  p_result_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_room_id uuid;
  v_source_message_id bigint;
  v_messages jsonb := coalesce(p_messages,'[]'::jsonb);
  v_intents jsonb := coalesce(p_post_turn_intents,'[]'::jsonb);
  v_patch jsonb := coalesce(p_result_patch,'{}'::jsonb);
  v_message_count integer;
  v_intent_count integer;
  v_item jsonb;
  v_index bigint;
  v_kind text;
  v_body text;
  v_npc_id uuid;
  v_message_id bigint;
  v_message_ids jsonb := '[]'::jsonb;
  v_commit_id uuid;
  v_existing_commit public.ai_gm_post_turn_commits%rowtype;
  v_intent_key text;
  v_intent_kind text;
  v_instruction text;
  v_evidence text;
  v_seen_keys text[] := array[]::text[];
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if jsonb_typeof(v_messages) <> 'array' then
    raise exception 'stage18_messages_must_be_array';
  end if;
  if jsonb_typeof(v_intents) <> 'array' then
    raise exception 'stage18_intents_must_be_array';
  end if;
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'stage18_result_patch_must_be_object';
  end if;

  v_message_count := jsonb_array_length(v_messages);
  v_intent_count := jsonb_array_length(v_intents);

  if v_message_count < 1 or v_message_count > 12 then
    raise exception 'stage18_message_count_invalid';
  end if;
  if v_intent_count > 16 then
    raise exception 'stage18_intent_count_invalid';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  select * into v_existing_commit
  from public.ai_gm_post_turn_commits
  where parent_job_id=p_job_id;

  if v_job.status='completed' then
    return jsonb_build_object(
      'message_ids',coalesce(v_job.result->'reply_message_ids',
        case
          when nullif(v_job.result->>'reply_message_id','') is null then '[]'::jsonb
          else jsonb_build_array((v_job.result->>'reply_message_id')::bigint)
        end
      ),
      'commit_id',v_existing_commit.id,
      'commit_state',v_existing_commit.state,
      'replayed',true,
      'runtime_stage',18
    );
  end if;

  if v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  v_room_id := nullif(v_job.input->>'room_id','')::uuid;
  v_source_message_id := nullif(v_job.input->>'source_chat_message_id','')::bigint;
  if v_room_id is null or v_source_message_id is null then
    raise exception 'stage18_turn_identity_missing';
  end if;

  -- Validate the entire hidden plan before publishing any visible output.
  for v_item,v_index in
    select value,ordinality
    from jsonb_array_elements(v_intents) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'stage18_intent_invalid';
    end if;

    v_intent_key := lower(btrim(coalesce(v_item->>'intent_key','')));
    v_intent_kind := lower(btrim(coalesce(v_item->>'kind','')));
    v_instruction := btrim(coalesce(v_item->>'instruction',''));
    v_evidence := btrim(coalesce(v_item->>'evidence',''));

    if length(v_intent_key) < 1 or length(v_intent_key) > 120 then
      raise exception 'stage18_intent_key_invalid';
    end if;
    if v_intent_key = any(v_seen_keys) then
      raise exception 'stage18_intent_key_duplicate';
    end if;
    if v_intent_kind not in ('location','npc','quest','memory','binding','canonical_state') then
      raise exception 'stage18_intent_kind_invalid';
    end if;
    if length(v_instruction) < 1 or length(v_instruction) > 2400 then
      raise exception 'stage18_intent_instruction_invalid';
    end if;
    if length(v_evidence) > 2400 then
      raise exception 'stage18_intent_evidence_too_large';
    end if;

    v_seen_keys := array_append(v_seen_keys,v_intent_key);
  end loop;

  -- Publish all visible GM/NPC output first, but in the same transaction that
  -- installs the post-turn gate. External observers can never see one without
  -- the other after COMMIT.
  for v_item,v_index in
    select value,ordinality
    from jsonb_array_elements(v_messages) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'stage18_output_message_invalid';
    end if;

    v_kind := lower(btrim(coalesce(v_item->>'kind','')));
    v_body := btrim(coalesce(v_item->>'body',''));
    v_npc_id := case
      when v_kind='npc_dialogue'
        then nullif(btrim(coalesce(v_item->>'npc_character_id','')),'')::uuid
      else null
    end;

    v_message_id := public.publish_ai_gm_turn_message_v1(
      p_job_id,
      v_index::smallint,
      v_kind,
      v_npc_id,
      v_body
    );
    v_message_ids := v_message_ids || jsonb_build_array(v_message_id);
  end loop;

  if v_intent_count > 0 then
    insert into public.ai_gm_post_turn_commits(
      campaign_id,room_id,source_message_id,parent_job_id,
      state,intent_count,completed_intents
    )
    values(
      v_job.campaign_id,v_room_id,v_source_message_id,p_job_id,
      'queued',v_intent_count,0
    )
    returning id into v_commit_id;

    for v_item,v_index in
      select value,ordinality
      from jsonb_array_elements(v_intents) with ordinality
    loop
      insert into public.ai_gm_post_turn_intent_receipts(
        commit_id,intent_index,intent_key,intent_kind,instruction,evidence
      )
      values(
        v_commit_id,
        v_index::smallint,
        lower(btrim(v_item->>'intent_key')),
        lower(btrim(v_item->>'kind')),
        btrim(v_item->>'instruction'),
        btrim(coalesce(v_item->>'evidence',''))
      );
    end loop;
  end if;

  update public.agent_jobs
  set status='completed',
      completed_outputs=1,
      result=coalesce(result,'{}'::jsonb)
        || v_patch
        || jsonb_build_object(
          'surface','game_chat_v1',
          'runtime_stage',18,
          'source_chat_message_id',v_source_message_id::text,
          'reply_message_id',(v_message_ids->>(jsonb_array_length(v_message_ids)-1))::bigint,
          'reply_message_ids',v_message_ids,
          'post_turn_commit_id',v_commit_id,
          'post_turn_intent_count',v_intent_count
        ),
      completed_at=now(),
      updated_at=now(),
      error_code=null,
      error_message=null
  where id=p_job_id
    and status='running';

  if not found then
    raise exception 'stage18_finalize_race';
  end if;

  return jsonb_build_object(
    'message_ids',v_message_ids,
    'commit_id',v_commit_id,
    'commit_state',case when v_commit_id is null then null else 'queued' end,
    'replayed',false,
    'runtime_stage',18
  );
end;
$$;

revoke all on function public.finalize_ai_gm_turn_v2(uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_ai_gm_turn_v2(uuid,jsonb,jsonb,jsonb)
  to service_role;

create or replace function public.claim_ai_gm_post_turn_commit_v2(
  p_commit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_token uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then
    raise exception 'stage18_commit_not_found';
  end if;

  if v_commit.state='completed' then
    return jsonb_build_object(
      'claimed',false,'state','completed','commit_id',v_commit.id
    );
  end if;

  if v_commit.state='failed' then
    return jsonb_build_object(
      'claimed',false,'state','failed','commit_id',v_commit.id,
      'last_error',v_commit.last_error
    );
  end if;

  if v_commit.state='running'
     and v_commit.lease_expires_at is not null
     and v_commit.lease_expires_at > now()
  then
    return jsonb_build_object(
      'claimed',false,'state','running','commit_id',v_commit.id,
      'lease_expires_at',v_commit.lease_expires_at
    );
  end if;

  if v_commit.state='retry_wait'
     and v_commit.next_retry_at is not null
     and v_commit.next_retry_at > now()
  then
    return jsonb_build_object(
      'claimed',false,'state','retry_wait','commit_id',v_commit.id,
      'next_retry_at',v_commit.next_retry_at
    );
  end if;

  if v_commit.attempt_count >= 3 then
    update public.ai_gm_post_turn_commits
    set state='failed',
        lease_token=null,
        lease_expires_at=null,
        updated_at=now()
    where id=v_commit.id;

    return jsonb_build_object(
      'claimed',false,'state','failed','commit_id',v_commit.id,
      'last_error',v_commit.last_error
    );
  end if;

  v_token := extensions.gen_random_uuid();

  update public.ai_gm_post_turn_commits
  set state='running',
      attempt_count=attempt_count+1,
      lease_token=v_token,
      lease_expires_at=now()+interval '90 seconds',
      next_retry_at=null,
      updated_at=now()
  where id=v_commit.id
  returning * into v_commit;

  return jsonb_build_object(
    'claimed',true,
    'state','running',
    'commit_id',v_commit.id,
    'campaign_id',v_commit.campaign_id,
    'room_id',v_commit.room_id,
    'source_message_id',v_commit.source_message_id,
    'parent_job_id',v_commit.parent_job_id,
    'attempt_count',v_commit.attempt_count,
    'lease_token',v_token,
    'lease_expires_at',v_commit.lease_expires_at
  );
end;
$$;

revoke all on function public.claim_ai_gm_post_turn_commit_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_gm_post_turn_commit_v2(uuid)
  to service_role;

create or replace function public.claim_ai_gm_post_turn_intent_v2(
  p_commit_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_receipt public.ai_gm_post_turn_intent_receipts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;
  if v_commit.state <> 'running'
     or v_commit.lease_token is distinct from p_lease_token
     or v_commit.lease_expires_at is null
     or v_commit.lease_expires_at <= now()
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  select * into v_receipt
  from public.ai_gm_post_turn_intent_receipts
  where commit_id=p_commit_id
    and state in ('pending','failed')
  order by intent_index
  limit 1
  for update skip locked;

  if v_receipt.id is null then
    return jsonb_build_object(
      'intent',null,'done',true,'commit_id',p_commit_id
    );
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='running',
      attempt_count=attempt_count+1,
      started_at=coalesce(started_at,now()),
      updated_at=now(),
      last_error=null
  where id=v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object(
    'done',false,
    'commit_id',p_commit_id,
    'intent_id',v_receipt.id,
    'intent_index',v_receipt.intent_index,
    'intent_key',v_receipt.intent_key,
    'kind',v_receipt.intent_kind,
    'instruction',v_receipt.instruction,
    'evidence',v_receipt.evidence,
    'attempt_count',v_receipt.attempt_count
  );
end;
$$;

revoke all on function public.claim_ai_gm_post_turn_intent_v2(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_gm_post_turn_intent_v2(uuid,uuid)
  to service_role;

create or replace function public.complete_ai_gm_post_turn_intent_v2(
  p_intent_id uuid,
  p_lease_token uuid,
  p_worker_model_key text,
  p_tool_name text,
  p_tool_arguments jsonb,
  p_tool_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_receipt public.ai_gm_post_turn_intent_receipts%rowtype;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_completed integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select r.* into v_receipt
  from public.ai_gm_post_turn_intent_receipts r
  where r.id=p_intent_id
  for update;

  if v_receipt.id is null then raise exception 'stage18_intent_not_found'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=v_receipt.commit_id
  for update;

  if v_commit.state <> 'running'
     or v_commit.lease_token is distinct from p_lease_token
     or v_commit.lease_expires_at is null
     or v_commit.lease_expires_at <= now()
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  if v_receipt.state='completed' then
    return jsonb_build_object(
      'intent_id',v_receipt.id,'state','completed','replayed',true
    );
  end if;

  if v_receipt.state <> 'running' then
    raise exception 'stage18_intent_not_running';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='completed',
      worker_model_key=left(coalesce(p_worker_model_key,''),160),
      tool_name=left(coalesce(p_tool_name,''),160),
      tool_arguments=coalesce(p_tool_arguments,'{}'::jsonb),
      tool_result=coalesce(p_tool_result,'{}'::jsonb),
      completed_at=now(),
      updated_at=now(),
      last_error=null
  where id=v_receipt.id;

  select count(*)::integer into v_completed
  from public.ai_gm_post_turn_intent_receipts
  where commit_id=v_commit.id
    and state='completed';

  update public.ai_gm_post_turn_commits
  set completed_intents=v_completed,
      lease_expires_at=now()+interval '90 seconds',
      updated_at=now()
  where id=v_commit.id;

  return jsonb_build_object(
    'intent_id',v_receipt.id,'state','completed','replayed',false
  );
end;
$$;

revoke all on function public.complete_ai_gm_post_turn_intent_v2(
  uuid,uuid,text,text,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.complete_ai_gm_post_turn_intent_v2(
  uuid,uuid,text,text,jsonb,jsonb
) to service_role;

create or replace function public.fail_ai_gm_post_turn_commit_v2(
  p_commit_id uuid,
  p_lease_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_next_state text;
  v_error text := left(coalesce(p_error,'stage18_post_turn_commit_failed'),500);
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;
  if v_commit.state <> 'running'
     or v_commit.lease_token is distinct from p_lease_token
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='failed',
      last_error=v_error,
      updated_at=now()
  where commit_id=p_commit_id
    and state='running';

  v_next_state := case
    when v_commit.attempt_count >= 3 then 'failed'
    else 'retry_wait'
  end;

  update public.ai_gm_post_turn_commits
  set state=v_next_state,
      lease_token=null,
      lease_expires_at=null,
      next_retry_at=case
        when v_next_state='retry_wait' then now()+interval '1 second'
        else null
      end,
      last_error=v_error,
      updated_at=now()
  where id=p_commit_id;

  return jsonb_build_object(
    'commit_id',p_commit_id,
    'state',v_next_state,
    'attempt_count',v_commit.attempt_count,
    'last_error',v_error
  );
end;
$$;

revoke all on function public.fail_ai_gm_post_turn_commit_v2(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_gm_post_turn_commit_v2(uuid,uuid,text)
  to service_role;

create or replace function public.complete_ai_gm_post_turn_commit_v2(
  p_commit_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_remaining integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;

  if v_commit.state='completed' then
    return jsonb_build_object(
      'commit_id',p_commit_id,'state','completed','replayed',true
    );
  end if;

  if v_commit.state <> 'running'
     or v_commit.lease_token is distinct from p_lease_token
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  select count(*)::integer into v_remaining
  from public.ai_gm_post_turn_intent_receipts
  where commit_id=p_commit_id
    and state <> 'completed';

  if v_remaining <> 0 then
    raise exception 'stage18_commit_has_unfinished_intents';
  end if;

  update public.ai_gm_post_turn_commits
  set state='completed',
      completed_intents=intent_count,
      lease_token=null,
      lease_expires_at=null,
      next_retry_at=null,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where id=p_commit_id;

  return jsonb_build_object(
    'commit_id',p_commit_id,'state','completed','replayed',false
  );
end;
$$;

revoke all on function public.complete_ai_gm_post_turn_commit_v2(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.complete_ai_gm_post_turn_commit_v2(uuid,uuid)
  to service_role;

create or replace function public.retry_ai_gm_post_turn_commit_v2(
  p_commit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_user_id uuid := auth.uid();
begin
  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;

  if auth.role() <> 'service_role' then
    if v_user_id is null
       or not private.can_manage_campaign(v_commit.campaign_id,v_user_id)
    then
      raise exception 'campaign_manager_required';
    end if;
  end if;

  if v_commit.state='completed' then
    return jsonb_build_object(
      'commit_id',v_commit.id,'state','completed','replayed',true
    );
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='pending',
      last_error=null,
      updated_at=now()
  where commit_id=v_commit.id
    and state='failed';

  update public.ai_gm_post_turn_commits
  set state='queued',
      attempt_count=0,
      lease_token=null,
      lease_expires_at=null,
      next_retry_at=null,
      last_error=null,
      updated_at=now()
  where id=v_commit.id;

  return jsonb_build_object(
    'commit_id',v_commit.id,'state','queued','replayed',false
  );
end;
$$;

revoke all on function public.retry_ai_gm_post_turn_commit_v2(uuid)
  from public, anon;
grant execute on function public.retry_ai_gm_post_turn_commit_v2(uuid)
  to authenticated, service_role;

create or replace function public.get_ai_gm_room_status_v2(
  p_room_id uuid
)
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
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_can_retry boolean := false;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_room
  from public.chat_rooms
  where id=p_room_id;

  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits c
  where c.room_id=p_room_id
    and c.state in ('queued','running','retry_wait','failed')
  order by c.created_at desc
  limit 1;

  if v_commit.id is not null then
    v_can_retry := private.can_manage_campaign(v_commit.campaign_id,v_user_id);

    return jsonb_build_object(
      'active',true,
      'phase','post_turn_commit',
      'label',case
        when v_commit.state='failed' then 'Синхронизация мира не завершилась'
        else 'Младший шуршит…'
      end,
      'room_id',p_room_id,
      'campaign_id',v_commit.campaign_id,
      'commit_id',v_commit.id,
      'commit_state',v_commit.state,
      'attempt_count',v_commit.attempt_count,
      'intent_count',v_commit.intent_count,
      'completed_intents',v_commit.completed_intents,
      'needs_wake',
        v_commit.state='queued'
        or (
          v_commit.state='retry_wait'
          and (v_commit.next_retry_at is null or v_commit.next_retry_at <= now())
        )
        or (
          v_commit.state='running'
          and (v_commit.lease_expires_at is null or v_commit.lease_expires_at <= now())
        ),
      'can_retry',v_can_retry and v_commit.state='failed',
      'error_code',case
        when v_commit.state='failed' then 'stage18_post_turn_commit_failed'
        else null
      end,
      'error_message',v_commit.last_error,
      'updated_at',v_commit.updated_at,
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
      'active',false,'phase','idle','label','ИИ-ГМ готов',
      'room_id',p_room_id,'runtime_stage',18
    );
  end if;

  return jsonb_build_object(
    'active',v_job.status in ('queued','running','waiting_for_user'),
    'phase',case
      when v_job.status='queued' then 'queued'
      when v_job.status='running'
        then coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
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
    'room_id',p_room_id,
    'campaign_id',v_room.campaign_id,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',18
  );
end;
$$;

revoke all on function public.get_ai_gm_room_status_v2(uuid)
  from public, anon;
grant execute on function public.get_ai_gm_room_status_v2(uuid)
  to authenticated;
