-- Stage 17 final hardening: scene-bound proof, strict replay and legacy API closure.

CREATE OR REPLACE FUNCTION private.stage17_location_within_scope_v1(p_campaign_id uuid, p_scope_location_id uuid, p_target_location_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive chain(id, parent_location_id, path) as (
    select l.id, l.parent_location_id, array[l.id]::uuid[]
    from public.locations l
    where l.id = p_target_location_id
      and l.campaign_id = p_campaign_id
      and l.lifecycle_state = 'active'
    union all
    select parent.id, parent.parent_location_id, chain.path || parent.id
    from public.locations parent
    join chain on chain.parent_location_id = parent.id
    where parent.campaign_id = p_campaign_id
      and parent.lifecycle_state = 'active'
      and not parent.id = any(chain.path)
  )
  select coalesce(
    p_scope_location_id is not null
    and p_target_location_id is not null
    and exists(select 1 from chain where id = p_scope_location_id),
    false
  );
$function$;



CREATE OR REPLACE FUNCTION private.stage17_validate_bound_world_proof_v1(p_job_id uuid, p_campaign_id uuid, p_uncertainty_scope text, p_evidence_refs jsonb, p_canonical_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_room_id uuid;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_source_day integer;
  v_refs jsonb := coalesce(p_evidence_refs, '{}'::jsonb);
  v_validated jsonb;
  v_item jsonb;
  v_kind text;
  v_id uuid;
  v_bound boolean;
begin
  select * into v_job
  from public.agent_jobs
  where id = p_job_id
    and campaign_id = p_campaign_id
    and job_type = 'conversation_turn'
    and input->>'surface' = 'game_chat_v1';

  if v_job.id is null then
    raise exception 'stage17_bound_proof_job_not_found';
  end if;

  begin
    v_room_id := nullif(v_job.input->>'room_id','')::uuid;
    v_source_character_id := nullif(v_job.input->>'source_character_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'stage17_bound_proof_source_identity_invalid';
  end;

  if v_room_id is null or v_source_character_id is null then
    raise exception 'stage17_bound_proof_source_identity_missing';
  end if;

  select ws.location_id, ws.campaign_day
    into v_source_location_id, v_source_day
  from public.character_world_state ws
  where ws.character_id = v_source_character_id
    and ws.campaign_id = p_campaign_id;

  if v_source_location_id is null then
    select r.location_id, r.campaign_day
      into v_source_location_id, v_source_day
    from public.chat_rooms r
    where r.id = v_room_id
      and r.campaign_id = p_campaign_id;
  end if;

  if v_source_location_id is null then
    raise exception 'stage17_bound_proof_source_location_missing';
  end if;

  if nullif(v_refs->>'source_character_id','') is distinct from v_source_character_id::text then
    raise exception 'stage17_bound_proof_source_character_mismatch';
  end if;
  if nullif(v_refs->>'source_location_id','') is distinct from v_source_location_id::text then
    raise exception 'stage17_bound_proof_source_location_mismatch';
  end if;
  if v_source_day is not null
     and nullif(v_refs->>'campaign_day','') is not null
     and (v_refs->>'campaign_day')::integer is distinct from v_source_day
  then
    raise exception 'stage17_bound_proof_game_day_mismatch';
  end if;

  v_validated := private.stage17_validate_canonical_evidence_v1(
    p_campaign_id,
    coalesce(p_canonical_evidence,'[]'::jsonb)
  );

  if lower(btrim(coalesce(p_uncertainty_scope,''))) <> 'world_discovery'
     or jsonb_array_length(v_validated) = 0
  then
    return v_validated;
  end if;

  for v_item in select value from jsonb_array_elements(v_validated)
  loop
    v_kind := v_item->>'kind';
    v_id := (v_item->>'id')::uuid;
    v_bound := false;

    if v_kind = 'location' then
      v_bound :=
        private.stage17_location_within_scope_v1(
          p_campaign_id, v_source_location_id, v_id
        )
        and (
          v_id::text = nullif(v_refs->>'source_location_id','')
          or exists (
            select 1
            from public.quest_targets qt
            join public.quests q on q.id = qt.quest_id
            where q.campaign_id = p_campaign_id
              and qt.location_id = v_id
              and qt.binding_state = 'bound'
              and exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(v_refs->'quest_target_ids','[]'::jsonb)
                ) ref(value)
                where ref.value = qt.id::text
              )
          )
          or exists (
            select 1
            from public.campaign_memory_facts f
            where f.campaign_id = p_campaign_id
              and f.status = 'active'
              and f.subject_id = v_id::text
              and exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(v_refs->'memory_fact_ids','[]'::jsonb)
                ) ref(value)
                where ref.value = f.id::text
              )
          )
        );

    elsif v_kind = 'npc' then
      v_bound :=
        exists (
          select 1
          from public.character_world_state ws
          join public.characters c on c.id = ws.character_id
          where ws.character_id = v_id
            and ws.campaign_id = p_campaign_id
            and c.campaign_id = p_campaign_id
            and c.character_type = 'npc'
            and c.publication_state = 'campaign'
            and private.stage17_location_within_scope_v1(
              p_campaign_id, v_source_location_id, ws.location_id
            )
        )
        and (
          exists (
            select 1
            from jsonb_array_elements_text(
              coalesce(v_refs->'present_character_ids','[]'::jsonb)
            ) ref(value)
            where ref.value = v_id::text
          )
          or exists (
            select 1
            from public.quest_targets qt
            join public.quests q on q.id = qt.quest_id
            where q.campaign_id = p_campaign_id
              and qt.npc_character_id = v_id
              and qt.binding_state = 'bound'
              and exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(v_refs->'quest_target_ids','[]'::jsonb)
                ) ref(value)
                where ref.value = qt.id::text
              )
          )
        );

    elsif v_kind = 'scene_actor' then
      v_bound :=
        exists (
          select 1
          from public.ai_scene_actors a
          where a.id = v_id
            and a.campaign_id = p_campaign_id
            and a.room_id = v_room_id
            and a.runtime_state = 'active'
            and private.stage17_location_within_scope_v1(
              p_campaign_id, v_source_location_id, a.location_id
            )
        )
        and exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(v_refs->'scene_actor_ids','[]'::jsonb)
          ) ref(value)
          where ref.value = v_id::text
        );

    elsif v_kind = 'quest_target' then
      v_bound :=
        exists (
          select 1
          from public.quest_targets qt
          join public.quests q on q.id = qt.quest_id
          left join public.character_world_state nws
            on nws.character_id = qt.npc_character_id
           and nws.campaign_id = p_campaign_id
          where qt.id = v_id
            and q.campaign_id = p_campaign_id
            and qt.binding_state = 'bound'
            and exists (
              select 1
              from jsonb_array_elements_text(
                coalesce(v_refs->'quest_target_ids','[]'::jsonb)
              ) ref(value)
              where ref.value = qt.id::text
            )
            and (
              (
                qt.location_id is not null
                and private.stage17_location_within_scope_v1(
                  p_campaign_id, v_source_location_id, qt.location_id
                )
              )
              or (
                qt.npc_character_id is not null
                and nws.location_id is not null
                and private.stage17_location_within_scope_v1(
                  p_campaign_id, v_source_location_id, nws.location_id
                )
              )
            )
        );

    elsif v_kind = 'memory_fact' then
      v_bound :=
        exists (
          select 1
          from public.campaign_memory_facts f
          where f.id = v_id
            and f.campaign_id = p_campaign_id
            and f.status = 'active'
            and exists (
              select 1
              from jsonb_array_elements_text(
                coalesce(v_refs->'memory_fact_ids','[]'::jsonb)
              ) ref(value)
              where ref.value = f.id::text
            )
            and (
              f.room_id = v_room_id
              or f.subject_id = v_source_location_id::text
              or exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(v_refs->'present_character_ids','[]'::jsonb)
                ) ref(value)
                where ref.value = f.subject_id
              )
              or exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(v_refs->'scene_actor_ids','[]'::jsonb)
                ) ref(value)
                where ref.value = f.subject_id
              )
            )
        );

    elsif v_kind = 'item_definition' then
      -- A catalog definition proves that an item type exists in the rules/catalog,
      -- never that an instance is physically present in the current scene.
      v_bound := false;
    end if;

    if not v_bound then
      raise exception 'stage17_world_evidence_not_bound_to_current_scene:%:%',
        v_kind, v_id;
    end if;
  end loop;

  return v_validated;
end;
$function$;



CREATE OR REPLACE FUNCTION public.create_ai_gm_player_roll_request_v4(p_job_id uuid, p_character_id uuid, p_adjudication_mode text, p_uncertainty_scope text, p_exact_goal text, p_semantic_mechanic_request text, p_logical_difficulty text, p_dc_visibility text, p_success_envelope text, p_failure_envelope text, p_partial_success_envelope text, p_evidence_context jsonb, p_evidence_refs jsonb, p_canonical_evidence jsonb, p_resolver_decision_key text, p_request_type text, p_ability_key text, p_skill_key text, p_attack_kind text, p_label text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_existing public.pending_player_roll_requests%rowtype;
  v_adjudication public.ai_player_intent_adjudications%rowtype;
  v_validated_evidence jsonb;
  v_mode text := lower(btrim(coalesce(p_adjudication_mode,'')));
  v_scope text := lower(btrim(coalesce(p_uncertainty_scope,'')));
  v_difficulty text := lower(btrim(coalesce(p_logical_difficulty,'')));
  v_visibility text := case
    when lower(btrim(coalesce(p_dc_visibility,'')))='public' then 'public'
    else 'hidden'
  end;
  v_request_type text := lower(btrim(coalesce(p_request_type,'')));
  v_ability_key text := nullif(lower(btrim(coalesce(p_ability_key,''))),'');
  v_skill_key text := nullif(lower(btrim(coalesce(p_skill_key,''))),'');
  v_attack_kind text := nullif(lower(btrim(coalesce(p_attack_kind,''))),'');
  v_resolver_key text := nullif(btrim(coalesce(p_resolver_decision_key,'')),'');
  v_dc integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id = p_job_id
    and job_type = 'conversation_turn'
    and input->>'surface' = 'game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  v_validated_evidence := private.stage17_validate_bound_world_proof_v1(
    p_job_id,
    v_job.campaign_id,
    v_scope,
    coalesce(p_evidence_refs,'{}'::jsonb),
    coalesce(p_canonical_evidence,'[]'::jsonb)
  );

  v_dc := private.ai_gm_difficulty_dc_v1(v_difficulty);

  select * into v_existing
  from public.pending_player_roll_requests
  where gm_job_id = p_job_id
    and status in ('pending','resolving')
  order by sequence_no desc
  limit 1
  for update;

  if v_existing.id is not null then
    if v_existing.adjudication_id is null then
      raise exception 'stage17_pending_roll_missing_adjudication';
    end if;

    select * into v_adjudication
    from public.ai_player_intent_adjudications
    where id = v_existing.adjudication_id;

    if v_adjudication.id is null then
      raise exception 'stage17_pending_roll_adjudication_not_found';
    end if;

    if v_existing.character_id is distinct from p_character_id
       or v_adjudication.adjudication_mode is distinct from v_mode
       or v_adjudication.uncertainty_scope is distinct from v_scope
       or v_adjudication.exact_goal is distinct from left(btrim(coalesce(p_exact_goal,'')),1600)
       or v_adjudication.semantic_mechanic_request is distinct from left(btrim(coalesce(p_semantic_mechanic_request,'')),1600)
       or v_adjudication.logical_difficulty is distinct from v_difficulty
       or v_adjudication.normalized_request_type is distinct from v_request_type
       or v_adjudication.normalized_ability_key is distinct from v_ability_key
       or v_adjudication.normalized_skill_key is distinct from v_skill_key
       or v_adjudication.normalized_attack_kind is distinct from v_attack_kind
       or v_adjudication.dc is distinct from v_dc
       or v_adjudication.dc_visibility is distinct from v_visibility
       or v_adjudication.success_envelope is distinct from left(coalesce(p_success_envelope,''),2400)
       or v_adjudication.failure_envelope is distinct from left(coalesce(p_failure_envelope,''),2400)
       or v_adjudication.partial_success_envelope is distinct from left(coalesce(p_partial_success_envelope,''),2400)
       or v_adjudication.canonical_evidence is distinct from v_validated_evidence
       or v_adjudication.resolver_decision_key is distinct from v_resolver_key
    then
      raise exception 'stage17_pending_roll_replay_contract_mismatch';
    end if;

    return jsonb_build_object(
      'request_id',v_existing.id,
      'request_message_id',v_existing.request_message_id,
      'status',v_existing.status,
      'sequence_no',v_existing.sequence_no,
      'adjudication_id',v_existing.adjudication_id,
      'adjudication_mode',v_adjudication.adjudication_mode,
      'uncertainty_scope',v_adjudication.uncertainty_scope,
      'world_proof_kind',v_adjudication.world_proof_kind,
      'receipt_fingerprint',v_adjudication.receipt_fingerprint,
      'replayed',true,
      'runtime_stage',17
    );
  end if;

  return public.create_ai_gm_player_roll_request_v3(
    p_job_id,
    p_character_id,
    p_adjudication_mode,
    p_uncertainty_scope,
    p_exact_goal,
    p_semantic_mechanic_request,
    p_logical_difficulty,
    p_dc_visibility,
    p_success_envelope,
    p_failure_envelope,
    p_partial_success_envelope,
    p_evidence_context,
    p_evidence_refs,
    v_validated_evidence,
    p_resolver_decision_key,
    p_request_type,
    p_ability_key,
    p_skill_key,
    p_attack_kind,
    p_label,
    p_reason
  );
end;
$function$;



CREATE OR REPLACE FUNCTION public.record_ai_gm_deterministic_adjudication_v2(p_job_id uuid, p_character_id uuid, p_adjudication_mode text, p_uncertainty_scope text, p_exact_goal text, p_outcome_envelope text, p_evidence_context jsonb, p_evidence_refs jsonb, p_canonical_evidence jsonb, p_resolver_decision_key text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_validated_evidence jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id = p_job_id
    and job_type = 'conversation_turn'
    and input->>'surface' = 'game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  v_validated_evidence := private.stage17_validate_bound_world_proof_v1(
    p_job_id,
    v_job.campaign_id,
    lower(btrim(coalesce(p_uncertainty_scope,''))),
    coalesce(p_evidence_refs,'{}'::jsonb),
    coalesce(p_canonical_evidence,'[]'::jsonb)
  );

  return public.record_ai_gm_deterministic_adjudication_v1(
    p_job_id,
    p_character_id,
    p_adjudication_mode,
    p_uncertainty_scope,
    p_exact_goal,
    p_outcome_envelope,
    p_evidence_context,
    p_evidence_refs,
    v_validated_evidence,
    p_resolver_decision_key,
    p_reason
  );
end;
$function$;


revoke all on function public.create_ai_gm_player_roll_request_v1(uuid,uuid,text,text,text,text,text,text,integer,text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_ai_gm_player_roll_request_v2(uuid,uuid,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_ai_gm_player_roll_request_v3(uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_ai_gm_deterministic_adjudication_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,text)
  from public, anon, authenticated, service_role;

revoke all on function public.create_ai_gm_player_roll_request_v4(uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.create_ai_gm_player_roll_request_v4(uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,text,text,text,text,text)
  to service_role;

revoke all on function public.record_ai_gm_deterministic_adjudication_v2(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.record_ai_gm_deterministic_adjudication_v2(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,text)
  to service_role;
