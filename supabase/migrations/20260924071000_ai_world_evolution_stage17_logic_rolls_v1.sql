-- AI World Evolution Stage 17: canon-bound intent adjudication + delegated real player rolls.
-- Adds an immutable pre-roll receipt without breaking the certified Stage 5 roll path.

create table if not exists public.ai_player_intent_adjudications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  gm_job_id uuid not null references public.agent_jobs(id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 1),
  source_message_id bigint not null references public.chat_messages(id) on delete restrict,
  target_character_id uuid not null references public.characters(id) on delete cascade,

  source_intent_fingerprint text not null
    check (source_intent_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_fingerprint text not null
    check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_refs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_refs) = 'object'),

  adjudication_mode text not null check (
    adjudication_mode in (
      'deterministic_success',
      'deterministic_failure',
      'check',
      'impossible_exact'
    )
  ),
  exact_goal text not null check (length(btrim(exact_goal)) between 1 and 1600),
  exact_goal_allowed boolean not null,

  semantic_mechanic_request text not null default ''
    check (length(semantic_mechanic_request) <= 1600),
  logical_difficulty text check (
    logical_difficulty is null or logical_difficulty in (
      'very_easy',
      'easy',
      'moderate',
      'hard',
      'very_hard',
      'nearly_impossible'
    )
  ),

  normalized_request_type text check (
    normalized_request_type is null or normalized_request_type in (
      'skill',
      'ability',
      'save',
      'attack',
      'custom'
    )
  ),
  normalized_ability_key text,
  normalized_skill_key text,
  normalized_attack_kind text,
  dc integer check (dc is null or (dc >= 1 and dc <= 40)),
  dc_visibility text not null default 'hidden'
    check (dc_visibility in ('public','hidden')),
  natural_20_policy text not null check (
    natural_20_policy in ('not_applicable','total_only','partial_only')
  ),

  success_envelope text not null default ''
    check (length(success_envelope) <= 2400),
  failure_envelope text not null default ''
    check (length(failure_envelope) <= 2400),
  partial_success_envelope text not null default ''
    check (length(partial_success_envelope) <= 2400),

  receipt_fingerprint text not null
    check (receipt_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),

  unique (gm_job_id, sequence_no),
  unique (receipt_fingerprint)
);

comment on table public.ai_player_intent_adjudications is
  'Stage 17 immutable pre-roll adjudication receipts. A player d20 measures character performance and cannot manufacture unstated world canon.';

create index if not exists ai_player_intent_adjudications_campaign_created_idx
  on public.ai_player_intent_adjudications (campaign_id, created_at desc);

create index if not exists ai_player_intent_adjudications_target_created_idx
  on public.ai_player_intent_adjudications (target_character_id, created_at desc);

alter table public.ai_player_intent_adjudications enable row level security;

revoke all on table public.ai_player_intent_adjudications
  from public, anon, authenticated;
grant all on table public.ai_player_intent_adjudications to service_role;

drop policy if exists ai_player_intent_adjudications_no_direct_reads
  on public.ai_player_intent_adjudications;

create policy ai_player_intent_adjudications_no_direct_reads
  on public.ai_player_intent_adjudications
  for select
  to authenticated
  using (false);

create or replace function private.reject_ai_player_intent_adjudication_update_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ai_player_intent_adjudication_is_immutable';
end;
$$;

drop trigger if exists ai_player_intent_adjudications_immutable_update
  on public.ai_player_intent_adjudications;

create trigger ai_player_intent_adjudications_immutable_update
before update on public.ai_player_intent_adjudications
for each row
execute function private.reject_ai_player_intent_adjudication_update_v1();

alter table public.pending_player_roll_requests
  add column if not exists adjudication_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'pending_player_roll_requests_adjudication_id_fkey'
      and conrelid = 'public.pending_player_roll_requests'::regclass
  ) then
    alter table public.pending_player_roll_requests
      add constraint pending_player_roll_requests_adjudication_id_fkey
      foreign key (adjudication_id)
      references public.ai_player_intent_adjudications(id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists pending_player_roll_requests_adjudication_unique
  on public.pending_player_roll_requests (adjudication_id)
  where adjudication_id is not null;

create or replace function private.ai_gm_difficulty_dc_v1(p_difficulty text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_difficulty,'')))
    when 'very_easy' then 5
    when 'easy' then 10
    when 'moderate' then 15
    when 'hard' then 20
    when 'very_hard' then 25
    when 'nearly_impossible' then 30
    else null
  end;
$$;

revoke all on function private.ai_gm_difficulty_dc_v1(text)
  from public, anon, authenticated;
grant execute on function private.ai_gm_difficulty_dc_v1(text)
  to service_role;

create or replace function public.create_ai_gm_player_roll_request_v2(
  p_job_id uuid,
  p_character_id uuid,
  p_adjudication_mode text,
  p_exact_goal text,
  p_semantic_mechanic_request text,
  p_logical_difficulty text,
  p_dc_visibility text,
  p_success_envelope text,
  p_failure_envelope text,
  p_partial_success_envelope text,
  p_evidence_context jsonb,
  p_evidence_refs jsonb,
  p_request_type text,
  p_ability_key text,
  p_skill_key text,
  p_attack_kind text,
  p_label text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_existing public.pending_player_roll_requests%rowtype;
  v_room_id uuid;
  v_source_message_id bigint;
  v_source_body text;
  v_sequence integer;
  v_mode text := lower(btrim(coalesce(p_adjudication_mode,'')));
  v_difficulty text := lower(btrim(coalesce(p_logical_difficulty,'')));
  v_visibility text := case
    when lower(btrim(coalesce(p_dc_visibility,''))) = 'public' then 'public'
    else 'hidden'
  end;
  v_request_type text := lower(btrim(coalesce(p_request_type,'')));
  v_dc integer;
  v_exact_goal_allowed boolean;
  v_nat20_policy text;
  v_source_fingerprint text;
  v_evidence_fingerprint text;
  v_receipt_fingerprint text;
  v_receipt public.ai_player_intent_adjudications%rowtype;
  v_roll jsonb;
  v_request_id uuid;
begin
  select * into v_job
  from public.agent_jobs
  where id = p_job_id
    and job_type = 'conversation_turn'
    and input ->> 'surface' = 'game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  select * into v_existing
  from public.pending_player_roll_requests
  where gm_job_id = p_job_id
    and status in ('pending','resolving')
  order by sequence_no desc
  limit 1
  for update;

  if v_existing.id is not null then
    return jsonb_build_object(
      'request_id', v_existing.id,
      'request_message_id', v_existing.request_message_id,
      'status', v_existing.status,
      'sequence_no', v_existing.sequence_no,
      'adjudication_id', v_existing.adjudication_id
    );
  end if;

  if v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  if v_mode not in ('check','impossible_exact') then
    raise exception 'stage17_roll_mode_invalid';
  end if;

  if nullif(btrim(coalesce(p_exact_goal,'')), '') is null then
    raise exception 'stage17_exact_goal_required';
  end if;

  if nullif(btrim(coalesce(p_semantic_mechanic_request,'')), '') is null then
    raise exception 'stage17_semantic_mechanic_required';
  end if;

  v_dc := private.ai_gm_difficulty_dc_v1(v_difficulty);
  if v_dc is null then
    raise exception 'stage17_logical_difficulty_invalid';
  end if;

  if nullif(btrim(coalesce(p_success_envelope,'')), '') is null
     and v_mode = 'check'
  then
    raise exception 'stage17_success_envelope_required';
  end if;

  if nullif(btrim(coalesce(p_failure_envelope,'')), '') is null then
    raise exception 'stage17_failure_envelope_required';
  end if;

  if v_mode = 'impossible_exact'
     and nullif(btrim(coalesce(p_partial_success_envelope,'')), '') is null
  then
    raise exception 'stage17_partial_envelope_required';
  end if;

  if v_request_type not in ('skill','ability','save','attack','custom') then
    raise exception 'stage17_normalized_request_type_invalid';
  end if;

  v_exact_goal_allowed := v_mode = 'check';
  v_nat20_policy := case
    when v_mode = 'impossible_exact' then 'partial_only'
    else 'total_only'
  end;

  v_room_id := nullif(v_job.input ->> 'room_id','')::uuid;
  v_source_message_id := nullif(v_job.input ->> 'source_chat_message_id','')::bigint;

  if v_room_id is null or v_source_message_id is null then
    raise exception 'stage17_source_identity_missing';
  end if;

  select m.body into v_source_body
  from public.chat_messages m
  where m.id = v_source_message_id
    and m.room_id = v_room_id;

  if v_source_body is null then
    raise exception 'stage17_source_message_missing';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.id = p_character_id
      and c.campaign_id = v_job.campaign_id
      and c.character_type = 'pc'
      and c.life_state = 'alive'
      and c.assigned_user_id is not null
  ) then
    raise exception 'roll_target_must_be_live_player_character';
  end if;

  select coalesce(max(sequence_no),0) + 1
  into v_sequence
  from public.pending_player_roll_requests
  where gm_job_id = p_job_id;

  v_source_fingerprint := encode(
    digest(
      convert_to(
        concat_ws(
          '|',
          v_source_message_id::text,
          p_character_id::text,
          coalesce(v_source_body,'')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_evidence_fingerprint := encode(
    digest(
      convert_to(coalesce(p_evidence_context,'{}'::jsonb)::text,'UTF8'),
      'sha256'
    ),
    'hex'
  );

  v_receipt_fingerprint := encode(
    digest(
      convert_to(
        jsonb_build_object(
          'job_id', p_job_id,
          'sequence_no', v_sequence,
          'source_intent_fingerprint', v_source_fingerprint,
          'evidence_fingerprint', v_evidence_fingerprint,
          'mode', v_mode,
          'exact_goal', btrim(p_exact_goal),
          'exact_goal_allowed', v_exact_goal_allowed,
          'semantic_mechanic_request', btrim(p_semantic_mechanic_request),
          'logical_difficulty', v_difficulty,
          'request_type', v_request_type,
          'ability_key', nullif(lower(btrim(coalesce(p_ability_key,''))),''),
          'skill_key', nullif(lower(btrim(coalesce(p_skill_key,''))),''),
          'attack_kind', nullif(lower(btrim(coalesce(p_attack_kind,''))),''),
          'dc', v_dc,
          'dc_visibility', v_visibility,
          'natural_20_policy', v_nat20_policy,
          'success_envelope', coalesce(p_success_envelope,''),
          'failure_envelope', coalesce(p_failure_envelope,''),
          'partial_success_envelope', coalesce(p_partial_success_envelope,'')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.ai_player_intent_adjudications (
    campaign_id,
    room_id,
    gm_job_id,
    sequence_no,
    source_message_id,
    target_character_id,
    source_intent_fingerprint,
    evidence_fingerprint,
    evidence_refs,
    adjudication_mode,
    exact_goal,
    exact_goal_allowed,
    semantic_mechanic_request,
    logical_difficulty,
    normalized_request_type,
    normalized_ability_key,
    normalized_skill_key,
    normalized_attack_kind,
    dc,
    dc_visibility,
    natural_20_policy,
    success_envelope,
    failure_envelope,
    partial_success_envelope,
    receipt_fingerprint
  )
  values (
    v_job.campaign_id,
    v_room_id,
    p_job_id,
    v_sequence,
    v_source_message_id,
    p_character_id,
    v_source_fingerprint,
    v_evidence_fingerprint,
    coalesce(p_evidence_refs,'{}'::jsonb),
    v_mode,
    left(btrim(p_exact_goal),1600),
    v_exact_goal_allowed,
    left(btrim(p_semantic_mechanic_request),1600),
    v_difficulty,
    v_request_type,
    nullif(lower(btrim(coalesce(p_ability_key,''))),''),
    nullif(lower(btrim(coalesce(p_skill_key,''))),''),
    nullif(lower(btrim(coalesce(p_attack_kind,''))),''),
    v_dc,
    v_visibility,
    v_nat20_policy,
    left(coalesce(p_success_envelope,''),2400),
    left(coalesce(p_failure_envelope,''),2400),
    left(coalesce(p_partial_success_envelope,''),2400),
    v_receipt_fingerprint
  )
  returning * into v_receipt;

  v_roll := public.create_ai_gm_player_roll_request_v1(
    p_job_id,
    p_character_id,
    v_request_type,
    p_ability_key,
    p_skill_key,
    p_attack_kind,
    p_label,
    p_reason,
    v_dc,
    v_visibility
  );

  v_request_id := nullif(v_roll ->> 'request_id','')::uuid;
  if v_request_id is null then
    raise exception 'stage17_roll_request_missing';
  end if;

  update public.pending_player_roll_requests
  set adjudication_id = v_receipt.id
  where id = v_request_id
    and adjudication_id is null;

  return v_roll || jsonb_build_object(
    'adjudication_id', v_receipt.id,
    'adjudication_mode', v_receipt.adjudication_mode,
    'receipt_fingerprint', v_receipt.receipt_fingerprint,
    'runtime_stage', 17
  );
end;
$$;

revoke all on function public.create_ai_gm_player_roll_request_v2(
  uuid,uuid,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.create_ai_gm_player_roll_request_v2(
  uuid,uuid,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,text,text,text,text
) to service_role;

create or replace function public.resolve_player_roll_request_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.pending_player_roll_requests%rowtype;
  v_adjudication public.ai_player_intent_adjudications%rowtype;
  v_modifier integer;
  v_roll_message_id bigint;
  v_roll_payload jsonb;
  v_public_result jsonb;
  v_private_result jsonb;
  v_job public.agent_jobs%rowtype;
  v_total integer;
  v_d20_raw integer;
  v_dc_passed boolean;
  v_outcome_class text;
  v_outcome_envelope text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Anonymous accounts cannot resolve player rolls';
  end if;

  select * into v_request
  from public.pending_player_roll_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'roll_request_not_found';
  end if;

  if not exists(
    select 1
    from public.characters c
    where c.id = v_request.character_id
      and c.assigned_user_id = auth.uid()
      and c.life_state = 'alive'
  ) then
    raise exception 'roll_request_belongs_to_another_player';
  end if;

  if v_request.status = 'resolved' and v_request.roll_message_id is not null then
    v_public_result := coalesce(v_request.result,'{}'::jsonb)
      - 'outcomeEnvelope'
      - 'successEnvelope'
      - 'failureEnvelope'
      - 'partialSuccessEnvelope'
      - 'exactGoal'
      - 'semanticMechanicRequest'
      - 'evidenceFingerprint'
      - 'sourceIntentFingerprint'
      - 'receiptFingerprint';
    return v_public_result;
  end if;

  if v_request.status <> 'pending' then
    raise exception 'roll_request_not_pending';
  end if;

  select * into v_job
  from public.agent_jobs
  where id = v_request.gm_job_id
  for update;

  if v_job.id is null or v_job.status <> 'waiting_for_user' then
    raise exception 'gm_turn_not_waiting_for_roll';
  end if;

  if v_request.adjudication_id is not null then
    select * into v_adjudication
    from public.ai_player_intent_adjudications
    where id = v_request.adjudication_id;

    if v_adjudication.id is null then
      raise exception 'stage17_adjudication_missing';
    end if;
  end if;

  update public.pending_player_roll_requests
  set status = 'resolving'
  where id = v_request.id;

  v_modifier := private.resolve_player_roll_modifier_v1(
    v_request.character_id,
    v_request.request_type,
    v_request.ability_key,
    v_request.skill_key,
    v_request.attack_kind
  );

  v_roll_message_id := public.send_chat_roll_v4(
    v_request.room_id,
    v_request.character_id,
    v_request.label,
    case
      when v_request.request_type = 'skill' then 'skill'
      when v_request.request_type = 'save' then 'save'
      when v_request.request_type = 'attack' then 'attack'
      when v_request.request_type = 'ability' then 'check'
      else 'custom'
    end,
    v_modifier,
    true,
    0,0,0,1,
    '[]'::jsonb
  );

  select event_payload into v_roll_payload
  from public.chat_messages
  where id = v_roll_message_id;

  update public.chat_messages
  set event_payload = coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'playerRollRequestId', v_request.id,
    'gmJobId', v_request.gm_job_id
  )
  where id = v_roll_message_id;

  update public.chat_messages
  set event_payload = coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'status','resolved',
    'rollMessageId',v_roll_message_id
  )
  where id = v_request.request_message_id;

  v_total := coalesce((v_roll_payload ->> 'total')::integer,0);
  v_d20_raw := coalesce((v_roll_payload ->> 'd20Raw')::integer,0);
  v_dc_passed := case
    when v_request.dc is null then null
    else v_total >= v_request.dc
  end;

  if v_adjudication.id is not null then
    if v_adjudication.adjudication_mode = 'check' then
      if v_dc_passed is true then
        v_outcome_class := 'success';
        v_outcome_envelope := v_adjudication.success_envelope;
      else
        v_outcome_class := 'failure';
        v_outcome_envelope := v_adjudication.failure_envelope;
      end if;
    elsif v_adjudication.adjudication_mode = 'impossible_exact' then
      if v_dc_passed is true then
        v_outcome_class := 'partial_success';
        v_outcome_envelope := v_adjudication.partial_success_envelope;
      else
        v_outcome_class := 'failure';
        v_outcome_envelope := v_adjudication.failure_envelope;
      end if;
    else
      raise exception 'stage17_roll_has_non_roll_adjudication';
    end if;
  else
    v_outcome_class := case
      when v_dc_passed is true then 'success'
      when v_dc_passed is false then 'failure'
      else 'rolled'
    end;
    v_outcome_envelope := '';
  end if;

  v_public_result := coalesce(v_roll_payload,'{}'::jsonb) || jsonb_build_object(
    'requestId', v_request.id,
    'requestType', v_request.request_type,
    'resolvedModifier', v_modifier,
    'rollMessageId', v_roll_message_id,
    'dcPassed', v_dc_passed,
    'outcomeClass', v_outcome_class
  );

  v_private_result := v_public_result;

  if v_adjudication.id is not null then
    v_private_result := v_private_result || jsonb_build_object(
      'adjudicationId', v_adjudication.id,
      'adjudicationMode', v_adjudication.adjudication_mode,
      'exactGoal', v_adjudication.exact_goal,
      'exactGoalAllowed', v_adjudication.exact_goal_allowed,
      'semanticMechanicRequest', v_adjudication.semantic_mechanic_request,
      'logicalDifficulty', v_adjudication.logical_difficulty,
      'natural20Policy', v_adjudication.natural_20_policy,
      'natural20', v_d20_raw = 20,
      'outcomeEnvelope', v_outcome_envelope,
      'successEnvelope', v_adjudication.success_envelope,
      'failureEnvelope', v_adjudication.failure_envelope,
      'partialSuccessEnvelope', v_adjudication.partial_success_envelope,
      'sourceIntentFingerprint', v_adjudication.source_intent_fingerprint,
      'evidenceFingerprint', v_adjudication.evidence_fingerprint,
      'receiptFingerprint', v_adjudication.receipt_fingerprint
    );
  end if;

  update public.pending_player_roll_requests
  set status = 'resolved',
      roll_message_id = v_roll_message_id,
      resolved_modifier = v_modifier,
      result = v_private_result,
      resolved_at = now()
  where id = v_request.id;

  update public.agent_jobs
  set status = 'queued',
      input = coalesce(input,'{}'::jsonb) || jsonb_build_object(
        'resume_chat_message_id', v_roll_message_id
      ),
      result = (coalesce(result,'{}'::jsonb) - 'pending_roll_request_id')
        || jsonb_build_object(
          'last_roll_request_id', v_request.id,
          'last_roll_message_id', v_roll_message_id,
          'last_roll_result', v_private_result,
          'runtime_stage', case
            when v_adjudication.id is not null then 17
            else 5
          end
        ),
      updated_at = now(),
      error_code = null,
      error_message = null
  where id = v_request.gm_job_id
    and status = 'waiting_for_user';

  perform private.dispatch_ai_gm_roll_resume_v1(v_request.gm_job_id);

  return v_public_result;
end;
$$;

revoke all on function public.resolve_player_roll_request_v1(uuid)
  from public, anon;
grant execute on function public.resolve_player_roll_request_v1(uuid)
  to authenticated;
