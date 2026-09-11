-- CLASS_MIGRATION_SCOPE: infrastructure
-- Generic Character Engine formula parity fix.
-- The live character_sheets schema stores six scalar ability columns; it does
-- not contain a JSONB ability_scores column. Server-side template formulas must
-- resolve abilities.*.(score|modifier) from the canonical scalar columns.

begin;

create or replace function private.evaluate_character_template_numeric_expression(
  p_character_id uuid,
  p_expression jsonb
)
returns numeric
language plpgsql
security definer
set search_path=''
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
  v_ability text;
begin
  if p_expression is null then
    raise exception 'FORMULA_EXPRESSION_REQUIRED';
  end if;

  if jsonb_typeof(p_expression)='number' then
    return (p_expression #>> '{}')::numeric;
  end if;
  if jsonb_typeof(p_expression)<>'object' then
    raise exception 'FORMULA_EXPRESSION_INVALID';
  end if;

  v_kind:=nullif(btrim(coalesce(p_expression->>'kind','')),'');
  if v_kind is null then raise exception 'FORMULA_KIND_REQUIRED'; end if;

  if v_kind='literal' then
    if jsonb_typeof(p_expression->'value')<>'number' then raise exception 'FORMULA_LITERAL_INVALID'; end if;
    return (p_expression->>'value')::numeric;
  end if;

  if v_kind='reference' then
    v_key:=nullif(btrim(coalesce(p_expression->>'key','')),'');
    if v_key is null then raise exception 'FORMULA_REFERENCE_KEY_REQUIRED'; end if;

    if v_key like 'values.%' then
      return private.character_runtime_value_snapshot(p_character_id,substr(v_key,8));
    end if;

    if v_key='core.proficiencyBonus' then
      select s.proficiency_bonus::numeric into v_value
      from public.character_sheets s where s.character_id=p_character_id;
      if v_value is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%',v_key; end if;
      return v_value;
    end if;

    if v_key='core.level' then
      select c.level::numeric into v_value
      from public.characters c where c.id=p_character_id;
      if v_value is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%',v_key; end if;
      return v_value;
    end if;

    if v_key ~ '^abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.(score|modifier)$' then
      v_ability:=split_part(v_key,'.',2);
      v_suffix:=split_part(v_key,'.',3);

      select case v_ability
        when 'strength' then s.strength::numeric
        when 'dexterity' then s.dexterity::numeric
        when 'constitution' then s.constitution::numeric
        when 'intelligence' then s.intelligence::numeric
        when 'wisdom' then s.wisdom::numeric
        when 'charisma' then s.charisma::numeric
        else null
      end
      into v_score
      from public.character_sheets s
      where s.character_id=p_character_id;

      if v_score is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%',v_key; end if;
      if v_suffix='score' then return v_score; end if;
      return floor((v_score-10)/2);
    end if;

    if v_key like 'resources.%.current' or v_key like 'resources.%.max' then
      v_suffix:=case when v_key like '%.current' then 'current' else 'max' end;
      v_state_key:=substr(v_key,11,length(v_key)-10-length(v_suffix)-1);
      if nullif(v_state_key,'') is null then raise exception 'FORMULA_REFERENCE_KEY_INVALID:%',v_key; end if;
      if v_suffix='current' then
        select s.current::numeric into v_value
        from public.character_resource_states s
        where s.character_id=p_character_id and s.state_key=v_state_key;
      else
        select s.max_snapshot::numeric into v_value
        from public.character_resource_states s
        where s.character_id=p_character_id and s.state_key=v_state_key;
      end if;
      if v_value is null then raise exception 'FORMULA_REFERENCE_NOT_FOUND:%',v_key; end if;
      return v_value;
    end if;

    raise exception 'FORMULA_REFERENCE_UNSUPPORTED:%',v_key;
  end if;

  if v_kind='add' then
    if jsonb_typeof(p_expression->'terms')<>'array' or jsonb_array_length(p_expression->'terms')=0 then
      raise exception 'FORMULA_ADD_TERMS_REQUIRED';
    end if;
    v_result:=0;
    for v_item in select value from jsonb_array_elements(p_expression->'terms') loop
      v_result:=v_result+private.evaluate_character_template_numeric_expression(p_character_id,v_item);
    end loop;
    return v_result;
  end if;

  if v_kind='subtract' then
    if p_expression->'left' is null or p_expression->'right' is null then
      raise exception 'FORMULA_SUBTRACT_OPERANDS_REQUIRED';
    end if;
    return private.evaluate_character_template_numeric_expression(p_character_id,p_expression->'left')
      - private.evaluate_character_template_numeric_expression(p_character_id,p_expression->'right');
  end if;

  if v_kind='multiply' then
    if jsonb_typeof(p_expression->'factors')<>'array' or jsonb_array_length(p_expression->'factors')=0 then
      raise exception 'FORMULA_MULTIPLY_FACTORS_REQUIRED';
    end if;
    v_result:=1;
    for v_item in select value from jsonb_array_elements(p_expression->'factors') loop
      v_result:=v_result*private.evaluate_character_template_numeric_expression(p_character_id,v_item);
    end loop;
    return v_result;
  end if;

  if v_kind in ('min','max') then
    if jsonb_typeof(p_expression->'values')<>'array' or jsonb_array_length(p_expression->'values')=0 then
      raise exception 'FORMULA_%_VALUES_REQUIRED',upper(v_kind);
    end if;
    v_count:=0;
    v_result:=null;
    for v_item in select value from jsonb_array_elements(p_expression->'values') loop
      v_other:=private.evaluate_character_template_numeric_expression(p_character_id,v_item);
      v_count:=v_count+1;
      if v_result is null then
        v_result:=v_other;
      elsif v_kind='min' then
        v_result:=least(v_result,v_other);
      else
        v_result:=greatest(v_result,v_other);
      end if;
    end loop;
    return v_result;
  end if;

  if v_kind='clamp' then
    if p_expression->'value' is null then raise exception 'FORMULA_CLAMP_VALUE_REQUIRED'; end if;
    if p_expression->'min' is null and p_expression->'max' is null then raise exception 'FORMULA_CLAMP_BOUND_REQUIRED'; end if;
    v_result:=private.evaluate_character_template_numeric_expression(p_character_id,p_expression->'value');
    if p_expression->'min' is not null then
      v_value:=private.evaluate_character_template_numeric_expression(p_character_id,p_expression->'min');
      v_result:=greatest(v_result,v_value);
    else
      v_value:=null;
    end if;
    if p_expression->'max' is not null then
      v_other:=private.evaluate_character_template_numeric_expression(p_character_id,p_expression->'max');
      if v_value is not null and v_value>v_other then raise exception 'FORMULA_CLAMP_BOUNDS_INVALID'; end if;
      v_result:=least(v_result,v_other);
    end if;
    return v_result;
  end if;

  raise exception 'FORMULA_KIND_UNSUPPORTED:%',v_kind;
end;
$function$;

revoke all on function private.evaluate_character_template_numeric_expression(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.evaluate_character_template_numeric_expression(uuid,jsonb) to service_role;

commit;
