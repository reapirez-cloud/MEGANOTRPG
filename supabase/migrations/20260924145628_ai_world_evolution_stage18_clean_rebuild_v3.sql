-- Stage 18 clean rebuild v3.
-- This migration intentionally destroys every older Stage 18 implementation
-- before creating the post-response commit/gate pipeline from scratch.

drop trigger if exists enforce_ai_gm_player_turn_gate_v2 on public.chat_messages;
drop trigger if exists enforce_ai_gm_player_turn_gate_v3 on public.chat_messages;
drop trigger if exists ai_gm_post_turn_intent_contract_immutable_v1 on public.ai_gm_post_turn_intent_receipts;
drop trigger if exists ai_gm_post_turn_intent_contract_immutable_v3 on public.ai_gm_post_turn_intent_receipts;

drop function if exists public.finalize_ai_gm_turn_v18(uuid,jsonb,jsonb,jsonb) cascade;
drop function if exists public.get_ai_gm_room_status_v2(uuid) cascade;
drop function if exists public.retry_ai_gm_post_turn_commit_v1(uuid) cascade;
drop function if exists public.claim_ai_gm_post_turn_commit_v1(uuid) cascade;
drop function if exists public.claim_ai_gm_post_turn_intent_v1(uuid) cascade;
drop function if exists public.complete_ai_gm_post_turn_commit_v1(uuid) cascade;
drop function if exists public.complete_ai_gm_post_turn_intent_v1(uuid,text,jsonb,jsonb,jsonb) cascade;
drop function if exists public.fail_ai_gm_post_turn_commit_v1(uuid,text) cascade;
drop function if exists public.fail_ai_gm_post_turn_intent_v1(uuid,text) cascade;
drop function if exists private.ai_gm_post_turn_intent_contract_immutable_v1() cascade;
drop function if exists private.enforce_ai_gm_player_turn_gate_v2() cascade;

drop function if exists public.finalize_ai_gm_turn_v3(uuid,jsonb,jsonb,jsonb) cascade;
drop function if exists public.get_ai_gm_room_status_v3(uuid) cascade;
drop function if exists public.retry_ai_gm_post_turn_commit_v3(uuid) cascade;
drop function if exists public.claim_ai_gm_post_turn_commit_v3(uuid) cascade;
drop function if exists public.claim_ai_gm_post_turn_intent_v3(uuid,uuid) cascade;
drop function if exists public.execute_ai_gm_post_turn_mutation_v3(uuid,uuid,uuid,text,jsonb) cascade;
drop function if exists public.complete_ai_gm_post_turn_commit_v3(uuid,uuid) cascade;
drop function if exists public.fail_ai_gm_post_turn_commit_v3(uuid,uuid,text) cascade;
drop function if exists public.fail_ai_gm_post_turn_intent_v3(uuid,uuid,text) cascade;
drop function if exists private.ai_gm_post_turn_intent_contract_immutable_v3() cascade;
drop function if exists private.enforce_ai_gm_player_turn_gate_v3() cascade;
drop function if exists private.stage18_resolve_quest_id_v3(uuid,jsonb) cascade;

drop table if exists public.ai_gm_post_turn_intent_receipts cascade;
drop table if exists public.ai_gm_post_turn_commits cascade;

create table public.ai_gm_post_turn_commits (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  parent_job_id uuid not null unique references public.agent_jobs(id) on delete cascade,
  source_message_id bigint not null references public.chat_messages(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete restrict,
  source_character_id uuid not null references public.characters(id) on delete restrict,
  reply_message_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(reply_message_ids)='array'),
  published_messages jsonb not null default '[]'::jsonb check (jsonb_typeof(published_messages)='array'),
  contract_fingerprint text not null unique check (contract_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null default 'queued' check (state in ('queued','running','completed','failed')),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 3),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state='running' and lease_token is not null and lease_expires_at is not null)
    or
    (state<>'running' and lease_token is null and lease_expires_at is null)
  )
);

create table public.ai_gm_post_turn_intent_receipts (
  id uuid primary key default gen_random_uuid(),
  commit_id uuid not null references public.ai_gm_post_turn_commits(id) on delete cascade,
  intent_index smallint not null check (intent_index between 1 and 16),
  intent_key text not null check (
    length(intent_key) between 1 and 120
    and intent_key ~ '^[a-z0-9][a-z0-9:_-]{0,119}$'
  ),
  kind text not null check (kind in ('location','npc','quest','memory','canonical_state','binding')),
  instruction text not null check (length(instruction) between 1 and 3000),
  evidence text not null default '' check (length(evidence) <= 3000),
  intent_fingerprint text not null check (intent_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending' check (state in ('pending','running','completed','failed','skipped')),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 3),
  lease_token uuid,
  lease_expires_at timestamptz,
  tool_name text,
  tool_arguments jsonb not null default '{}'::jsonb check (jsonb_typeof(tool_arguments)='object'),
  tool_result jsonb not null default '{}'::jsonb,
  resolved_entity_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(resolved_entity_ids)='array'),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(commit_id,intent_index),
  unique(commit_id,intent_key),
  check (
    (state='running' and lease_token is not null and lease_expires_at is not null)
    or
    (state<>'running' and lease_token is null and lease_expires_at is null)
  )
);

create index ai_gm_post_turn_commits_room_open_idx
  on public.ai_gm_post_turn_commits(room_id,created_at desc)
  where state in ('queued','running','failed');
create index ai_gm_post_turn_commits_state_idx
  on public.ai_gm_post_turn_commits(state,updated_at);
create index ai_gm_post_turn_intents_claim_idx
  on public.ai_gm_post_turn_intent_receipts(commit_id,intent_index)
  where state in ('pending','running');
create index ai_gm_post_turn_intents_state_idx
  on public.ai_gm_post_turn_intent_receipts(state,updated_at);

alter table public.ai_gm_post_turn_commits enable row level security;
alter table public.ai_gm_post_turn_intent_receipts enable row level security;
revoke all on table public.ai_gm_post_turn_commits from public,anon,authenticated;
revoke all on table public.ai_gm_post_turn_intent_receipts from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.ai_gm_post_turn_intent_contract_immutable_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.commit_id is distinct from old.commit_id
     or new.intent_index is distinct from old.intent_index
     or new.intent_key is distinct from old.intent_key
     or new.kind is distinct from old.kind
     or new.instruction is distinct from old.instruction
     or new.evidence is distinct from old.evidence
     or new.intent_fingerprint is distinct from old.intent_fingerprint
     or new.max_attempts is distinct from old.max_attempts
  then
    raise exception 'stage18_intent_contract_is_immutable';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_ai_gm_player_turn_gate_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Server-owned AI output is not a new player turn.
  if current_setting('meganot.ai_gm_runtime',true)='on' then
    return new;
  end if;

  -- Stage 17 requested d20 is the only player-originated event allowed
  -- while the GM is waiting_for_user.
  if current_setting('meganot.ai_gm_requested_roll',true)='on' then
    return new;
  end if;

  -- Narrator/system rows are not free-form PC turns.
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
$function$;

CREATE OR REPLACE FUNCTION private.stage18_resolve_quest_id_v3(p_campaign_id uuid, p_args jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_key text;
begin
  begin
    v_id := nullif(btrim(coalesce(p_args->>'quest_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception 'stage18_quest_id_invalid';
  end;

  v_key := nullif(btrim(coalesce(p_args->>'quest_key','')),'');

  if v_id is not null then
    if not exists (
      select 1 from public.quests q
      where q.id=v_id and q.campaign_id=p_campaign_id
    ) then
      raise exception 'stage18_quest_not_found';
    end if;
    return v_id;
  end if;

  if v_key is null then
    raise exception 'stage18_quest_identity_required';
  end if;

  select q.id into v_id
  from public.quests q
  where q.campaign_id=p_campaign_id
    and q.quest_key=v_key;

  if v_id is null then
    raise exception 'stage18_quest_not_found';
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_ai_gm_post_turn_commit_v3(p_commit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_token uuid := gen_random_uuid();
  v_claimed boolean := false;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.ai_gm_post_turn_commits
  set state='failed',
      lease_token=null,
      lease_expires_at=null,
      last_error=coalesce(last_error,'stage18_commit_attempts_exhausted'),
      updated_at=now()
  where id=p_commit_id
    and state in ('queued','running')
    and attempts>=max_attempts
    and (state='queued' or lease_expires_at<now());

  update public.ai_gm_post_turn_commits
  set state='running',
      attempts=attempts+1,
      lease_token=v_token,
      lease_expires_at=now()+interval '2 minutes',
      started_at=coalesce(started_at,now()),
      last_error=null,
      updated_at=now()
  where id=p_commit_id
    and attempts<max_attempts
    and (
      state='queued'
      or (state='running' and lease_expires_at<now())
    )
  returning * into v_commit;

  if v_commit.id is not null then
    v_claimed := true;
  else
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
    'contract_fingerprint',v_commit.contract_fingerprint,
    'state',v_commit.state,
    'attempts',v_commit.attempts,
    'max_attempts',v_commit.max_attempts,
    'lease_token',v_commit.lease_token,
    'lease_expires_at',v_commit.lease_expires_at,
    'last_error',v_commit.last_error,
    'claimed',v_claimed,
    'runtime_stage',18,
    'stage18_version',3
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_ai_gm_post_turn_intent_v3(p_commit_id uuid, p_commit_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then
    raise exception 'stage18_commit_not_found';
  end if;
  if v_commit.state<>'running'
     or v_commit.lease_token is distinct from p_commit_lease_token
     or v_commit.lease_expires_at is null
     or v_commit.lease_expires_at<now()
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='failed',
      lease_token=null,
      lease_expires_at=null,
      last_error=coalesce(last_error,'stage18_intent_attempts_exhausted'),
      updated_at=now()
  where commit_id=p_commit_id
    and state in ('pending','running')
    and attempts>=max_attempts
    and (state='pending' or lease_expires_at<now());

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where commit_id=p_commit_id
    and attempts<max_attempts
    and (
      state='pending'
      or (state='running' and lease_expires_at<now())
    )
  order by intent_index
  limit 1
  for update skip locked;

  if v_intent.id is null then
    return null;
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='running',
      attempts=attempts+1,
      lease_token=v_token,
      lease_expires_at=now()+interval '90 seconds',
      started_at=coalesce(started_at,now()),
      last_error=null,
      updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return to_jsonb(v_intent)
    || jsonb_build_object('runtime_stage',18,'stage18_version',3);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_ai_gm_post_turn_commit_v3(p_commit_id uuid, p_commit_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;
  if v_commit.state='completed' then return to_jsonb(v_commit); end if;
  if v_commit.state<>'running'
     or v_commit.lease_token is distinct from p_commit_lease_token
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  if exists (
    select 1 from public.ai_gm_post_turn_intent_receipts
    where commit_id=p_commit_id and state not in ('completed','skipped')
  ) then
    raise exception 'stage18_commit_has_unfinished_intents';
  end if;

  update public.ai_gm_post_turn_commits
  set state='completed',
      lease_token=null,
      lease_expires_at=null,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state','completed',
        'post_turn_commit_id',p_commit_id,
        'runtime_stage',18,
        'stage18_version',3
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return to_jsonb(v_commit);
end;
$function$;

CREATE OR REPLACE FUNCTION public.execute_ai_gm_post_turn_mutation_v3(p_intent_id uuid, p_commit_lease_token uuid, p_intent_lease_token uuid, p_tool_name text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commit_id uuid;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
  v_tool text := lower(btrim(coalesce(p_tool_name,'')));
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_result jsonb := '{}'::jsonb;
  v_resolved_ids jsonb := '[]'::jsonb;
  v_location_id uuid;
  v_parent_id uuid;
  v_character_id uuid;
  v_npc_id uuid;
  v_faction_id uuid;
  v_source_location_id uuid;
  v_target_location_id uuid;
  v_secret_id uuid;
  v_quest_id uuid;
  v_target_id uuid;
  v_entity_id uuid;
  v_condition_id uuid;
  v_target_kind text;
  v_fact_id uuid;
  v_source_event_ids uuid[] := '{}'::uuid[];
  v_visibility text;
  v_scope text;
  v_life_state text;
  v_status text;
  v_patch jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception 'stage18_tool_arguments_must_be_object';
  end if;

  select commit_id into v_commit_id
  from public.ai_gm_post_turn_intent_receipts
  where id=p_intent_id;

  if v_commit_id is null then
    raise exception 'stage18_intent_not_found';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=v_commit_id
  for update;

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where id=p_intent_id
  for update;

  if v_commit.state<>'running'
     or v_commit.lease_token is distinct from p_commit_lease_token
     or v_commit.lease_expires_at is null
     or v_commit.lease_expires_at<now()
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  if v_intent.state='completed' then
    return jsonb_build_object(
      'intent_id',v_intent.id,
      'state','completed',
      'tool_name',v_intent.tool_name,
      'tool_result',v_intent.tool_result,
      'replayed',true,
      'runtime_stage',18,
      'stage18_version',3
    );
  end if;

  if v_intent.state<>'running'
     or v_intent.lease_token is distinct from p_intent_lease_token
     or v_intent.lease_expires_at is null
     or v_intent.lease_expires_at<now()
  then
    raise exception 'stage18_intent_lease_invalid';
  end if;

  -- One tool family per immutable intent kind.
  if v_intent.kind='location' and v_tool not in (
      'create_location','update_location','set_location_archived',
      'upsert_location_transition','upsert_location_secret','set_location_secret_state'
    ) then
    raise exception 'stage18_tool_not_allowed_for_intent_kind';
  elsif v_intent.kind='npc' and v_tool not in (
      'create_world_npc','update_world_npc','set_npc_habitat',
      'move_character_world','set_character_life_state'
    ) then
    raise exception 'stage18_tool_not_allowed_for_intent_kind';
  elsif v_intent.kind='quest' and v_tool not in (
      'create_quest_plan','activate_quest','update_quest_brief',
      'bind_quest_target','materialize_quest_target',
      'resolve_quest_condition','close_quest'
    ) then
    raise exception 'stage18_tool_not_allowed_for_intent_kind';
  elsif v_intent.kind='memory' and v_tool<>'remember_campaign_fact' then
    raise exception 'stage18_tool_not_allowed_for_intent_kind';
  elsif v_intent.kind='canonical_state' and v_tool not in (
      'upsert_faction','set_faction_membership','set_character_faction_reputation',
      'move_character_world','set_world_discovery','set_character_life_state'
    ) then
    raise exception 'stage18_tool_not_allowed_for_intent_kind';
  elsif v_intent.kind='binding' and v_tool not in (
      'bind_quest_target','set_npc_habitat','upsert_location_transition',
      'set_faction_membership','set_world_discovery'
    ) then
    raise exception 'stage18_tool_not_allowed_for_intent_kind';
  end if;

  select coalesce(array_agg(e.id order by e.occurred_at,e.id),'{}'::uuid[])
  into v_source_event_ids
  from public.campaign_events e
  where e.campaign_id=v_commit.campaign_id
    and e.source_kind='chat_message'
    and e.source_id in (
      select value #>> '{}'
      from jsonb_array_elements(v_commit.reply_message_ids)
    );

  if v_tool='create_location' then
    begin
      v_parent_id := nullif(btrim(coalesce(v_args->>'parent_location_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'parent_location_id_invalid';
    end;
    if v_parent_id is not null and not exists (
      select 1 from public.locations
      where id=v_parent_id and campaign_id=v_commit.campaign_id
        and lifecycle_state='active'
    ) then
      raise exception 'parent_location_not_found';
    end if;
    if btrim(coalesce(v_args->>'name',''))='' then
      raise exception 'location_name_required';
    end if;
    v_visibility := case
      when v_args->>'visibility_mode' in ('always','private') then v_args->>'visibility_mode'
      else 'discover'
    end;
    v_scope := case
      when v_args->>'background_simulation_scope' in ('entity','detail')
        then v_args->>'background_simulation_scope'
      else 'disabled'
    end;
    insert into public.locations(
      campaign_id,parent_location_id,name,summary,description,image_url,
      visibility_mode,background_simulation_scope,lifecycle_state,created_by
    )
    values(
      v_commit.campaign_id,v_parent_id,left(btrim(v_args->>'name'),160),
      left(coalesce(v_args->>'summary',''),2000),
      left(coalesce(v_args->>'description',''),12000),null,
      v_visibility,v_scope,'active',v_commit.manager_user_id
    )
    returning id into v_location_id;
    v_result := jsonb_build_object(
      'location_id',v_location_id,'canonical_state_changed',true
    );
    v_resolved_ids := jsonb_build_array(v_location_id);

  elsif v_tool='update_location' then
    begin
      v_location_id := nullif(btrim(coalesce(v_args->>'location_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'location_id_invalid';
    end;
    if v_location_id is null then raise exception 'location_id_required'; end if;
    if not exists (
      select 1 from public.locations
      where id=v_location_id and campaign_id=v_commit.campaign_id
    ) then raise exception 'location_not_found'; end if;

    if v_args ? 'parent_location_id' then
      begin
        v_parent_id := nullif(btrim(coalesce(v_args->>'parent_location_id','')),'')::uuid;
      exception when invalid_text_representation then
        raise exception 'parent_location_id_invalid';
      end;
      if v_parent_id=v_location_id then raise exception 'parent_location_id_invalid'; end if;
      if v_parent_id is not null and not exists (
        select 1 from public.locations
        where id=v_parent_id and campaign_id=v_commit.campaign_id
      ) then raise exception 'parent_location_not_found'; end if;
    end if;

    update public.locations l
    set parent_location_id=case when v_args ? 'parent_location_id' then v_parent_id else l.parent_location_id end,
        name=case when v_args ? 'name' and btrim(coalesce(v_args->>'name',''))<>'' then left(btrim(v_args->>'name'),160) else l.name end,
        summary=case when v_args ? 'summary' then left(coalesce(v_args->>'summary',''),2000) else l.summary end,
        description=case when v_args ? 'description' then left(coalesce(v_args->>'description',''),12000) else l.description end,
        visibility_mode=case when v_args->>'visibility_mode' in ('always','discover','private') then v_args->>'visibility_mode' else l.visibility_mode end,
        background_simulation_scope=case when v_args->>'background_simulation_scope' in ('entity','detail','disabled') then v_args->>'background_simulation_scope' else l.background_simulation_scope end,
        updated_at=now()
    where l.id=v_location_id and l.campaign_id=v_commit.campaign_id;
    v_result := jsonb_build_object(
      'location_id',v_location_id,'canonical_state_changed',true
    );
    v_resolved_ids := jsonb_build_array(v_location_id);

  elsif v_tool='set_location_archived' then
    begin
      v_location_id := nullif(btrim(coalesce(v_args->>'location_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'location_id_invalid';
    end;
    if v_location_id is null then raise exception 'location_id_required'; end if;
    update public.locations
    set lifecycle_state=case when coalesce((v_args->>'archived')::boolean,false) then 'archived' else 'active' end,
        archived_at=case when coalesce((v_args->>'archived')::boolean,false) then now() else null end,
        updated_at=now()
    where id=v_location_id and campaign_id=v_commit.campaign_id;
    if not found then raise exception 'location_not_found'; end if;
    v_result := jsonb_build_object(
      'location_id',v_location_id,
      'archived',coalesce((v_args->>'archived')::boolean,false),
      'canonical_state_changed',true
    );
    v_resolved_ids := jsonb_build_array(v_location_id);

  elsif v_tool='create_world_npc' then
    if btrim(coalesce(v_args->>'name',''))='' then
      raise exception 'npc_name_required';
    end if;
    v_result := public.create_world_npc_v1(v_commit.campaign_id,v_args);
    v_npc_id := coalesce(
      nullif(v_result->>'character_id','')::uuid,
      nullif(v_result#>>'{character,id}','')::uuid,
      nullif(v_result#>>'{npc,id}','')::uuid
    );
    if v_npc_id is not null then v_resolved_ids:=jsonb_build_array(v_npc_id); end if;

  elsif v_tool='update_world_npc' then
    begin
      v_npc_id := nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'character_id_invalid';
    end;
    if v_npc_id is null then raise exception 'character_id_required'; end if;
    if not exists (
      select 1 from public.characters
      where id=v_npc_id and campaign_id=v_commit.campaign_id and character_type='npc'
    ) then raise exception 'world_npc_not_found'; end if;
    v_patch := v_args - 'character_id';
    v_result := public.update_world_npc_v1(v_npc_id,v_patch);
    v_resolved_ids := jsonb_build_array(v_npc_id);

  elsif v_tool='set_npc_habitat' then
    begin
      v_npc_id := nullif(btrim(coalesce(v_args->>'npc_character_id','')),'')::uuid;
      v_location_id := nullif(btrim(coalesce(v_args->>'location_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_habitat_identity_invalid';
    end;
    if v_npc_id is null or v_location_id is null then
      raise exception 'stage18_habitat_identity_required';
    end if;
    if not exists (
      select 1 from public.characters
      where id=v_npc_id and campaign_id=v_commit.campaign_id and character_type='npc'
    ) then raise exception 'world_npc_not_found'; end if;
    if not exists (
      select 1 from public.locations
      where id=v_location_id and campaign_id=v_commit.campaign_id
    ) then raise exception 'location_not_found'; end if;
    perform public.set_npc_zone_habitat(
      v_npc_id,v_location_id,coalesce((v_args->>'attached')::boolean,true)
    );
    v_result := jsonb_build_object(
      'npc_character_id',v_npc_id,'location_id',v_location_id,
      'attached',coalesce((v_args->>'attached')::boolean,true),
      'canonical_state_changed',true
    );
    v_resolved_ids := jsonb_build_array(v_npc_id,v_location_id);

  elsif v_tool='move_character_world' then
    begin
      v_character_id := nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
      v_location_id := nullif(btrim(coalesce(v_args->>'location_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_movement_identity_invalid';
    end;
    if v_character_id is null or v_location_id is null then
      raise exception 'stage18_movement_identity_required';
    end if;
    if not exists (
      select 1 from public.characters
      where id=v_character_id and campaign_id=v_commit.campaign_id
    ) then raise exception 'character_not_found'; end if;
    if not exists (
      select 1 from public.locations
      where id=v_location_id and campaign_id=v_commit.campaign_id
    ) then raise exception 'location_not_found'; end if;
    v_result := public.move_character_world_v1(
      v_character_id,
      v_location_id,
      case when v_args ? 'campaign_day' then (v_args->>'campaign_day')::integer else null end,
      nullif(btrim(coalesce(v_args->>'day_period','')),'')
    );
    v_resolved_ids := jsonb_build_array(v_character_id,v_location_id);

  elsif v_tool='set_character_life_state' then
    begin
      v_character_id := nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'character_id_invalid';
    end;
    if v_character_id is null then raise exception 'character_id_required'; end if;
    v_life_state := case when v_args->>'life_state'='dead' then 'dead' else 'alive' end;
    update public.characters
    set life_state=v_life_state,
        died_at=case when v_life_state='dead' then coalesce(died_at,now()) else null end,
        updated_at=now()
    where id=v_character_id and campaign_id=v_commit.campaign_id;
    if not found then raise exception 'character_not_found'; end if;
    v_result:=jsonb_build_object(
      'character_id',v_character_id,'life_state',v_life_state,
      'canonical_state_changed',true
    );
    v_resolved_ids:=jsonb_build_array(v_character_id);

  elsif v_tool='upsert_location_transition' then
    begin
      v_source_location_id := nullif(btrim(coalesce(v_args->>'source_location_id','')),'')::uuid;
      v_target_location_id := nullif(btrim(coalesce(v_args->>'target_location_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_transition_identity_invalid';
    end;
    if v_source_location_id is null or v_target_location_id is null then
      raise exception 'stage18_transition_identity_required';
    end if;
    if not exists (
      select 1 from public.locations
      where id in (v_source_location_id,v_target_location_id)
        and campaign_id=v_commit.campaign_id
      group by campaign_id having count(*)=2
    ) then raise exception 'stage18_transition_location_not_found'; end if;
    v_patch := v_args - 'source_location_id' - 'target_location_id';
    v_result := public.upsert_location_transition_v1(
      v_source_location_id,v_target_location_id,v_patch
    );
    v_resolved_ids := jsonb_build_array(v_source_location_id,v_target_location_id);

  elsif v_tool='upsert_location_secret' then
    begin
      v_location_id := nullif(btrim(coalesce(v_args->>'location_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'location_id_invalid';
    end;
    if v_location_id is null then raise exception 'location_id_required'; end if;
    if not exists (
      select 1 from public.locations
      where id=v_location_id and campaign_id=v_commit.campaign_id
    ) then raise exception 'location_not_found'; end if;
    v_patch := v_args - 'location_id';
    if not (v_patch ? 'secret_id') and btrim(coalesce(v_patch->>'secret_key',''))='' then
      v_patch := v_patch || jsonb_build_object(
        'secret_key',left('stage18:'||v_commit.id::text||':'||v_intent.intent_key,160)
      );
    end if;
    v_result := public.upsert_location_secret_v1(v_location_id,v_patch);
    v_secret_id := coalesce(
      nullif(v_result->>'id','')::uuid,
      nullif(v_result->>'secret_id','')::uuid,
      nullif(v_result#>>'{secret,id}','')::uuid
    );
    if v_secret_id is not null then v_resolved_ids:=jsonb_build_array(v_secret_id); end if;

  elsif v_tool='set_location_secret_state' then
    begin
      v_secret_id := nullif(btrim(coalesce(v_args->>'secret_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'secret_id_invalid';
    end;
    v_status := v_args->>'status';
    if v_secret_id is null then raise exception 'secret_id_required'; end if;
    if v_status not in ('active','resolved','retired') then
      raise exception 'location_secret_status_invalid';
    end if;
    if not exists (
      select 1 from public.location_secrets
      where id=v_secret_id and campaign_id=v_commit.campaign_id
    ) then raise exception 'location_secret_not_found'; end if;
    v_result := public.set_location_secret_state_v1(
      v_secret_id,v_status,left(coalesce(v_args->>'resolution_note',''),12000)
    );
    v_resolved_ids:=jsonb_build_array(v_secret_id);

  elsif v_tool='upsert_faction' then
    v_result := public.upsert_faction_v1(v_commit.campaign_id,v_args);
    v_faction_id := coalesce(
      nullif(v_result->>'id','')::uuid,
      nullif(v_result->>'faction_id','')::uuid,
      nullif(v_result#>>'{faction,id}','')::uuid
    );
    if v_faction_id is not null then v_resolved_ids:=jsonb_build_array(v_faction_id); end if;

  elsif v_tool='set_faction_membership' then
    begin
      v_character_id := nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
      v_faction_id := nullif(btrim(coalesce(v_args->>'faction_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_faction_membership_identity_invalid';
    end;
    if v_character_id is null or v_faction_id is null then
      raise exception 'stage18_faction_membership_identity_required';
    end if;
    v_patch := v_args - 'character_id' - 'faction_id';
    v_result := public.set_faction_membership_v1(v_character_id,v_faction_id,v_patch);
    v_resolved_ids:=jsonb_build_array(v_character_id,v_faction_id);

  elsif v_tool='set_character_faction_reputation' then
    begin
      v_character_id := nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
      v_faction_id := nullif(btrim(coalesce(v_args->>'faction_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_faction_reputation_identity_invalid';
    end;
    if v_character_id is null or v_faction_id is null then
      raise exception 'stage18_faction_reputation_identity_required';
    end if;
    v_patch := v_args - 'character_id' - 'faction_id';
    v_result := public.set_character_faction_reputation_v1(v_character_id,v_faction_id,v_patch);
    v_resolved_ids:=jsonb_build_array(v_character_id,v_faction_id);

  elsif v_tool='set_world_discovery' then
    begin
      v_character_id := nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
      v_entity_id := nullif(btrim(coalesce(v_args->>'entity_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_discovery_identity_invalid';
    end;
    if v_character_id is null or v_entity_id is null then
      raise exception 'stage18_discovery_identity_required';
    end if;
    if v_args->>'entity_type' not in ('location','npc','link') then
      raise exception 'entity_type_invalid';
    end if;
    v_result := public.manage_world_discovery_v1(
      v_character_id,v_args->>'entity_type',v_entity_id,
      coalesce((v_args->>'discovered')::boolean,true),'ai_gm'
    );
    v_resolved_ids:=jsonb_build_array(v_character_id,v_entity_id);

  elsif v_tool='create_quest_plan' then
    v_patch := v_args || jsonb_build_object(
      'quest_key',left('stage18:'||v_commit.id::text||':'||v_intent.intent_key,120)
    );
    v_result := public.create_quest_plan_v1(v_commit.campaign_id,v_patch);
    v_quest_id := coalesce(
      nullif(v_result->>'quest_id','')::uuid,
      nullif(v_result->>'id','')::uuid,
      nullif(v_result#>>'{quest,id}','')::uuid
    );
    if v_quest_id is not null then v_resolved_ids:=jsonb_build_array(v_quest_id); end if;

  elsif v_tool='activate_quest' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_commit.campaign_id,v_args);
    v_result := public.activate_quest_v1(v_quest_id);
    v_resolved_ids:=jsonb_build_array(v_quest_id);

  elsif v_tool='update_quest_brief' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_commit.campaign_id,v_args);
    if not (v_args ? 'title') and not (v_args ? 'player_brief') then
      raise exception 'quest_brief_patch_required';
    end if;
    update public.quests q
    set title=case
          when v_args ? 'title' and btrim(coalesce(v_args->>'title',''))<>''
            then left(btrim(v_args->>'title'),240)
          else q.title
        end,
        player_brief=case
          when v_args ? 'player_brief' then left(coalesce(v_args->>'player_brief',''),6000)
          else q.player_brief
        end,
        updated_at=now()
    where q.id=v_quest_id and q.campaign_id=v_commit.campaign_id;
    v_result:=jsonb_build_object(
      'quest_id',v_quest_id,'canonical_state_changed',true
    );
    v_resolved_ids:=jsonb_build_array(v_quest_id);

  elsif v_tool='bind_quest_target' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_commit.campaign_id,v_args);
    if btrim(coalesce(v_args->>'target_key',''))='' then
      raise exception 'target_key_required';
    end if;
    select id,target_kind into v_target_id,v_target_kind
    from public.quest_targets
    where quest_id=v_quest_id and target_key=left(v_args->>'target_key',120)
    for update;
    if v_target_id is null then raise exception 'quest_target_not_found'; end if;
    begin
      v_entity_id := nullif(btrim(coalesce(v_args->>'entity_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'entity_id_invalid';
    end;
    if v_target_kind='location' then
      update public.quest_targets set location_id=v_entity_id,updated_at=now()
      where id=v_target_id;
    elsif v_target_kind='npc' then
      update public.quest_targets set npc_character_id=v_entity_id,updated_at=now()
      where id=v_target_id;
    else
      update public.quest_targets set item_definition_id=v_entity_id,updated_at=now()
      where id=v_target_id;
    end if;
    v_result:=jsonb_build_object(
      'quest_id',v_quest_id,'target_id',v_target_id,
      'target_key',left(v_args->>'target_key',120),
      'canonical_state_changed',true
    );
    v_resolved_ids:=jsonb_build_array(v_quest_id,v_target_id)
      || case when v_entity_id is null then '[]'::jsonb else jsonb_build_array(v_entity_id) end;

  elsif v_tool='materialize_quest_target' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_commit.campaign_id,v_args);
    if btrim(coalesce(v_args->>'target_key',''))='' then
      raise exception 'target_key_required';
    end if;
    if jsonb_typeof(coalesce(v_args->'entity','null'::jsonb))<>'object' then
      raise exception 'materialization_entity_required';
    end if;
    v_result := public.materialize_quest_target_v1(
      v_quest_id,left(v_args->>'target_key',120),v_args->'entity'
    );
    v_resolved_ids:=jsonb_build_array(v_quest_id);

  elsif v_tool='resolve_quest_condition' then
    begin
      v_condition_id := nullif(btrim(coalesce(v_args->>'condition_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'condition_id_invalid';
    end;
    if v_condition_id is null then raise exception 'condition_id_required'; end if;
    if not exists (
      select 1
      from public.quest_conditions qc
      join public.quest_condition_groups qg on qg.id=qc.group_id
      join public.quest_stages qs on qs.id=qg.stage_id
      join public.quests q on q.id=qs.quest_id
      where qc.id=v_condition_id and q.campaign_id=v_commit.campaign_id
    ) then raise exception 'quest_condition_not_found'; end if;
    v_result:=public.set_quest_condition_resolution_ai_v1(
      v_condition_id,
      coalesce((v_args->>'satisfied')::boolean,false),
      left(coalesce(v_args->>'note',''),6000)
    );
    v_resolved_ids:=jsonb_build_array(v_condition_id);

  elsif v_tool='close_quest' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_commit.campaign_id,v_args);
    v_status:=v_args->>'status';
    if v_status not in ('completed','failed','cancelled') then
      raise exception 'quest_close_status_invalid';
    end if;
    v_result:=public.close_quest_v1(
      v_quest_id,v_status,left(coalesce(v_args->>'note',''),6000)
    );
    v_resolved_ids:=jsonb_build_array(v_quest_id);

  elsif v_tool='remember_campaign_fact' then
    if btrim(coalesce(v_args->>'statement',''))='' then
      raise exception 'memory_statement_required';
    end if;
    v_fact_id:=gen_random_uuid();
    insert into public.campaign_memory_facts(
      id,campaign_id,fact_key,subject_type,subject_id,predicate,statement,
      structured_value,status,confidence,source_event_ids,visibility,room_id,
      visible_user_ids,visible_character_ids,provenance,created_by
    )
    values(
      v_fact_id,
      v_commit.campaign_id,
      left('stage18:'||v_commit.id::text||':'||v_intent.intent_key,180),
      nullif(left(btrim(coalesce(v_args->>'subject_type','')),80),''),
      nullif(left(btrim(coalesce(v_args->>'subject_id','')),180),''),
      nullif(left(btrim(coalesce(v_args->>'predicate','')),120),''),
      left(btrim(v_args->>'statement'),6000),
      case when jsonb_typeof(v_args->'structured_value')='object'
        then v_args->'structured_value' else '{}'::jsonb end,
      'active',
      greatest(0,least(1,coalesce((v_args->>'confidence')::numeric,0.8))),
      v_source_event_ids,
      'room',
      v_commit.room_id,
      '{}'::uuid[],
      '{}'::uuid[],
      jsonb_build_object(
        'kind','stage18_post_turn_commit',
        'commit_id',v_commit.id,
        'intent_id',v_intent.id,
        'intent_key',v_intent.intent_key
      ),
      v_commit.manager_user_id
    );
    v_result:=jsonb_build_object(
      'fact_id',v_fact_id,'stored',true,'canonical_state_changed',false
    );
    v_resolved_ids:=jsonb_build_array(v_fact_id);

  else
    raise exception 'stage18_unknown_tool';
  end if;

  if v_result is null then
    v_result := '{}'::jsonb;
  end if;
  if jsonb_typeof(v_result)='object'
     and nullif(btrim(coalesce(v_result->>'error','')),'') is not null
  then
    raise exception 'stage18_canonical_mutation_error:%',left(v_result->>'error',400);
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='completed',
      lease_token=null,
      lease_expires_at=null,
      tool_name=v_tool,
      tool_arguments=v_args,
      tool_result=v_result,
      resolved_entity_ids=v_resolved_ids,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where id=v_intent.id
    and state='running'
    and lease_token=p_intent_lease_token;

  if not found then
    raise exception 'stage18_intent_completion_race';
  end if;

  return jsonb_build_object(
    'intent_id',v_intent.id,
    'state','completed',
    'tool_name',v_tool,
    'tool_result',v_result,
    'resolved_entity_ids',v_resolved_ids,
    'replayed',false,
    'runtime_stage',18,
    'stage18_version',3
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fail_ai_gm_post_turn_commit_v3(p_commit_id uuid, p_commit_lease_token uuid, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_next text;
  v_has_failed_intent boolean;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;
  if v_commit.state='completed' then return to_jsonb(v_commit); end if;
  if v_commit.state<>'running'
     or v_commit.lease_token is distinct from p_commit_lease_token
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  select exists(
    select 1 from public.ai_gm_post_turn_intent_receipts
    where commit_id=p_commit_id and state='failed'
  ) into v_has_failed_intent;

  v_next := case
    when v_has_failed_intent or v_commit.attempts>=v_commit.max_attempts then 'failed'
    else 'queued'
  end;

  if v_next='queued' then
    update public.ai_gm_post_turn_intent_receipts
    set state='pending',
        lease_token=null,
        lease_expires_at=null,
        updated_at=now()
    where commit_id=p_commit_id
      and state='running'
      and attempts<max_attempts;
  else
    update public.ai_gm_post_turn_intent_receipts
    set state='failed',
        lease_token=null,
        lease_expires_at=null,
        last_error=coalesce(last_error,left(coalesce(p_error,'stage18_commit_failed'),500)),
        updated_at=now()
    where commit_id=p_commit_id
      and state='running';
  end if;

  update public.ai_gm_post_turn_commits
  set state=v_next,
      lease_token=null,
      lease_expires_at=null,
      last_error=left(coalesce(p_error,'stage18_post_turn_commit_failed'),500),
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state',v_next,
        'post_turn_commit_id',p_commit_id,
        'post_turn_error',v_commit.last_error,
        'runtime_stage',18,
        'stage18_version',3
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return to_jsonb(v_commit);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fail_ai_gm_post_turn_intent_v3(p_intent_id uuid, p_intent_lease_token uuid, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
  v_next text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where id=p_intent_id
  for update;

  if v_intent.id is null then raise exception 'stage18_intent_not_found'; end if;
  if v_intent.state='completed' or v_intent.state='skipped' then
    return to_jsonb(v_intent);
  end if;
  if v_intent.state<>'running' or v_intent.lease_token is distinct from p_intent_lease_token then
    raise exception 'stage18_intent_lease_invalid';
  end if;

  v_next := case when v_intent.attempts<v_intent.max_attempts then 'pending' else 'failed' end;

  update public.ai_gm_post_turn_intent_receipts
  set state=v_next,
      lease_token=null,
      lease_expires_at=null,
      last_error=left(coalesce(p_error,'stage18_intent_failed'),500),
      updated_at=now()
  where id=p_intent_id
  returning * into v_intent;

  return to_jsonb(v_intent);
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_ai_gm_turn_v3(p_job_id uuid, p_messages jsonb, p_post_turn_intents jsonb, p_result_patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_intent_fingerprint text;
  v_contract_fingerprint text;
  v_seen_keys text[] := '{}'::text[];
  v_result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;
  if jsonb_typeof(v_messages)<>'array' then
    raise exception 'stage18_messages_must_be_array';
  end if;
  if jsonb_typeof(v_intents)<>'array' then
    raise exception 'stage18_intents_must_be_array';
  end if;
  if jsonb_typeof(coalesce(p_result_patch,'{}'::jsonb))<>'object' then
    raise exception 'stage18_result_patch_must_be_object';
  end if;

  v_message_count := jsonb_array_length(v_messages);
  v_intent_count := jsonb_array_length(v_intents);
  if v_message_count<1 or v_message_count>12 then
    raise exception 'stage18_message_count_invalid';
  end if;
  if v_intent_count>16 then
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
     and coalesce((v_job.result->>'stage18_v3_finalized')::boolean,false)
  then
    return jsonb_build_object(
      'reply_message_ids',coalesce(v_job.result->'reply_message_ids','[]'::jsonb),
      'reply_message_id',v_job.result->'reply_message_id',
      'post_turn_commit_id',v_job.result->'post_turn_commit_id',
      'post_turn_state',coalesce(v_job.result->>'post_turn_state','idle'),
      'replayed',true,
      'runtime_stage',18,
      'stage18_version',3
    );
  end if;

  if v_job.status<>'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  begin
    v_room_id := nullif(v_job.input->>'room_id','')::uuid;
    v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
    v_source_character_id := nullif(v_job.input->>'source_character_id','')::uuid;
    v_source_message_id := nullif(v_job.input->>'source_chat_message_id','')::bigint;
  exception when invalid_text_representation then
    raise exception 'stage18_turn_identity_invalid';
  end;

  if v_room_id is null or v_manager_user_id is null
     or v_source_character_id is null or v_source_message_id is null
  then
    raise exception 'stage18_turn_identity_missing';
  end if;

  v_contract_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'job_id',p_job_id,
          'messages',v_messages,
          'post_turn_intents',v_intents
        )::text,'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  for v_message,v_message_index in
    select value,ordinality
    from jsonb_array_elements(v_messages) with ordinality
  loop
    if jsonb_typeof(v_message)<>'object' then
      raise exception 'stage18_message_invalid';
    end if;
    v_kind := lower(btrim(coalesce(v_message->>'kind','')));
    if v_kind not in ('narration','npc_dialogue') then
      raise exception 'stage18_message_kind_invalid';
    end if;
    v_body := btrim(coalesce(v_message->>'body',''));
    if length(v_body)<1 or length(v_body)>4000 then
      raise exception 'stage18_message_body_invalid';
    end if;
    begin
      v_npc_id := case
        when v_kind='npc_dialogue'
          then nullif(btrim(coalesce(v_message->>'npc_character_id','')),'')::uuid
        else null
      end;
    exception when invalid_text_representation then
      raise exception 'stage18_message_npc_invalid';
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

  if v_intent_count>0 then
    insert into public.ai_gm_post_turn_commits(
      campaign_id,room_id,parent_job_id,source_message_id,
      manager_user_id,source_character_id,reply_message_ids,
      published_messages,contract_fingerprint
    )
    values(
      v_job.campaign_id,v_room_id,p_job_id,v_source_message_id,
      v_manager_user_id,v_source_character_id,v_message_ids,
      v_messages,v_contract_fingerprint
    )
    returning id into v_commit_id;

    for v_intent,v_intent_index in
      select value,ordinality
      from jsonb_array_elements(v_intents) with ordinality
    loop
      if jsonb_typeof(v_intent)<>'object' then
        raise exception 'stage18_intent_invalid';
      end if;

      v_intent_key := lower(btrim(coalesce(v_intent->>'intent_key','')));
      v_kind := lower(btrim(coalesce(v_intent->>'kind','')));
      v_instruction := btrim(coalesce(v_intent->>'instruction',''));
      v_evidence := btrim(coalesce(v_intent->>'evidence',''));

      if v_intent_key !~ '^[a-z0-9][a-z0-9:_-]{0,119}$' then
        raise exception 'stage18_intent_key_invalid';
      end if;
      if v_intent_key=any(v_seen_keys) then
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

      v_intent_fingerprint := encode(
        extensions.digest(
          convert_to(
            jsonb_build_object(
              'commit_id',v_commit_id,
              'intent_index',v_intent_index,
              'intent_key',v_intent_key,
              'kind',v_kind,
              'instruction',v_instruction,
              'evidence',v_evidence,
              'reply_message_ids',v_message_ids
            )::text,'UTF8'
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
        v_instruction,v_evidence,v_intent_fingerprint
      );
    end loop;
  end if;

  v_result :=
    coalesce(v_job.result,'{}'::jsonb)
    || coalesce(p_result_patch,'{}'::jsonb)
    || jsonb_build_object(
      'stage18_v3_finalized',true,
      'runtime_stage',18,
      'stage18_version',3,
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
  where id=p_job_id and status='running';

  if not found then
    raise exception 'stage18_parent_job_completion_race';
  end if;

  return jsonb_build_object(
    'reply_message_ids',v_message_ids,
    'reply_message_id',(v_message_ids->>(jsonb_array_length(v_message_ids)-1))::bigint,
    'post_turn_commit_id',v_commit_id,
    'post_turn_state',case when v_commit_id is null then 'idle' else 'queued' end,
    'replayed',false,
    'runtime_stage',18,
    'stage18_version',3
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_ai_gm_room_status_v3(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_room public.chat_rooms%rowtype;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_job public.agent_jobs%rowtype;
  v_can_recover boolean:=false;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_room from public.chat_rooms where id=p_room_id;
  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where room_id=p_room_id and state in ('queued','running','failed')
  order by created_at desc
  limit 1;

  if v_commit.id is not null then
    v_can_recover :=
      v_commit.state='failed'
      and private.can_manage_campaign(v_commit.campaign_id,v_user_id);

    return jsonb_build_object(
      'active',true,
      'phase',case when v_commit.state='failed' then 'post_turn_failed' else 'post_turn_commit' end,
      'label',case when v_commit.state='failed'
        then 'Синхронизация мира не завершилась'
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
          and v_commit.lease_expires_at<now()
        )
      ),
      'error_code',case when v_commit.state='failed' then 'stage18_post_turn_commit_failed' else null end,
      'error_message',v_commit.last_error,
      'updated_at',v_commit.updated_at,
      'lease_expires_at',v_commit.lease_expires_at,
      'runtime_stage',18,
      'stage18_version',3
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

  if v_job.id is null or v_job.status='completed' then
    return jsonb_build_object(
      'active',false,'phase','idle','label','ИИ-ГМ готов',
      'room_id',p_room_id,'runtime_stage',18,'stage18_version',3
    );
  end if;

  return jsonb_build_object(
    'active',v_job.status in ('queued','running','waiting_for_user','failed'),
    'phase',case
      when v_job.status='queued' then 'queued'
      when v_job.status='running' then coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
      when v_job.status='waiting_for_user' then 'waiting_for_roll'
      when v_job.status='failed' then 'failed'
      when v_job.status='cancelled' then 'cancelled'
      else v_job.status
    end,
    'label',case
      when v_job.status='queued' then 'ИИ-ГМ запускается'
      when v_job.status='running' then 'ИИ-ГМ думает'
      when v_job.status='waiting_for_user' then 'ИИ-ГМ ждёт бросок'
      when v_job.status='failed' then 'Ошибка хода ИИ-ГМ'
      when v_job.status='cancelled' then 'Ход ИИ-ГМ отменён'
      else 'ИИ-ГМ: '||v_job.status
    end,
    'room_id',p_room_id,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',18,
    'stage18_version',3
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.retry_ai_gm_post_turn_commit_v3(p_commit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;
  if not private.can_manage_campaign(v_commit.campaign_id,v_user_id) then
    raise exception 'campaign_manage_required';
  end if;
  if v_commit.state<>'failed' then raise exception 'stage18_commit_not_failed'; end if;

  update public.ai_gm_post_turn_intent_receipts
  set state=case when state in ('completed','skipped') then state else 'pending' end,
      attempts=case when state in ('completed','skipped') then attempts else 0 end,
      lease_token=null,
      lease_expires_at=null,
      last_error=case when state in ('completed','skipped') then last_error else null end,
      updated_at=now()
  where commit_id=p_commit_id;

  update public.ai_gm_post_turn_commits
  set state='queued',
      attempts=0,
      lease_token=null,
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
        'runtime_stage',18,
        'stage18_version',3
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return jsonb_build_object(
    'commit_id',v_commit.id,'state',v_commit.state,
    'room_id',v_commit.room_id,'runtime_stage',18,'stage18_version',3
  );
end;
$function$;

CREATE TRIGGER ai_gm_post_turn_intent_contract_immutable_v3 BEFORE UPDATE ON ai_gm_post_turn_intent_receipts FOR EACH ROW EXECUTE FUNCTION private.ai_gm_post_turn_intent_contract_immutable_v3();

CREATE TRIGGER enforce_ai_gm_player_turn_gate_v3 BEFORE INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION private.enforce_ai_gm_player_turn_gate_v3();


revoke all on function public.finalize_ai_gm_turn_v3(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_ai_gm_turn_v3(uuid,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.claim_ai_gm_post_turn_commit_v3(uuid) from public,anon,authenticated;
grant execute on function public.claim_ai_gm_post_turn_commit_v3(uuid) to service_role;
revoke all on function public.claim_ai_gm_post_turn_intent_v3(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ai_gm_post_turn_intent_v3(uuid,uuid) to service_role;
revoke all on function public.execute_ai_gm_post_turn_mutation_v3(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.execute_ai_gm_post_turn_mutation_v3(uuid,uuid,uuid,text,jsonb) to service_role;
revoke all on function public.complete_ai_gm_post_turn_commit_v3(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_ai_gm_post_turn_commit_v3(uuid,uuid) to service_role;
revoke all on function public.fail_ai_gm_post_turn_commit_v3(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_ai_gm_post_turn_commit_v3(uuid,uuid,text) to service_role;
revoke all on function public.fail_ai_gm_post_turn_intent_v3(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_ai_gm_post_turn_intent_v3(uuid,uuid,text) to service_role;
revoke all on function public.retry_ai_gm_post_turn_commit_v3(uuid) from public,anon;
grant execute on function public.retry_ai_gm_post_turn_commit_v3(uuid) to authenticated;
revoke all on function public.get_ai_gm_room_status_v3(uuid) from public,anon;
grant execute on function public.get_ai_gm_room_status_v3(uuid) to authenticated,service_role;

revoke all on function private.stage18_resolve_quest_id_v3(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ai_gm_post_turn_intent_contract_immutable_v3() from public,anon,authenticated,service_role;
revoke all on function private.enforce_ai_gm_player_turn_gate_v3() from public,anon,authenticated,service_role;

comment on table public.ai_gm_post_turn_commits is
  'Stage 18 v3 durable gate. Visible GM answer already exists; next free-form PC turn remains blocked until this commit is completed.';
comment on table public.ai_gm_post_turn_intent_receipts is
  'Stage 18 v3 immutable post-response intent contracts with lease-owned atomic canonical mutation receipts.';
comment on function public.execute_ai_gm_post_turn_mutation_v3(uuid,uuid,uuid,text,jsonb) is
  'Executes exactly one allowed canonical mutation and completes its receipt in the same PostgreSQL transaction.';
