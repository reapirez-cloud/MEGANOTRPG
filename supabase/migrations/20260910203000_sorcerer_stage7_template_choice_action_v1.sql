-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererSubclassesStage7.test.ts
-- CLASS_WORK_STATUS: sorcerer:text=READY_AUTHORING_SCOPE;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.apply_character_template_choice_action_effect_v1(
  p_character_id uuid,
  p_mechanic_id text,
  p_option_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_action jsonb;
  v_effect jsonb;
  v_effect_count integer;
  v_choice_key text;
  v_option text;
  v_candidates jsonb;
  v_assignment_id uuid;
  v_assignment public.character_template_assignments%rowtype;
  v_choice jsonb;
  v_source_level integer;
  v_validation jsonb;
  v_instances jsonb;
  v_legacy_options jsonb;
  v_required integer;
  v_current text;
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
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then
    raise exception 'CHOICE_ACTION_PERMISSION_DENIED';
  end if;
  if nullif(btrim(coalesce(p_mechanic_id,'')),'') is null then
    raise exception 'MECHANIC_ID_REQUIRED';
  end if;

  v_action:=private.character_template_selected_action_definition_v1(p_character_id,btrim(p_mechanic_id));
  if v_action is null then
    raise exception 'CHOICE_ACTION_UNAVAILABLE:%',p_mechanic_id;
  end if;

  select count(*)
  into v_effect_count
  from jsonb_array_elements(coalesce(v_action->'effects','[]'::jsonb)) e(value)
  where e.value->>'kind'='template_choice';

  if v_effect_count=0 then
    return null;
  end if;
  if v_effect_count>1 then
    raise exception 'CHOICE_ACTION_MULTIPLE_EFFECTS_UNSUPPORTED:%',p_mechanic_id;
  end if;
  if jsonb_array_length(coalesce(v_action->'costOptions','[]'::jsonb))>0 then
    raise exception 'CHOICE_ACTION_OPTION_KEY_AMBIGUOUS:%',p_mechanic_id;
  end if;

  select e.value
  into v_effect
  from jsonb_array_elements(coalesce(v_action->'effects','[]'::jsonb)) e(value)
  where e.value->>'kind'='template_choice'
  limit 1;

  if coalesce(v_effect->>'operation','')<>'SET_OPTION' then
    raise exception 'CHOICE_ACTION_OPERATION_UNSUPPORTED:%',coalesce(v_effect->>'operation','');
  end if;

  v_choice_key:=nullif(btrim(coalesce(v_effect->>'choiceKey','')),'');
  v_option:=nullif(btrim(coalesce(p_option_key,'')),'');
  if v_choice_key is null then
    raise exception 'CHOICE_ACTION_CHOICE_KEY_REQUIRED';
  end if;
  if v_option is null then
    raise exception 'CHOICE_ACTION_OPTION_REQUIRED:%',v_choice_key;
  end if;
  if not exists(
    select 1
    from jsonb_array_elements_text(coalesce(v_effect->'options','[]'::jsonb)) o(value)
    where o.value=v_option
  ) then
    raise exception 'CHOICE_ACTION_OPTION_NOT_AUTHORED:%:%',v_choice_key,v_option;
  end if;

  with assigned_raw as (
    select
      a.id as assignment_id,
      a.template_id,
      a.template_level,
      a.selected_choices,
      t.kind,
      t.unlock_level as template_unlock_level,
      t.parent_template_id,
      t.choices,
      case
        when t.kind='subclass' then greatest(1,coalesce(parent.template_level,1))
        when t.kind='class' then greatest(1,coalesce(a.template_level,1))
        else greatest(1,coalesce(c.level,1))
      end as effective_level
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id and t.is_active
    join public.characters c on c.id=a.character_id
    left join public.character_template_assignments parent
      on parent.character_id=a.character_id and parent.template_id=t.parent_template_id
    where a.character_id=p_character_id
      and t.kind in ('class','subclass')
  ),
  assigned as (
    select * from assigned_raw
    where kind<>'subclass'
       or effective_level>=greatest(1,coalesce(template_unlock_level,1))
  ),
  definitions as (
    select a.assignment_id,a.effective_level,0 as unlock_level,d.value as definition
    from assigned a
    cross join lateral jsonb_array_elements(coalesce(a.choices,'[]'::jsonb)) d(value)
    union all
    select a.assignment_id,a.effective_level,l.level,d.value
    from assigned a
    join public.rule_template_levels l
      on l.template_id=a.template_id and l.level<=a.effective_level
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) d(value)
  ),
  latest as (
    select distinct on (assignment_id)
      assignment_id,effective_level,definition
    from definitions
    where definition->>'key'=v_choice_key
    order by assignment_id,unlock_level desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id',assignment_id,
    'effective_level',effective_level,
    'definition',definition
  )),'[]'::jsonb)
  into v_candidates
  from latest;

  if jsonb_array_length(v_candidates)=0 then
    raise exception 'CHOICE_ACTION_TARGET_NOT_FOUND:%',v_choice_key;
  end if;
  if jsonb_array_length(v_candidates)>1 then
    raise exception 'CHOICE_ACTION_TARGET_AMBIGUOUS:%',v_choice_key;
  end if;

  v_assignment_id:=(v_candidates->0->>'assignment_id')::uuid;
  v_source_level:=(v_candidates->0->>'effective_level')::integer;
  v_choice:=v_candidates->0->'definition';

  if coalesce(v_choice->>'selection_mode','manager')<>'player_once' then
    raise exception 'CHOICE_ACTION_TARGET_NOT_PLAYER_CHOICE:%',v_choice_key;
  end if;

  select *
  into v_assignment
  from public.character_template_assignments
  where id=v_assignment_id
  for update;

  if v_assignment.id is null then
    raise exception 'CHOICE_ACTION_ASSIGNMENT_NOT_FOUND:%',v_assignment_id;
  end if;

  v_current:=coalesce(
    v_assignment.selected_choices #>> array['_choice_runtime_v2','choices',v_choice_key,'instances','0','option'],
    case
      when jsonb_typeof(v_assignment.selected_choices->v_choice_key)='string'
        then v_assignment.selected_choices->>v_choice_key
      when jsonb_typeof(v_assignment.selected_choices->v_choice_key)='array'
        then v_assignment.selected_choices->v_choice_key->>0
      else null
    end
  );
  if v_current=v_option then
    raise exception 'CHOICE_ACTION_OPTION_UNCHANGED:%:%',v_choice_key,v_option;
  end if;

  v_validation:=private.validate_template_choice_instances_v2(
    v_choice,
    jsonb_build_array(jsonb_build_object('option',v_option)),
    v_source_level,
    coalesce(v_assignment.selected_choices,'{}'::jsonb),
    v_choice_key
  );
  v_required:=(v_validation->>'required_count')::integer;
  if v_required<>1 then
    raise exception 'CHOICE_ACTION_SET_OPTION_REQUIRES_SINGLE:%:%',v_choice_key,v_required;
  end if;

  v_instances:=v_validation->'instances';
  v_legacy_options:=v_validation->'legacy_options';
  v_value:=v_legacy_options->0;

  v_next:=jsonb_set(
    coalesce(v_assignment.selected_choices,'{}'::jsonb),
    array[v_choice_key],
    v_value,
    true
  );

  v_runtime:=coalesce(v_next->'_choice_runtime_v2','{}'::jsonb);
  if jsonb_typeof(v_runtime)<>'object' then
    v_runtime:='{}'::jsonb;
  end if;
  v_runtime:=jsonb_set(v_runtime,'{version}',to_jsonb(2),true);

  v_runtime_choices:=coalesce(v_runtime->'choices','{}'::jsonb);
  if jsonb_typeof(v_runtime_choices)<>'object' then
    v_runtime_choices:='{}'::jsonb;
  end if;

  v_entry:=jsonb_build_object(
    'source_level',v_source_level,
    'instances',v_instances,
    'refresh',coalesce(v_choice->>'refresh',''),
    'updated_at',to_jsonb(now())
  );
  v_runtime_choices:=jsonb_set(v_runtime_choices,array[v_choice_key],v_entry,true);
  v_runtime:=jsonb_set(v_runtime,'{choices}',v_runtime_choices,true);
  v_next:=jsonb_set(v_next,'{_choice_runtime_v2}',v_runtime,true);

  update public.character_template_assignments
  set selected_choices=v_next,
      updated_at=now()
  where id=v_assignment.id
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'assignment_id',v_assignment.id,
    'choice_key',v_choice_key,
    'source_level',v_source_level,
    'previous_option',v_current,
    'option',v_option,
    'instances',v_instances,
    'selected_choices',v_next,
    'updated_at',v_updated_at
  );
end;
$function$;

revoke all on function private.apply_character_template_choice_action_effect_v1(uuid,text,text) from public;
revoke all on function private.apply_character_template_choice_action_effect_v1(uuid,text,text) from anon;
revoke all on function private.apply_character_template_choice_action_effect_v1(uuid,text,text) from authenticated;

create or replace function private.patch_sorcerer_stage7_lunar_choice_action_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lunar uuid;
begin
  select id into v_lunar
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key='subclass:sorcerer:lunar-sorcery'
    and is_active
  order by updated_at desc
  limit 1;

  if v_lunar is null then
    return;
  end if;

  update public.rule_template_levels l
  set mechanics=(
    select coalesce(jsonb_agg(
      case
        when m.value->>'id' in ('lunar-change-phase','lunar-waxing-action')
          or m.value->>'key' in ('sorcerer_lunar_change_phase','sorcerer_lunar_waxing_and_waning')
        then jsonb_build_object(
          'id','lunar-waxing-action',
          'key','sorcerer_lunar_waxing_and_waning',
          'tags',jsonb_build_array('sorcerer','subclass','template-choice'),
          'type','action',
          'label','Сменить лунную фазу',
          'economy','bonus_action',
          'effects',jsonb_build_array(jsonb_build_object(
            'kind','template_choice',
            'choiceKey','sorcerer_lunar_phase',
            'operation','SET_OPTION',
            'options',jsonb_build_array('full','new','crescent'),
            'optionLabels',jsonb_build_object(
              'full','Полная луна',
              'new','Новолуние',
              'crescent','Серп луны'
            )
          )),
          'sourceKey','sorcerer:lunar:waxing',
          'resourceCosts',jsonb_build_array(jsonb_build_object('key','sorcery_points','amount',1))
        )
        else m.value
      end
      order by m.ord
    ),'[]'::jsonb)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality m(value,ord)
  )
  where l.template_id=v_lunar and l.level=6;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_lunar
      and l.level=6
      and m.value->>'id'='lunar-waxing-action'
      and m.value->'effects'->0->>'kind'='template_choice'
      and m.value->'effects'->0->>'choiceKey'='sorcerer_lunar_phase'
  ) then
    raise exception 'SORCERER_STAGE7_LUNAR_CHOICE_ACTION_PATCH_FAILED:%',p_campaign_id;
  end if;
end;
$function$;

create or replace function private.install_sorcerer_stage7_for_new_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.ensure_sorcerer_stage7_subclass_runtime_v1(new.id);
  perform private.patch_sorcerer_stage7_lunar_choice_action_v1(new.id);
  return new;
end;
$function$;

create or replace function public.send_chat_template_action_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null,
  p_label text default null,
  p_payload jsonb default '{}'::jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_message_id bigint;
  v_payload jsonb;
  v_fingerprint jsonb;
  v_resource_amount integer := 1;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;

  if coalesce(p_payload,'{}'::jsonb) ? 'resourceAmount' then
    if jsonb_typeof(coalesce(p_payload,'{}'::jsonb)->'resourceAmount') <> 'number'
       or (coalesce(p_payload,'{}'::jsonb)->>'resourceAmount') !~ '^[0-9]+$' then
      raise exception 'Resource amount must be a positive integer';
    end if;
    v_resource_amount := (coalesce(p_payload,'{}'::jsonb)->>'resourceAmount')::integer;
    if v_resource_amount < 1 or v_resource_amount > 1000 then
      raise exception 'Resource amount is out of range';
    end if;
    if v_resource_amount > 1 and not private.character_template_action_supports_variable_cost_v1(p_character_id,trim(p_mechanic_id)) then
      raise exception 'Action does not support variable resource cost';
    end if;
  end if;

  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  v_fingerprint := jsonb_build_object(
    'roomId',p_room_id,
    'characterId',p_character_id,
    'mechanicId',trim(p_mechanic_id),
    'optionKey',nullif(trim(coalesce(p_option_key,'')),''),
    'label',p_label,
    'payload',coalesce(p_payload,'{}'::jsonb)
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
      or v_existing.campaign_id is distinct from v_campaign_id
      or v_existing.engine is distinct from 'gena'
      or v_existing.command_kind is distinct from 'template.action'
      or v_existing.aggregate_id is distinct from p_character_id
      or (v_existing.result->'fingerprint') is distinct from v_fingerprint
    then
      raise exception 'Command id is already used by another command';
    end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  perform private.assert_character_template_preparation_action(p_character_id,trim(p_mechanic_id));
  if v_resource_amount > 1 then
    perform public.use_character_template_resource_action_amount_v1(
      p_character_id,
      trim(p_mechanic_id),
      v_resource_amount,
      nullif(trim(coalesce(p_option_key,'')),'')
    );
  else
    perform public.use_character_template_resource_action(
      p_character_id,
      trim(p_mechanic_id),
      nullif(trim(coalesce(p_option_key,'')),'')
    );
  end if;

  perform private.apply_character_template_choice_action_effect_v1(
    p_character_id,
    trim(p_mechanic_id),
    nullif(trim(coalesce(p_option_key,'')),'')
  );

  v_payload := coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
    'templateMechanicId',trim(p_mechanic_id),
    'templateOptionKey',nullif(trim(coalesce(p_option_key,'')),'')
  );
  v_message_id := public.send_chat_event_v3(
    p_room_id,
    p_character_id,
    'action',
    coalesce(nullif(trim(coalesce(p_label,'')),''),trim(p_mechanic_id)),
    v_payload,
    '[]'::jsonb
  );

  insert into public.engine_command_receipts(command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by)
  values(
    p_command_id,
    v_campaign_id,
    p_character_id,
    'gena',
    'template.action',
    p_character_id,
    jsonb_build_object('messageId',v_message_id,'fingerprint',v_fingerprint),
    auth.uid()
  );
  return v_message_id;
end;
$function$;

revoke all on function public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid) from public;
grant execute on function public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid) to authenticated;

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.patch_sorcerer_stage7_lunar_choice_action_v1(r.id);
  end loop;
end;
$block$;

do $cert$
declare
  r record;
  v_action jsonb;
begin
  for r in
    select rt.campaign_id,rt.id
    from public.rule_templates rt
    where rt.kind='subclass'
      and rt.catalog_key='subclass:sorcerer:lunar-sorcery'
      and rt.is_active
  loop
    select m.value into v_action
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=r.id
      and l.level=6
      and m.value->>'id'='lunar-waxing-action'
    limit 1;

    if v_action is null then
      raise exception 'SORCERER_STAGE7_LUNAR_CHOICE_ACTION_MISSING:%',r.campaign_id;
    end if;
    if v_action->'effects'->0->>'kind'<>'template_choice'
       or v_action->'effects'->0->>'choiceKey'<>'sorcerer_lunar_phase'
       or jsonb_array_length(v_action->'effects'->0->'options')<>3
       or v_action->'resourceCosts'->0->>'key'<>'sorcery_points'
       or (v_action->'resourceCosts'->0->>'amount')::integer<>1 then
      raise exception 'SORCERER_STAGE7_LUNAR_CHOICE_ACTION_INVALID:%',r.campaign_id;
    end if;
  end loop;

  if position(
    'apply_character_template_choice_action_effect_v1'
    in pg_get_functiondef('public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)'::regprocedure)
  )=0 then
    raise exception 'SORCERER_STAGE7_TEMPLATE_ACTION_CHOICE_HOOK_MISSING';
  end if;
end;
$cert$;

commit;
