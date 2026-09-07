-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:warlock
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/warlockSupplementalSubclassesRuntime.test.ts
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

create or replace function private.warlock_supplemental_upsert_v1(
  p_campaign_id uuid,
  p_parent_id uuid,
  p_catalog_key text,
  p_slug text,
  p_name text,
  p_description text,
  p_source_label text,
  p_levels jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_template_id uuid;
  v_level record;
begin
  select id into v_template_id
  from public.rule_templates
  where campaign_id = p_campaign_id and catalog_key = p_catalog_key and is_builtin is true
  order by updated_at desc limit 1;

  if v_template_id is null then
    insert into public.rule_templates (
      campaign_id, kind, slug, name, description, version, mechanics, choices,
      is_active, parent_template_id, unlock_level, catalog_key, catalog_revision,
      source_kind, source_label, is_builtin, mechanical_summary, rules_meta
    ) values (
      p_campaign_id, 'subclass', p_slug, p_name, p_description, 1, '[]'::jsonb, '[]'::jsonb,
      true, p_parent_id, 3, p_catalog_key, 'warlock-supplemental-runtime-v1',
      'official', p_source_label, true,
      'Supplemental Warlock runtime: CE resources, actions, passives and explicit GM scene boundaries.',
      jsonb_build_object(
        'base_class','class:warlock','mechanics_status','READY','runtime_scope','WARLOCK_SUPPLEMENTAL_5',
        'feature_levels',jsonb_build_array(3,6,10,14),'gm_adjudication_boundary',true,
        'expanded_spells_mode','legacy_expanded_list'
      )
    ) returning id into v_template_id;
  else
    update public.rule_templates
    set kind='subclass', slug=p_slug, name=p_name, description=p_description,
        mechanics='[]'::jsonb, choices='[]'::jsonb, is_active=true,
        parent_template_id=p_parent_id, unlock_level=3,
        catalog_revision='warlock-supplemental-runtime-v1', source_kind='official', source_label=p_source_label,
        is_builtin=true,
        mechanical_summary='Supplemental Warlock runtime: CE resources, actions, passives and explicit GM scene boundaries.',
        rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
          'base_class','class:warlock','mechanics_status','READY','runtime_scope','WARLOCK_SUPPLEMENTAL_5',
          'feature_levels',jsonb_build_array(3,6,10,14),'gm_adjudication_boundary',true,
          'expanded_spells_mode','legacy_expanded_list'
        ), updated_at=now()
    where id=v_template_id;
  end if;

  delete from public.rule_template_levels where template_id=v_template_id;
  for v_level in select * from jsonb_array_elements(p_levels) x(value) loop
    insert into public.rule_template_levels(template_id, level, mechanics, choices)
    values(v_template_id, (v_level.value->>'level')::integer,
      coalesce(v_level.value->'mechanics','[]'::jsonb), coalesce(v_level.value->'choices','[]'::jsonb));
  end loop;
  return v_template_id;
end;
$$;

create or replace function private.install_warlock_supplemental_subclasses_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_parent_id uuid;
  v_pb jsonb := jsonb_build_object('kind','reference','key','core.proficiencyBonus');
  v_genie_choice jsonb;
begin
  perform private.apply_warlock_base_runtime_v1(p_campaign_id);
  perform private.apply_warlock_invocations_runtime_v1(p_campaign_id);
  perform private.apply_warlock_stage4_choice_policy_v1(p_campaign_id);
  perform private.install_warlock_phb2024_subclasses_v1(p_campaign_id);

  select id into v_parent_id from public.rule_templates
  where campaign_id=p_campaign_id and catalog_key='class:warlock' and kind='class' and is_builtin is true
  order by updated_at desc limit 1;
  if v_parent_id is null then raise exception 'WARLOCK_PARENT_MISSING:%', p_campaign_id; end if;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
    'subclass_supplemental_runtime_included',true,
    'subclass_supplemental_runtime_count',5,
    'subclass_supplemental_runtime_scope','OFFICIAL_SUPPLEMENTAL_5',
    'subclass_supplemental_runtime_revision','warlock-supplemental-runtime-v1',
    'subclass_total_runtime_count',9
  ), updated_at=now()
  where id=v_parent_id;

  perform private.warlock_supplemental_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:hexblade','hexblade','Клинок-проклятие',
    'Проклятия, теневая сталь и оружие, связанное с покровителем.','Xanathar''s Guide to Everything',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('hexblade-curse-resource','warlock:hexblade:hexblades-curse','warlock_hexblade_curse','Проклятие Клинка',jsonb_build_object('kind','literal','value',1),jsonb_build_array('short_rest','long_rest')),
        private.warlock_subclass_action_v1('hexblade-curse-action','warlock:hexblade:hexblades-curse','warlock_hexblade_curse_action','Проклятие Клинка','bonus_action',jsonb_build_array(jsonb_build_object('key','warlock_hexblade_curse','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','hexblades_curse','payload',jsonb_build_object('rangeFeet',30,'durationMinutes',1,'bonusDamage','proficiency_bonus','criticalThreshold',19,'healingOnTargetDeath','warlock_level_plus_charisma','gm_target_gate',true,'gm_death_gate',true)))), '["warlock","subclass","hexblade"]'::jsonb),
        private.warlock_subclass_feature_v1('hexblade-medium','warlock:hexblade:hex-warrior','warlock_hexblade_hex_warrior','Воин-проклинатель','Средние доспехи, щиты и воинское оружие; выбранное после продолжительного отдыха подходящее оружие может использовать Харизму для атак и урона.','{"kind":"hex_warrior_weapon_choice","refresh":"long_rest","ability":"charisma","pactWeaponAlwaysQualifies":true,"gm_equipment_gate":true}'::jsonb),
        private.warlock_subclass_feature_v1('hexblade-expanded','warlock:hexblade:expanded-spells','warlock_hexblade_expanded_spells','Расширенные заклинания','Shield, Wrathful Smite, Blur, Branding Smite, Blink, Elemental Weapon, Phantasmal Killer, Staggering Smite, Banishing Smite, Cone of Cold.','{"kind":"expanded_spell_list","casting":"pact_magic","legacySelection":true}'::jsonb)
      )),
      jsonb_build_object('level',5,'mechanics','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('hexblade-specter-resource','warlock:hexblade:accursed-specter','warlock_hexblade_accursed_specter','Проклятый призрак',jsonb_build_object('kind','literal','value',1),'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('hexblade-specter-action','warlock:hexblade:accursed-specter','warlock_hexblade_accursed_specter_action','Поднять проклятого призрака','special',jsonb_build_array(jsonb_build_object('key','warlock_hexblade_accursed_specter','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','accursed_specter','payload',jsonb_build_object('trigger','humanoid_killed_by_you','duration','until_next_long_rest','gm_trigger_gate',true))), '["warlock","subclass","hexblade"]'::jsonb)
      )),
      jsonb_build_object('level',7,'mechanics','[]'::jsonb),jsonb_build_object('level',9,'mechanics','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('hexblade-armor','warlock:hexblade:armor-of-hexes','warlock_hexblade_armor_of_hexes','Доспехи проклятий','Реакцией на попадание проклятой цели бросьте d6; на 4+ атака промахивается.','{"kind":"armor_of_hexes","economy":"reaction","die":"1d6","successMinimum":4,"gm_target_hit_gate":true}'::jsonb))),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('hexblade-master','warlock:hexblade:master-of-hexes','warlock_hexblade_master_of_hexes','Мастер проклятий','После смерти проклятой цели можно перенести проклятие на новую цель в 30 футах вместо лечения.','{"kind":"master_of_hexes","rangeFeet":30,"gm_target_death_gate":true}'::jsonb)))
    )
  );

  perform private.warlock_supplemental_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:fathomless','fathomless','Бездонный','Власть глубин, холода и щупалец.','Tasha''s Cauldron of Everything',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('fathomless-tentacle-resource','warlock:fathomless:tentacle','warlock_fathomless_tentacle','Щупальце глубин',v_pb,'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('fathomless-tentacle-action','warlock:fathomless:tentacle','warlock_fathomless_tentacle_action','Щупальце глубин','bonus_action',jsonb_build_array(jsonb_build_object('key','warlock_fathomless_tentacle','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','tentacle_of_the_deeps','payload',jsonb_build_object('summonRangeFeet',60,'attackRangeFeet',10,'damage','1d8_cold','speedReductionFeet',10,'durationMinutes',1,'gm_target_gate',true,'gm_scene_position_gate',true))), '["warlock","subclass","fathomless"]'::jsonb),
        private.warlock_subclass_feature_v1('fathomless-sea','warlock:fathomless:gift-of-sea','warlock_fathomless_gift_of_sea','Дар моря','Дыхание под водой и скорость плавания 40 футов.','{"kind":"aquatic_adaptation","swimSpeedFeet":40,"breatheUnderwater":true}'::jsonb),
        private.warlock_subclass_feature_v1('fathomless-expanded','warlock:fathomless:expanded-spells','warlock_fathomless_expanded_spells','Расширенные заклинания','Create or Destroy Water, Thunderwave, Gust of Wind, Silence, Lightning Bolt, Sleet Storm, Control Water, Summon Elemental, Bigby''s Hand, Cone of Cold.','{"kind":"expanded_spell_list","casting":"pact_magic","legacySelection":true}'::jsonb)
      )),jsonb_build_object('level',5,'mechanics','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(
        '{"id":"fathomless-cold-resistance","type":"grant","sourceKey":"warlock:fathomless:oceanic-soul","target":"resistance","key":"damage:cold","payload":{"label":"Сопротивление холоду"}}'::jsonb,
        private.warlock_subclass_feature_v1('fathomless-coil','warlock:fathomless:guardian-coil','warlock_fathomless_guardian_coil','Защитная спираль','Реакцией уменьшает урон существу возле щупальца на 1d8, а с 10 уровня на 2d8.','{"kind":"guardian_coil","economy":"reaction","rangeFromTentacleFeet":10,"reductionDiceByLevel":{"6":"1d8","10":"2d8"},"gm_scene_position_gate":true,"gm_reaction_gate":true}'::jsonb)
      )),jsonb_build_object('level',7,'mechanics','[]'::jsonb),jsonb_build_object('level',9,'mechanics','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('fathomless-grasping-resource','warlock:fathomless:grasping-tentacles','warlock_fathomless_grasping_tentacles','Хваткие щупальца',jsonb_build_object('kind','literal','value',1),'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('fathomless-grasping-action','warlock:fathomless:grasping-tentacles','warlock_fathomless_grasping_tentacles_action','Хваткие щупальца','action',jsonb_build_array(jsonb_build_object('key','warlock_fathomless_grasping_tentacles','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','free_spell_cast','payload',jsonb_build_object('spellSlug','evards-black-tentacles','tempHp','warlock_level','concentrationCannotBreakFromDamage',true))), '["warlock","subclass","fathomless"]'::jsonb),
        private.warlock_subclass_feature_v1('fathomless-upgrade','warlock:fathomless:tentacle','warlock_fathomless_tentacle_upgrade','Щупальце: усиление','Урон щупальца становится 2d8 холодом.','{"kind":"tentacle_damage_upgrade","damage":"2d8_cold"}'::jsonb)
      )),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('fathomless-plunge-resource','warlock:fathomless:fathomless-plunge','warlock_fathomless_plunge','Бездонное погружение',jsonb_build_object('kind','literal','value',1),'["short_rest","long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('fathomless-plunge-action','warlock:fathomless:fathomless-plunge','warlock_fathomless_plunge_action','Бездонное погружение','action',jsonb_build_array(jsonb_build_object('key','warlock_fathomless_plunge','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','fathomless_plunge','payload',jsonb_build_object('willingCreatures',5,'selectionRangeFeet',30,'destinationWaterWithinMiles',1,'gm_destination_gate',true))), '["warlock","subclass","fathomless"]'::jsonb)
      ))
    )
  );

  v_genie_choice := jsonb_build_object(
    'key','warlock_genie_patron_kind','label','Род покровителя-джинна','target','trait','options',jsonb_build_array('dao','djinni','efreeti','marid'),'count',1,
    'option_labels',jsonb_build_object('dao','Дао','djinni','Джинни','efreeti','Ифрити','marid','Марид'),'selection_mode','player_once','replacement_policy','locked',
    'option_mechanics',jsonb_build_object(
      'dao',jsonb_build_array('{"id":"genie-dao-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:bludgeoning","payload":{"label":"Сопротивление дробящему урону"}}'::jsonb),
      'djinni',jsonb_build_array('{"id":"genie-djinni-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:thunder","payload":{"label":"Сопротивление звуковому урону"}}'::jsonb),
      'efreeti',jsonb_build_array('{"id":"genie-efreeti-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:fire","payload":{"label":"Сопротивление огню"}}'::jsonb),
      'marid',jsonb_build_array('{"id":"genie-marid-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:cold","payload":{"label":"Сопротивление холоду"}}'::jsonb)
    )
  );

  perform private.warlock_supplemental_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:genie','genie','Джинн','Дао, джинни, ифрити или марид как покровитель.','Tasha''s Cauldron of Everything',
    jsonb_build_array(
      jsonb_build_object('level',3,'choices',jsonb_build_array(v_genie_choice),'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('genie-respite-resource','warlock:genie:genies-vessel','warlock_genie_bottled_respite','Уединение в сосуде',jsonb_build_object('kind','literal','value',1),'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('genie-respite-action','warlock:genie:genies-vessel','warlock_genie_bottled_respite_action','Уединение в сосуде','action',jsonb_build_array(jsonb_build_object('key','warlock_genie_bottled_respite','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','bottled_respite','payload',jsonb_build_object('maxHours','2_x_proficiency_bonus','gm_vessel_gate',true))), '["warlock","subclass","genie"]'::jsonb),
        private.warlock_subclass_feature_v1('genie-wrath','warlock:genie:genies-vessel','warlock_genie_wrath','Гнев джинна','Первый раз за ход при попадании добавляет урон, равный бонусу мастерства; тип зависит от рода джинна.','{"kind":"genies_wrath","cadence":"once_per_turn","damage":"proficiency_bonus","gm_hit_turn_gate":true}'::jsonb),
        private.warlock_subclass_feature_v1('genie-expanded','warlock:genie:expanded-spells','warlock_genie_expanded_spells','Расширенные заклинания','Общий список и отдельный список рода джинна расширяют выбор заклинаний, включая Wish на 9 круге.','{"kind":"expanded_spell_list_by_choice","casting":"pact_magic","legacySelection":true,"choice":"warlock_genie_patron_kind"}'::jsonb)
      )),jsonb_build_object('level',5,'mechanics','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('genie-flight-resource','warlock:genie:elemental-gift','warlock_genie_elemental_flight','Стихийный полёт',v_pb,'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('genie-flight-action','warlock:genie:elemental-gift','warlock_genie_elemental_flight_action','Стихийный полёт','bonus_action',jsonb_build_array(jsonb_build_object('key','warlock_genie_elemental_flight','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','elemental_flight','payload',jsonb_build_object('flySpeedFeet',30,'durationMinutes',10))), '["warlock","subclass","genie"]'::jsonb)
      )),jsonb_build_object('level',7,'mechanics','[]'::jsonb),jsonb_build_object('level',9,'mechanics','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('genie-sanctuary','warlock:genie:sanctuary-vessel','warlock_genie_sanctuary_vessel','Сосуд-святилище','До пяти союзников могут войти; 10 минут дают короткий отдых, Кости Хитов лечат дополнительно на бонус мастерства.','{"kind":"sanctuary_vessel","creatures":5,"minutesForShortRest":10,"extraHealingPerHitDie":"proficiency_bonus","gm_rest_gate":true}'::jsonb))),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('genie-wish-resource','warlock:genie:limited-wish','warlock_genie_limited_wish','Ограниченное желание',jsonb_build_object('kind','literal','value',1),'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('genie-wish-action','warlock:genie:limited-wish','warlock_genie_limited_wish_action','Ограниченное желание','action',jsonb_build_array(jsonb_build_object('key','warlock_genie_limited_wish','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','limited_wish','payload',jsonb_build_object('maximumSpellLevel',6,'maximumCastingTime','1_action','ignoresComponents',true,'cooldown','1d4_long_rests','gm_spell_gate',true,'gm_cooldown_gate',true))), '["warlock","subclass","genie"]'::jsonb)
      ))
    )
  );

  perform private.warlock_supplemental_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:undead','undead','Нежить','Страх, некротическая сила и проекция духа.','Van Richten''s Guide to Ravenloft',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('undead-dread-resource','warlock:undead:form-of-dread','warlock_undead_form_of_dread','Облик ужаса',v_pb,'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('undead-dread-action','warlock:undead:form-of-dread','warlock_undead_form_of_dread_action','Облик ужаса','bonus_action',jsonb_build_array(jsonb_build_object('key','warlock_undead_form_of_dread','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','form_of_dread','payload',jsonb_build_object('durationMinutes',1,'tempHp','1d10_plus_warlock_level','frightenedImmunity',true,'gm_hit_turn_gate',true))), '["warlock","subclass","undead"]'::jsonb),
        private.warlock_subclass_feature_v1('undead-expanded','warlock:undead:expanded-spells','warlock_undead_expanded_spells','Расширенные заклинания','Bane, False Life, Blindness/Deafness, Phantasmal Force, Phantom Steed, Speak with Dead, Death Ward, Greater Invisibility, Antilife Shell, Cloudkill.','{"kind":"expanded_spell_list","casting":"pact_magic","legacySelection":true}'::jsonb)
      )),jsonb_build_object('level',5,'mechanics','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('undead-grave','warlock:undead:grave-touched','warlock_undead_grave_touched','Касание могилы','Не требуется еда, питьё или дыхание; раз за ход можно заменить урон на некротический, а в Облике ужаса добавить куб урона.','{"kind":"grave_touched","cadence":"once_per_turn","gm_hit_turn_gate":true}'::jsonb))),
      jsonb_build_object('level',7,'mechanics','[]'::jsonb),jsonb_build_object('level',9,'mechanics','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(
        '{"id":"undead-necrotic-resistance","type":"grant","sourceKey":"warlock:undead:necrotic-husk","target":"resistance","key":"damage:necrotic","payload":{"label":"Сопротивление некротическому урону"}}'::jsonb,
        private.warlock_subclass_feature_v1('undead-husk','warlock:undead:necrotic-husk','warlock_undead_necrotic_husk','Некротическая оболочка','При падении до 0 хитов реакцией можно остаться на 1 хите и высвободить некротический взрыв; повторно после 1d4 продолжительных отдыхов.','{"kind":"necrotic_husk","economy":"reaction","trigger":"reduced_to_zero_hp","remainHp":1,"burstDamage":"2d10_plus_warlock_level","cooldown":"1d4_long_rests","gm_trigger_gate":true,"gm_cooldown_gate":true}'::jsonb)
      )),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('undead-projection-resource','warlock:undead:spirit-projection','warlock_undead_spirit_projection','Проекция духа',jsonb_build_object('kind','literal','value',1),'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('undead-projection-action','warlock:undead:spirit-projection','warlock_undead_spirit_projection_action','Проекция духа','action',jsonb_build_array(jsonb_build_object('key','warlock_undead_spirit_projection','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','spirit_projection','payload',jsonb_build_object('durationHours',1,'projectionState','gm_adjudicated'))), '["warlock","subclass","undead"]'::jsonb)
      ))
    )
  );

  perform private.warlock_supplemental_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:undying','undying','Бессмертный','Сопротивление смерти, болезням и разрушению тела.','Sword Coast Adventurer''s Guide',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',jsonb_build_array(
        private.warlock_subclass_feature_v1('undying-among','warlock:undying:among-the-dead','warlock_undying_among_the_dead','Среди мёртвых','Заговор Spare the Dying, преимущество против болезней и защита от первого выбора целью нежитью.','{"kind":"among_the_dead","cantrip":"spare-the-dying","advantageAgainstDisease":true,"gm_target_gate":true}'::jsonb),
        private.warlock_subclass_feature_v1('undying-expanded','warlock:undying:expanded-spells','warlock_undying_expanded_spells','Расширенные заклинания','False Life, Ray of Sickness, Blindness/Deafness, Silence, Feign Death, Speak with Dead, Aura of Life, Death Ward, Contagion, Legend Lore.','{"kind":"expanded_spell_list","casting":"pact_magic","legacySelection":true}'::jsonb)
      )),jsonb_build_object('level',5,'mechanics','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('undying-defy-resource','warlock:undying:defy-death','warlock_undying_defy_death','Бросить вызов смерти',jsonb_build_object('kind','literal','value',1),'["long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('undying-defy-action','warlock:undying:defy-death','warlock_undying_defy_death_action','Бросить вызов смерти','special',jsonb_build_array(jsonb_build_object('key','warlock_undying_defy_death','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','defy_death','payload',jsonb_build_object('healing','1d8_plus_constitution_modifier','gm_trigger_gate',true))), '["warlock","subclass","undying"]'::jsonb)
      )),jsonb_build_object('level',7,'mechanics','[]'::jsonb),jsonb_build_object('level',9,'mechanics','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('undying-nature','warlock:undying:undying-nature','warlock_undying_nature','Неумирающая природа','Не требуется дышать, есть, пить или спать; старение в десять раз медленнее и иммунитет к магическому старению.','{"kind":"undying_nature","holdBreathIndefinitely":true,"needsFoodDrinkSleep":false,"agingRateDivisor":10,"immuneMagicalAging":true}'::jsonb))),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(
        private.warlock_subclass_resource_v1('undying-life-resource','warlock:undying:indestructible-life','warlock_undying_indestructible_life','Несокрушимая жизнь',jsonb_build_object('kind','literal','value',1),'["short_rest","long_rest"]'::jsonb),
        private.warlock_subclass_action_v1('undying-life-action','warlock:undying:indestructible-life','warlock_undying_indestructible_life_action','Несокрушимая жизнь','bonus_action',jsonb_build_array(jsonb_build_object('key','warlock_undying_indestructible_life','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','indestructible_life','payload',jsonb_build_object('healing','1d8_plus_warlock_level','reattachSeveredPart',true))), '["warlock","subclass","undying"]'::jsonb)
      ))
    )
  );
end;
$$;

create or replace function private.apply_warlock_supplemental_subclasses_on_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.install_warlock_supplemental_subclasses_v1(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzzg_campaigns_apply_warlock_supplemental_subclasses_v1 on public.campaigns;
create trigger zzzzzzzzg_campaigns_apply_warlock_supplemental_subclasses_v1
after insert on public.campaigns
for each row execute function private.apply_warlock_supplemental_subclasses_on_campaign_v1();

do $$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_warlock_supplemental_subclasses_v1(v_campaign.id);
  end loop;
end;
$$;
