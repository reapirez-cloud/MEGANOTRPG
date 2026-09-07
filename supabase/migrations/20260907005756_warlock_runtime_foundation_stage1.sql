-- CLASS_MIGRATION_SCOPE: infrastructure
-- Shared class runtime infrastructure for rest-editable choices and CE numeric resource effects.

create or replace function private.character_runtime_value_snapshot(
  p_character_id uuid,
  p_key text
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current numeric;
  v_operation text;
  v_tier_value numeric;
  v_operation_count integer;
  v_value_count integer;
  v_invalid_count integer;
  r record;
begin
  if nullif(btrim(coalesce(p_key, '')), '') is null then
    raise exception 'RUNTIME_VALUE_KEY_REQUIRED';
  end if;

  for r in
    with assigned_raw as (
      select
        a.template_id,
        a.template_level,
        a.selected_choices,
        t.kind,
        t.version,
        t.unlock_level as template_unlock_level,
        t.parent_template_id,
        t.mechanics,
        t.choices,
        case
          when t.kind = 'subclass' then greatest(1, coalesce(parent.template_level, 1))
          when t.kind = 'class' then greatest(1, coalesce(a.template_level, 1))
          else greatest(1, coalesce(c.level, 1))
        end as effective_level
      from public.character_template_assignments a
      join public.rule_templates t on t.id = a.template_id and t.is_active
      join public.characters c on c.id = a.character_id
      left join public.character_template_assignments parent
        on parent.character_id = a.character_id
       and parent.template_id = t.parent_template_id
      where a.character_id = p_character_id
        and t.kind in ('class', 'subclass')
    ), assigned as (
      select *
      from assigned_raw
      where kind <> 'subclass'
         or effective_level >= greatest(1, coalesce(template_unlock_level, 1))
    ), choice_defs as (
      select a.*, 0 as choice_unlock_level, d.value as definition
      from assigned a
      cross join lateral jsonb_array_elements(coalesce(a.choices, '[]'::jsonb)) d(value)
      union all
      select a.*, l.level as choice_unlock_level, d.value as definition
      from assigned a
      join public.rule_template_levels l
        on l.template_id = a.template_id
       and l.level <= a.effective_level
      cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) d(value)
    ), selected_options as (
      select
        d.*,
        s.option_key,
        s.ord,
        greatest(
          1,
          coalesce(
            (
              select e.value::integer
              from jsonb_each_text(coalesce(d.definition->'count_by_level', '{}'::jsonb)) e(key, value)
              where e.key ~ '^[0-9]+$'
                and e.key::integer <= d.effective_level
              order by e.key::integer desc
              limit 1
            ),
            case
              when coalesce(d.definition->>'count', '') ~ '^[0-9]+$'
                then (d.definition->>'count')::integer
              else null
            end,
            1
          )
        ) as allowed_count
      from choice_defs d
      cross join lateral jsonb_array_elements_text(
        case jsonb_typeof(d.selected_choices->(d.definition->>'key'))
          when 'array' then d.selected_choices->(d.definition->>'key')
          when 'string' then jsonb_build_array(d.selected_choices->>(d.definition->>'key'))
          else '[]'::jsonb
        end
      ) with ordinality s(option_key, ord)
      where nullif(btrim(coalesce(d.definition->>'key', '')), '') is not null
    ), active_options as (
      select s.*
      from selected_options s
      where s.ord <= s.allowed_count
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(s.definition->'options', '[]'::jsonb)) o(value)
          where o.value = s.option_key
        )
        and s.effective_level >= greatest(
          1,
          coalesce(
            case
              when coalesce(s.definition->'option_unlock_level'->>s.option_key, '') ~ '^[0-9]+$'
                then (s.definition->'option_unlock_level'->>s.option_key)::integer
              else null
            end,
            1
          )
        )
    ), mechanics as (
      select
        a.template_id,
        a.kind,
        a.version,
        m.value as mechanic,
        null::text as choice_key,
        null::text as choice_option
      from assigned a
      cross join lateral jsonb_array_elements(coalesce(a.mechanics, '[]'::jsonb)) m(value)
      union all
      select
        a.template_id,
        a.kind,
        a.version,
        m.value,
        null::text,
        null::text
      from assigned a
      join public.rule_template_levels l
        on l.template_id = a.template_id
       and l.level <= a.effective_level
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
      union all
      select
        o.template_id,
        o.kind,
        o.version,
        m.value,
        o.definition->>'key',
        o.option_key
      from active_options o
      cross join lateral jsonb_array_elements(
        coalesce(o.definition->'option_mechanics'->o.option_key, '[]'::jsonb)
      ) m(value)
      union all
      select
        o.template_id,
        o.kind,
        o.version,
        m.value,
        o.definition->>'key',
        o.option_key
      from active_options o
      cross join lateral jsonb_each(
        coalesce(o.definition->'option_mechanics_by_level'->o.option_key, '{}'::jsonb)
      ) g(level_key, mechanics)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(g.mechanics) = 'array' then g.mechanics else '[]'::jsonb end
      ) m(value)
      where g.level_key ~ '^[0-9]+$'
        and g.level_key::integer <= o.effective_level
    ), candidates as (
      select
        coalesce(
          case when coalesce(m.mechanic->>'priority', '') ~ '^-?[0-9]+$'
            then (m.mechanic->>'priority')::integer
          end,
          0
        ) as priority,
        upper(coalesce(nullif(btrim(m.mechanic->>'grantOperation'), ''), 'GRANT')) as operation,
        m.mechanic->'payload'->'value' as raw_value,
        'template:' || m.kind || ':' || m.template_id::text || ':v' || m.version::text as root_source_id,
        case
          when m.choice_key is not null and m.choice_option is not null
            then 'template:' || m.kind || ':' || m.template_id::text || ':v' || m.version::text
              || ':choice:' || m.choice_key || ':' || m.choice_option
          else 'template:' || m.kind || ':' || m.template_id::text || ':v' || m.version::text
              || ':source:' || coalesce(
                nullif(btrim(m.mechanic->>'sourceKey'), ''),
                'mechanic:' || coalesce(m.mechanic->>'id', p_key)
              )
        end as source_id
      from mechanics m
      where m.mechanic->>'type' = 'grant'
        and m.mechanic->>'target' = 'value'
        and m.mechanic->>'key' = p_key
        and coalesce(nullif(btrim(m.mechanic->>'variantKey'), ''), 'default') = 'default'
    ), active_candidates as (
      select c.*
      from candidates c
      where not exists (
        select 1
        from public.character_source_suppressions s
        where s.character_id = p_character_id
          and s.source_id in (c.root_source_id, c.source_id)
      )
    )
    select
      priority,
      min(operation) as operation,
      count(distinct operation)::integer as operation_count,
      min((raw_value #>> '{}')::numeric) filter (where jsonb_typeof(raw_value) = 'number') as tier_value,
      count(distinct (raw_value #>> '{}')::numeric) filter (where jsonb_typeof(raw_value) = 'number')::integer as value_count,
      count(*) filter (where operation <> 'SUPPRESS' and jsonb_typeof(raw_value) is distinct from 'number')::integer as invalid_count
    from active_candidates
    group by priority
    order by priority
  loop
    v_operation := r.operation;
    v_operation_count := r.operation_count;
    v_tier_value := r.tier_value;
    v_value_count := r.value_count;
    v_invalid_count := r.invalid_count;

    if v_operation_count <> 1 then
      raise exception 'RUNTIME_VALUE_OPERATION_CONFLICT:%:priority=%', p_key, r.priority;
    end if;

    if v_operation = 'SUPPRESS' then
      v_current := null;
      continue;
    end if;

    if v_operation not in ('GRANT', 'REPLACE') then
      raise exception 'RUNTIME_VALUE_OPERATION_UNSUPPORTED:%:%', p_key, v_operation;
    end if;
    if v_invalid_count > 0 or v_value_count <> 1 then
      raise exception 'RUNTIME_VALUE_PAYLOAD_CONFLICT:%:priority=%', p_key, r.priority;
    end if;

    if v_operation = 'REPLACE' then
      v_current := v_tier_value;
    elsif v_current is null then
      v_current := v_tier_value;
    elsif v_current <> v_tier_value then
      raise exception 'RUNTIME_VALUE_GRANT_CONFLICT:%:priority=%', p_key, r.priority;
    end if;
  end loop;

  if v_current is null then
    raise exception 'RUNTIME_VALUE_NOT_FOUND:%', p_key;
  end if;
  return v_current;
end;
$function$;

create or replace function private.evaluate_character_template_numeric_expression(
  p_character_id uuid,
  p_expression jsonb
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kind text;
  v_key text;
  v_value numeric;
  v_result numeric;
  v_other numeric;
  v_score numeric;
  v_item jsonb;
  v_count integer := 0;
  v_state_key text;
  v_suffix text;
begin
  if p_expression is null then
    raise exception 'FORMULA_EXPRESSION_REQUIRED';
  end if;

  if jsonb_typeof(p_expression) = 'number' then
    return (p_expression #>> '{}')::numeric;
  end if;
  if jsonb_typeof(p_expression) <> 'object' then
    raise exception 'FORMULA_EXPRESSION_INVALID';
  end if;

  v_kind := nullif(btrim(coalesce(p_expression->>'kind', '')), '');
  if v_kind is null then
    raise exception 'FORMULA_KIND_REQUIRED';
  end if;

  if v_kind = 'literal' then
    if jsonb_typeof(p_expression->'value') <> 'number' then
      raise exception 'FORMULA_LITERAL_INVALID';
    end if;
    return (p_expression->>'value')::numeric;
  end if;

  if v_kind = 'reference' then
    v_key := nullif(btrim(coalesce(p_expression->>'key', '')), '');
    if v_key is null then
      raise exception 'FORMULA_REFERENCE_KEY_REQUIRED';
    end if;

    if v_key like 'values.%' then
      return private.character_runtime_value_snapshot(p_character_id, substr(v_key, 8));
    end if;

    if v_key = 'core.proficiencyBonus' then
      select s.proficiency_bonus::numeric into v_value
      from public.character_sheets s
      where s.character_id = p_character_id;
      if v_value is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%', v_key; end if;
      return v_value;
    end if;

    if v_key = 'core.level' then
      select c.level::numeric into v_value
      from public.characters c
      where c.id = p_character_id;
      if v_value is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%', v_key; end if;
      return v_value;
    end if;

    if v_key ~ '^abilities\.[a-z_]+\.(score|modifier)$' then
      v_suffix := split_part(v_key, '.', 3);
      select (s.ability_scores->>split_part(v_key, '.', 2))::numeric into v_score
      from public.character_sheets s
      where s.character_id = p_character_id;
      if v_score is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%', v_key; end if;
      if v_suffix = 'score' then return v_score; end if;
      return floor((v_score - 10) / 2);
    end if;

    if v_key like 'resources.%.current' or v_key like 'resources.%.max' then
      v_suffix := case when v_key like '%.current' then 'current' else 'max' end;
      v_state_key := substr(v_key, 11, length(v_key) - 10 - length(v_suffix) - 1);
      if nullif(v_state_key, '') is null then raise exception 'FORMULA_REFERENCE_KEY_INVALID:%', v_key; end if;
      if v_suffix = 'current' then
        select s.current::numeric into v_value
        from public.character_resource_states s
        where s.character_id = p_character_id and s.state_key = v_state_key;
      else
        select s.max_snapshot::numeric into v_value
        from public.character_resource_states s
        where s.character_id = p_character_id and s.state_key = v_state_key;
      end if;
      if v_value is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%', v_key; end if;
      return v_value;
    end if;

    raise exception 'FORMULA_REFERENCE_UNSUPPORTED:%', v_key;
  end if;

  if v_kind = 'add' then
    if jsonb_typeof(p_expression->'terms') <> 'array' or jsonb_array_length(p_expression->'terms') = 0 then
      raise exception 'FORMULA_ADD_TERMS_REQUIRED';
    end if;
    v_result := 0;
    for v_item in select value from jsonb_array_elements(p_expression->'terms') loop
      v_result := v_result + private.evaluate_character_template_numeric_expression(p_character_id, v_item);
    end loop;
    return v_result;
  end if;

  if v_kind = 'subtract' then
    if p_expression->'left' is null or p_expression->'right' is null then
      raise exception 'FORMULA_SUBTRACT_OPERANDS_REQUIRED';
    end if;
    return private.evaluate_character_template_numeric_expression(p_character_id, p_expression->'left')
      - private.evaluate_character_template_numeric_expression(p_character_id, p_expression->'right');
  end if;

  if v_kind = 'multiply' then
    if jsonb_typeof(p_expression->'factors') <> 'array' or jsonb_array_length(p_expression->'factors') = 0 then
      raise exception 'FORMULA_MULTIPLY_FACTORS_REQUIRED';
    end if;
    v_result := 1;
    for v_item in select value from jsonb_array_elements(p_expression->'factors') loop
      v_result := v_result * private.evaluate_character_template_numeric_expression(p_character_id, v_item);
    end loop;
    return v_result;
  end if;

  if v_kind in ('min', 'max') then
    if jsonb_typeof(p_expression->'values') <> 'array' or jsonb_array_length(p_expression->'values') = 0 then
      raise exception 'FORMULA_%_VALUES_REQUIRED', upper(v_kind);
    end if;
    v_count := 0;
    v_result := null;
    for v_item in select value from jsonb_array_elements(p_expression->'values') loop
      v_other := private.evaluate_character_template_numeric_expression(p_character_id, v_item);
      v_count := v_count + 1;
      if v_result is null then
        v_result := v_other;
      elsif v_kind = 'min' then
        v_result := least(v_result, v_other);
      else
        v_result := greatest(v_result, v_other);
      end if;
    end loop;
    return v_result;
  end if;

  if v_kind = 'clamp' then
    if p_expression->'value' is null then raise exception 'FORMULA_CLAMP_VALUE_REQUIRED'; end if;
    if p_expression->'min' is null and p_expression->'max' is null then raise exception 'FORMULA_CLAMP_BOUND_REQUIRED'; end if;
    v_result := private.evaluate_character_template_numeric_expression(p_character_id, p_expression->'value');
    if p_expression->'min' is not null then
      v_value := private.evaluate_character_template_numeric_expression(p_character_id, p_expression->'min');
      v_result := greatest(v_result, v_value);
    else
      v_value := null;
    end if;
    if p_expression->'max' is not null then
      v_other := private.evaluate_character_template_numeric_expression(p_character_id, p_expression->'max');
      if v_value is not null and v_value > v_other then raise exception 'FORMULA_CLAMP_BOUNDS_INVALID'; end if;
      v_result := least(v_result, v_other);
    end if;
    return v_result;
  end if;

  raise exception 'FORMULA_KIND_UNSUPPORTED:%', v_kind;
end;
$function$;

create or replace function private.commit_character_template_choice_v2_core_stage4(p_assignment_id uuid, p_choice_key text, p_instances jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_choice_key, '')), '') is null then raise exception 'CHOICE_KEY_REQUIRED'; end if;

  select * into v_assignment from public.character_template_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND'; end if;

  select * into v_template from public.rule_templates where id = v_assignment.template_id and is_active = true;
  if v_template.id is null then raise exception 'ACTIVE_TEMPLATE_NOT_FOUND'; end if;

  select * into v_character from public.characters where id = v_assignment.character_id;
  if v_character.id is null then raise exception 'CHARACTER_NOT_FOUND'; end if;

  if coalesce(v_character.assigned_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()
     and not private.can_manage_character(v_character.id, auth.uid()) then
    raise exception 'CHOICE_PERMISSION_DENIED';
  end if;

  v_source_level := private.character_template_source_level(v_assignment.id);
  if v_source_level is null then raise exception 'CHOICE_SOURCE_NOT_UNLOCKED'; end if;

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

  if v_choice is null then raise exception 'CHOICE_NOT_UNLOCKED'; end if;
  if coalesce(v_choice->>'selection_mode', 'manager') <> 'player_once' then raise exception 'CHOICE_NOT_PLAYER_RESOLVABLE'; end if;

  v_refresh := coalesce(v_choice->>'refresh', '');
  if v_refresh not in ('', 'long_rest', 'short_or_long_rest') then
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
    or (v_refresh in ('long_rest', 'short_or_long_rest') and private.is_character_preparation_open(v_character.id));

  if v_existing_count >= v_required and not v_can_replace then raise exception 'CHOICE_ALREADY_LOCKED'; end if;

  if v_existing_count > 0 and v_existing_count < v_required and not v_can_replace then
    if exists (
      select 1
      from (
        select value, count(*) as n from jsonb_array_elements(v_existing_instances) group by value
      ) e
      left join (
        select value, count(*) as n from jsonb_array_elements(v_instances) group by value
      ) r using (value)
      where coalesce(r.n, 0) < e.n
    ) then
      raise exception 'CHOICE_CONFIRMED_INSTANCE_REMOVAL_DENIED';
    end if;
  end if;

  v_value := case when v_required = 1 then v_legacy_options->0 else v_legacy_options end;
  v_next := jsonb_set(coalesce(v_assignment.selected_choices, '{}'::jsonb), array[p_choice_key], v_value, true);

  v_runtime := coalesce(v_next->'_choice_runtime_v2', '{}'::jsonb);
  if jsonb_typeof(v_runtime) <> 'object' then v_runtime := '{}'::jsonb; end if;
  v_runtime := jsonb_set(v_runtime, '{version}', to_jsonb(2), true);
  v_runtime_choices := coalesce(v_runtime->'choices', '{}'::jsonb);
  if jsonb_typeof(v_runtime_choices) <> 'object' then v_runtime_choices := '{}'::jsonb; end if;

  v_entry := jsonb_build_object(
    'source_level', v_source_level,
    'instances', v_instances,
    'updated_at', to_jsonb(now())
  );
  v_runtime_choices := jsonb_set(v_runtime_choices, array[p_choice_key], v_entry, true);
  v_runtime := jsonb_set(v_runtime, '{choices}', v_runtime_choices, true);
  v_next := jsonb_set(v_next, '{_choice_runtime_v2}', v_runtime, true);

  update public.character_template_assignments
  set selected_choices = v_next, updated_at = now()
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

create or replace function public.use_character_template_resource_action(p_character_id uuid, p_mechanic_id text, p_option_key text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_template_id uuid; v_template_kind text; v_template_version integer; v_mechanic jsonb; v_source_key text; v_root_source_id text; v_source_id text; v_choice_key text; v_choice_option text; v_option jsonb; v_cost jsonb; v_costs jsonb:='[]'::jsonb; v_requirement jsonb; v_effect jsonb; v_key text; v_variant text; v_state_key text; v_amount integer; v_amount_value numeric; v_current integer; v_max integer; v_label text; v_recharge jsonb; v_minimum integer; v_maximum integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;
  with assigned_raw as (
    select a.template_id,a.template_level,a.selected_choices,t.kind,t.version,t.unlock_level as template_unlock_level,t.parent_template_id,t.mechanics,t.choices,case when t.kind='subclass' then greatest(1,coalesce(parent.template_level,1)) when t.kind='class' then greatest(1,coalesce(a.template_level,1)) else greatest(1,coalesce(c.level,1)) end as effective_level
    from public.character_template_assignments a join public.rule_templates t on t.id=a.template_id and t.is_active join public.characters c on c.id=a.character_id left join public.character_template_assignments parent on parent.character_id=a.character_id and parent.template_id=t.parent_template_id where a.character_id=p_character_id and t.kind in ('class','subclass')
  ), assigned as (select * from assigned_raw where kind<>'subclass' or effective_level>=greatest(1,coalesce(template_unlock_level,1))),
  choice_defs as (select a.*,0 as choice_unlock_level,d.value as definition from assigned a cross join lateral jsonb_array_elements(coalesce(a.choices,'[]'::jsonb)) d(value) union all select a.*,l.level as choice_unlock_level,d.value as definition from assigned a join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) d(value)),
  selected_options as (select d.*,s.option_key,s.ord,greatest(1,coalesce((select e.value::integer from jsonb_each_text(coalesce(d.definition->'count_by_level','{}'::jsonb)) e(key,value) where e.key~'^[0-9]+$' and e.key::integer<=d.effective_level order by e.key::integer desc limit 1),case when coalesce(d.definition->>'count','')~'^[0-9]+$' then (d.definition->>'count')::integer else null end,1)) as allowed_count from choice_defs d cross join lateral jsonb_array_elements_text(case jsonb_typeof(d.selected_choices->(d.definition->>'key')) when 'array' then d.selected_choices->(d.definition->>'key') when 'string' then jsonb_build_array(d.selected_choices->>(d.definition->>'key')) else '[]'::jsonb end) with ordinality s(option_key,ord) where nullif(trim(coalesce(d.definition->>'key','')),'') is not null),
  active_options as (select s.* from selected_options s where s.ord<=s.allowed_count and exists(select 1 from jsonb_array_elements_text(coalesce(s.definition->'options','[]'::jsonb)) o(value) where o.value=s.option_key) and s.effective_level>=greatest(1,coalesce(case when coalesce(s.definition->'option_unlock_level'->>s.option_key,'')~'^[0-9]+$' then (s.definition->'option_unlock_level'->>s.option_key)::integer else null end,1))),
  candidates as (
    select a.template_id,a.kind,a.version,0 as unlock_level,m.value as mechanic,null::text as choice_key,null::text as choice_option from assigned a cross join lateral jsonb_array_elements(coalesce(a.mechanics,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all select a.template_id,a.kind,a.version,l.level,m.value,null::text,null::text from assigned a join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all select o.template_id,o.kind,o.version,o.choice_unlock_level,m.value,o.definition->>'key',o.option_key from active_options o cross join lateral jsonb_array_elements(coalesce(o.definition->'option_mechanics'->o.option_key,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all select o.template_id,o.kind,o.version,g.level_key::integer,m.value,o.definition->>'key',o.option_key from active_options o cross join lateral jsonb_each(coalesce(o.definition->'option_mechanics_by_level'->o.option_key,'{}'::jsonb)) g(level_key,mechanics) cross join lateral jsonb_array_elements(case when jsonb_typeof(g.mechanics)='array' then g.mechanics else '[]'::jsonb end) m(value) where g.level_key~'^[0-9]+$' and g.level_key::integer<=o.effective_level and m.value->>'id'=trim(p_mechanic_id)
  ) select template_id,kind,version,mechanic,choice_key,choice_option into v_template_id,v_template_kind,v_template_version,v_mechanic,v_choice_key,v_choice_option from candidates order by unlock_level desc limit 1;
  if v_template_id is null or v_mechanic is null then raise exception 'Class action is unavailable'; end if;
  if coalesce(v_mechanic->>'type','')<>'action' then raise exception 'Mechanic is not an action'; end if;
  v_root_source_id:='template:'||v_template_kind||':'||v_template_id::text||':v'||v_template_version::text;
  if v_choice_key is not null and v_choice_option is not null then v_source_id:=v_root_source_id||':choice:'||v_choice_key||':'||v_choice_option; else v_source_key:=coalesce(nullif(trim(v_mechanic->>'sourceKey'),''),'mechanic:'||trim(p_mechanic_id)); v_source_id:=v_root_source_id||':source:'||v_source_key; end if;
  if exists(select 1 from public.character_source_suppressions s where s.character_id=p_character_id and s.source_id in(v_root_source_id,v_source_id)) then raise exception 'Class action is disabled'; end if;
  perform 1 from public.character_sheets where character_id=p_character_id for update;
  for v_requirement in select value from jsonb_array_elements(coalesce(v_mechanic->'requirements','[]'::jsonb)) loop
    if coalesce(v_requirement->>'enforcement','engine')='gm' then continue; end if;
    if coalesce(v_requirement->>'kind','')='resource' then
      v_key:=trim(coalesce(v_requirement->>'key','')); v_variant:=coalesce(nullif(trim(v_requirement->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end;
      select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key);
      if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
      v_minimum:=greatest(0,coalesce((v_requirement->>'minimum')::integer,0)); v_maximum:=case when v_requirement?'maximum' then greatest(0,(v_requirement->>'maximum')::integer) else null end;
      if v_current<v_minimum or(v_maximum is not null and v_current>v_maximum) then raise exception '%',coalesce(nullif(v_requirement->>'label',''),'Условие ресурса не выполнено'); end if;
    elsif coalesce(v_requirement->>'kind','')='condition' then if not private.evaluate_character_template_condition(p_character_id,coalesce(v_requirement->'condition','{"kind":"always"}'::jsonb)) then raise exception '%',coalesce(nullif(v_requirement->>'label',''),'Условие действия не выполнено'); end if; end if;
  end loop;
  if jsonb_array_length(coalesce(v_mechanic->'resourceCosts','[]'::jsonb))>0 then
    for v_cost in select value from jsonb_array_elements(v_mechanic->'resourceCosts') loop v_key:=trim(coalesce(v_cost->>'key','')); v_variant:=coalesce(nullif(trim(v_cost->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end; v_amount:=greatest(1,coalesce((v_cost->>'amount')::integer,0)); select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key); if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if; v_costs:=v_costs||jsonb_build_array(jsonb_build_object('stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge)); end loop;
  elsif nullif(trim(coalesce(v_mechanic->>'resourceKey','')),'') is not null then v_key:=trim(v_mechanic->>'resourceKey'); v_state_key:=v_key; v_amount:=greatest(1,coalesce((v_mechanic->>'resourceCost')::integer,1)); select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key); if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if; v_costs:=v_costs||jsonb_build_array(jsonb_build_object('stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge)); end if;
  if jsonb_array_length(coalesce(v_mechanic->'costOptions','[]'::jsonb))>0 then select value into v_option from jsonb_array_elements(v_mechanic->'costOptions') where value->>'key'=coalesce(p_option_key,'') limit 1; if v_option is null then raise exception 'Выбери способ оплаты'; end if; for v_cost in select value from jsonb_array_elements(coalesce(v_option->'costs','[]'::jsonb)) loop v_key:=trim(coalesce(v_cost->>'key','')); v_variant:=coalesce(nullif(trim(v_cost->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end; v_amount:=greatest(1,coalesce((v_cost->>'amount')::integer,0)); select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key); if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if; v_costs:=v_costs||jsonb_build_array(jsonb_build_object('stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge)); end loop; end if;
  perform private.consume_character_resource_costs(p_character_id,v_costs,auth.uid());
  for v_effect in select value from jsonb_array_elements(coalesce(v_mechanic->'effects','[]'::jsonb)) loop
    if coalesce(v_effect->>'kind','')='resource' then
      v_key:=trim(coalesce(v_effect->>'key','')); v_variant:=coalesce(nullif(trim(v_effect->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end;
      v_amount_value:=greatest(0,private.evaluate_character_template_numeric_expression(p_character_id,v_effect->'amount'));
      if trunc(v_amount_value)<>v_amount_value or v_amount_value>2147483647 then raise exception 'Resource effect amount must resolve to a non-negative integer'; end if;
      v_amount:=v_amount_value::integer;
      perform private.apply_character_runtime_resource_effect(p_character_id,v_state_key,v_effect->>'operation',v_amount,auth.uid());
    elsif coalesce(v_effect->>'kind','')='state' then perform private.apply_character_runtime_state_effect(p_character_id,v_effect); end if;
  end loop;
end;
$function$;