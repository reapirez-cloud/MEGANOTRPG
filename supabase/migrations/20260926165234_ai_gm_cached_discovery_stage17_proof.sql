-- CLASS_MIGRATION_SCOPE: infrastructure
-- Cached day/location discovery can justify a later check in the same area.
-- Every other Resolver proof still belongs to its original job.
create or replace function private.ai_gm_resolver_proof_for_job_v1(
  p_job_id uuid, p_receipt_id uuid
) returns boolean
language plpgsql stable set search_path=''
as $function$
declare
  v_job public.agent_jobs%rowtype;
  v_receipt public.ai_world_random_receipts%rowtype;
  v_source_location uuid;
begin
  select * into v_job from public.agent_jobs where id=p_job_id;
  select * into v_receipt from public.ai_world_random_receipts where id=p_receipt_id;
  if v_job.id is null or v_receipt.id is null
     or v_job.campaign_id<>v_receipt.campaign_id
     or v_job.agent_key<>'voss' or v_job.job_type<>'conversation_turn'
     or v_receipt.decision_kind<>'narrative.branch'
     or v_receipt.audit->>'caller_surface'<>'primary_gm'
  then return false; end if;

  if v_receipt.run_key=p_job_id::text then return true; end if;

  if v_receipt.decision_key !~ '^narrative:primary_gm:day:[0-9]+:(world|npc|location|scene_actor):[0-9a-f-]+:(valuables|supplies|tracks|hidden_places|creatures|other):discovery_pool$'
     or v_receipt.campaign_day is distinct from nullif(v_job.input->>'campaign_day','')::integer
     or v_receipt.decision_key not like
       'narrative:primary_gm:day:'||v_receipt.campaign_day::text||':'||
       v_receipt.target_scope||':'||v_receipt.target_id||':%:discovery_pool'
     or not private.ai_random_decision_target_valid_v1(
       v_job.campaign_id,p_job_id::text,'primary_gm',
       v_receipt.target_scope,v_receipt.target_id
     )
  then return false; end if;

  select ws.location_id into v_source_location
  from public.character_world_state ws
  where ws.campaign_id=v_job.campaign_id
    and ws.character_id=nullif(v_job.input->>'source_character_id','')::uuid;

  if v_receipt.target_scope='world' then
    return v_receipt.target_id=v_job.campaign_id::text;
  end if;
  if v_source_location is null then return false; end if;
  if v_receipt.target_scope='location' then
    return v_receipt.target_id=v_source_location::text;
  end if;
  if v_receipt.target_scope='npc' then
    return exists(
      select 1 from public.character_world_state ws
      where ws.campaign_id=v_job.campaign_id
        and ws.character_id=v_receipt.target_id::uuid
        and ws.location_id=v_source_location
    );
  end if;
  if v_receipt.target_scope='scene_actor' then
    return exists(
      select 1 from public.ai_scene_actors a
      where a.id=v_receipt.target_id::uuid
        and a.campaign_id=v_job.campaign_id
        and a.location_id=v_source_location
    );
  end if;
  return false;
end;
$function$;

revoke all on function private.ai_gm_resolver_proof_for_job_v1(uuid,uuid)
from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_ai_gm_player_roll_request_v3(p_job_id uuid, p_character_id uuid, p_adjudication_mode text, p_uncertainty_scope text, p_exact_goal text, p_semantic_mechanic_request text, p_logical_difficulty text, p_dc_visibility text, p_success_envelope text, p_failure_envelope text, p_partial_success_envelope text, p_evidence_context jsonb, p_evidence_refs jsonb, p_canonical_evidence jsonb, p_resolver_decision_key text, p_request_type text, p_ability_key text, p_skill_key text, p_attack_kind text, p_label text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_existing public.pending_player_roll_requests%rowtype;
  v_room_id uuid;
  v_source_message_id bigint;
  v_source_body text;
  v_sequence integer;
  v_mode text := lower(btrim(coalesce(p_adjudication_mode,'')));
  v_scope text := lower(btrim(coalesce(p_uncertainty_scope,'')));
  v_difficulty text := lower(btrim(coalesce(p_logical_difficulty,'')));
  v_visibility text := case
    when lower(btrim(coalesce(p_dc_visibility,'')))='public' then 'public'
    else 'hidden'
  end;
  v_request_type text := lower(btrim(coalesce(p_request_type,'')));
  v_resolver_key text := nullif(btrim(coalesce(p_resolver_decision_key,'')),'');
  v_dc integer;
  v_exact_goal_allowed boolean;
  v_nat20_policy text;
  v_source_fingerprint text;
  v_evidence_fingerprint text;
  v_receipt_fingerprint text;
  v_receipt public.ai_player_intent_adjudications%rowtype;
  v_roll jsonb;
  v_request_id uuid;
  v_canonical_evidence jsonb;
  v_world_proof_kind text := 'not_required';
  v_resolver_receipt_id uuid;
  v_resolver_matched jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null then raise exception 'ai_gm_turn_not_found'; end if;

  select * into v_existing
  from public.pending_player_roll_requests
  where gm_job_id=p_job_id
    and status in ('pending','resolving')
  order by sequence_no desc
  limit 1
  for update;

  if v_existing.id is not null then
    return jsonb_build_object(
      'request_id',v_existing.id,
      'request_message_id',v_existing.request_message_id,
      'status',v_existing.status,
      'sequence_no',v_existing.sequence_no,
      'adjudication_id',v_existing.adjudication_id
    );
  end if;

  if v_job.status <> 'running' then raise exception 'ai_gm_turn_not_running'; end if;
  if v_mode not in ('check','impossible_exact') then raise exception 'stage17_roll_mode_invalid'; end if;
  if v_scope not in ('character_performance','world_discovery') then
    raise exception 'stage17_uncertainty_scope_invalid';
  end if;
  if nullif(btrim(coalesce(p_exact_goal,'')),'') is null then
    raise exception 'stage17_exact_goal_required';
  end if;
  if nullif(btrim(coalesce(p_semantic_mechanic_request,'')),'') is null then
    raise exception 'stage17_semantic_mechanic_required';
  end if;

  v_dc := private.ai_gm_difficulty_dc_v1(v_difficulty);
  if v_dc is null then raise exception 'stage17_logical_difficulty_invalid'; end if;

  if v_mode='check'
     and nullif(btrim(coalesce(p_success_envelope,'')),'') is null
  then
    raise exception 'stage17_success_envelope_required';
  end if;
  if nullif(btrim(coalesce(p_failure_envelope,'')),'') is null then
    raise exception 'stage17_failure_envelope_required';
  end if;
  if v_mode='impossible_exact'
     and nullif(btrim(coalesce(p_partial_success_envelope,'')),'') is null
  then
    raise exception 'stage17_partial_envelope_required';
  end if;
  if v_request_type not in ('skill','ability','save','attack','custom') then
    raise exception 'stage17_normalized_request_type_invalid';
  end if;

  v_exact_goal_allowed := v_mode='check';
  v_nat20_policy := case when v_mode='impossible_exact'
    then 'partial_only' else 'total_only' end;

  v_room_id := nullif(v_job.input->>'room_id','')::uuid;
  v_source_message_id := nullif(v_job.input->>'source_chat_message_id','')::bigint;
  if v_room_id is null or v_source_message_id is null then
    raise exception 'stage17_source_identity_missing';
  end if;

  select m.body into v_source_body
  from public.chat_messages m
  where m.id=v_source_message_id and m.room_id=v_room_id;
  if v_source_body is null then raise exception 'stage17_source_message_missing'; end if;

  if not exists (
    select 1 from public.characters c
    where c.id=p_character_id
      and c.campaign_id=v_job.campaign_id
      and c.character_type='pc'
      and c.life_state='alive'
      and c.assigned_user_id is not null
  ) then
    raise exception 'roll_target_must_be_live_player_character';
  end if;

  v_canonical_evidence := private.stage17_validate_canonical_evidence_v1(
    v_job.campaign_id,
    coalesce(p_canonical_evidence,'[]'::jsonb)
  );

  if v_resolver_key is not null then
    select r.id, r.matched_outcome
      into v_resolver_receipt_id, v_resolver_matched
    from public.ai_world_random_receipts r
    where r.campaign_id=v_job.campaign_id
      and r.decision_key=v_resolver_key
      and private.ai_gm_resolver_proof_for_job_v1(p_job_id,r.id)
      and r.decision_kind='narrative.branch'
      and coalesce(r.audit->>'caller_surface','')='primary_gm';

    if v_resolver_receipt_id is null then
      raise exception 'stage17_resolver_proof_not_found';
    end if;
  end if;

  if v_scope='world_discovery' and v_mode='check' then
    if jsonb_array_length(v_canonical_evidence)>0 then
      v_world_proof_kind := 'canonical_entities';
    elsif v_resolver_receipt_id is not null
       and coalesce(
         v_resolver_matched #>> '{payload,stage17_world_existence}',
         ''
       )='exists'
    then
      v_world_proof_kind := 'resolver_exists';
    else
      raise exception 'stage17_world_discovery_requires_canonical_or_resolver_exists_proof';
    end if;
  elsif v_mode='impossible_exact' then
    v_world_proof_kind := 'impossible_exact';
  elsif jsonb_array_length(v_canonical_evidence)>0 then
    v_world_proof_kind := 'canonical_entities';
  end if;

  if v_resolver_receipt_id is not null
     and coalesce(
       v_resolver_matched #>> '{payload,stage17_world_existence}',
       ''
     )='absent'
     and v_mode='check'
  then
    raise exception 'stage17_resolver_says_world_target_absent';
  end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.ai_player_intent_adjudications
  where gm_job_id=p_job_id;

  v_source_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws('|',v_source_message_id::text,p_character_id::text,coalesce(v_source_body,'')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_evidence_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'context',coalesce(p_evidence_context,'{}'::jsonb),
          'canonical_evidence',v_canonical_evidence,
          'resolver_receipt_id',v_resolver_receipt_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_receipt_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'job_id',p_job_id,
          'sequence_no',v_sequence,
          'source_intent_fingerprint',v_source_fingerprint,
          'evidence_fingerprint',v_evidence_fingerprint,
          'mode',v_mode,
          'uncertainty_scope',v_scope,
          'world_proof_kind',v_world_proof_kind,
          'canonical_evidence',v_canonical_evidence,
          'resolver_receipt_id',v_resolver_receipt_id,
          'resolver_decision_key',v_resolver_key,
          'exact_goal',btrim(p_exact_goal),
          'exact_goal_allowed',v_exact_goal_allowed,
          'semantic_mechanic_request',btrim(p_semantic_mechanic_request),
          'logical_difficulty',v_difficulty,
          'request_type',v_request_type,
          'ability_key',nullif(lower(btrim(coalesce(p_ability_key,''))),''),
          'skill_key',nullif(lower(btrim(coalesce(p_skill_key,''))),''),
          'attack_kind',nullif(lower(btrim(coalesce(p_attack_kind,''))),''),
          'dc',v_dc,
          'dc_visibility',v_visibility,
          'natural_20_policy',v_nat20_policy,
          'success_envelope',coalesce(p_success_envelope,''),
          'failure_envelope',coalesce(p_failure_envelope,''),
          'partial_success_envelope',coalesce(p_partial_success_envelope,'')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.ai_player_intent_adjudications (
    campaign_id,room_id,gm_job_id,sequence_no,source_message_id,target_character_id,
    source_intent_fingerprint,evidence_fingerprint,evidence_refs,
    adjudication_mode,uncertainty_scope,world_proof_kind,canonical_evidence,
    resolver_receipt_id,resolver_decision_key,
    exact_goal,exact_goal_allowed,semantic_mechanic_request,logical_difficulty,
    normalized_request_type,normalized_ability_key,normalized_skill_key,
    normalized_attack_kind,dc,dc_visibility,natural_20_policy,
    success_envelope,failure_envelope,partial_success_envelope,receipt_fingerprint
  ) values (
    v_job.campaign_id,v_room_id,p_job_id,v_sequence,v_source_message_id,p_character_id,
    v_source_fingerprint,v_evidence_fingerprint,coalesce(p_evidence_refs,'{}'::jsonb),
    v_mode,v_scope,v_world_proof_kind,v_canonical_evidence,
    v_resolver_receipt_id,v_resolver_key,
    left(btrim(p_exact_goal),1600),v_exact_goal_allowed,
    left(btrim(p_semantic_mechanic_request),1600),v_difficulty,
    v_request_type,nullif(lower(btrim(coalesce(p_ability_key,''))),''),
    nullif(lower(btrim(coalesce(p_skill_key,''))),''),
    nullif(lower(btrim(coalesce(p_attack_kind,''))),''),
    v_dc,v_visibility,v_nat20_policy,
    left(coalesce(p_success_envelope,''),2400),
    left(coalesce(p_failure_envelope,''),2400),
    left(coalesce(p_partial_success_envelope,''),2400),
    v_receipt_fingerprint
  )
  returning * into v_receipt;

  v_roll := public.create_ai_gm_player_roll_request_v1(
    p_job_id,p_character_id,v_request_type,p_ability_key,p_skill_key,p_attack_kind,
    p_label,p_reason,v_dc,v_visibility
  );

  v_request_id := nullif(v_roll->>'request_id','')::uuid;
  if v_request_id is null then raise exception 'stage17_roll_request_missing'; end if;

  update public.pending_player_roll_requests
  set adjudication_id=v_receipt.id
  where id=v_request_id and adjudication_id is null;

  return v_roll || jsonb_build_object(
    'adjudication_id',v_receipt.id,
    'adjudication_mode',v_receipt.adjudication_mode,
    'uncertainty_scope',v_receipt.uncertainty_scope,
    'world_proof_kind',v_receipt.world_proof_kind,
    'receipt_fingerprint',v_receipt.receipt_fingerprint,
    'runtime_stage',17
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.record_ai_gm_deterministic_adjudication_v1(p_job_id uuid, p_character_id uuid, p_adjudication_mode text, p_uncertainty_scope text, p_exact_goal text, p_outcome_envelope text, p_evidence_context jsonb, p_evidence_refs jsonb, p_canonical_evidence jsonb, p_resolver_decision_key text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_room_id uuid;
  v_source_message_id bigint;
  v_source_body text;
  v_mode text := lower(btrim(coalesce(p_adjudication_mode,'')));
  v_scope text := lower(btrim(coalesce(p_uncertainty_scope,'')));
  v_goal text := btrim(coalesce(p_exact_goal,''));
  v_outcome text := btrim(coalesce(p_outcome_envelope,''));
  v_resolver_key text := nullif(btrim(coalesce(p_resolver_decision_key,'')),'');
  v_canonical_evidence jsonb;
  v_resolver_receipt_id uuid;
  v_resolver_matched jsonb;
  v_world_proof_kind text := 'not_required';
  v_source_fingerprint text;
  v_evidence_fingerprint text;
  v_receipt_fingerprint text;
  v_sequence integer;
  v_existing public.ai_player_intent_adjudications%rowtype;
  v_receipt public.ai_player_intent_adjudications%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if v_mode not in ('deterministic_success','deterministic_failure') then
    raise exception 'stage17_deterministic_mode_invalid';
  end if;
  if v_scope not in ('character_performance','world_discovery') then
    raise exception 'stage17_uncertainty_scope_invalid';
  end if;
  if length(v_goal)<1 or length(v_goal)>1600 then
    raise exception 'stage17_exact_goal_required';
  end if;
  if length(v_outcome)<1 or length(v_outcome)>2400 then
    raise exception 'stage17_deterministic_outcome_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null then raise exception 'ai_gm_turn_not_found'; end if;
  if v_job.status <> 'running' then raise exception 'ai_gm_turn_not_running'; end if;

  v_room_id := nullif(v_job.input->>'room_id','')::uuid;
  v_source_message_id := nullif(v_job.input->>'source_chat_message_id','')::bigint;
  if v_room_id is null or v_source_message_id is null then
    raise exception 'stage17_source_identity_missing';
  end if;

  select m.body into v_source_body
  from public.chat_messages m
  where m.id=v_source_message_id and m.room_id=v_room_id;
  if v_source_body is null then raise exception 'stage17_source_message_missing'; end if;

  if not exists (
    select 1 from public.characters c
    where c.id=p_character_id
      and c.campaign_id=v_job.campaign_id
      and c.character_type='pc'
      and c.life_state='alive'
      and c.assigned_user_id is not null
  ) then
    raise exception 'roll_target_must_be_live_player_character';
  end if;

  v_canonical_evidence := private.stage17_validate_canonical_evidence_v1(
    v_job.campaign_id,
    coalesce(p_canonical_evidence,'[]'::jsonb)
  );

  if v_resolver_key is not null then
    select r.id, r.matched_outcome
      into v_resolver_receipt_id, v_resolver_matched
    from public.ai_world_random_receipts r
    where r.campaign_id=v_job.campaign_id
      and r.decision_key=v_resolver_key
      and private.ai_gm_resolver_proof_for_job_v1(p_job_id,r.id)
      and r.decision_kind='narrative.branch'
      and coalesce(r.audit->>'caller_surface','')='primary_gm';

    if v_resolver_receipt_id is null then
      raise exception 'stage17_resolver_proof_not_found';
    end if;
  end if;

  if v_scope='world_discovery' and v_mode='deterministic_success' then
    if jsonb_array_length(v_canonical_evidence)>0 then
      v_world_proof_kind := 'canonical_entities';
    elsif v_resolver_receipt_id is not null
       and coalesce(v_resolver_matched #>> '{payload,stage17_world_existence}','')='exists'
    then
      v_world_proof_kind := 'resolver_exists';
    else
      raise exception 'stage17_world_success_requires_canonical_or_resolver_exists_proof';
    end if;
  elsif v_scope='world_discovery' and v_mode='deterministic_failure' then
    if v_resolver_receipt_id is not null
       and coalesce(v_resolver_matched #>> '{payload,stage17_world_existence}','')='absent'
    then
      v_world_proof_kind := 'resolver_absent';
    elsif jsonb_array_length(v_canonical_evidence)>0 then
      v_world_proof_kind := 'canonical_entities';
    else
      raise exception 'stage17_world_failure_requires_canonical_or_resolver_absent_proof';
    end if;
  elsif jsonb_array_length(v_canonical_evidence)>0 then
    v_world_proof_kind := 'canonical_entities';
  end if;

  if v_resolver_receipt_id is not null then
    if v_mode='deterministic_success'
       and coalesce(v_resolver_matched #>> '{payload,stage17_world_existence}','')='absent'
    then
      raise exception 'stage17_resolver_says_world_target_absent';
    end if;
    if v_mode='deterministic_failure'
       and coalesce(v_resolver_matched #>> '{payload,stage17_world_existence}','')='exists'
       and v_scope='world_discovery'
       and jsonb_array_length(v_canonical_evidence)=0
    then
      raise exception 'stage17_resolver_says_world_target_exists';
    end if;
  end if;

  v_source_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws('|',v_source_message_id::text,p_character_id::text,coalesce(v_source_body,'')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_evidence_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'context',coalesce(p_evidence_context,'{}'::jsonb),
          'canonical_evidence',v_canonical_evidence,
          'resolver_receipt_id',v_resolver_receipt_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_receipt_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'job_id',p_job_id,
          'source_message_id',v_source_message_id,
          'target_character_id',p_character_id,
          'source_intent_fingerprint',v_source_fingerprint,
          'evidence_fingerprint',v_evidence_fingerprint,
          'mode',v_mode,
          'uncertainty_scope',v_scope,
          'world_proof_kind',v_world_proof_kind,
          'canonical_evidence',v_canonical_evidence,
          'resolver_receipt_id',v_resolver_receipt_id,
          'resolver_decision_key',v_resolver_key,
          'exact_goal',v_goal,
          'outcome_envelope',v_outcome
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into v_existing
  from public.ai_player_intent_adjudications
  where receipt_fingerprint=v_receipt_fingerprint;

  if v_existing.id is not null then
    return jsonb_build_object(
      'adjudication_id',v_existing.id,
      'adjudication_mode',v_existing.adjudication_mode,
      'uncertainty_scope',v_existing.uncertainty_scope,
      'world_proof_kind',v_existing.world_proof_kind,
      'replayed',true,
      'runtime_stage',17
    );
  end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.ai_player_intent_adjudications
  where gm_job_id=p_job_id;

  insert into public.ai_player_intent_adjudications (
    campaign_id,room_id,gm_job_id,sequence_no,source_message_id,target_character_id,
    source_intent_fingerprint,evidence_fingerprint,evidence_refs,
    adjudication_mode,uncertainty_scope,world_proof_kind,canonical_evidence,
    resolver_receipt_id,resolver_decision_key,
    exact_goal,exact_goal_allowed,semantic_mechanic_request,logical_difficulty,
    normalized_request_type,normalized_ability_key,normalized_skill_key,
    normalized_attack_kind,dc,dc_visibility,natural_20_policy,
    success_envelope,failure_envelope,partial_success_envelope,receipt_fingerprint
  ) values (
    v_job.campaign_id,v_room_id,p_job_id,v_sequence,v_source_message_id,p_character_id,
    v_source_fingerprint,v_evidence_fingerprint,coalesce(p_evidence_refs,'{}'::jsonb),
    v_mode,v_scope,v_world_proof_kind,v_canonical_evidence,
    v_resolver_receipt_id,v_resolver_key,
    v_goal,v_mode='deterministic_success','',null,
    null,null,null,null,null,'hidden','not_applicable',
    case when v_mode='deterministic_success' then v_outcome else '' end,
    case when v_mode='deterministic_failure' then v_outcome else '' end,
    '',v_receipt_fingerprint
  )
  returning * into v_receipt;

  return jsonb_build_object(
    'adjudication_id',v_receipt.id,
    'adjudication_mode',v_receipt.adjudication_mode,
    'uncertainty_scope',v_receipt.uncertainty_scope,
    'world_proof_kind',v_receipt.world_proof_kind,
    'receipt_fingerprint',v_receipt.receipt_fingerprint,
    'replayed',false,
    'runtime_stage',17
  );
end;
$function$;
