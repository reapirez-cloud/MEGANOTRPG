-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererMetamagicStage4.test.ts
-- CLASS_WORK_STATUS: sorcerer:stage4_metamagic=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Stage 4 Sorcerer binding: 2024 Metamagic selection, progression and metadata.
-- Execution uses the generic receipt-aware spell modifier primitive installed
-- immediately before this migration.

begin;

create or replace function private.ensure_sorcerer_metamagic_stage4_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_choices jsonb;
  v_choice jsonb;
begin
  perform private.ensure_sorcerer_stage3_reverse_conversion_fix_v1(p_campaign_id);

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_STAGE4_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  v_choice := $metamagic$
{"key":"sorcerer_metamagic","label":"Метамагия","target":"trait","selection_mode":"player_once","count":2,"count_by_level":{"2":2,"10":4,"17":6},"replacement_policy":"on_level_change","replacement_limit":1,"options":["careful-spell","distant-spell","empowered-spell","extended-spell","heightened-spell","quickened-spell","seeking-spell","subtle-spell","transmuted-spell","twinned-spell"],"option_labels":{"careful-spell":"Осторожное заклинание","distant-spell":"Далёкое заклинание","empowered-spell":"Усиленное заклинание","extended-spell":"Продлённое заклинание","heightened-spell":"Усиленная помеха","quickened-spell":"Ускоренное заклинание","seeking-spell":"Ищущее заклинание","subtle-spell":"Незаметное заклинание","transmuted-spell":"Преобразованное заклинание","twinned-spell":"Раздвоенное заклинание"},"option_mechanics":{"careful-spell":[{"id":"sorcerer-metamagic-careful-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:careful-spell","sourceKey":"metamagic-careful-spell","payload":{"label":"Осторожное заклинание","description":"Когда заклинание заставляет других существ совершать спасбросок, вы можете потратить 1 Очко чародейства и выбрать число этих существ не больше модификатора Харизмы, минимум одно. Выбранные существа автоматически преуспевают в спасброске и не получают урон, если при обычном успехе получили бы половину урона."}},{"id":"sorcerer-metamagic-careful-spell-action","type":"action","key":"sorcerer_metamagic_careful_spell","sourceKey":"metamagic-careful-spell","label":"Метамагия: Осторожное заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_careful_spell","payload":{"timing":"on_cast","requires":"spell_forces_saving_throw","protected_targets":"charisma_modifier_min_1","auto_success":true,"no_damage_if_half_on_success":true}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}],"distant-spell":[{"id":"sorcerer-metamagic-distant-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:distant-spell","sourceKey":"metamagic-distant-spell","payload":{"label":"Далёкое заклинание","description":"Когда вы накладываете заклинание с дальностью не меньше 5 футов, можете потратить 1 Очко чародейства и удвоить его дальность. Если дальность заклинания — Касание, вместо этого она становится 30 футов."}},{"id":"sorcerer-metamagic-distant-spell-action","type":"action","key":"sorcerer_metamagic_distant_spell","sourceKey":"metamagic-distant-spell","label":"Метамагия: Далёкое заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_distant_spell","payload":{"timing":"on_cast","minimum_range_ft":5,"range_multiplier":2,"touch_range_ft":30}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}],"empowered-spell":[{"id":"sorcerer-metamagic-empowered-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:empowered-spell","sourceKey":"metamagic-empowered-spell","payload":{"label":"Усиленное заклинание","description":"Когда вы бросаете кости урона заклинания, можете потратить 1 Очко чародейства и перебросить число костей не больше модификатора Харизмы, минимум одну. Новые результаты обязательны. Этот вариант можно применить, даже если при том же заклинании уже использована другая Метамагия."}},{"id":"sorcerer-metamagic-empowered-spell-action","type":"action","key":"sorcerer_metamagic_empowered_spell","sourceKey":"metamagic-empowered-spell","label":"Метамагия: Усиленное заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_empowered_spell","payload":{"timing":"on_damage_roll","reroll_damage_dice":"charisma_modifier_min_1","must_use_new_rolls":true,"can_combine_with_other_metamagic":true}}],"tags":["class","sorcerer","metamagic","spell_modifier","metamagic_stack_exception"]}],"extended-spell":[{"id":"sorcerer-metamagic-extended-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:extended-spell","sourceKey":"metamagic-extended-spell","payload":{"label":"Продлённое заклинание","description":"Когда вы накладываете заклинание длительностью не меньше 1 минуты, можете потратить 1 Очко чародейства и удвоить его длительность, максимум до 24 часов. Если заклинание требует Концентрации, вы получаете Преимущество на спасброски для поддержания этой Концентрации."}},{"id":"sorcerer-metamagic-extended-spell-action","type":"action","key":"sorcerer_metamagic_extended_spell","sourceKey":"metamagic-extended-spell","label":"Метамагия: Продлённое заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_extended_spell","payload":{"timing":"on_cast","minimum_duration_minutes":1,"duration_multiplier":2,"duration_cap_hours":24,"concentration_save_advantage":true}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}],"heightened-spell":[{"id":"sorcerer-metamagic-heightened-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:heightened-spell","sourceKey":"metamagic-heightened-spell","payload":{"label":"Усиленная помеха","description":"Когда вы накладываете заклинание, заставляющее существо совершать спасбросок, можете потратить 2 Очка чародейства и выбрать одну цель этого заклинания. Эта цель совершает спасброски против данного заклинания с Помехой."}},{"id":"sorcerer-metamagic-heightened-spell-action","type":"action","key":"sorcerer_metamagic_heightened_spell","sourceKey":"metamagic-heightened-spell","label":"Метамагия: Усиленная помеха","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":2}],"effects":[{"kind":"semantic","key":"metamagic_heightened_spell","payload":{"timing":"on_cast","requires":"spell_forces_saving_throw","targets":1,"saving_throw_disadvantage":true}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}],"quickened-spell":[{"id":"sorcerer-metamagic-quickened-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:quickened-spell","sourceKey":"metamagic-quickened-spell","payload":{"label":"Ускоренное заклинание","description":"Когда вы накладываете заклинание со временем накладывания Действие, можете потратить 2 Очка чародейства и для этого применения изменить время накладывания на Бонусное действие. Нельзя применять этот вариант, если в текущем ходу уже было наложено заклинание уровня 1+, и после него в том же ходу также нельзя накладывать заклинание уровня 1+."}},{"id":"sorcerer-metamagic-quickened-spell-action","type":"action","key":"sorcerer_metamagic_quickened_spell","sourceKey":"metamagic-quickened-spell","label":"Метамагия: Ускоренное заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":2}],"effects":[{"kind":"semantic","key":"metamagic_quickened_spell","payload":{"timing":"on_cast","requires_casting_time":"action","casting_time_override":"bonus_action","levelled_spell_same_turn_restriction":true}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}],"seeking-spell":[{"id":"sorcerer-metamagic-seeking-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:seeking-spell","sourceKey":"metamagic-seeking-spell","payload":{"label":"Ищущее заклинание","description":"Если бросок атаки заклинанием промахнулся, можете потратить 1 Очко чародейства, перебросить d20 и обязаны использовать новый результат. Этот вариант можно применить, даже если при том же заклинании уже использована другая Метамагия."}},{"id":"sorcerer-metamagic-seeking-spell-action","type":"action","key":"sorcerer_metamagic_seeking_spell","sourceKey":"metamagic-seeking-spell","label":"Метамагия: Ищущее заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_seeking_spell","payload":{"timing":"after_missed_spell_attack","reroll_d20":true,"must_use_new_roll":true,"can_combine_with_other_metamagic":true}}],"tags":["class","sorcerer","metamagic","spell_modifier","metamagic_stack_exception"]}],"subtle-spell":[{"id":"sorcerer-metamagic-subtle-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:subtle-spell","sourceKey":"metamagic-subtle-spell","payload":{"label":"Незаметное заклинание","description":"Когда вы накладываете заклинание, можете потратить 1 Очко чародейства и обойтись без Вербальных, Соматических и Материальных компонентов. Материальный компонент всё равно требуется, если заклинание его расходует или в правиле указана его стоимость."}},{"id":"sorcerer-metamagic-subtle-spell-action","type":"action","key":"sorcerer_metamagic_subtle_spell","sourceKey":"metamagic-subtle-spell","label":"Метамагия: Незаметное заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_subtle_spell","payload":{"timing":"on_cast","ignore_components":["verbal","somatic","material"],"material_exceptions":["consumed","specified_cost"]}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}],"transmuted-spell":[{"id":"sorcerer-metamagic-transmuted-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:transmuted-spell","sourceKey":"metamagic-transmuted-spell","payload":{"label":"Преобразованное заклинание","description":"Когда вы накладываете заклинание, наносящее урон кислотой, холодом, огнём, электричеством, ядом или громом, можете потратить 1 Очко чародейства и заменить этот тип урона на любой другой тип из того же списка."}},{"id":"sorcerer-metamagic-transmuted-spell-action","type":"action","key":"sorcerer_metamagic_transmuted_spell","sourceKey":"metamagic-transmuted-spell","label":"Метамагия: Преобразованное заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_transmuted_spell","payload":{"timing":"on_cast","allowed_damage_types":["acid","cold","fire","lightning","poison","thunder"],"replace_damage_type_with_same_list":true}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}],"twinned-spell":[{"id":"sorcerer-metamagic-twinned-spell-feature","type":"grant","target":"feature","key":"class:sorcerer:metamagic:twinned-spell","sourceKey":"metamagic-twinned-spell","payload":{"label":"Раздвоенное заклинание","description":"Когда вы накладываете заклинание, которое при использовании ячейки более высокого уровня может получить дополнительную цель, можете потратить 1 Очко чародейства и считать эффективный уровень этого применения на 1 выше для определения числа целей."}},{"id":"sorcerer-metamagic-twinned-spell-action","type":"action","key":"sorcerer_metamagic_twinned_spell","sourceKey":"metamagic-twinned-spell","label":"Метамагия: Раздвоенное заклинание","economy":"special","resourceCosts":[{"key":"sorcery_points","amount":1}],"effects":[{"kind":"semantic","key":"metamagic_twinned_spell","payload":{"timing":"on_cast","requires":"upcast_adds_target","effective_spell_level_bonus":1}}],"tags":["class","sorcerer","metamagic","spell_modifier"]}]}}
$metamagic$::jsonb;

  update public.rule_template_levels
  set choices=coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(coalesce(rule_template_levels.choices,'[]'::jsonb))
      with ordinality e(value,ordinality)
    where value->>'key'<>'sorcerer_metamagic'
  ),'[]'::jsonb)
  where template_id=v_sorcerer;

  select coalesce(choices,'[]'::jsonb) into v_choices
  from public.rule_template_levels
  where template_id=v_sorcerer and level=2;

  update public.rule_template_levels
  set choices=v_choices || jsonb_build_array(v_choice)
  where template_id=v_sorcerer and level=2;

  update public.rule_template_levels
  set mechanics=(
    select coalesce(jsonb_agg(
      case
        when value->>'id'='sorcerer-metamagic-feature-l2'
          then jsonb_set(
            value,'{payload,description}',
            to_jsonb('На 2 уровне вы выбираете два варианта Метамагии из списка класса. При каждом получении уровня чародея можно заменить один известный вариант другим. Обычно к одному сотворению заклинания применяется только один вариант Метамагии, если сам вариант прямо не разрешает сочетание. На 10 и 17 уровнях вы выбираете ещё по два варианта.'::text),true
          )
        when value->>'id'='sorcerer-metamagic-feature-l10'
          then jsonb_set(
            value,'{payload,description}',
            to_jsonb('На 10 уровне вы выбираете ещё два варианта Метамагии. Общее число известных вариантов становится четыре. При получении этого уровня также можно заменить один ранее известный вариант согласно общему правилу Метамагии.'::text),true
          )
        when value->>'id'='sorcerer-metamagic-feature-l17'
          then jsonb_set(
            value,'{payload,description}',
            to_jsonb('На 17 уровне вы выбираете ещё два варианта Метамагии. Общее число известных вариантов становится шесть. При получении этого уровня также можно заменить один ранее известный вариант согласно общему правилу Метамагии.'::text),true
          )
        else value
      end
      order by ordinality
    ),'[]'::jsonb)
    from jsonb_array_elements(coalesce(rule_template_levels.mechanics,'[]'::jsonb))
      with ordinality e(value,ordinality)
  )
  where template_id=v_sorcerer and level in (2,10,17);

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage4-metamagic-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE4_METAMAGIC_READY',
        'runtime_stage',4,
        'runtime_revision','xphb-2024-sorcerer-stage4-metamagic-v1',
        'font_of_magic_reverse_conversion_runtime',true,
        'metamagic_runtime_included',true,
        'metamagic_choice_key','sorcerer_metamagic',
        'metamagic_choice_count_by_level',jsonb_build_object('2',2,'10',4,'17',6),
        'metamagic_option_count',10,
        'metamagic_replacement_policy','on_level_change',
        'metamagic_replacement_limit',1,
        'metamagic_execution','gena_atomic_spell_with_template_modifiers_v1',
        'metamagic_default_per_spell_limit',1,
        'metamagic_stack_exceptions',jsonb_build_array('empowered-spell','seeking-spell'),
        'sorcery_incarnate_runtime',false,
        'arcane_apotheosis_runtime',false,
        'spell_runtime_included',false,
        'subclass_runtime_included',false
      ),
      updated_at=now()
  where id=v_sorcerer;
end;
$function$;

revoke all on function private.ensure_sorcerer_metamagic_stage4_v1(uuid)
  from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_metamagic_stage4_v1(uuid)
  to service_role;

create or replace function private.ensure_sorcerer_metamagic_stage4_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_metamagic_stage4_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_sorcerer_metamagic_stage4_v1_after_campaign()
  from public,anon,authenticated;

drop trigger if exists aaaaaaaaf_campaigns_ensure_sorcerer_font_of_magic_stage3_v1 on public.campaigns;
drop trigger if exists aaaaaaaag_campaigns_ensure_sorcerer_stage3_reverse_conversion_fix_v1 on public.campaigns;
drop trigger if exists aaaaaaaah_campaigns_ensure_sorcerer_metamagic_stage4_v1 on public.campaigns;

create trigger aaaaaaaah_campaigns_ensure_sorcerer_metamagic_stage4_v1
after insert on public.campaigns
for each row execute function private.ensure_sorcerer_metamagic_stage4_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_metamagic_stage4_v1(r.id);
  end loop;
end;
$apply$;

commit;
