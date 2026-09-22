CREATE OR REPLACE FUNCTION private.quest_condition_base_satisfied_v1(p_condition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_condition public.quest_conditions%rowtype;
  v_group public.quest_condition_groups%rowtype;
  v_stage public.quest_stages%rowtype;
  v_quest public.quests%rowtype;
  v_target public.quest_targets%rowtype;
  v_character_ids uuid[];
  v_scope text;
  v_all_scope boolean;
  v_since timestamptz;
  v_satisfied boolean := false;
  v_event_type text;
  v_payload_contains jsonb;
  v_field text;
  v_expected text;
begin
  select * into v_condition
  from public.quest_conditions
  where id = p_condition_id;

  if not found then
    return jsonb_build_object(
      'satisfied', false,
      'automatic', false,
      'reason', 'condition_not_found'
    );
  end if;

  select * into v_group
  from public.quest_condition_groups
  where id = v_condition.group_id;

  select * into v_stage
  from public.quest_stages
  where id = v_group.stage_id;

  select * into v_quest
  from public.quests
  where id = v_stage.quest_id;

  if v_condition.target_id is not null then
    select * into v_target
    from public.quest_targets
    where id = v_condition.target_id;
  end if;

  if v_condition.condition_type = 'custom_narrative' then
    select qcs.satisfied
      into v_satisfied
    from public.quest_condition_states qcs
    where qcs.condition_id = p_condition_id
      and qcs.resolution_source in ('gm','ai');

    return jsonb_build_object(
      'satisfied', coalesce(v_satisfied, false),
      'automatic', false,
      'reason', case when v_satisfied is null then 'manual_required' else 'manual_resolution' end
    );
  end if;

  v_character_ids := private.quest_condition_character_ids_v1(p_condition_id);
  if coalesce(array_length(v_character_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'satisfied', false,
      'automatic', true,
      'reason', 'no_assigned_characters'
    );
  end if;

  v_scope := lower(coalesce(nullif(v_condition.params->>'character_scope', ''), 'primary'));
  v_all_scope := v_scope = 'all';

  if coalesce((v_condition.params->>'historical')::boolean, false) then
    v_since := null;
  else
    v_since := coalesce(v_quest.activated_at, v_quest.created_at);
  end if;

  if v_condition.condition_type = 'visit_location' then
    if v_target.location_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(
        exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = cid
            and cws.location_id = v_target.location_id
        )
        or exists (
          select 1
          from public.campaign_events ce
          where ce.campaign_id = v_quest.campaign_id
            and ce.event_type = 'world.location_entered'
            and ce.location_id = v_target.location_id
            and ce.actor_character_id = cid
            and (v_since is null or ce.occurred_at >= v_since)
        )
      )
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from unnest(v_character_ids) as cid
        where exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = cid
            and cws.location_id = v_target.location_id
        )
        or exists (
          select 1
          from public.campaign_events ce
          where ce.campaign_id = v_quest.campaign_id
            and ce.event_type = 'world.location_entered'
            and ce.location_id = v_target.location_id
            and ce.actor_character_id = cid
            and (v_since is null or ce.occurred_at >= v_since)
        )
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'discover_location' then
    if v_target.location_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(exists (
        select 1
        from public.character_location_discoveries cld
        where cld.character_id = cid
          and cld.location_id = v_target.location_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cld.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ))
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from public.character_location_discoveries cld
        where cld.character_id = any(v_character_ids)
          and cld.location_id = v_target.location_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cld.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type in ('meet_npc','discover_npc') then
    if v_target.npc_character_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = cid
          and cnd.npc_character_id = v_target.npc_character_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cnd.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ))
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = any(v_character_ids)
          and cnd.npc_character_id = v_target.npc_character_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cnd.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'talk_to_npc' then
    if v_target.npc_character_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = cid
          and cnd.npc_character_id = v_target.npc_character_id
          and (v_since is null or cnd.last_interaction_at >= v_since)
      ))
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = any(v_character_ids)
          and cnd.npc_character_id = v_target.npc_character_id
          and (v_since is null or cnd.last_interaction_at >= v_since)
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'inventory_has' then
    if v_target.item_definition_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(
        coalesce((
          select sum(cii.quantity)
          from public.character_inventory_items cii
          where cii.character_id = cid
            and cii.definition_id = v_target.item_definition_id
            and cii.world_storage_id is null
            and cii.surface_id is null
        ), 0) >= v_condition.required_quantity
      )
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from unnest(v_character_ids) as cid
        where coalesce((
          select sum(cii.quantity)
          from public.character_inventory_items cii
          where cii.character_id = cid
            and cii.definition_id = v_target.item_definition_id
            and cii.world_storage_id is null
            and cii.surface_id is null
        ), 0) >= v_condition.required_quantity
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'deliver_item' then
    if v_target.item_definition_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    v_event_type := coalesce(nullif(v_condition.params->>'event_type', ''), 'quest.item_delivered');

    select exists (
      select 1
      from public.campaign_events ce
      where ce.campaign_id = v_quest.campaign_id
        and ce.event_type = v_event_type
        and (v_since is null or ce.occurred_at >= v_since)
        and (
          coalesce((v_condition.params->>'campaign_wide')::boolean, false)
          or ce.actor_character_id = any(v_character_ids)
          or ce.participant_character_ids && v_character_ids
        )
        and (
          ce.payload->>'target_id' = v_condition.target_id::text
          or ce.payload->>'item_definition_id' = v_target.item_definition_id::text
          or ce.payload#>>'{event_payload,targetId}' = v_condition.target_id::text
          or ce.payload#>>'{event_payload,itemDefinitionId}' = v_target.item_definition_id::text
        )
    ) into v_satisfied;

  elsif v_condition.condition_type = 'event_occurred' then
    v_event_type := nullif(v_condition.params->>'event_type', '');
    if v_event_type is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'event_type_required'
      );
    end if;

    if jsonb_typeof(v_condition.params->'payload_contains') = 'object' then
      v_payload_contains := v_condition.params->'payload_contains';
    else
      v_payload_contains := '{}'::jsonb;
    end if;

    select exists (
      select 1
      from public.campaign_events ce
      where ce.campaign_id = v_quest.campaign_id
        and ce.event_type = v_event_type
        and (v_since is null or ce.occurred_at >= v_since)
        and (
          nullif(v_condition.params->>'source_kind', '') is null
          or ce.source_kind = v_condition.params->>'source_kind'
        )
        and (
          nullif(v_condition.params->>'source_id', '') is null
          or ce.source_id = v_condition.params->>'source_id'
        )
        and ce.payload @> v_payload_contains
        and (
          coalesce((v_condition.params->>'campaign_wide')::boolean, false)
          or ce.actor_character_id = any(v_character_ids)
          or ce.participant_character_ids && v_character_ids
        )
        and (
          v_condition.target_id is null
          or (
            v_target.target_kind = 'location'
            and v_target.location_id is not null
            and (
              ce.location_id = v_target.location_id
              or ce.payload->>'location_id' = v_target.location_id::text
            )
          )
          or (
            v_target.target_kind = 'npc'
            and v_target.npc_character_id is not null
            and (
              ce.payload->>'npc_character_id' = v_target.npc_character_id::text
              or ce.payload->>'target_id' = v_condition.target_id::text
            )
          )
          or (
            v_target.target_kind = 'item'
            and v_target.item_definition_id is not null
            and (
              ce.payload->>'item_definition_id' = v_target.item_definition_id::text
              or ce.payload->>'target_id' = v_condition.target_id::text
            )
          )
        )
    ) into v_satisfied;

  elsif v_condition.condition_type = 'character_state' then
    v_field := lower(coalesce(v_condition.params->>'field', ''));
    v_expected := coalesce(v_condition.params->>'equals', v_condition.params->>'value');

    if v_field = 'life_state' then
      if v_all_scope then
        select bool_and(c.life_state = v_expected)
          into v_satisfied
        from unnest(v_character_ids) cid
        join public.characters c on c.id = cid;
      else
        select exists (
          select 1
          from public.characters c
          where c.id = any(v_character_ids)
            and c.life_state = v_expected
        ) into v_satisfied;
      end if;

    elsif v_field = 'level' then
      if v_all_scope then
        select bool_and(
          (v_condition.params->>'min' is null or c.level >= (v_condition.params->>'min')::integer)
          and (v_condition.params->>'max' is null or c.level <= (v_condition.params->>'max')::integer)
          and (v_expected is null or c.level = v_expected::integer)
        )
        into v_satisfied
        from unnest(v_character_ids) cid
        join public.characters c on c.id = cid;
      else
        select exists (
          select 1
          from public.characters c
          where c.id = any(v_character_ids)
            and (v_condition.params->>'min' is null or c.level >= (v_condition.params->>'min')::integer)
            and (v_condition.params->>'max' is null or c.level <= (v_condition.params->>'max')::integer)
            and (v_expected is null or c.level = v_expected::integer)
        ) into v_satisfied;
      end if;

    elsif v_field = 'location_id' then
      if v_target.location_id is not null then
        v_expected := v_target.location_id::text;
      end if;

      if v_expected is null then
        return jsonb_build_object(
          'satisfied', false,
          'automatic', true,
          'reason', 'location_value_required'
        );
      end if;

      if v_all_scope then
        select bool_and(cws.location_id::text = v_expected)
          into v_satisfied
        from unnest(v_character_ids) cid
        left join public.character_world_state cws on cws.character_id = cid;
      else
        select exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = any(v_character_ids)
            and cws.location_id::text = v_expected
        ) into v_satisfied;
      end if;

    elsif v_field = 'campaign_day' then
      if v_all_scope then
        select bool_and(
          (v_condition.params->>'min' is null or cws.campaign_day >= (v_condition.params->>'min')::integer)
          and (v_condition.params->>'max' is null or cws.campaign_day <= (v_condition.params->>'max')::integer)
          and (v_expected is null or cws.campaign_day = v_expected::integer)
        )
        into v_satisfied
        from unnest(v_character_ids) cid
        join public.character_world_state cws on cws.character_id = cid;
      else
        select exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = any(v_character_ids)
            and (v_condition.params->>'min' is null or cws.campaign_day >= (v_condition.params->>'min')::integer)
            and (v_condition.params->>'max' is null or cws.campaign_day <= (v_condition.params->>'max')::integer)
            and (v_expected is null or cws.campaign_day = v_expected::integer)
        ) into v_satisfied;
      end if;

    elsif v_field = 'day_period' then
      if v_all_scope then
        select bool_and(cws.day_period = v_expected)
          into v_satisfied
        from unnest(v_character_ids) cid
        join public.character_world_state cws on cws.character_id = cid;
      else
        select exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = any(v_character_ids)
            and cws.day_period = v_expected
        ) into v_satisfied;
      end if;

    else
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'unsupported_character_state_field'
      );
    end if;

  else
    return jsonb_build_object(
      'satisfied', false,
      'automatic', false,
      'reason', 'unsupported_condition_type'
    );
  end if;

  if v_condition.negated then
    v_satisfied := not coalesce(v_satisfied, false);
  end if;

  return jsonb_build_object(
    'satisfied', coalesce(v_satisfied, false),
    'automatic', true,
    'condition_type', v_condition.condition_type,
    'target_id', v_condition.target_id,
    'character_ids', to_jsonb(v_character_ids),
    'evaluated_at', now()
  );
end;
$function$
;

comment on function private.quest_condition_base_satisfied_v1(uuid) is
  'Evaluates canonical automatic Quest Engine conditions. meet_npc and discover_npc both use character_npc_discoveries; talk_to_npc additionally requires a recent interaction.';
;