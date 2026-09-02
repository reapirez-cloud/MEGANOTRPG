-- CLASS_MIGRATION_SCOPE: infrastructure

alter table public.character_sheets
  add column if not exists runtime_facts jsonb not null default '{}'::jsonb;

create or replace function private.character_runtime_resource_snapshot(
  p_character_id uuid,
  p_state_key text
)
returns table(current_value integer, max_value integer, label_value text, recharge_value jsonb)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_level integer;
  v_slots jsonb;
begin
  if p_state_key ~ '^spell_slot_[1-9]$' then
    v_level := substring(p_state_key from '([1-9])$')::integer;
    select coalesce(spell_slots, '{}'::jsonb)
      into v_slots
    from public.character_sheets
    where character_id = p_character_id;

    if v_slots is null then
      return;
    end if;

    current_value := greatest(
      0,
      coalesce((v_slots -> v_level::text ->> 'max')::integer, 0)
      - coalesce((v_slots -> v_level::text ->> 'used')::integer, 0)
    );
    max_value := coalesce((v_slots -> v_level::text ->> 'max')::integer, 0);
    label_value := format('Ячейка %s уровня', v_level);
    recharge_value := jsonb_build_object('triggers', jsonb_build_array('long_rest'), 'restore', 'full');
    return next;
    return;
  end if;

  return query
  select s.current, s.max_snapshot, s.label, s.recharge
  from public.character_resource_states s
  where s.character_id = p_character_id
    and s.state_key = p_state_key;
end;
$function$;

create or replace function private.evaluate_character_template_condition(
  p_character_id uuid,
  p_condition jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_kind text := coalesce(p_condition ->> 'kind', '');
  v_key text;
  v_operator text;
  v_facts jsonb := '{}'::jsonb;
  v_actual jsonb;
  v_expected jsonb;
  v_item jsonb;
  v_current_hp integer;
  v_max_hp integer;
  v_percent numeric;
begin
  if v_kind = 'always' then
    return true;
  end if;

  if v_kind = 'hp_below_percent' then
    select current_hp, max_hp
      into v_current_hp, v_max_hp
    from public.character_sheets
    where character_id = p_character_id;

    v_percent := coalesce((p_condition ->> 'percent')::numeric, 0);
    return coalesce(v_max_hp, 0) > 0
      and coalesce(v_current_hp, 0)::numeric * 100 < v_max_hp::numeric * v_percent;
  end if;

  if v_kind = 'state' then
    v_key := trim(coalesce(p_condition ->> 'key', ''));
    v_operator := upper(coalesce(p_condition ->> 'operator', ''));

    select coalesce(runtime_facts, '{}'::jsonb)
      into v_facts
    from public.character_sheets
    where character_id = p_character_id;

    if v_operator = 'EXISTS' then
      return v_facts ? v_key;
    elsif v_operator = 'NOT_EXISTS' then
      return not (v_facts ? v_key);
    end if;

    if not (v_facts ? v_key) then
      return false;
    end if;

    v_actual := v_facts -> v_key;
    v_expected := coalesce(p_condition -> 'value', 'null'::jsonb);

    if v_operator in ('EQUALS', 'EQ') then
      return v_actual = v_expected;
    elsif v_operator in ('NOT_EQUALS', 'NEQ') then
      return v_actual <> v_expected;
    elsif v_operator in ('GT', 'GTE', 'LT', 'LTE') then
      if jsonb_typeof(v_actual) <> 'number' or jsonb_typeof(v_expected) <> 'number' then
        return false;
      end if;
      if v_operator = 'GT' then return (v_actual #>> '{}')::numeric > (v_expected #>> '{}')::numeric; end if;
      if v_operator = 'GTE' then return (v_actual #>> '{}')::numeric >= (v_expected #>> '{}')::numeric; end if;
      if v_operator = 'LT' then return (v_actual #>> '{}')::numeric < (v_expected #>> '{}')::numeric; end if;
      return (v_actual #>> '{}')::numeric <= (v_expected #>> '{}')::numeric;
    end if;

    return false;
  end if;

  if v_kind = 'all' then
    for v_item in select value from jsonb_array_elements(coalesce(p_condition -> 'conditions', '[]'::jsonb)) loop
      if not private.evaluate_character_template_condition(p_character_id, v_item) then return false; end if;
    end loop;
    return true;
  end if;

  if v_kind = 'any' then
    for v_item in select value from jsonb_array_elements(coalesce(p_condition -> 'conditions', '[]'::jsonb)) loop
      if private.evaluate_character_template_condition(p_character_id, v_item) then return true; end if;
    end loop;
    return false;
  end if;

  if v_kind = 'not' then
    return not private.evaluate_character_template_condition(p_character_id, coalesce(p_condition -> 'condition', '{"kind":"always"}'::jsonb));
  end if;

  return false;
end;
$function$;

create or replace function private.apply_character_runtime_resource_effect(
  p_character_id uuid,
  p_state_key text,
  p_operation text,
  p_amount integer,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_level integer;
  v_slots jsonb;
  v_max integer;
  v_used integer;
  v_current integer;
  v_new_used integer;
  v_label text;
  v_operation text := upper(coalesce(p_operation, ''));
begin
  if p_state_key ~ '^spell_slot_[1-9]$' then
    v_level := substring(p_state_key from '([1-9])$')::integer;
    select coalesce(spell_slots, '{}'::jsonb)
      into v_slots
    from public.character_sheets
    where character_id = p_character_id
    for update;

    if v_slots is null then raise exception 'Ресурс не синхронизирован: %', p_state_key; end if;
    v_max := coalesce((v_slots -> v_level::text ->> 'max')::integer, 0);
    v_used := coalesce((v_slots -> v_level::text ->> 'used')::integer, 0);
    v_current := greatest(0, v_max - v_used);
    v_label := format('Ячейка %s уровня', v_level);

    if v_max <= 0 then raise exception 'Ресурс не синхронизирован: %', p_state_key; end if;

    if v_operation = 'RESTORE' then
      if v_current >= v_max and p_amount > 0 then raise exception 'Ресурс уже заполнен: %', v_label; end if;
      v_new_used := greatest(0, v_used - greatest(0, p_amount));
    elsif v_operation = 'SPEND' then
      if v_current < greatest(0, p_amount) then raise exception 'Недостаточно ресурса: %', v_label; end if;
      v_new_used := least(v_max, v_used + greatest(0, p_amount));
    elsif v_operation = 'SET' then
      v_new_used := v_max - greatest(0, least(v_max, greatest(0, p_amount)));
    else
      raise exception 'Unsupported resource effect operation: %', v_operation;
    end if;

    update public.character_sheets
    set spell_slots = jsonb_set(
      coalesce(spell_slots, '{}'::jsonb),
      array[v_level::text, 'used'],
      to_jsonb(v_new_used),
      true
    ), updated_at = now()
    where character_id = p_character_id;
    return;
  end if;

  select s.current, s.max_snapshot, coalesce(nullif(s.label, ''), p_state_key)
    into v_current, v_max, v_label
  from public.character_resource_states s
  where s.character_id = p_character_id and s.state_key = p_state_key
  for update;

  if v_max is null then raise exception 'Ресурс не синхронизирован: %', p_state_key; end if;

  if v_operation = 'RESTORE' then
    if v_current >= v_max and p_amount > 0 then raise exception 'Ресурс уже заполнен: %', v_label; end if;
    update public.character_resource_states
    set current = least(max_snapshot, current + greatest(0, p_amount)), updated_by = p_actor, updated_at = now()
    where character_id = p_character_id and state_key = p_state_key;
  elsif v_operation = 'SPEND' then
    if v_current < greatest(0, p_amount) then raise exception 'Недостаточно ресурса: %', v_label; end if;
    update public.character_resource_states
    set current = current - greatest(0, p_amount), updated_by = p_actor, updated_at = now()
    where character_id = p_character_id and state_key = p_state_key;
  elsif v_operation = 'SET' then
    update public.character_resource_states
    set current = greatest(0, least(max_snapshot, greatest(0, p_amount))), updated_by = p_actor, updated_at = now()
    where character_id = p_character_id and state_key = p_state_key;
  else
    raise exception 'Unsupported resource effect operation: %', v_operation;
  end if;
end;
$function$;

create or replace function private.apply_character_runtime_state_effect(
  p_character_id uuid,
  p_effect jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key text := trim(coalesce(p_effect ->> 'key', ''));
  v_operation text := upper(coalesce(p_effect ->> 'operation', ''));
  v_value jsonb := coalesce(p_effect -> 'value', 'null'::jsonb);
  v_facts jsonb;
  v_current numeric;
  v_delta numeric;
begin
  if v_key = '' then raise exception 'State effect key is required'; end if;

  select coalesce(runtime_facts, '{}'::jsonb)
    into v_facts
  from public.character_sheets
  where character_id = p_character_id
  for update;

  if v_operation = 'SET' then
    v_facts := jsonb_set(v_facts, array[v_key], v_value, true);
  elsif v_operation = 'UNSET' then
    v_facts := v_facts - v_key;
  elsif v_operation in ('ADD', 'SUBTRACT') then
    if jsonb_typeof(v_value) <> 'number' then raise exception 'State arithmetic value must be numeric'; end if;
    if v_facts ? v_key and jsonb_typeof(v_facts -> v_key) <> 'number' then raise exception 'State arithmetic target must be numeric'; end if;
    v_current := case when v_facts ? v_key then ((v_facts -> v_key) #>> '{}')::numeric else 0 end;
    v_delta := (v_value #>> '{}')::numeric;
    if v_operation = 'SUBTRACT' then v_delta := -v_delta; end if;
    v_facts := jsonb_set(v_facts, array[v_key], to_jsonb(v_current + v_delta), true);
  else
    raise exception 'Unsupported state effect operation: %', v_operation;
  end if;

  update public.character_sheets
  set runtime_facts = v_facts, updated_at = now()
  where character_id = p_character_id;
end;
$function$;

create or replace function private.recover_character_runtime_facts(
  p_character_id uuid,
  p_trigger text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_facts jsonb;
  v_key text;
  v_triggers text;
begin
  select coalesce(runtime_facts, '{}'::jsonb)
    into v_facts
  from public.character_sheets
  where character_id = p_character_id
  for update;

  if v_facts is null then return; end if;

  for v_key in select jsonb_object_keys(v_facts) loop
    if v_key ~ '^recovery-state\[[^]]+\]::' then
      v_triggers := substring(v_key from '^recovery-state\[([^]]+)\]::');
      if p_trigger = any(string_to_array(v_triggers, ',')) then
        v_facts := v_facts - v_key;
      end if;
    end if;
  end loop;

  update public.character_sheets
  set runtime_facts = v_facts, updated_at = now()
  where character_id = p_character_id;
end;
$function$;

create or replace function public.use_character_template_resource_action(p_character_id uuid, p_mechanic_id text, p_option_key text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_template_id uuid;
  v_template_kind text;
  v_template_version integer;
  v_mechanic jsonb;
  v_source_key text;
  v_root_source_id text;
  v_source_id text;
  v_choice_key text;
  v_choice_option text;
  v_option jsonb;
  v_cost jsonb;
  v_costs jsonb := '[]'::jsonb;
  v_requirement jsonb;
  v_effect jsonb;
  v_key text;
  v_variant text;
  v_state_key text;
  v_amount integer;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
  v_minimum integer;
  v_maximum integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;

  with assigned_raw as (
    select a.template_id,a.template_level,a.selected_choices,t.kind,t.version,t.unlock_level as template_unlock_level,t.parent_template_id,t.mechanics,t.choices,
      case when t.kind='subclass' then greatest(1,coalesce(parent.template_level,1)) when t.kind='class' then greatest(1,coalesce(a.template_level,1)) else greatest(1,coalesce(c.level,1)) end as effective_level
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id and t.is_active
    join public.characters c on c.id=a.character_id
    left join public.character_template_assignments parent on parent.character_id=a.character_id and parent.template_id=t.parent_template_id
    where a.character_id=p_character_id and t.kind in ('class','subclass')
  ), assigned as (
    select * from assigned_raw where kind<>'subclass' or effective_level>=greatest(1,coalesce(template_unlock_level,1))
  ), choice_defs as (
    select a.*,0 as choice_unlock_level,d.value as definition from assigned a cross join lateral jsonb_array_elements(coalesce(a.choices,'[]'::jsonb)) d(value)
    union all
    select a.*,l.level as choice_unlock_level,d.value as definition from assigned a join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) d(value)
  ), selected_options as (
    select d.*,s.option_key,s.ord,greatest(1,coalesce((select e.value::integer from jsonb_each_text(coalesce(d.definition->'count_by_level','{}'::jsonb)) e(key,value) where e.key ~ '^[0-9]+$' and e.key::integer<=d.effective_level order by e.key::integer desc limit 1),case when coalesce(d.definition->>'count','') ~ '^[0-9]+$' then (d.definition->>'count')::integer else null end,1)) as allowed_count
    from choice_defs d
    cross join lateral jsonb_array_elements_text(case jsonb_typeof(d.selected_choices->(d.definition->>'key')) when 'array' then d.selected_choices->(d.definition->>'key') when 'string' then jsonb_build_array(d.selected_choices->>(d.definition->>'key')) else '[]'::jsonb end) with ordinality s(option_key,ord)
    where nullif(trim(coalesce(d.definition->>'key','')),'') is not null
  ), active_options as (
    select s.* from selected_options s where s.ord<=s.allowed_count
      and exists(select 1 from jsonb_array_elements_text(coalesce(s.definition->'options','[]'::jsonb)) o(value) where o.value=s.option_key)
      and s.effective_level>=greatest(1,coalesce(case when coalesce(s.definition->'option_unlock_level'->>s.option_key,'') ~ '^[0-9]+$' then (s.definition->'option_unlock_level'->>s.option_key)::integer else null end,1))
  ), candidates as (
    select a.template_id,a.kind,a.version,0 as unlock_level,m.value as mechanic,null::text as choice_key,null::text as choice_option from assigned a cross join lateral jsonb_array_elements(coalesce(a.mechanics,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all
    select a.template_id,a.kind,a.version,l.level,m.value,null::text,null::text from assigned a join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all
    select o.template_id,o.kind,o.version,o.choice_unlock_level,m.value,o.definition->>'key',o.option_key from active_options o cross join lateral jsonb_array_elements(coalesce(o.definition->'option_mechanics'->o.option_key,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all
    select o.template_id,o.kind,o.version,g.level_key::integer,m.value,o.definition->>'key',o.option_key from active_options o cross join lateral jsonb_each(coalesce(o.definition->'option_mechanics_by_level'->o.option_key,'{}'::jsonb)) g(level_key,mechanics) cross join lateral jsonb_array_elements(case when jsonb_typeof(g.mechanics)='array' then g.mechanics else '[]'::jsonb end) m(value) where g.level_key ~ '^[0-9]+$' and g.level_key::integer<=o.effective_level and m.value->>'id'=trim(p_mechanic_id)
  )
  select template_id,kind,version,mechanic,choice_key,choice_option into v_template_id,v_template_kind,v_template_version,v_mechanic,v_choice_key,v_choice_option
  from candidates order by unlock_level desc limit 1;

  if v_template_id is null or v_mechanic is null then raise exception 'Class action is unavailable'; end if;
  if coalesce(v_mechanic->>'type','')<>'action' then raise exception 'Mechanic is not an action'; end if;
  v_root_source_id := 'template:'||v_template_kind||':'||v_template_id::text||':v'||v_template_version::text;
  if v_choice_key is not null and v_choice_option is not null then v_source_id:=v_root_source_id||':choice:'||v_choice_key||':'||v_choice_option;
  else v_source_key:=coalesce(nullif(trim(v_mechanic->>'sourceKey'),''),'mechanic:'||trim(p_mechanic_id)); v_source_id:=v_root_source_id||':source:'||v_source_key; end if;
  if exists(select 1 from public.character_source_suppressions s where s.character_id=p_character_id and s.source_id in (v_root_source_id,v_source_id)) then raise exception 'Class action is disabled'; end if;

  perform 1 from public.character_sheets where character_id=p_character_id for update;

  for v_requirement in select value from jsonb_array_elements(coalesce(v_mechanic->'requirements','[]'::jsonb)) loop
    if coalesce(v_requirement->>'enforcement','engine')='gm' then continue; end if;

    if coalesce(v_requirement->>'kind','')='resource' then
      v_key:=trim(coalesce(v_requirement->>'key','')); v_variant:=coalesce(nullif(trim(v_requirement->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end;
      select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key);
      if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
      v_minimum:=greatest(0,coalesce((v_requirement->>'minimum')::integer,0)); v_maximum:=case when v_requirement ? 'maximum' then greatest(0,(v_requirement->>'maximum')::integer) else null end;
      if v_current<v_minimum or (v_maximum is not null and v_current>v_maximum) then raise exception '%',coalesce(nullif(v_requirement->>'label',''),'Условие ресурса не выполнено'); end if;
    elsif coalesce(v_requirement->>'kind','')='condition' then
      if not private.evaluate_character_template_condition(p_character_id,coalesce(v_requirement->'condition','{"kind":"always"}'::jsonb)) then
        raise exception '%',coalesce(nullif(v_requirement->>'label',''),'Условие действия не выполнено');
      end if;
    end if;
  end loop;

  if jsonb_array_length(coalesce(v_mechanic->'resourceCosts','[]'::jsonb))>0 then
    for v_cost in select value from jsonb_array_elements(v_mechanic->'resourceCosts') loop
      v_key:=trim(coalesce(v_cost->>'key','')); v_variant:=coalesce(nullif(trim(v_cost->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end; v_amount:=greatest(1,coalesce((v_cost->>'amount')::integer,0));
      select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key);
      if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
      v_costs:=v_costs||jsonb_build_array(jsonb_build_object('stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge));
    end loop;
  elsif nullif(trim(coalesce(v_mechanic->>'resourceKey','')),'') is not null then
    v_key:=trim(v_mechanic->>'resourceKey'); v_variant:='default'; v_state_key:=v_key; v_amount:=greatest(1,coalesce((v_mechanic->>'resourceCost')::integer,1));
    select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key);
    if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
    v_costs:=v_costs||jsonb_build_array(jsonb_build_object('stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge));
  end if;

  if jsonb_array_length(coalesce(v_mechanic->'costOptions','[]'::jsonb))>0 then
    select value into v_option from jsonb_array_elements(v_mechanic->'costOptions') where value->>'key'=coalesce(p_option_key,'') limit 1;
    if v_option is null then raise exception 'Выбери способ оплаты'; end if;
    for v_cost in select value from jsonb_array_elements(coalesce(v_option->'costs','[]'::jsonb)) loop
      v_key:=trim(coalesce(v_cost->>'key','')); v_variant:=coalesce(nullif(trim(v_cost->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end; v_amount:=greatest(1,coalesce((v_cost->>'amount')::integer,0));
      select current_value,max_value,label_value,recharge_value into v_current,v_max,v_label,v_recharge from private.character_runtime_resource_snapshot(p_character_id,v_state_key);
      if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
      v_costs:=v_costs||jsonb_build_array(jsonb_build_object('stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge));
    end loop;
  end if;

  perform private.consume_character_resource_costs(p_character_id,v_costs,auth.uid());

  for v_effect in select value from jsonb_array_elements(coalesce(v_mechanic->'effects','[]'::jsonb)) loop
    if coalesce(v_effect->>'kind','')='resource' then
      v_key:=trim(coalesce(v_effect->>'key','')); v_variant:=coalesce(nullif(trim(v_effect->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end;
      if jsonb_typeof(v_effect->'amount')<>'number' then raise exception 'Resource effect amount must be numeric'; end if;
      v_amount:=greatest(0,(v_effect->>'amount')::integer);
      perform private.apply_character_runtime_resource_effect(p_character_id,v_state_key,v_effect->>'operation',v_amount,auth.uid());
    elsif coalesce(v_effect->>'kind','')='state' then
      perform private.apply_character_runtime_state_effect(p_character_id,v_effect);
    end if;
  end loop;
end;
$function$;

create or replace function public.recover_character_resources(p_character_id uuid, p_trigger text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_state record;
  v_rule jsonb;
  v_restore text;
  v_amount integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn') then raise exception 'Unsupported persistent recovery trigger'; end if;

  for v_state in
    select state_key,current,max_snapshot,recharge
    from public.character_resource_states
    where character_id=p_character_id
    for update
  loop
    v_rule := null;

    if v_state.recharge ? 'rules' then
      select value into v_rule
      from jsonb_array_elements(v_state.recharge->'rules')
      where value->>'trigger'=p_trigger
      limit 1;
    elsif exists(
      select 1
      from jsonb_array_elements_text(coalesce(v_state.recharge->'triggers','[]'::jsonb)) t(value)
      where t.value=p_trigger
    ) then
      v_rule := v_state.recharge;
    end if;

    if v_rule is null then continue; end if;
    v_restore := coalesce(v_rule->>'restore','full');
    if v_restore='amount' then
      v_amount := greatest(0,coalesce((v_rule->>'amount')::integer,0));
      update public.character_resource_states
      set current=least(max_snapshot,current+v_amount),updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state.state_key;
    else
      update public.character_resource_states
      set current=max_snapshot,updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state.state_key;
    end if;
  end loop;

  perform private.recover_character_runtime_facts(p_character_id,p_trigger);
end;
$function$;

revoke all on function private.character_runtime_resource_snapshot(uuid,text) from public;
revoke all on function private.evaluate_character_template_condition(uuid,jsonb) from public;
revoke all on function private.apply_character_runtime_resource_effect(uuid,text,text,integer,uuid) from public;
revoke all on function private.apply_character_runtime_state_effect(uuid,jsonb) from public;
revoke all on function private.recover_character_runtime_facts(uuid,text) from public;
