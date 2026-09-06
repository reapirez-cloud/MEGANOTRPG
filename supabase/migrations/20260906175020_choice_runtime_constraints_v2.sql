-- Generic structured choice runtime v2.
-- Keeps commit_character_template_choice_v1 unchanged for backwards compatibility.
-- v2 adds repeatable options, selectors, option-level prerequisites/min levels,
-- structured instance config, and controlled replacement policies.

create or replace function private.choice_runtime_has_option_v2(
  p_selected_choices jsonb,
  p_choice_key text,
  p_option text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_value jsonb;
  v_instances jsonb;
begin
  if nullif(btrim(coalesce(p_choice_key, '')), '') is null
     or nullif(btrim(coalesce(p_option, '')), '') is null then
    return false;
  end if;

  v_instances := coalesce(
    p_selected_choices #> array['_choice_runtime_v2', 'choices', p_choice_key, 'instances'],
    '[]'::jsonb
  );
  if jsonb_typeof(v_instances) = 'array' and exists (
    select 1
    from jsonb_array_elements(v_instances) i(value)
    where jsonb_typeof(i.value) = 'object'
      and i.value->>'option' = p_option
  ) then
    return true;
  end if;

  v_value := coalesce(p_selected_choices, '{}'::jsonb)->p_choice_key;
  if jsonb_typeof(v_value) = 'string' then
    return (v_value #>> '{}') = p_option;
  end if;
  if jsonb_typeof(v_value) = 'array' then
    return exists (
      select 1
      from jsonb_array_elements_text(v_value) x(value)
      where x.value = p_option
    );
  end if;

  return false;
end;
$function$;

revoke all on function private.choice_runtime_has_option_v2(jsonb,text,text) from public;

create or replace function private.validate_template_choice_instances_v2(
  p_choice jsonb,
  p_instances jsonb,
  p_source_level integer,
  p_selected_choices jsonb,
  p_choice_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_required integer := 1;
  v_pair record;
  v_instance jsonb;
  v_option text;
  v_option_spec jsonb;
  v_rule jsonb;
  v_config jsonb;
  v_selector text;
  v_selector_value text;
  v_selector_options jsonb;
  v_repeatable boolean;
  v_min_level integer;
  v_normalized jsonb := '[]'::jsonb;
  v_legacy_options jsonb := '[]'::jsonb;
  v_requirement jsonb;
  v_req jsonb;
  v_req_key text;
  v_req_option text;
  v_required_options jsonb;
  v_same_count integer;
begin
  if jsonb_typeof(coalesce(p_choice, '{}'::jsonb)) <> 'object' then
    raise exception 'CHOICE_SPEC_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_instances, 'null'::jsonb)) <> 'array' then
    raise exception 'CHOICE_INSTANCES_MUST_BE_ARRAY';
  end if;
  if p_source_level is null or p_source_level < 0 then
    raise exception 'CHOICE_SOURCE_LEVEL_INVALID';
  end if;

  v_required := greatest(1, coalesce((p_choice->>'count')::integer, 1));
  if jsonb_typeof(coalesce(p_choice->'count_by_level', '{}'::jsonb)) = 'object' then
    for v_pair in
      select key, value
      from jsonb_each_text(coalesce(p_choice->'count_by_level', '{}'::jsonb))
    loop
      if v_pair.key ~ '^[0-9]+$' and v_pair.key::integer <= p_source_level then
        v_required := greatest(v_required, greatest(1, v_pair.value::integer));
      end if;
    end loop;
  end if;

  if jsonb_array_length(p_instances) <> v_required then
    raise exception 'CHOICE_COUNT_MISMATCH:expected=%:actual=%', v_required, jsonb_array_length(p_instances);
  end if;

  for v_instance in select value from jsonb_array_elements(p_instances)
  loop
    if jsonb_typeof(v_instance) = 'string' then
      v_option := nullif(btrim(v_instance #>> '{}'), '');
      v_config := '{}'::jsonb;
      v_selector_value := null;
    elsif jsonb_typeof(v_instance) = 'object' then
      v_option := nullif(btrim(coalesce(v_instance->>'option', v_instance->>'key', v_instance->>'slug', '')), '');
      v_config := coalesce(v_instance->'config', '{}'::jsonb);
      v_selector_value := nullif(btrim(coalesce(v_instance->>'selector_value', v_instance->>'target', '')), '');
      if jsonb_typeof(v_config) <> 'object' then
        raise exception 'CHOICE_CONFIG_MUST_BE_OBJECT:%', coalesce(v_option, '?');
      end if;
    else
      raise exception 'CHOICE_INSTANCE_INVALID';
    end if;

    if v_option is null then
      raise exception 'CHOICE_OPTION_REQUIRED';
    end if;

    select o.value into v_option_spec
    from jsonb_array_elements(coalesce(p_choice->'options', '[]'::jsonb)) o(value)
    where case
      when jsonb_typeof(o.value) = 'string' then o.value #>> '{}'
      when jsonb_typeof(o.value) = 'object' then coalesce(o.value->>'option', o.value->>'key', o.value->>'slug', o.value->>'value')
      else null
    end = v_option
    limit 1;

    if v_option_spec is null then
      raise exception 'CHOICE_OPTION_UNKNOWN:%', v_option;
    end if;

    v_rule := case when jsonb_typeof(v_option_spec) = 'object' then v_option_spec else '{}'::jsonb end;
    if jsonb_typeof(coalesce((p_choice->'option_rules')->v_option, '{}'::jsonb)) = 'object' then
      v_rule := v_rule || coalesce((p_choice->'option_rules')->v_option, '{}'::jsonb);
    end if;

    v_repeatable := coalesce((v_rule->>'repeatable')::boolean, (p_choice->>'repeatable')::boolean, false)
      or not coalesce((p_choice->>'uniqueWithinChoice')::boolean, true)
      or coalesce((p_choice->'constraints'->>'allowSameOptionTwice')::boolean, false);

    v_min_level := greatest(
      1,
      coalesce((p_choice->'option_unlock_level'->>v_option)::integer, 1),
      coalesce((v_rule->>'min_level')::integer, 1),
      coalesce((v_rule->>'unlock_level')::integer, 1)
    );
    if p_source_level < v_min_level then
      raise exception 'CHOICE_OPTION_LOCKED:%:min_level=%', v_option, v_min_level;
    end if;

    if jsonb_typeof(v_rule->'selector') = 'object' then
      v_selector := nullif(btrim(coalesce(v_rule->'selector'->>'key', '')), '');
      v_selector_options := coalesce(v_rule->'selector'->'options', v_rule->'selector_options', '[]'::jsonb);
    else
      v_selector := nullif(btrim(coalesce(v_rule->>'selector', p_choice->>'selector', '')), '');
      v_selector_options := coalesce(v_rule->'selector_options', '[]'::jsonb);
    end if;
    if v_selector = 'none' then
      v_selector := null;
    end if;

    if v_selector is not null and v_selector_value is null then
      raise exception 'CHOICE_SELECTOR_REQUIRED:%:%', v_option, v_selector;
    end if;
    if v_selector is null and v_selector_value is not null then
      raise exception 'CHOICE_SELECTOR_NOT_ALLOWED:%', v_option;
    end if;
    if v_selector is not null
       and jsonb_typeof(v_selector_options) = 'array'
       and jsonb_array_length(v_selector_options) > 0
       and not exists (
         select 1 from jsonb_array_elements(v_selector_options) s(value)
         where case
           when jsonb_typeof(s.value) = 'string' then s.value #>> '{}'
           when jsonb_typeof(s.value) = 'object' then coalesce(s.value->>'value', s.value->>'key', s.value->>'slug')
           else null
         end = v_selector_value
       ) then
      raise exception 'CHOICE_SELECTOR_INVALID:%:%', v_option, v_selector_value;
    end if;

    select count(*) into v_same_count
    from jsonb_array_elements(v_normalized) n(value)
    where n.value->>'option' = v_option;

    if v_same_count > 0 and not v_repeatable then
      raise exception 'CHOICE_DUPLICATE_OPTION:%', v_option;
    end if;
    if v_same_count > 0 and v_repeatable and v_selector is not null and exists (
      select 1 from jsonb_array_elements(v_normalized) n(value)
      where n.value->>'option' = v_option
        and n.value->>'selector_value' = v_selector_value
    ) then
      raise exception 'CHOICE_SELECTOR_DUPLICATE:%:%', v_option, v_selector_value;
    end if;

    v_normalized := v_normalized || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'option', v_option,
        'selector', v_selector,
        'selector_value', v_selector_value,
        'config', v_config
      ))
    );
    v_legacy_options := v_legacy_options || jsonb_build_array(to_jsonb(v_option));
  end loop;

  v_requirement := p_choice->'requires_choice';
  if jsonb_typeof(v_requirement) = 'object' then
    v_req_key := nullif(btrim(coalesce(v_requirement->>'key', '')), '');
    v_req_option := nullif(btrim(coalesce(v_requirement->>'option', '')), '');
    if v_req_key is not null and v_req_option is not null then
      if v_req_key = p_choice_key then
        if not exists (select 1 from jsonb_array_elements(v_normalized) n(value) where n.value->>'option' = v_req_option) then
          raise exception 'CHOICE_DEPENDENCY_UNSATISFIED:%:%', v_req_key, v_req_option;
        end if;
      elsif not private.choice_runtime_has_option_v2(coalesce(p_selected_choices, '{}'::jsonb), v_req_key, v_req_option) then
        raise exception 'CHOICE_DEPENDENCY_UNSATISFIED:%:%', v_req_key, v_req_option;
      end if;
    end if;
  end if;

  for v_instance in select value from jsonb_array_elements(v_normalized)
  loop
    v_option := v_instance->>'option';
    select o.value into v_option_spec
    from jsonb_array_elements(coalesce(p_choice->'options', '[]'::jsonb)) o(value)
    where case
      when jsonb_typeof(o.value) = 'string' then o.value #>> '{}'
      when jsonb_typeof(o.value) = 'object' then coalesce(o.value->>'option', o.value->>'key', o.value->>'slug', o.value->>'value')
      else null
    end = v_option
    limit 1;
    v_rule := case when jsonb_typeof(v_option_spec) = 'object' then v_option_spec else '{}'::jsonb end;
    if jsonb_typeof(coalesce((p_choice->'option_rules')->v_option, '{}'::jsonb)) = 'object' then
      v_rule := v_rule || coalesce((p_choice->'option_rules')->v_option, '{}'::jsonb);
    end if;

    v_required_options := '[]'::jsonb;
    if jsonb_typeof(v_rule->'required_options') = 'array' then
      v_required_options := v_required_options || (v_rule->'required_options');
    end if;
    if jsonb_typeof(v_rule->'required_invocations') = 'array' then
      v_required_options := v_required_options || (v_rule->'required_invocations');
    end if;
    if jsonb_typeof(v_rule->'required_choices') = 'array' then
      for v_req in select value from jsonb_array_elements(v_rule->'required_choices')
      loop
        if jsonb_typeof(v_req) = 'string' then
          v_required_options := v_required_options || jsonb_build_array(v_req);
        elsif jsonb_typeof(v_req) = 'object' then
          v_req_key := nullif(btrim(coalesce(v_req->>'key', p_choice_key, '')), '');
          v_req_option := nullif(btrim(coalesce(v_req->>'option', v_req->>'value', '')), '');
          if v_req_key is not null and v_req_option is not null then
            if v_req_key = p_choice_key then
              if not exists (select 1 from jsonb_array_elements(v_normalized) n(value) where n.value->>'option' = v_req_option) then
                raise exception 'CHOICE_DEPENDENCY_UNSATISFIED:%:%', v_req_key, v_req_option;
              end if;
            elsif not private.choice_runtime_has_option_v2(coalesce(p_selected_choices, '{}'::jsonb), v_req_key, v_req_option) then
              raise exception 'CHOICE_DEPENDENCY_UNSATISFIED:%:%', v_req_key, v_req_option;
            end if;
          end if;
        end if;
      end loop;
    end if;

    for v_req_option in select value from jsonb_array_elements_text(v_required_options)
    loop
      if not exists (select 1 from jsonb_array_elements(v_normalized) n(value) where n.value->>'option' = v_req_option) then
        raise exception 'CHOICE_DEPENDENCY_UNSATISFIED:%:%', p_choice_key, v_req_option;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'required_count', v_required,
    'instances', v_normalized,
    'legacy_options', v_legacy_options
  );
end;
$function$;

revoke all on function private.validate_template_choice_instances_v2(jsonb,jsonb,integer,jsonb,text) from public;

create or replace function public.commit_character_template_choice_v2(
  p_assignment_id uuid,
  p_choice_key text,
  p_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_character public.characters%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_validation jsonb;
  v_instances jsonb;
  v_legacy_options jsonb;
  v_required integer;
  v_existing_json jsonb;
  v_existing_instances jsonb := '[]'::jsonb;
  v_existing_count integer := 0;
  v_previous_level integer;
  v_refresh text;
  v_replacement_policy text;
  v_can_replace boolean := false;
  v_value jsonb;
  v_next jsonb;
  v_runtime jsonb;
  v_runtime_choices jsonb;
  v_entry jsonb;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_choice_key, '')), '') is null then
    raise exception 'CHOICE_KEY_REQUIRED';
  end if;

  select * into v_assignment
  from public.character_template_assignments
  where id = p_assignment_id
  for update;
  if v_assignment.id is null then
    raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND';
  end if;

  select * into v_template
  from public.rule_templates
  where id = v_assignment.template_id and is_active = true;
  if v_template.id is null then
    raise exception 'ACTIVE_TEMPLATE_NOT_FOUND';
  end if;

  select * into v_character
  from public.characters
  where id = v_assignment.character_id;
  if v_character.id is null then
    raise exception 'CHARACTER_NOT_FOUND';
  end if;

  if coalesce(v_character.assigned_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()
     and not private.can_manage_character(v_character.id, auth.uid()) then
    raise exception 'CHOICE_PERMISSION_DENIED';
  end if;

  v_source_level := private.character_template_source_level(v_assignment.id);
  if v_source_level is null then
    raise exception 'CHOICE_SOURCE_NOT_UNLOCKED';
  end if;

  select q.choice into v_choice
  from (
    select 0 as level, c.choice
    from jsonb_array_elements(coalesce(v_template.choices, '[]'::jsonb)) c(choice)
    union all
    select l.level, c.choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c(choice)
    where l.template_id = v_template.id and l.level <= v_source_level
  ) q
  where q.choice->>'key' = p_choice_key
  order by q.level desc
  limit 1;

  if v_choice is null then
    raise exception 'CHOICE_NOT_UNLOCKED';
  end if;
  if coalesce(v_choice->>'selection_mode', 'manager') <> 'player_once' then
    raise exception 'CHOICE_NOT_PLAYER_RESOLVABLE';
  end if;

  v_refresh := coalesce(v_choice->>'refresh', '');
  if v_refresh <> '' and v_refresh <> 'long_rest' then
    raise exception 'CHOICE_REFRESH_UNSUPPORTED:%', v_refresh;
  end if;

  v_validation := private.validate_template_choice_instances_v2(
    v_choice,
    p_instances,
    v_source_level,
    coalesce(v_assignment.selected_choices, '{}'::jsonb),
    p_choice_key
  );
  v_instances := v_validation->'instances';
  v_legacy_options := v_validation->'legacy_options';
  v_required := (v_validation->>'required_count')::integer;

  v_existing_json := coalesce(v_assignment.selected_choices, '{}'::jsonb)->p_choice_key;
  if jsonb_typeof(v_existing_json) = 'string' then
    v_existing_count := 1;
    v_existing_instances := jsonb_build_array(jsonb_build_object('option', v_existing_json #>> '{}', 'config', '{}'::jsonb));
  elsif jsonb_typeof(v_existing_json) = 'array' then
    v_existing_count := jsonb_array_length(v_existing_json);
    select coalesce(jsonb_agg(jsonb_build_object('option', x.value, 'config', '{}'::jsonb)), '[]'::jsonb)
    into v_existing_instances
    from jsonb_array_elements_text(v_existing_json) x(value);
  end if;

  if jsonb_typeof(coalesce(
      coalesce(v_assignment.selected_choices, '{}'::jsonb) #> array['_choice_runtime_v2', 'choices', p_choice_key, 'instances'],
      '[]'::jsonb
    )) = 'array'
     and jsonb_array_length(coalesce(
      coalesce(v_assignment.selected_choices, '{}'::jsonb) #> array['_choice_runtime_v2', 'choices', p_choice_key, 'instances'],
      '[]'::jsonb
    )) > 0 then
    v_existing_instances := coalesce(v_assignment.selected_choices, '{}'::jsonb) #> array['_choice_runtime_v2', 'choices', p_choice_key, 'instances'];
    v_existing_count := jsonb_array_length(v_existing_instances);
  end if;

  if (coalesce(v_assignment.selected_choices, '{}'::jsonb) #> array['_choice_runtime_v2', 'choices', p_choice_key, 'source_level']) is not null then
    v_previous_level := (coalesce(v_assignment.selected_choices, '{}'::jsonb) #>> array['_choice_runtime_v2', 'choices', p_choice_key, 'source_level'])::integer;
  end if;

  v_replacement_policy := coalesce(v_choice->>'replacement_policy', 'locked');
  if v_replacement_policy not in ('locked', 'always', 'preparation', 'on_level_change', 'preparation_or_level_change') then
    raise exception 'CHOICE_REPLACEMENT_POLICY_UNSUPPORTED:%', v_replacement_policy;
  end if;

  v_can_replace :=
       v_replacement_policy = 'always'
    or (v_replacement_policy in ('preparation', 'preparation_or_level_change') and private.is_character_preparation_open(v_character.id))
    or (v_replacement_policy in ('on_level_change', 'preparation_or_level_change') and v_previous_level is not null and v_source_level > v_previous_level)
    or (v_refresh = 'long_rest' and private.is_character_preparation_open(v_character.id));

  if v_existing_count >= v_required and not v_can_replace then
    raise exception 'CHOICE_ALREADY_LOCKED';
  end if;

  if v_existing_count > 0 and v_existing_count < v_required and not v_can_replace then
    if exists (
      select 1
      from (
        select value, count(*) as n
        from jsonb_array_elements(v_existing_instances)
        group by value
      ) e
      left join (
        select value, count(*) as n
        from jsonb_array_elements(v_instances)
        group by value
      ) r using (value)
      where coalesce(r.n, 0) < e.n
    ) then
      raise exception 'CHOICE_CONFIRMED_INSTANCE_REMOVAL_DENIED';
    end if;
  end if;

  v_value := case
    when v_required = 1 then v_legacy_options->0
    else v_legacy_options
  end;

  v_next := jsonb_set(
    coalesce(v_assignment.selected_choices, '{}'::jsonb),
    array[p_choice_key],
    v_value,
    true
  );

  v_runtime := coalesce(v_next->'_choice_runtime_v2', '{}'::jsonb);
  if jsonb_typeof(v_runtime) <> 'object' then
    v_runtime := '{}'::jsonb;
  end if;
  v_runtime := jsonb_set(v_runtime, '{version}', to_jsonb(2), true);
  v_runtime_choices := coalesce(v_runtime->'choices', '{}'::jsonb);
  if jsonb_typeof(v_runtime_choices) <> 'object' then
    v_runtime_choices := '{}'::jsonb;
  end if;

  v_entry := jsonb_build_object(
    'source_level', v_source_level,
    'instances', v_instances,
    'updated_at', to_jsonb(now())
  );
  v_runtime_choices := jsonb_set(v_runtime_choices, array[p_choice_key], v_entry, true);
  v_runtime := jsonb_set(v_runtime, '{choices}', v_runtime_choices, true);
  v_next := jsonb_set(v_next, '{_choice_runtime_v2}', v_runtime, true);

  update public.character_template_assignments
  set selected_choices = v_next,
      updated_at = now()
  where id = v_assignment.id
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'assignment_id', v_assignment.id,
    'choice_key', p_choice_key,
    'source_level', v_source_level,
    'instances', v_instances,
    'selected_choices', v_next,
    'updated_at', v_updated_at
  );
end;
$function$;

revoke all on function public.commit_character_template_choice_v2(uuid,text,jsonb) from public;
grant execute on function public.commit_character_template_choice_v2(uuid,text,jsonb) to authenticated;
grant execute on function public.commit_character_template_choice_v2(uuid,text,jsonb) to service_role;

comment on function public.commit_character_template_choice_v2(uuid,text,jsonb) is
'Choice runtime v2: structured instances, repeatable options, selectors, prerequisites, min levels, and controlled replacement while preserving legacy selected_choices projections.';
