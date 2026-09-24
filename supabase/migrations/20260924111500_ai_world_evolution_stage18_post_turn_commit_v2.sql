-- AI World Evolution Stage 18 rebuild.
-- Delete the obsolete v1 gate/job design and replace it with an atomic finalizer
-- plus a dedicated durable post-turn commit queue.

create extension if not exists pgcrypto with schema extensions;

-- Remove the audited-bad Stage 18 implementation completely.
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
  parent_job_id uuid not null unique references public.agent_jobs(id) on delete cascade,
  source_message_id bigint not null references public.chat_messages(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete restrict,
  source_character_id uuid not null references public.characters(id) on delete restrict,
  reply_message_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reply_message_ids)='array'),
  published_messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(published_messages)='array'),
  state text not null default 'queued'
    check (state in ('queued','running','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_gm_post_turn_commits_room_state_idx
  on public.ai_gm_post_turn_commits(room_id,state,created_at desc);
create index ai_gm_post_turn_commits_retry_idx
  on public.ai_gm_post_turn_commits(state,lease_expires_at,updated_at)
  where state in ('queued','running','failed');

alter table public.ai_gm_post_turn_commits enable row level security;
revoke all on table public.ai_gm_post_turn_commits
  from public, anon, authenticated;

create table public.ai_gm_post_turn_intent_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  commit_id uuid not null
    references public.ai_gm_post_turn_commits(id) on delete cascade,
  intent_index smallint not null check (intent_index between 1 and 16),
  intent_key text not null check (length(intent_key) between 1 and 120),
  kind text not null
    check (kind in ('location','npc','quest','memory','canonical_state','binding')),
  instruction text not null check (length(instruction) between 1 and 3000),
  evidence text not null default '' check (length(evidence) <= 3000),
  intent_fingerprint text not null check (length(intent_fingerprint)=64),
  state text not null default 'pending'
    check (state in ('pending','running','completed','failed','skipped')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_expires_at timestamptz,
  last_error text,
  tool_name text,
  tool_arguments jsonb,
  tool_result jsonb,
  resolved_entity_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(resolved_entity_ids)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(commit_id,intent_index),
  unique(commit_id,intent_key)
);

create index ai_gm_post_turn_intents_commit_state_idx
  on public.ai_gm_post_turn_intent_receipts(commit_id,state,intent_index);

alter table public.ai_gm_post_turn_intent_receipts enable row level security;
revoke all on table public.ai_gm_post_turn_intent_receipts
  from public, anon, authenticated;

create or replace function private.ai_gm_post_turn_intent_contract_immutable_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.commit_id is distinct from new.commit_id
     or old.intent_index is distinct from new.intent_index
     or old.intent_key is distinct from new.intent_key
     or old.kind is distinct from new.kind
     or old.instruction is distinct from new.instruction
     or old.evidence is distinct from new.evidence
     or old.intent_fingerprint is distinct from new.intent_fingerprint
  then
    raise exception 'stage18_intent_contract_is_immutable';
  end if;
  return new;
end;
$$;

revoke all on function private.ai_gm_post_turn_intent_contract_immutable_v1()
  from public, anon, authenticated;

create trigger ai_gm_post_turn_intent_contract_immutable_v1
before update on public.ai_gm_post_turn_intent_receipts
for each row execute function private.ai_gm_post_turn_intent_contract_immutable_v1();

create or replace function private.enforce_ai_gm_player_turn_gate_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Server-owned GM output and the Stage 17 requested d20 explicitly mark
  -- their transaction as AI runtime traffic. Ordinary clients cannot do this.
  if current_setting('meganot.ai_gm_runtime', true) = 'on' then
    return new;
  end if;

  if new.character_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.ai_gm_post_turn_commits c
    where c.room_id=new.room_id
      and c.state in ('queued','running','failed')
  ) then
    raise exception 'ai_gm_post_turn_locked';
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

revoke all on function private.enforce_ai_gm_player_turn_gate_v2()
  from public, anon, authenticated;

create trigger enforce_ai_gm_player_turn_gate_v2
before insert on public.chat_messages
for each row execute function private.enforce_ai_gm_player_turn_gate_v2();

create or replace function public.finalize_ai_gm_turn_v18(
  p_job_id uuid,
  p_messages jsonb,
  p_post_turn_intents jsonb,
  p_result_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_room_id uuid;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_source_message_id bigint;
  v_messages jsonb := coalesce(p_messages,'[]'::jsonb);
  v_intents jsonb := coalesce(p_post_turn_intents,'[]'::jsonb);
  v_message jsonb;
  v_intent jsonb;
  v_message_index bigint;
  v_intent_index bigint;
  v_message_count integer;
  v_intent_count integer;
  v_kind text;
  v_body text;
  v_npc_id uuid;
  v_message_id bigint;
  v_message_ids jsonb := '[]'::jsonb;
  v_commit_id uuid;
  v_intent_key text;
  v_instruction text;
  v_evidence text;
  v_fingerprint text;
  v_seen_keys text[] := '{}'::text[];
  v_existing_commit public.ai_gm_post_turn_commits%rowtype;
  v_result jsonb;
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
  if jsonb_typeof(coalesce(p_result_patch,'{}'::jsonb)) <> 'object' then
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

  if v_job.status='completed'
     and coalesce((v_job.result->>'stage18_finalized')::boolean,false)
  then
    return jsonb_build_object(
      'reply_message_ids',coalesce(v_job.result->'reply_message_ids','[]'::jsonb),
      'reply_message_id',v_job.result->'reply_message_id',
      'post_turn_commit_id',v_job.result->'post_turn_commit_id',
      'post_turn_state',coalesce(v_job.result->>'post_turn_state','idle'),
      'replayed',true,
      'runtime_stage',18
    );
  end if;

  if v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  v_room_id := nullif(v_job.input->>'room_id','')::uuid;
  v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
  v_source_character_id := nullif(v_job.input->>'source_character_id','')::uuid;
  v_source_message_id := nullif(v_job.input->>'source_chat_message_id','')::bigint;

  if v_room_id is null
     or v_manager_user_id is null
     or v_source_character_id is null
     or v_source_message_id is null
  then
    raise exception 'stage18_turn_identity_missing';
  end if;

  select * into v_existing_commit
  from public.ai_gm_post_turn_commits
  where parent_job_id=p_job_id
  for update;

  for v_message,v_message_index in
    select value,ordinality
    from jsonb_array_elements(v_messages) with ordinality
  loop
    if jsonb_typeof(v_message) <> 'object' then
      raise exception 'stage18_message_invalid';
    end if;

    v_kind := lower(btrim(coalesce(v_message->>'kind','')));
    v_body := btrim(coalesce(v_message->>'body',''));
    v_npc_id := case
      when v_kind='npc_dialogue'
      then nullif(btrim(coalesce(v_message->>'npc_character_id','')),'')::uuid
      else null
    end;

    v_message_id := public.publish_ai_gm_turn_message_v1(
      p_job_id,
      v_message_index::smallint,
      v_kind,
      v_npc_id,
      v_body
    );

    v_message_ids := v_message_ids || jsonb_build_array(v_message_id);
  end loop;

  if v_intent_count > 0 then
    if v_existing_commit.id is null then
      insert into public.ai_gm_post_turn_commits(
        campaign_id,room_id,parent_job_id,source_message_id,
        manager_user_id,source_character_id,reply_message_ids,published_messages
      )
      values(
        v_job.campaign_id,v_room_id,p_job_id,v_source_message_id,
        v_manager_user_id,v_source_character_id,v_message_ids,v_messages
      )
      returning id into v_commit_id;
    else
      v_commit_id := v_existing_commit.id;
      if v_existing_commit.reply_message_ids is distinct from v_message_ids
         or v_existing_commit.published_messages is distinct from v_messages
      then
        raise exception 'stage18_finalizer_replay_conflict';
      end if;
    end if;

    for v_intent,v_intent_index in
      select value,ordinality
      from jsonb_array_elements(v_intents) with ordinality
    loop
      if jsonb_typeof(v_intent) <> 'object' then
        raise exception 'stage18_intent_invalid';
      end if;

      v_intent_key := lower(btrim(coalesce(v_intent->>'intent_key','')));
      v_kind := lower(btrim(coalesce(v_intent->>'kind','')));
      v_instruction := btrim(coalesce(v_intent->>'instruction',''));
      v_evidence := btrim(coalesce(v_intent->>'evidence',''));

      if v_intent_key !~ '^[a-z0-9][a-z0-9:_-]{0,119}$' then
        raise exception 'stage18_intent_key_invalid';
      end if;
      if v_intent_key = any(v_seen_keys) then
        raise exception 'stage18_intent_key_duplicate';
      end if;
      v_seen_keys := array_append(v_seen_keys,v_intent_key);

      if v_kind not in ('location','npc','quest','memory','canonical_state','binding') then
        raise exception 'stage18_intent_kind_invalid';
      end if;
      if length(v_instruction)<1 or length(v_instruction)>3000 then
        raise exception 'stage18_intent_instruction_invalid';
      end if;
      if length(v_evidence)>3000 then
        raise exception 'stage18_intent_evidence_invalid';
      end if;

      v_fingerprint := encode(
        extensions.digest(
          convert_to(
            jsonb_build_object(
              'parent_job_id',p_job_id,
              'intent_index',v_intent_index,
              'intent_key',v_intent_key,
              'kind',v_kind,
              'instruction',v_instruction,
              'evidence',v_evidence,
              'reply_message_ids',v_message_ids
            )::text,
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      );

      insert into public.ai_gm_post_turn_intent_receipts(
        commit_id,intent_index,intent_key,kind,instruction,evidence,intent_fingerprint
      )
      values(
        v_commit_id,v_intent_index::smallint,v_intent_key,v_kind,
        v_instruction,v_evidence,v_fingerprint
      )
      on conflict (commit_id,intent_key) do nothing;
    end loop;
  end if;

  v_result :=
    coalesce(v_job.result,'{}'::jsonb)
    || coalesce(p_result_patch,'{}'::jsonb)
    || jsonb_build_object(
      'stage18_finalized',true,
      'runtime_stage',18,
      'reply_message_id',(v_message_ids->>(jsonb_array_length(v_message_ids)-1))::bigint,
      'reply_message_ids',v_message_ids,
      'post_turn_commit_id',v_commit_id,
      'post_turn_state',case when v_commit_id is null then 'idle' else 'queued' end,
      'post_turn_intent_count',v_intent_count
    );

  update public.agent_jobs
  set status='completed',
      completed_outputs=1,
      result=v_result,
      completed_at=now(),
      updated_at=now(),
      error_code=null,
      error_message=null
  where id=p_job_id
    and status='running';

  return jsonb_build_object(
    'reply_message_ids',v_message_ids,
    'reply_message_id',(v_message_ids->>(jsonb_array_length(v_message_ids)-1))::bigint,
    'post_turn_commit_id',v_commit_id,
    'post_turn_state',case when v_commit_id is null then 'idle' else 'queued' end,
    'replayed',false,
    'runtime_stage',18
  );
end;
$$;

revoke all on function public.finalize_ai_gm_turn_v18(uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_ai_gm_turn_v18(uuid,jsonb,jsonb,jsonb)
  to service_role;

create or replace function public.claim_ai_gm_post_turn_commit_v1(
  p_commit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_claimed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.ai_gm_post_turn_commits
  set state='running',
      attempts=attempts+1,
      lease_expires_at=now()+interval '2 minutes',
      last_error=null,
      updated_at=now()
  where id=p_commit_id
    and attempts < max_attempts
    and (
      state='queued'
      or (state='running' and lease_expires_at < now())
    )
  returning * into v_commit;

  if v_commit.id is not null then
    v_claimed := true;
  end if;

  if v_commit.id is null then
    select * into v_commit
    from public.ai_gm_post_turn_commits
    where id=p_commit_id;
  end if;

  if v_commit.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id',v_commit.id,
    'campaign_id',v_commit.campaign_id,
    'room_id',v_commit.room_id,
    'parent_job_id',v_commit.parent_job_id,
    'source_message_id',v_commit.source_message_id,
    'manager_user_id',v_commit.manager_user_id,
    'source_character_id',v_commit.source_character_id,
    'reply_message_ids',v_commit.reply_message_ids,
    'published_messages',v_commit.published_messages,
    'state',v_commit.state,
    'attempts',v_commit.attempts,
    'max_attempts',v_commit.max_attempts,
    'lease_expires_at',v_commit.lease_expires_at,
    'claimed',v_claimed
  );
end;
$$;

revoke all on function public.claim_ai_gm_post_turn_commit_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_gm_post_turn_commit_v1(uuid)
  to service_role;

create or replace function public.claim_ai_gm_post_turn_intent_v1(
  p_commit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where commit_id=p_commit_id
    and (
      state='pending'
      or (state='running' and lease_expires_at < now())
    )
    and attempts < 3
  order by intent_index
  limit 1
  for update skip locked;

  if v_intent.id is null then
    return null;
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='running',
      attempts=attempts+1,
      lease_expires_at=now()+interval '90 seconds',
      last_error=null,
      updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return to_jsonb(v_intent);
end;
$$;

revoke all on function public.claim_ai_gm_post_turn_intent_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_gm_post_turn_intent_v1(uuid)
  to service_role;

create or replace function public.complete_ai_gm_post_turn_intent_v1(
  p_intent_id uuid,
  p_tool_name text,
  p_tool_arguments jsonb,
  p_tool_result jsonb,
  p_resolved_entity_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if jsonb_typeof(coalesce(p_resolved_entity_ids,'[]'::jsonb)) <> 'array' then
    raise exception 'stage18_resolved_entity_ids_must_be_array';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='completed',
      tool_name=nullif(left(btrim(coalesce(p_tool_name,'')),160),''),
      tool_arguments=coalesce(p_tool_arguments,'{}'::jsonb),
      tool_result=coalesce(p_tool_result,'{}'::jsonb),
      resolved_entity_ids=coalesce(p_resolved_entity_ids,'[]'::jsonb),
      lease_expires_at=null,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where id=p_intent_id
    and state='running'
  returning * into v_intent;

  if v_intent.id is null then
    select * into v_intent
    from public.ai_gm_post_turn_intent_receipts
    where id=p_intent_id and state='completed';
  end if;

  if v_intent.id is null then
    raise exception 'stage18_intent_not_running';
  end if;

  return to_jsonb(v_intent);
end;
$$;

revoke all on function public.complete_ai_gm_post_turn_intent_v1(
  uuid,text,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.complete_ai_gm_post_turn_intent_v1(
  uuid,text,jsonb,jsonb,jsonb
) to service_role;

create or replace function public.fail_ai_gm_post_turn_intent_v1(
  p_intent_id uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='failed',
      lease_expires_at=null,
      last_error=left(coalesce(p_error,'stage18_intent_failed'),500),
      updated_at=now()
  where id=p_intent_id
    and state='running'
  returning * into v_intent;

  return case when v_intent.id is null then null else to_jsonb(v_intent) end;
end;
$$;

revoke all on function public.fail_ai_gm_post_turn_intent_v1(uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_gm_post_turn_intent_v1(uuid,text)
  to service_role;

create or replace function public.complete_ai_gm_post_turn_commit_v1(
  p_commit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if exists (
    select 1
    from public.ai_gm_post_turn_intent_receipts
    where commit_id=p_commit_id
      and state not in ('completed','skipped')
  ) then
    raise exception 'stage18_commit_has_unfinished_intents';
  end if;

  update public.ai_gm_post_turn_commits
  set state='completed',
      lease_expires_at=null,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where id=p_commit_id
    and state='running'
  returning * into v_commit;

  if v_commit.id is null then
    select * into v_commit
    from public.ai_gm_post_turn_commits
    where id=p_commit_id and state='completed';
  end if;

  if v_commit.id is null then
    raise exception 'stage18_commit_not_running';
  end if;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state','completed',
        'post_turn_commit_id',p_commit_id,
        'runtime_stage',18
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return to_jsonb(v_commit);
end;
$$;

revoke all on function public.complete_ai_gm_post_turn_commit_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_ai_gm_post_turn_commit_v1(uuid)
  to service_role;

create or replace function public.fail_ai_gm_post_turn_commit_v1(
  p_commit_id uuid,
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

  v_next_state := case
    when v_commit.attempts < v_commit.max_attempts then 'queued'
    else 'failed'
  end;

  update public.ai_gm_post_turn_intent_receipts
  set state=case
        when state='running' and v_next_state='queued' then 'pending'
        when state='running' then 'failed'
        else state
      end,
      lease_expires_at=null,
      last_error=case
        when state='running' then left(coalesce(p_error,'stage18_intent_failed'),500)
        else last_error
      end,
      updated_at=now()
  where commit_id=p_commit_id
    and state='running';

  update public.ai_gm_post_turn_commits
  set state=v_next_state,
      lease_expires_at=null,
      last_error=left(coalesce(p_error,'stage18_post_turn_commit_failed'),500),
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state',v_next_state,
        'post_turn_commit_id',p_commit_id,
        'post_turn_error',v_commit.last_error,
        'runtime_stage',18
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return to_jsonb(v_commit);
end;
$$;

revoke all on function public.fail_ai_gm_post_turn_commit_v1(uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_gm_post_turn_commit_v1(uuid,text)
  to service_role;

create or replace function public.retry_ai_gm_post_turn_commit_v1(
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
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then
    raise exception 'stage18_commit_not_found';
  end if;
  if not private.can_manage_campaign(v_commit.campaign_id,v_user_id) then
    raise exception 'campaign_manage_required';
  end if;
  if v_commit.state <> 'failed' then
    raise exception 'stage18_commit_not_failed';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state=case when state='completed' then 'completed' else 'pending' end,
      attempts=case when state='completed' then attempts else 0 end,
      lease_expires_at=null,
      last_error=case when state='completed' then last_error else null end,
      updated_at=now()
  where commit_id=p_commit_id;

  update public.ai_gm_post_turn_commits
  set state='queued',
      attempts=0,
      lease_expires_at=null,
      last_error=null,
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state','queued',
        'post_turn_commit_id',p_commit_id,
        'post_turn_error',null,
        'runtime_stage',18
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return jsonb_build_object(
    'commit_id',v_commit.id,
    'state',v_commit.state,
    'room_id',v_commit.room_id,
    'runtime_stage',18
  );
end;
$$;

revoke all on function public.retry_ai_gm_post_turn_commit_v1(uuid)
  from public, anon;
grant execute on function public.retry_ai_gm_post_turn_commit_v1(uuid)
  to authenticated;

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
  v_can_recover boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_room
  from public.chat_rooms
  where id=p_room_id;

  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where room_id=p_room_id
    and state in ('queued','running','failed')
  order by created_at desc
  limit 1;

  if v_commit.id is not null then
    v_can_recover :=
      v_commit.state='failed'
      and private.can_manage_campaign(v_commit.campaign_id,v_user_id);

    return jsonb_build_object(
      'active',true,
      'phase',case
        when v_commit.state='failed' then 'post_turn_failed'
        else 'post_turn_commit'
      end,
      'label',case
        when v_commit.state='failed' then 'Синхронизация мира не завершилась'
        else 'Младший шуршит…'
      end,
      'room_id',p_room_id,
      'campaign_id',v_commit.campaign_id,
      'commit_id',v_commit.id,
      'commit_state',v_commit.state,
      'attempts',v_commit.attempts,
      'max_attempts',v_commit.max_attempts,
      'can_recover',v_can_recover,
      'wake_required',(
        v_commit.state='queued'
        or (
          v_commit.state='running'
          and v_commit.lease_expires_at is not null
          and v_commit.lease_expires_at < now()
        )
      ),
      'error_code',case
        when v_commit.state='failed' then 'stage18_post_turn_commit_failed'
        else null
      end,
      'error_message',v_commit.last_error,
      'updated_at',v_commit.updated_at,
      'lease_expires_at',v_commit.lease_expires_at,
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
