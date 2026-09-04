-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch2.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch2=RUNTIME_READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Monk subclass batch 2: Drunken Master, Kensei, Ascendant Dragon, Astral Self.
-- Original published subclass rules are preserved where no 2024 replacement exists;
-- Ki costs are paid from the rebuilt Monk's canonical monk_focus pool.

begin;

create or replace function private.monk_subclass_value(
  p_id text,p_source_key text,p_key text,p_label text,p_value jsonb,p_priority integer default 0
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','value','sourceKey',p_source_key,'key',p_key,
    'grantOperation','REPLACE','priority',p_priority,
    'payload',jsonb_build_object('label',p_label,'value',p_value)
  );
$$;

create or replace function private.upsert_monk_subclass_batch2(
  p_campaign_id uuid,p_parent_template_id uuid,p_slug text,p_catalog_key text,p_name text,
  p_source_label text,p_description text,p_summary text,
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
      p_catalog_key,'monk-subclasses-batch2-runtime-v1','official',p_source_label,true,p_summary,
      '','',jsonb_build_object(
        'base_class','class:monk','mechanics_status','READY','feature_levels',jsonb_build_array(3,6,11,17),
        'shared_resource','monk_focus','no_fake_scene_state',true,'subclass_batch',2,
        'compatibility_policy','original rules where no 2024 replacement exists'
      ),null,true
    ) returning id into v_template;
  else
    update public.rule_templates set
      slug=p_slug,name=p_name,description=p_description,mechanics='[]'::jsonb,choices='[]'::jsonb,
      parent_template_id=p_parent_template_id,unlock_level=3,
      catalog_revision='monk-subclasses-batch2-runtime-v1',source_kind='official',source_label=p_source_label,
      is_builtin=true,mechanical_summary=p_summary,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'base_class','class:monk','mechanics_status','READY','feature_levels',jsonb_build_array(3,6,11,17),
        'shared_resource','monk_focus','no_fake_scene_state',true,'subclass_batch',2,
        'compatibility_policy','original rules where no 2024 replacement exists'
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

create or replace function private.install_monk_subclasses_batch2_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_monk uuid;
  v_pb jsonb := '{"kind":"reference","key":"core.proficiencyBonus"}'::jsonb;
  v_kensei_melee_options jsonb := '["weapon:club","weapon:dagger","weapon:greatclub","weapon:handaxe","weapon:javelin","weapon:light_hammer","weapon:mace","weapon:quarterstaff","weapon:sickle","weapon:spear","weapon:battleaxe","weapon:flail","weapon:longsword","weapon:morningstar","weapon:rapier","weapon:scimitar","weapon:shortsword","weapon:trident","weapon:war_pick","weapon:warhammer","weapon:whip"]'::jsonb;
  v_kensei_ranged_options jsonb := '["weapon:dart","weapon:light_crossbow","weapon:shortbow","weapon:sling","weapon:blowgun","weapon:hand_crossbow","weapon:longbow"]'::jsonb;
  v_kensei_all_options jsonb;
begin
  perform private.install_monk_subclasses_batch1_v1(p_campaign_id);

  select id into v_monk from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:monk' and is_builtin is true
  order by is_active desc,version desc,created_at desc limit 1;
  if v_monk is null then raise exception 'Built-in Monk was not installed'; end if;

  v_kensei_all_options := v_kensei_melee_options || v_kensei_ranged_options;

  update public.rule_templates set
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'subclasses_included',true,'subclass_supported_count',8,
      'subclass_mechanics_status','BATCH2_READY',
      'subclass_runtime_revision','monk-subclasses-batch2-runtime-v1'
    ),updated_at=now()
  where id=v_monk;

  -- Way of the Drunken Master
  perform private.upsert_monk_subclass_batch2(
    p_campaign_id,v_monk,'monk-drunken-master','subclass:monk:drunken-master','Путь пьяного мастера',
    'Xanathar''s Guide to Everything',
    'Пьяный мастер превращает ложную неуклюжесть в мобильность, перенаправляет промахи врагов и снимает помеху за счёт концентрации.',
    'Drunken Technique улучшает Шквал без отдельной платы; Redirect Attack стоит 1 Focus, Drunkard''s Luck — 2 Focus; Intoxicated Frenzy сохраняет исходный предел пяти атак Шквала по разным целям.',
    jsonb_build_array(
      private.monk_subclass_feature('drunken-proficiencies-rules','monk:drunken-master:proficiencies','drunken_master_proficiencies','Дополнительные владения',
        'Монах получает владение навыком Выступление и инструментами пивовара.'),
      private.monk_subclass_proficiency('drunken-performance-prof','monk:drunken-master:proficiencies','skill:performance','Выступление'),
      private.monk_subclass_proficiency('drunken-brewers-prof','monk:drunken-master:proficiencies','tool:brewers_supplies','Инструменты пивовара'),
      private.monk_subclass_feature('drunken-technique-rules','monk:drunken-master:technique','drunken_technique','Пьяная техника',
        'После использования Шквала ударов монах получает эффект Отхода, а его Скорость ходьбы увеличивается на 10 футов до конца текущего хода.',
        '{"trigger":"after_flurry_of_blows","disengage":true,"walking_speed_bonus_feet":10,"duration":"end_of_current_turn"}'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('tipsy-sway-rules','monk:drunken-master:tipsy-sway','tipsy_sway','Пьяное покачивание',
        'Подъём из состояния Лежащий требует только 5 футов перемещения. Кроме того, когда существо промахивается по монаху рукопашной атакой, монах может реакцией потратить 1 Очко концентрации и перенаправить эту атаку в другое видимое существо в пределах 5 футов от себя; новой цели атака попадает автоматически.'),
      private.monk_subclass_action('tipsy-redirect-action','monk:drunken-master:tipsy-sway','tipsy_sway_redirect_attack','Пьяное покачивание: перенаправить атаку','reaction',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','redirect_missed_melee_attack','payload',jsonb_build_object('target_within_feet',5,'cannot_target_original_attacker',true,'automatic_hit',true))),
        '["subclass","after-melee-miss","gm-target"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('drunkards-luck-rules','monk:drunken-master:luck','drunkards_luck','Удача пьяницы',
        'Когда монах совершает проверку характеристики, бросок атаки или спасбросок с помехой, он может потратить 2 Очка концентрации и отменить помеху для этого броска.'),
      private.monk_subclass_action('drunkards-luck-action','monk:drunken-master:luck','drunkards_luck','Удача пьяницы','free',2,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','cancel_disadvantage_for_roll','payload',jsonb_build_object('roll_types',jsonb_build_array('ability_check','attack_roll','saving_throw')))),
        '["subclass","disadvantage-trigger"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('intoxicated-frenzy-rules','monk:drunken-master:frenzy','intoxicated_frenzy','Хмельное безумие',
        'При использовании Шквала ударов монах может сделать до трёх дополнительных атак Шквала, но каждая атака Шквала в этот ход должна быть направлена в отдельное существо. Исходный предел способности — не более пяти атак Шквала за этот ход.'),
      private.monk_subclass_value('intoxicated-frenzy-cap','monk:drunken-master:frenzy','drunken_flurry_max_attacks','Максимум атак Шквала при Хмельном безумии','5'::jsonb,17)
    ),'[]'::jsonb
  );

  -- Way of the Kensei
  perform private.upsert_monk_subclass_batch2(
    p_campaign_id,v_monk,'monk-kensei','subclass:monk:kensei','Путь кэнсэя / Мастера оружия',
    'Xanathar''s Guide to Everything',
    'Кэнсэй связывает монашеские приёмы с выбранными видами оружия, усиливает точность и временно зачаровывает клинок собственной концентрацией.',
    'Выбранные виды оружия хранятся как постоянные choices; Deft Strike стоит 1 Focus, Sharpen the Blade — 1–3 Focus. Триггеры конкретного оружия проверяются по фактической атаке за столом.',
    jsonb_build_array(
      private.monk_subclass_feature('kensei-path-rules','monk:kensei:path','path_of_the_kensei','Путь кэнсэя',
        'На 3 уровне монах выбирает один допустимый рукопашный и один допустимый дальнобойный вид оружия кэнсэя. Допустимо простое или воинское оружие без свойств Тяжёлое и Особое; длинный лук также допустим. Монах получает владение выбранным оружием, и оно считается для него оружием монаха. На 6, 11 и 17 уровнях он выбирает ещё по одному допустимому виду оружия. Если в рамках действия Атака монах наносит Безоружный удар и держит рукопашное оружие кэнсэя, он получает +2 к КД до начала следующего хода. Бонусным действием он также может усилить дальнобойное оружие кэнсэя: до конца хода каждое попадание им наносит ещё 1к4 урона типа оружия.'),
      private.monk_subclass_action('kensei-shot-action','monk:kensei:path','kenseis_shot','Выстрел кэнсэя','bonus_action',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','ranged_kensei_bonus_damage','payload',jsonb_build_object('damage','1d4','duration','end_of_current_turn'))),
        '["subclass","requires-ranged-kensei-weapon"]'::jsonb),
      private.monk_subclass_feature('kensei-brush-rules','monk:kensei:brush','way_of_the_brush','Путь кисти',
        'Монах получает владение одним набором на выбор: принадлежностями каллиграфа или художника.')
    ),
    jsonb_build_array(
      jsonb_build_object('key','kensei_melee_weapon','label','Рукопашное оружие кэнсэя','target','proficiency','options',v_kensei_melee_options,'count',1,'selection_mode','player_once'),
      jsonb_build_object('key','kensei_ranged_weapon','label','Дальнобойное оружие кэнсэя','target','proficiency','options',v_kensei_ranged_options,'count',1,'selection_mode','player_once'),
      jsonb_build_object('key','kensei_brush_tool','label','Путь кисти','target','proficiency','options',jsonb_build_array('tool:calligraphers_supplies','tool:painters_supplies'),'count',1,'selection_mode','player_once')
    ),
    jsonb_build_array(
      private.monk_subclass_feature('kensei-one-blade-rules','monk:kensei:one-with-blade','one_with_the_blade','Единство с клинком',
        'Атаки оружием кэнсэя считаются магическими для преодоления сопротивления и иммунитета к немагическим атакам. Один раз за ход, когда монах попадает оружием кэнсэя, он может потратить 1 Очко концентрации и нанести дополнительный урон, равный одному броску куба Боевых искусств.'),
      private.monk_subclass_action('kensei-deft-strike-action','monk:kensei:one-with-blade','deft_strike','Точный удар','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','extra_kensei_weapon_damage','payload',jsonb_build_object('damage','one_martial_arts_die','frequency','once_per_turn'))),
        '["subclass","on-kensei-weapon-hit","once-per-turn"]'::jsonb)
    ),
    jsonb_build_array(jsonb_build_object('key','kensei_extra_weapon','label','Дополнительное оружие кэнсэя','target','proficiency','options',v_kensei_all_options,'count_by_level',jsonb_build_object('6',1,'11',2,'17',3),'selection_mode','player_once')),
    jsonb_build_array(
      private.monk_subclass_feature('kensei-sharpen-rules','monk:kensei:sharpen','sharpen_the_blade','Заточка клинка',
        'Бонусным действием монах может потратить до 3 Очков концентрации и коснуться одного оружия кэнсэя. На 1 минуту оружие получает бонус к броскам атаки и урона, равный потраченным Очкам концентрации. Способность не действует на магическое оружие, уже имеющее бонус к броскам атаки и урона.'),
      private.monk_subclass_action('kensei-sharpen-1','monk:kensei:sharpen','sharpen_the_blade_1','Заточка клинка +1','bonus_action',1,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','kensei_weapon_bonus','payload',jsonb_build_object('bonus',1,'duration_minutes',1))),'["subclass","kensei-weapon"]'::jsonb),
      private.monk_subclass_action('kensei-sharpen-2','monk:kensei:sharpen','sharpen_the_blade_2','Заточка клинка +2','bonus_action',2,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','kensei_weapon_bonus','payload',jsonb_build_object('bonus',2,'duration_minutes',1))),'["subclass","kensei-weapon"]'::jsonb),
      private.monk_subclass_action('kensei-sharpen-3','monk:kensei:sharpen','sharpen_the_blade_3','Заточка клинка +3','bonus_action',3,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','kensei_weapon_bonus','payload',jsonb_build_object('bonus',3,'duration_minutes',1))),'["subclass","kensei-weapon"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('kensei-unerring-rules','monk:kensei:unerring','unerring_accuracy','Безошибочная точность',
        'Один раз в каждый свой ход, когда монах промахивается атакой оружием монаха, он может перебросить этот бросок атаки и обязан использовать новый результат.'),
      private.monk_subclass_action('kensei-unerring-action','monk:kensei:unerring','unerring_accuracy','Безошибочная точность','free',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','reroll_missed_monk_weapon_attack','payload',jsonb_build_object('must_use_new_result',true,'frequency','once_per_turn'))),
        '["subclass","after-miss","once-per-turn"]'::jsonb)
    ),'[]'::jsonb
  );

  -- Way of the Ascendant Dragon
  perform private.upsert_monk_subclass_batch2(
    p_campaign_id,v_monk,'monk-ascendant-dragon','subclass:monk:ascendant-dragon','Путь восходящего дракона',
    'Fizban''s Treasury of Dragons',
    'Драконий монах меняет тип урона безоружных ударов, выдыхает стихию, разворачивает крылья и создаёт драконью ауру.',
    'Breath и Wings имеют конечные long-rest ресурсы; Breath после исчерпания бесплатных применений стоит 2 Focus, Aspect после бесплатного применения — 3 Focus. Сценовые спасброски и ауры остаются структурированными правилами.',
    jsonb_build_array(
      private.monk_subclass_feature('dragon-disciple-rules','monk:ascendant-dragon:disciple','draconic_disciple','Ученик дракона',
        'При каждом Безоружном ударе монах может заменить тип урона на кислоту, холод, огонь, электричество или яд. Если монах проваливает проверку Харизмы (Запугивание или Убеждение), он может реакцией перебросить её и обязан использовать новый результат; после этого повторное применение доступно только после долгого отдыха. Также он учится говорить, читать и писать на Драконьем либо одном другом выбранном языке.'),
      private.monk_subclass_resource('dragon-presence-use','monk:ascendant-dragon:disciple','monk_draconic_presence_use','Драконье присутствие',1,'["long_rest"]'::jsonb,3),
      private.monk_subclass_action('dragon-presence-action','monk:ascendant-dragon:disciple','draconic_presence_reroll','Драконье присутствие: перебросить','reaction',0,jsonb_build_array(jsonb_build_object('key','monk_draconic_presence_use','amount',1)),
        jsonb_build_array(jsonb_build_object('kind','semantic','key','reroll_charisma_check','payload',jsonb_build_object('skills',jsonb_build_array('intimidation','persuasion'),'must_use_new_result',true))),
        '["subclass","failed-charisma-check"]'::jsonb),
      private.monk_subclass_feature('dragon-breath-rules','monk:ascendant-dragon:breath','breath_of_the_dragon','Дыхание дракона',
        'Когда монах совершает действие Атака, он может заменить одну из атак выдохом: 20-футовый конус либо линию длиной 30 футов и шириной 5 футов. Он выбирает кислоту, холод, огонь, электричество или яд. Существа в области делают спасбросок Ловкости против СЛ концентрации; при провале получают урон, равный двум кубам Боевых искусств, при успехе — половину. На 11 уровне урон становится тремя кубами Боевых искусств. Бесплатных применений — бонус мастерства за долгий отдых; когда они закончились, каждое следующее применение стоит 2 Очка концентрации.'),
      private.monk_subclass_resource('dragon-breath-uses','monk:ascendant-dragon:breath','monk_dragon_breath_uses','Дыхание дракона',v_pb,'["long_rest"]'::jsonb,3),
      private.monk_subclass_action('dragon-breath-free','monk:ascendant-dragon:breath','breath_of_the_dragon_free','Дыхание дракона: бесплатное применение','free',0,jsonb_build_array(jsonb_build_object('key','monk_dragon_breath_uses','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','dragon_breath','payload',jsonb_build_object('damage_dice','2 martial_arts_dice','save','dexterity','success','half'))),'["subclass","replaces-one-attack","aoe"]'::jsonb),
      private.monk_subclass_action('dragon-breath-focus','monk:ascendant-dragon:breath','breath_of_the_dragon_focus','Дыхание дракона: за концентрацию','free',2,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','dragon_breath','payload',jsonb_build_object('damage_dice','2 martial_arts_dice','save','dexterity','success','half','requires_free_uses_empty',true))),'["subclass","replaces-one-attack","aoe","only-after-free-uses"]'::jsonb)
    ),
    jsonb_build_array(jsonb_build_object('key','ascendant_dragon_language','label','Язык драконьего ученика','target','language','options',jsonb_build_array('draconic','dwarvish','elvish','giant','gnomish','goblin','halfling','orc','abyssal','celestial','deep_speech','infernal','primordial','sylvan','undercommon'),'count',1,'selection_mode','player_once')),
    jsonb_build_array(
      private.monk_subclass_feature('dragon-wings-rules','monk:ascendant-dragon:wings','wings_unfurled','Расправленные крылья',
        'Когда монах использует Шаг ветра, он может расправить призрачные драконьи крылья до конца текущего хода и получить скорость полёта, равную Скорости ходьбы. Способность можно использовать число раз, равное бонусу мастерства; все применения возвращаются после долгого отдыха.'),
      private.monk_subclass_resource('dragon-wings-uses','monk:ascendant-dragon:wings','monk_dragon_wings_uses','Расправленные крылья',v_pb,'["long_rest"]'::jsonb,6),
      private.monk_subclass_action('dragon-wings-action','monk:ascendant-dragon:wings','wings_unfurled','Расправленные крылья','free',0,jsonb_build_array(jsonb_build_object('key','monk_dragon_wings_uses','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','fly_until_end_turn','payload',jsonb_build_object('speed','walking_speed','requires_step_of_wind',true))),'["subclass","requires-step-of-wind"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('dragon-aspect-rules','monk:ascendant-dragon:aspect','aspect_of_the_wyrm','Аспект змея',
        'Бонусным действием монах создаёт на 1 минуту ауру радиусом 10 футов. При активации выбирается один эффект. Устрашающее присутствие: при создании ауры и бонусным действием в последующие ходы выбранное существо в ауре делает спасбросок Мудрости; при провале Испугано на 1 минуту и повторяет спасбросок в конце каждого хода. Сопротивление: выбирается кислота, холод, огонь, электричество или яд; монах и союзники в ауре получают сопротивление выбранному типу. Одно создание ауры бесплатно после каждого долгого отдыха; дополнительные стоят 3 Очка концентрации.'),
      private.monk_subclass_resource('dragon-aspect-use','monk:ascendant-dragon:aspect','monk_dragon_aspect_free_use','Аспект змея',1,'["long_rest"]'::jsonb,11),
      private.monk_subclass_action('dragon-aspect-free','monk:ascendant-dragon:aspect','aspect_of_the_wyrm_free','Аспект змея: бесплатное применение','bonus_action',0,jsonb_build_array(jsonb_build_object('key','monk_dragon_aspect_free_use','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','dragon_aura','payload',jsonb_build_object('radius_feet',10,'duration_minutes',1))),'["subclass","aura"]'::jsonb),
      private.monk_subclass_action('dragon-aspect-focus','monk:ascendant-dragon:aspect','aspect_of_the_wyrm_focus','Аспект змея: за концентрацию','bonus_action',3,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','dragon_aura','payload',jsonb_build_object('radius_feet',10,'duration_minutes',1,'requires_free_use_empty',true))),'["subclass","aura","only-after-free-use"]'::jsonb),
      private.monk_subclass_feature('dragon-breath-l11-rules','monk:ascendant-dragon:breath','breath_of_the_dragon_upgrade','Дыхание дракона: усиление',
        'С 11 уровня урон Дыхания дракона равен трём кубам Боевых искусств вместо двух.')
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('dragon-ascendant-rules','monk:ascendant-dragon:ascendant','ascendant_aspect','Восходящий аспект',
        'Дыхание дракона усиливается: вместо обычной области можно выбрать 60-футовый конус или линию длиной 90 футов и шириной 5 футов, а урон становится 4к10 выбранного типа. Монах получает слепое зрение 10 футов. Когда он создаёт Аспект змея, выбранные существа в ауре делают спасбросок Ловкости против СЛ концентрации; при провале получают 3к10 урона того же типа, что выбран для ауры сопротивления, либо одного из доступных драконьих типов при устрашающем варианте.'),
      private.monk_subclass_value('dragon-blindsight-value','monk:ascendant-dragon:ascendant','ascendant_dragon_blindsight_feet','Слепое зрение', '10'::jsonb,17)
    ),'[]'::jsonb
  );

  -- Way of the Astral Self
  perform private.upsert_monk_subclass_batch2(
    p_campaign_id,v_monk,'monk-astral-self','subclass:monk:astral-self','Путь астрального самосознания',
    'Tasha''s Cauldron of Everything',
    'Астральный монах призывает руки, лик и тело духовного двойника, используя Мудрость вместо грубой физической силы.',
    'Arms и Visage стоят по 1 Focus, Awakened Self — 5 Focus. Длительность форм и сценовые атаки остаются точными правилами; расход общего Focus выполняется нативными действиями.',
    jsonb_build_array(
      private.monk_subclass_feature('astral-arms-rules','monk:astral-self:arms','arms_of_the_astral_self','Руки астрального «я»',
        'Бонусным действием монах тратит 1 Очко концентрации и на 10 минут призывает астральные руки. При призыве выбранные видимые существа в пределах 10 футов делают спасбросок Ловкости; при провале получают силовой урон, равный двум кубам Боевых искусств. Пока руки существуют, монах может использовать Мудрость вместо Силы для проверок и спасбросков Силы. Безоружные удары астральными руками имеют досягаемость на 5 футов больше обычной, могут использовать Мудрость вместо Силы или Ловкости для бросков атаки и урона и наносят силовой урон вместо обычного.'),
      private.monk_subclass_action('astral-arms-action','monk:astral-self:arms','arms_of_the_astral_self','Руки астрального «я»','bonus_action',1,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','summon_astral_arms','payload',jsonb_build_object('duration_minutes',10,'summon_radius_feet',10,'summon_damage','2 martial_arts_dice force','reach_bonus_feet',5,'attack_ability','wisdom','damage_ability','wisdom'))),'["subclass","duration-table"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('astral-visage-rules','monk:astral-self:visage','visage_of_the_astral_self','Лик астрального «я»',
        'Бонусным действием либо как часть бонусного действия призыва Рук астрального «я» монах тратит 1 Очко концентрации и призывает лик на 10 минут. Он видит нормально в обычной и магической темноте на 120 футов, получает преимущество на проверки Мудрости (Проницательность) и Харизмы (Запугивание), может говорить так, чтобы его слышало только выбранное видимое существо в пределах 60 футов, либо усилить голос так, чтобы его слышали все в пределах 600 футов.'),
      private.monk_subclass_action('astral-visage-action','monk:astral-self:visage','visage_of_the_astral_self','Лик астрального «я»','bonus_action',1,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','summon_astral_visage','payload',jsonb_build_object('duration_minutes',10,'darkness_sight_feet',120,'private_voice_feet',60,'amplified_voice_feet',600))),'["subclass","duration-table"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('astral-body-rules','monk:astral-self:body','body_of_the_astral_self','Тело астрального «я»',
        'Пока одновременно призваны астральные руки и лик, монах может без действия проявить тело астрального «я». Пока тело существует, реакцией при получении урона кислотой, холодом, огнём, силовым полем, электричеством или звуком он уменьшает этот урон на 1к10 + модификатор Мудрости + уровень монаха. Кроме того, один раз в каждый свой ход при попадании астральными руками он наносит дополнительный урон, равный одному кубу Боевых искусств.'),
      private.monk_subclass_action('astral-body-action','monk:astral-self:body','body_of_the_astral_self','Тело астрального «я»: проявить','free',0,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','manifest_astral_body','payload',jsonb_build_object('requires_arms_and_visage',true))),'["subclass","requires-arms-and-visage"]'::jsonb),
      private.monk_subclass_action('astral-deflect-energy','monk:astral-self:body','deflect_energy','Отражение энергии','reaction',0,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','reduce_energy_damage','payload',jsonb_build_object('formula','1d10 + wisdom_modifier + monk_level','damage_types',jsonb_build_array('acid','cold','fire','force','lightning','thunder')))),'["subclass","requires-astral-body"]'::jsonb)
    ),'[]'::jsonb,
    jsonb_build_array(
      private.monk_subclass_feature('astral-awakened-rules','monk:astral-self:awakened','awakened_astral_self','Пробуждённое астральное «я»',
        'Бонусным действием монах тратит 5 Очков концентрации и на 10 минут призывает руки, лик и тело астрального «я» в пробуждённой форме. Пока форма действует, монах получает +2 к КД. Кроме того, при использовании Дополнительной атаки он может атаковать три раза вместо двух, если все эти атаки совершает астральными руками.'),
      private.monk_subclass_action('astral-awakened-action','monk:astral-self:awakened','awakened_astral_self','Пробуждённое астральное «я»','bonus_action',5,'[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','awaken_astral_self','payload',jsonb_build_object('duration_minutes',10,'ac_bonus',2,'astral_arm_attacks_with_extra_attack',3))),'["subclass","duration-table"]'::jsonb),
      private.monk_subclass_value('astral-awakened-ac','monk:astral-self:awakened','awakened_astral_self_ac_bonus','Бонус КД пробуждённой формы','2'::jsonb,17),
      private.monk_subclass_value('astral-awakened-attacks','monk:astral-self:awakened','awakened_astral_self_extra_attack_count','Атак астральными руками при Дополнительной атаке','3'::jsonb,17)
    ),'[]'::jsonb
  );
end;
$$;

revoke all on function private.install_monk_subclasses_batch2_v1(uuid) from public,anon,authenticated;
grant execute on function private.install_monk_subclasses_batch2_v1(uuid) to service_role;

create or replace function private.install_monk_subclasses_batch2_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.install_monk_subclasses_batch2_v1(new.id);
  return new;
end;
$$;

revoke all on function private.install_monk_subclasses_batch2_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzzzz_campaigns_install_monk_subclasses_batch2 on public.campaigns;
create trigger zzzzzzzzzzzzz_campaigns_install_monk_subclasses_batch2
after insert on public.campaigns
for each row execute function private.install_monk_subclasses_batch2_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_monk_subclasses_batch2_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
