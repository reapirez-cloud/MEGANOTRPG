-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch3.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch3=RUNTIME_READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Monk subclass batch 3: Sun Soul, Long Death, Cobalt Soul, Living Weapon.
-- Sun Soul / Long Death are official legacy rules. Cobalt Soul is Critical Role partnered content.
-- Living Weapon is third-party Exploring Eberron content by Keith Baker.
-- All Ki costs use the rebuilt Monk's canonical monk_focus pool.

begin;

create or replace function private.upsert_monk_subclass_batch3(
  p_campaign_id uuid,p_parent_template_id uuid,p_slug text,p_catalog_key text,p_name text,
  p_source_kind text,p_source_label text,p_description text,p_summary text,
  p_level3 jsonb,p_level3_choices jsonb,
  p_level6 jsonb,p_level6_choices jsonb,
  p_level11 jsonb,p_level11_choices jsonb,
  p_level17 jsonb,p_level17_choices jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_template uuid;
begin
  select id into v_template from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key=p_catalog_key and is_builtin is true
  order by is_active desc,version desc,created_at desc limit 1;

  if v_template is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,
      author_description,author_comment,rules_meta,created_by,is_active
    ) values (
      p_campaign_id,'subclass',p_slug,p_name,p_description,1,'[]'::jsonb,'[]'::jsonb,p_parent_template_id,3,
      p_catalog_key,'monk-subclasses-batch3-runtime-v1',p_source_kind,p_source_label,true,p_summary,
      '','',jsonb_build_object(
        'base_class','class:monk','mechanics_status','READY','feature_levels',jsonb_build_array(3,6,11,17),
        'shared_resource','monk_focus','no_fake_scene_state',true,'subclass_batch',3,
        'compatibility_policy','original published rules where no 2024 replacement exists'
      ),null,true
    ) returning id into v_template;
  else
    update public.rule_templates set
      slug=p_slug,name=p_name,description=p_description,mechanics='[]'::jsonb,choices='[]'::jsonb,
      parent_template_id=p_parent_template_id,unlock_level=3,catalog_revision='monk-subclasses-batch3-runtime-v1',
      source_kind=p_source_kind,source_label=p_source_label,is_builtin=true,mechanical_summary=p_summary,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'base_class','class:monk','mechanics_status','READY','feature_levels',jsonb_build_array(3,6,11,17),
        'shared_resource','monk_focus','no_fake_scene_state',true,'subclass_batch',3,
        'compatibility_policy','original published rules where no 2024 replacement exists'
      ),is_active=true,updated_at=now()
    where id=v_template;
  end if;

  delete from public.rule_template_levels where template_id=v_template;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
    (v_template,3,coalesce(p_level3,'[]'::jsonb),coalesce(p_level3_choices,'[]'::jsonb)),
    (v_template,6,coalesce(p_level6,'[]'::jsonb),coalesce(p_level6_choices,'[]'::jsonb)),
    (v_template,11,coalesce(p_level11,'[]'::jsonb),coalesce(p_level11_choices,'[]'::jsonb)),
    (v_template,17,coalesce(p_level17,'[]'::jsonb),coalesce(p_level17_choices,'[]'::jsonb));
end;
$$;

create or replace function private.install_monk_subclasses_batch3_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_monk uuid;
  v_sun_l6 jsonb := '[]'::jsonb;
  v_sun_l11 jsonb := '[]'::jsonb;
  v_long_l17 jsonb := '[]'::jsonb;
  v_i integer;
  v_languages jsonb := '["language:common","language:dwarvish","language:elvish","language:giant","language:gnomish","language:goblin","language:halfling","language:orc","language:abyssal","language:celestial","language:deep_speech","language:draconic","language:infernal","language:primordial","language:sylvan","language:undercommon"]'::jsonb;
  v_erudition_skills jsonb := '["skill:arcana","skill:history","skill:investigation","skill:nature","skill:religion"]'::jsonb;
  v_manifest_types jsonb := '["damage:bludgeoning","damage:piercing","damage:slashing","damage:cold","damage:lightning","damage:necrotic","damage:psychic","damage:thunder"]'::jsonb;
begin
  perform private.install_monk_subclasses_batch2_v1(p_campaign_id);

  select id into v_monk from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:monk' and is_builtin is true
  order by is_active desc,version desc,created_at desc limit 1;
  if v_monk is null then raise exception 'Built-in Monk was not installed'; end if;

  update public.rule_templates set
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'subclasses_included',true,'subclass_supported_count',12,
      'wotc_subclass_supported_count',10,'additional_subclass_supported_count',2,
      'subclass_mechanics_status','BATCH3_READY',
      'subclass_runtime_revision','monk-subclasses-batch3-runtime-v1'
    ),updated_at=now()
  where id=v_monk;

  -- Sun Soul variable-cost actions.
  for v_i in 2..10 loop
    v_sun_l6 := v_sun_l6 || jsonb_build_array(
      private.monk_subclass_action(
        'sun-soul-burning-hands-'||v_i,'monk:sun-soul:searing-arc','searing_arc_strike_'||v_i,
        'Пылающий дуговой удар: Burning Hands ('||(v_i-1)||' ур.)','bonus_action',v_i,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','cast_burning_hands','payload',jsonb_build_object('spell_level',v_i-1,'max_focus_rule','floor(monk_level/2)','requires_attack_action_first',true))),
        '["subclass","spell","requires-attack-action","gm-level-cap"]'::jsonb
      )
    );
  end loop;
  for v_i in 0..3 loop
    v_sun_l11 := v_sun_l11 || jsonb_build_array(
      private.monk_subclass_action(
        'sun-soul-sunburst-'||v_i,'monk:sun-soul:sunburst','searing_sunburst_'||v_i,
        'Солнечный взрыв: '||(2+2*v_i)||'к6','action',v_i,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','constitution_save_area_damage','payload',jsonb_build_object('range_feet',150,'radius_feet',20,'damage_dice',(2+2*v_i)||'d6','damage_type','radiant','success','zero','opaque_total_cover_immune',true))),
        '["subclass","aoe","constitution-save"]'::jsonb,
        jsonb_build_array(jsonb_build_object('key','sunburst-radiant-'||v_i,'label','Солнечный взрыв','damageType','radiant','count',2+2*v_i,'sides',6))
      )
    );
  end loop;

  perform private.upsert_monk_subclass_batch3(
    p_campaign_id,v_monk,'monk-sun-soul','subclass:monk:sun-soul','Путь солнечной души',
    'official','Xanathar''s Guide to Everything',
    'Монах Солнечной души превращает внутреннюю силу в дальние лучи сияния, огненные волны и взрывные сферы света.',
    'Radiant Sun Bolt использует текущий куб Боевых искусств; Searing Arc Strike и усиление Sunburst тратят общий Focus; условия Attack Action и допустимый максимум апкаста остаются видимым правилом для ГМа.',
    jsonb_build_array(
      private.monk_subclass_feature('sun-soul-bolt-rules','monk:sun-soul:bolt','radiant_sun_bolt','Луч сияющего солнца',
        'Монах получает особую дальнобойную магическую атаку в рамках действия Атака: дальность 30 футов, владение есть, к броску атаки и урону добавляется Ловкость, тип урона — radiant, а куб урона равен текущему кубу Боевых искусств. После действия Атака, в котором использован хотя бы один такой луч, можно потратить 1 Очко концентрации и бонусным действием сделать ещё две атаки Лучом.'),
      jsonb_build_object(
        'id','sun-soul-bolt-attack','type','action','sourceKey','monk:sun-soul:bolt','key','radiant_sun_bolt','label','Луч сияющего солнца','economy','attack','range',jsonb_build_object('kind','ranged','normal',30,'unit','feet'),
        'attackAbility','dexterity','proficient',true,'damage',jsonb_build_array(jsonb_build_object('key','radiant-sun-bolt','label','Луч сияющего солнца','damageType','radiant','count',1,'sides',jsonb_build_object('kind','reference','key','values.value:martial_arts_die_sides:default'))),
        'tags',jsonb_build_array('subclass','attack-action-option')
      ),
      private.monk_subclass_action('sun-soul-bolt-flurry','monk:sun-soul:bolt','radiant_sun_bolt_bonus_pair','Два дополнительных луча','bonus_action',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','make_two_radiant_sun_bolts','payload',jsonb_build_object('requires_attack_action_with_bolt',true))),
        '["subclass","requires-radiant-sun-bolt-attack-action"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(private.monk_subclass_feature('sun-soul-searing-arc-rules','monk:sun-soul:searing-arc','searing_arc_strike','Пылающий дуговой удар',
      'Сразу после действия Атака монах может бонусным действием потратить 2 Очка концентрации и наложить Burning Hands 1 уровня. За каждое дополнительное Очко концентрации уровень заклинания повышается на 1; суммарная трата не может превышать половину уровня монаха, округляя вниз.')) || v_sun_l6,'[]'::jsonb,
    jsonb_build_array(private.monk_subclass_feature('sun-soul-sunburst-rules','monk:sun-soul:sunburst','searing_sunburst','Солнечный взрыв',
      'Действием монах выбирает точку в пределах 150 футов. Сфера радиусом 20 футов требует спасбросок Телосложения; при провале существо получает 2к6 radiant урона, при успехе — 0. Существо за полной непрозрачной преградой не делает спасбросок. Можно потратить до 3 Очков концентрации, добавляя 2к6 урона за каждое.')) || v_sun_l11,'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('sun-soul-shield-rules','monk:sun-soul:shield','sun_shield','Солнечный щит',
        'Монах может бонусным действием включать или выключать сияние: яркий свет 30 футов и тусклый ещё 30 футов. Пока свет включён, когда существо попадает по монаху рукопашной атакой, монах может реакцией нанести атакующему radiant урон, равный 5 + модификатор Мудрости.'),
      private.monk_subclass_action('sun-soul-shield-toggle','monk:sun-soul:shield','sun_shield_toggle','Солнечный щит: включить/выключить','bonus_action',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','toggle_sun_shield_light','payload',jsonb_build_object('bright_feet',30,'dim_additional_feet',30))),
        '["subclass","toggle"]'::jsonb),
      private.monk_subclass_action('sun-soul-shield-retaliate','monk:sun-soul:shield','sun_shield_retaliation','Солнечный щит: ответное сияние','reaction',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','radiant_retaliation','payload',jsonb_build_object('damage','5 + wisdom_modifier','requires_light_active',true,'trigger','hit_by_melee_attack'))),
        '["subclass","melee-hit-trigger"]'::jsonb)
    ),'[]'::jsonb
  );

  -- Long Death variable Touch actions.
  for v_i in 1..10 loop
    v_long_l17 := v_long_l17 || jsonb_build_array(
      private.monk_subclass_action(
        'long-death-touch-'||v_i,'monk:long-death:touch','touch_of_the_long_death_'||v_i,
        'Прикосновение долгой смерти: '||v_i||' Focus','action',v_i,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','constitution_save_damage','payload',jsonb_build_object('damage_dice',(2*v_i)||'d10','damage_type','necrotic','success','half','range','touch'))),
        '["subclass","touch","constitution-save"]'::jsonb,
        jsonb_build_array(jsonb_build_object('key','long-death-necrotic-'||v_i,'label','Прикосновение долгой смерти','damageType','necrotic','count',2*v_i,'sides',10))
      )
    );
  end loop;

  perform private.upsert_monk_subclass_batch3(
    p_campaign_id,v_monk,'monk-long-death','subclass:monk:long-death','Путь долгой смерти',
    'official','Sword Coast Adventurer''s Guide',
    'Монах Долгой смерти получает временные HP от павших рядом существ, пугает окружающих, отказывается падать и направляет концентрацию в некротическое прикосновение.',
    'Mastery of Death и Touch of the Long Death расходуют общий Focus; убийство рядом, видимость целей и момент падения до 0 HP подтверждает ГМ.',
    jsonb_build_array(private.monk_subclass_feature('long-death-touch-life-rules','monk:long-death:touch-of-death','touch_of_death','Вытягивание жизни',
      'Когда монах уменьшает HP существа в пределах 5 футов до 0, он получает временные HP, равные модификатору Мудрости + уровню монаха, минимум 1. Временные HP не складываются с другими временными HP по обычным правилам.')),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('long-death-reaping-rules','monk:long-death:reaping','hour_of_reaping','Час жатвы',
        'Действием монах заставляет каждое существо в пределах 30 футов, которое может его видеть, сделать спасбросок Мудрости. При провале существо Испугано монахом до конца следующего хода монаха.'),
      private.monk_subclass_action('long-death-reaping-action','monk:long-death:reaping','hour_of_reaping','Час жатвы','action',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','wisdom_save_frighten','payload',jsonb_build_object('radius_feet',30,'requires_target_can_see_monk',true,'duration','end_of_monk_next_turn'))),
        '["subclass","aoe","wisdom-save"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('long-death-mastery-rules','monk:long-death:mastery','mastery_of_death','Владение смертью',
        'Когда HP монаха уменьшаются до 0, он может без действия потратить 1 Очко концентрации и вместо этого остаться с 1 HP.'),
      private.monk_subclass_action('long-death-mastery-action','monk:long-death:mastery','mastery_of_death','Владение смертью','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','remain_at_one_hp','payload',jsonb_build_object('trigger','reduced_to_zero_hp'))),
        '["subclass","zero-hp-trigger"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(private.monk_subclass_feature('long-death-touch-rules','monk:long-death:touch','touch_of_the_long_death','Прикосновение долгой смерти',
      'Действием монах касается существа в пределах 5 футов и тратит от 1 до 10 Очков концентрации. Цель делает спасбросок Телосложения. При провале она получает 2к10 некротического урона за каждое потраченное Очко концентрации; при успехе — половину.')) || v_long_l17,'[]'::jsonb
  );

  -- Cobalt Soul: partnered Critical Role content, not WotC.
  perform private.upsert_monk_subclass_batch3(
    p_campaign_id,v_monk,'monk-cobalt-soul','subclass:monk:cobalt-soul','Путь кобальтовой души',
    'third_party','Critical Role / Tal''Dorei Campaign Setting Reborn',
    'Кобальтовая душа анализирует противника через Шквал ударов, принуждает к правде и превращает знания о защите цели в уязвимость.',
    'Cobalt Soul отмечен как partnered/third-party. Extract Aspects и 24-часовая защита Debilitating Barrage — сценевые факты; Extort Truth, Mind of Mercury и Barrage реально списывают общий Focus.',
    jsonb_build_array(
      private.monk_subclass_feature('cobalt-extract-rules','monk:cobalt-soul:extract','extract_aspects','Извлечение аспектов',
        'Когда монах попадает по существу одной из атак Шквала ударов, он может проанализировать его до короткого или долгого отдыха. Монах узнаёт все уязвимости к урону, сопротивления, иммунитеты к урону и иммунитеты к состояниям цели. Когда проанализированное существо промахивается атакой по монаху, монах может реакцией сделать по нему Безоружный удар, если цель в пределах досягаемости.'),
      private.monk_subclass_action('cobalt-extract-counter','monk:cobalt-soul:extract','extract_aspects_counter','Извлечение аспектов: ответный удар','reaction',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','unarmed_strike_against_analyzed_misser','payload',jsonb_build_object('requires_analyzed_target',true,'requires_target_in_reach',true))),
        '["subclass","analyzed-target","miss-trigger"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('cobalt-extort-rules','monk:cobalt-soul:extort','extort_truth','Выбить правду',
        'Когда монах попадает Безоружным ударом, он может потратить 1 Очко концентрации и заставить цель сделать спасбросок Харизмы. При провале до 10 минут цель не может намеренно лгать, а проверки Харизмы, направленные на неё, совершаются с преимуществом. Монах знает результат спасброска. Цель понимает эффект и может уклоняться от ответа. Вместо урона удар можно использовать как безвредное касание.'),
      private.monk_subclass_action('cobalt-extort-action','monk:cobalt-soul:extort','extort_truth','Выбить правду','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','charisma_save_truth_effect','payload',jsonb_build_object('duration_minutes',10,'charisma_checks_against_target_advantage',true,'can_touch_without_damage',true))),
        '["subclass","unarmed-hit","charisma-save"]'::jsonb),
      private.monk_subclass_feature('cobalt-erudition-rules','monk:cobalt-soul:erudition','mystical_erudition','Мистическая эрудиция',
        'На 6 уровне монах выбирает один язык и один навык из Arcana, History, Investigation, Nature или Religion. Если выбранный навык уже имеет владение, вместо этого бонус владения для него удваивается. На 11 и 17 уровнях монах получает ещё по одному языку и ещё по одному такому выбору навыка.' )
    ),
    jsonb_build_array(
      jsonb_build_object('key','cobalt_erudition_language','label','Язык Мистической эрудиции','target','language','options',v_languages,'count_by_level',jsonb_build_object('6',1,'11',2,'17',3),'selection_mode','player_once'),
      jsonb_build_object('key','cobalt_erudition_skill','label','Навык Мистической эрудиции','target','proficiency','options',v_erudition_skills,'count_by_level',jsonb_build_object('6',1,'11',2,'17',3),'selection_mode','player_once')
    ),
    jsonb_build_array(
      private.monk_subclass_feature('cobalt-mercury-rules','monk:cobalt-soul:mercury','mind_of_mercury','Разум Меркурия',
        'Один раз за ход, если монах уже использовал свою реакцию, он может потратить 1 Очко концентрации и получить дополнительную реакцию. На один и тот же триггер нельзя использовать более одной реакции.'),
      private.monk_subclass_action('cobalt-mercury-action','monk:cobalt-soul:mercury','mind_of_mercury','Разум Меркурия','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','gain_additional_reaction','payload',jsonb_build_object('frequency','once_per_turn','one_reaction_per_trigger',true))),
        '["subclass","once-per-turn"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('cobalt-barrage-rules','monk:cobalt-soul:barrage','debilitating_barrage','Ослабляющий шквал',
        'Когда монах попадает Безоружным ударом, он может потратить 3 Очка концентрации и выбрать тип урона. На 1 минуту цель получает уязвимость к этому типу либо, если у неё было сопротивление, сопротивление подавляется вместо уязвимости. Иммунная цель не получает эффекта. Уязвимость заканчивается раньше в конце хода, в котором цель получила урон выбранного типа. После успешного применения эта цель не может снова подвергнуться способности 24 часа.'),
      private.monk_subclass_action('cobalt-barrage-action','monk:cobalt-soul:barrage','debilitating_barrage','Ослабляющий шквал','free',3,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','debilitating_damage_type','payload',jsonb_build_object('duration_minutes',1,'resistance_becomes_suppressed',true,'immunity_unaffected',true,'target_cooldown_hours',24))),
        '["subclass","unarmed-hit","damage-type-choice"]'::jsonb)
    ),'[]'::jsonb
  );

  -- Living Weapon: Exploring Eberron third-party content.
  perform private.upsert_monk_subclass_batch3(
    p_campaign_id,v_monk,'monk-living-weapon','subclass:monk:living-weapon','Путь живого оружия',
    'third_party','Exploring Eberron — Keith Baker',
    'Живое оружие меняет собственное тело и стиль боя: усиливает безоружный куб, выбирает боевую дисциплину, тип Manifest Blow и вторую форму совершенства.',
    'Исходное повышение куба применяется относительно базового Monk 2024: один шаг выше текущего Martial Arts die, максимум d12. Дисциплина и Perfect Form — независимые постоянные choices; Manifest Blow меняется после долгого отдыха.',
    jsonb_build_array(
      private.monk_subclass_feature('living-fists-rules','monk:living-weapon:fists','fists_of_bone_and_steel','Кулаки из кости и стали',
        'Куб урона Безоружных ударов монаха становится на одну ступень больше текущего куба Боевых искусств, максимум к12. Это увеличение применяется только к Безоружным ударам, не к оружию монаха.'),
      private.monk_subclass_value('living-unarmed-die','monk:living-weapon:fists','living_weapon_unarmed_die_sides','Куб Безоружного удара Живого оружия',
        jsonb_build_object('kind','min','values',jsonb_build_array(jsonb_build_object('kind','literal','value',12),jsonb_build_object('kind','add','terms',jsonb_build_array(jsonb_build_object('kind','reference','key','values.value:martial_arts_die_sides:default'),jsonb_build_object('kind','literal','value',2))))),3),
      private.monk_subclass_feature('living-mutable-rules','monk:living-weapon:mutable','mutable_strike','Изменяемый удар',
        'Каждый раз, когда монах делает Безоружный удар через Боевые искусства, он может выбрать для этой атаки дробящий, колющий или рубящий урон.'),
      private.monk_subclass_feature('living-discipline-rules','monk:living-weapon:discipline','martial_discipline','Боевая дисциплина',
        'На 3 уровне монах выбирает Forged Heart, Nightmare Shroud, Traveler’s Blade или Weretouched и получает соответствующее правило. Выбор постоянный; Perfect Form на 17 уровне выбирается отдельно и может совпадать или отличаться.')
    ),
    jsonb_build_array(
      jsonb_build_object('key','living_weapon_discipline','label','Боевая дисциплина','target','trait','options',jsonb_build_array('forged_heart','nightmare_shroud','travelers_blade','weretouched'),'count',1,'selection_mode','player_once',
        'option_labels',jsonb_build_object('forged_heart','Кованое сердце','nightmare_shroud','Покров кошмара','travelers_blade','Клинок странника','weretouched','Звериная кровь'),
        'option_mechanics',jsonb_build_object(
          'forged_heart',jsonb_build_array(
            private.monk_subclass_feature('living-forged-rules','monk:living-weapon:discipline:forged','living_forged_heart','Кованое сердце','Безоружные удары считаются адамантиновым оружием. После попадания Безоружным ударом можно потратить 1 Focus: цель делает спасбросок Силы; при провале получает ещё 2к6 урона того же типа и может быть оттолкнута до 15 футов, при успехе получает 1к6 и не отталкивается.'),
            private.monk_subclass_action('living-forged-action','monk:living-weapon:discipline:forged','living_forged_heart_strike','Кованое сердце: усилить удар','free',1,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','strength_save_forged_strike','payload',jsonb_build_object('fail_damage','2d6 same type','success_damage','1d6 same type','push_fail_feet',15))),'["subclass","unarmed-hit","strength-save"]'::jsonb)
          ),
          'nightmare_shroud',jsonb_build_array(
            private.monk_subclass_feature('living-nightmare-rules','monk:living-weapon:discipline:nightmare','living_nightmare_shroud','Покров кошмара','После попадания Безоружным ударом можно потратить 1 Focus: цель делает спасбросок Мудрости; при провале получает 1к6 psychic урона и Испугана до конца следующего хода монаха. После успеха цель иммунна к эффекту страха этой способности 24 часа.'),
            private.monk_subclass_action('living-nightmare-action','monk:living-weapon:discipline:nightmare','living_nightmare_shroud_strike','Покров кошмара: усилить удар','free',1,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','wisdom_save_nightmare_strike','payload',jsonb_build_object('fail_damage','1d6 psychic','frightened_until','end_of_monk_next_turn','success_fear_immunity_hours',24))),'["subclass","unarmed-hit","wisdom-save"]'::jsonb)
          ),
          'travelers_blade',jsonb_build_array(
            private.monk_subclass_value('living-traveler-base-reach','monk:living-weapon:discipline:traveler','living_weapon_reach_bonus_feet','Бонус досягаемости',5,3),
            private.monk_subclass_action('living-traveler-1','monk:living-weapon:discipline:traveler','living_travelers_blade_1','Клинок странника: +5 футов','free',1,'[]'::jsonb,'[]'::jsonb,'["subclass","start-of-turn","duration-turn"]'::jsonb),
            private.monk_subclass_action('living-traveler-2','monk:living-weapon:discipline:traveler','living_travelers_blade_2','Клинок странника: +10 футов','free',2,'[]'::jsonb,'[]'::jsonb,'["subclass","start-of-turn","duration-turn"]'::jsonb),
            private.monk_subclass_action('living-traveler-3','monk:living-weapon:discipline:traveler','living_travelers_blade_3','Клинок странника: +15 футов','free',3,'[]'::jsonb,'[]'::jsonb,'["subclass","start-of-turn","duration-turn"]'::jsonb),
            private.monk_subclass_action('living-traveler-4','monk:living-weapon:discipline:traveler','living_travelers_blade_4','Клинок странника: +20 футов','free',4,'[]'::jsonb,'[]'::jsonb,'["subclass","start-of-turn","duration-turn"]'::jsonb)
          ),
          'weretouched',jsonb_build_array(
            private.monk_subclass_feature('living-weretouched-rules','monk:living-weapon:discipline:weretouched','living_weretouched','Звериная кровь','Один раз за ход после попадания Безоружным ударом можно потратить 1 Focus и вызвать кровотечение: в начале каждого хода цели до 1 минуты она получает 1к4 рубящего урона. Эффект заканчивается после любого лечения HP, применения healer’s kit действием или успешной Medicine проверки против СЛ концентрации. С 6 уровня этот урон считается магическим для сопротивлений.'),
            private.monk_subclass_action('living-weretouched-action','monk:living-weapon:discipline:weretouched','living_weretouched_bleed','Звериная кровь: кровотечение','free',1,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','apply_bleeding','payload',jsonb_build_object('damage_each_target_turn','1d4 slashing','duration_minutes',1,'ends_on_heal',true,'healers_kit_action_ends',true,'medicine_check_ends',true))),'["subclass","unarmed-hit","once-per-turn"]'::jsonb)
          )
        )
      )
    ),
    jsonb_build_array(
      private.monk_subclass_feature('living-manifest-rules','monk:living-weapon:manifest','manifest_blow','Проявленный удар',
        'После долгого отдыха монах выбирает дробящий, колющий, рубящий, cold, lightning, necrotic, psychic или thunder урон. В свой ход первое существо, по которому он попадает Безоружным ударом, получает дополнительно 1к6 выбранного урона. На 11 уровне дополнительный урон становится 2к6. Физические B/P/S варианты считаются магическими для сопротивлений и иммунитетов.')
    ),
    jsonb_build_array(jsonb_build_object('key','living_manifest_damage_type','label','Тип урона Проявленного удара','target','trait','options',v_manifest_types,'count',1,'selection_mode','player_once','refresh','long_rest')),
    jsonb_build_array(
      private.monk_subclass_feature('living-reflex-rules','monk:living-weapon:reflex','reflexive_adaptation','Рефлекторная адаптация',
        'Когда монах делает проверку Strength (Athletics) или Dexterity (Acrobatics), он может потратить 1 Focus после броска, но до объявления результата, и бросить дополнительный d20. Затем выбирает, какой d20 использовать; если исходная проверка была с помехой, самый высокий d20 использовать нельзя. На этом уровне Manifest Blow наносит 2к6.'),
      private.monk_subclass_action('living-reflex-action','monk:living-weapon:reflex','reflexive_adaptation','Рефлекторная адаптация','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','additional_d20_athletics_acrobatics','payload',jsonb_build_object('after_roll_before_result',true,'disadvantage_omit_highest',true))),
        '["subclass","ability-check-trigger"]'::jsonb),
      private.monk_subclass_value('living-manifest-dice-l11','monk:living-weapon:manifest','living_manifest_blow_dice_count','Кубы Проявленного удара',2,11)
    ),'[]'::jsonb,
    jsonb_build_array(private.monk_subclass_feature('living-perfect-rules','monk:living-weapon:perfect','perfect_form','Совершенная форма',
      'На 17 уровне монах выбирает один из четырёх вариантов Perfect Form. Этот выбор независим от Боевой дисциплины 3 уровня и может совпадать с ней или отличаться.')),
    jsonb_build_array(
      jsonb_build_object('key','living_weapon_perfect_form','label','Совершенная форма','target','trait','options',jsonb_build_array('forged_heart','nightmare_shroud','travelers_blade','weretouched'),'count',1,'selection_mode','player_once',
        'option_labels',jsonb_build_object('forged_heart','Кованое сердце','nightmare_shroud','Покров кошмара','travelers_blade','Клинок странника','weretouched','Звериная кровь'),
        'option_mechanics',jsonb_build_object(
          'forged_heart',jsonb_build_array(
            private.monk_subclass_feature('living-perfect-forged-rules','monk:living-weapon:perfect:forged','living_perfect_forged','Совершенное кованое сердце','Когда по монаху попадает атака, он может реакцией добавить модификатор Мудрости (минимум 1) к КД, включая против вызвавшей реакцию атаки, до начала следующего хода.'),
            private.monk_subclass_action('living-perfect-forged-action','monk:living-weapon:perfect:forged','living_perfect_forged_ac','Совершенное кованое сердце','reaction',0,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','temporary_ac_bonus','payload',jsonb_build_object('formula','max(1, wisdom_modifier)','includes_triggering_attack',true,'duration','start_of_next_turn'))),'["subclass","hit-trigger"]'::jsonb)
          ),
          'nightmare_shroud',jsonb_build_array(private.monk_subclass_feature('living-perfect-nightmare-rules','monk:living-weapon:perfect:nightmare','living_perfect_nightmare','Совершенный покров кошмара','Когда Manifest Blow наносит урон, монах выбирает до трёх других существ в пределах 30 футов от цели; каждое получает psychic урон, равный половине уровня монаха, округляя вверх.')),
          'travelers_blade',jsonb_build_array(private.monk_subclass_feature('living-perfect-traveler-rules','monk:living-weapon:perfect:traveler','living_perfect_traveler','Совершенный клинок странника','Когда Безоружный удар наносит колющий или рубящий урон, цель дополнительно получает 1к8 poison урона и делает спасбросок Телосложения против СЛ концентрации; при провале Отравлена до конца своего следующего хода.')),
          'weretouched',jsonb_build_array(private.monk_subclass_feature('living-perfect-weretouched-rules','monk:living-weapon:perfect:weretouched','living_perfect_weretouched','Совершенная звериная кровь','При Шквале ударов монах делает три Безоружных удара вместо двух, и эти атаки совершаются с преимуществом. На базе Monk 2024 Шквал уже даёт три удара с 10 уровня, поэтому численность не увеличивается сверх трёх; преимущество сохраняется.'))
        )
      )
    )
  );
end;
$$;

revoke all on function private.install_monk_subclasses_batch3_v1(uuid) from public,anon,authenticated;
grant execute on function private.install_monk_subclasses_batch3_v1(uuid) to service_role;

create or replace function private.install_monk_subclasses_batch3_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.install_monk_subclasses_batch3_v1(new.id);
  return new;
end;
$$;

revoke all on function private.install_monk_subclasses_batch3_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzzzz_campaigns_install_monk_subclasses_batch3 on public.campaigns;
create trigger zzzzzzzzzzzzz_campaigns_install_monk_subclasses_batch3
after insert on public.campaigns
for each row execute function private.install_monk_subclasses_batch3_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_monk_subclasses_batch3_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
