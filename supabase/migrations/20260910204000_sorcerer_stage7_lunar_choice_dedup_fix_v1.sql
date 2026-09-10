-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererSubclassesStage7.test.ts
-- CLASS_WORK_STATUS: sorcerer:text=READY_AUTHORING_SCOPE;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.patch_sorcerer_stage7_lunar_choice_action_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lunar uuid;
  v_base jsonb;
  v_feature jsonb;
  v_action jsonb;
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

  select coalesce(jsonb_agg(m.value order by m.ord),'[]'::jsonb)
  into v_base
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality m(value,ord)
  where l.template_id=v_lunar
    and l.level=6
    and not (
      m.value->>'id'='lunar-waxing'
      or (
        m.value->>'type'='action'
        and (
          m.value->>'id' in ('lunar-change-phase','lunar-waxing-action')
          or m.value->>'key' in ('sorcerer_lunar_change_phase','sorcerer_lunar_waxing_and_waning')
        )
      )
    );

  v_feature:=jsonb_build_object(
    'id','lunar-waxing',
    'key','sorcerer_lunar_waxing_and_waning',
    'type','grant',
    'target','feature',
    'payload',jsonb_build_object(
      'label','Прибывание и убывание',
      'mechanic',jsonb_build_object(
        'kind','waxing_and_waning',
        'phaseChangeCost',1,
        'metamagicDiscount',1
      ),
      'description','После Метамагии на заклинании школы, связанной с активной фазой, стоимость Метамагии уменьшается на 1 Очко чародейства, минимум 0. Бонусным действием за 1 Очко чародейства можно сменить фазу.'
    ),
    'sourceKey','sorcerer:lunar:waxing'
  );

  v_action:=jsonb_build_object(
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
  );

  update public.rule_template_levels
  set mechanics=coalesce(v_base,'[]'::jsonb)||jsonb_build_array(v_feature,v_action)
  where template_id=v_lunar and level=6;

  if (
    select count(*)
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_lunar
      and l.level=6
      and m.value->>'id'='lunar-waxing'
      and m.value->>'type'='grant'
  )<>1 then
    raise exception 'SORCERER_STAGE7_LUNAR_WAXING_FEATURE_INVALID:%',p_campaign_id;
  end if;

  if (
    select count(*)
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_lunar
      and l.level=6
      and m.value->>'id'='lunar-waxing-action'
      and m.value->>'type'='action'
      and m.value->'effects'->0->>'kind'='template_choice'
  )<>1 then
    raise exception 'SORCERER_STAGE7_LUNAR_CHOICE_ACTION_INVALID:%',p_campaign_id;
  end if;
end;
$function$;

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.patch_sorcerer_stage7_lunar_choice_action_v1(r.id);
  end loop;
end;
$block$;

do $cert$
declare r record; v_ids text[];
begin
  for r in
    select rt.campaign_id,rt.id
    from public.rule_templates rt
    where rt.kind='subclass'
      and rt.catalog_key='subclass:sorcerer:lunar-sorcery'
      and rt.is_active
  loop
    select array_agg(m.value->>'id' order by m.ord)
    into v_ids
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality m(value,ord)
    where l.template_id=r.id and l.level=6;

    if v_ids is distinct from array[
      'lunar-boons',
      'lunar-boons-use',
      'lunar-waxing',
      'lunar-waxing-action'
    ]::text[] then
      raise exception 'SORCERER_STAGE7_LUNAR_LEVEL6_SHAPE_INVALID:%:%',r.campaign_id,v_ids;
    end if;
  end loop;
end;
$cert$;

commit;
