-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch1.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch1=RUNTIME_READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- 2024 Monk subclass batch 1: Mercy, Shadow, Elements, Open Hand.
-- Subclasses reuse the base monk_focus pool. Scene/target/light/turn conditions
-- remain exact table rules rather than fake Character Engine state.

begin;

create or replace function private.monk_subclass_feature(
  p_id text,p_source_key text,p_key text,p_label text,p_description text,p_mechanic jsonb default '{}'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','feature','key',p_key,'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',coalesce(p_mechanic,'{}'::jsonb))
  );
$$;

create or replace function private.monk_subclass_action(
  p_id text,p_source_key text,p_key text,p_label text,p_economy text,
  p_focus_cost integer default 0,p_extra_costs jsonb default '[]'::jsonb,
  p_effects jsonb default '[]'::jsonb,p_tags jsonb default '[]'::jsonb,
  p_damage jsonb default '[]'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','action','sourceKey',p_source_key,'key',p_key,'label',p_label,'economy',p_economy,
    'range',jsonb_build_object('kind','self'),
    'resourceCosts',case
      when p_focus_cost>0 then jsonb_build_array(jsonb_build_object('key','monk_focus','amount',p_focus_cost))||coalesce(p_extra_costs,'[]'::jsonb)
      when jsonb_array_length(coalesce(p_extra_costs,'[]'::jsonb))>0 then p_extra_costs
      else null end,
    'effects',case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects else null end,
    'damage',case when jsonb_array_length(coalesce(p_damage,'[]'::jsonb))>0 then p_damage else null end,
    'tags',coalesce(p_tags,'[]'::jsonb),
    'presentation',jsonb_build_object('tone','amber','icon','◆','display','counter','priority',84)
  ));
$$;

create or replace function private.monk_subclass_resource(
  p_id text,p_source_key text,p_key text,p_label text,p_max jsonb,p_recharge jsonb,p_priority integer default 0
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','resource','sourceKey',p_source_key,'key',p_key,'label',p_label,
    'max',p_max,'recharge',p_recharge,'initial','full','grantOperation','REPLACE','priority',p_priority,
    'presentation',jsonb_build_object('tone','amber','icon','◆','display','pips','priority',84)
  );
$$;

create or replace function private.monk_subclass_proficiency(
  p_id text,p_source_key text,p_key text,p_label text
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','proficiency','sourceKey',p_source_key,'key',p_key,
    'payload',jsonb_build_object('rank',1,'label',p_label)
  );
$$;

create or replace function private.upsert_monk_subclass_batch1(
  p_campaign_id uuid,p_parent_template_id uuid,p_slug text,p_catalog_key text,p_name text,
  p_description text,p_summary text,p_level3 jsonb,p_level6 jsonb,p_level11 jsonb,p_level17 jsonb
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
      p_catalog_key,'xphb-2024-monk-subclasses-batch1-v1','official','Player''s Handbook 2024',true,p_summary,
      '','',jsonb_build_object(
        'base_class','class:monk','rules_revision','2024','mechanics_status','READY',
        'feature_levels',jsonb_build_array(3,6,11,17),'shared_resource','monk_focus',
        'no_fake_scene_state',true,'subclass_batch',1
      ),null,true
    ) returning id into v_template;
  else
    update public.rule_templates set
      slug=p_slug,name=p_name,description=p_description,mechanics='[]'::jsonb,choices='[]'::jsonb,
      parent_template_id=p_parent_template_id,unlock_level=3,
      catalog_revision='xphb-2024-monk-subclasses-batch1-v1',source_kind='official',
      source_label='Player''s Handbook 2024',is_builtin=true,mechanical_summary=p_summary,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'base_class','class:monk','rules_revision','2024','mechanics_status','READY',
        'feature_levels',jsonb_build_array(3,6,11,17),'shared_resource','monk_focus',
        'no_fake_scene_state',true,'subclass_batch',1
      ),is_active=true,updated_at=now()
    where id=v_template;
  end if;

  delete from public.rule_template_levels where template_id=v_template;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
    (v_template,3,coalesce(p_level3,'[]'::jsonb),'[]'::jsonb),
    (v_template,6,coalesce(p_level6,'[]'::jsonb),'[]'::jsonb),
    (v_template,11,coalesce(p_level11,'[]'::jsonb),'[]'::jsonb),
    (v_template,17,coalesce(p_level17,'[]'::jsonb),'[]'::jsonb);
end;
$$;

create or replace function private.install_monk_subclasses_batch1_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_monk uuid;
  v_wis_uses jsonb := '{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.wisdom.modifier"}]}'::jsonb;
  v_ma_sides jsonb := '{"kind":"reference","key":"values.value:martial_arts_die_sides:default"}'::jsonb;
begin
  perform private.apply_monk_base_runtime_v1(p_campaign_id);
  perform private.audit_monk_base_runtime_v1(p_campaign_id);
  perform private.apply_monk_2024_rules_precision(p_campaign_id);
  perform private.complete_monk_runtime_v1(p_campaign_id);

  select id into v_monk from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:monk' and is_builtin is true
  order by is_active desc,version desc,created_at desc limit 1;
  if v_monk is null then raise exception 'Built-in Monk was not installed'; end if;

  update public.rule_templates set
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'subclasses_included',true,'subclass_supported_count',4,
      'subclass_mechanics_status','BATCH1_READY',
      'subclass_runtime_revision','xphb-2024-monk-subclasses-batch1-v1'
    ),updated_at=now()
  where id=v_monk;

  -- Warrior of Mercy / Путь милосердия
  perform private.upsert_monk_subclass_batch1(
    p_campaign_id,v_monk,'monk-mercy','subclass:monk:mercy','Путь милосердия',
    'Монах милосердия управляет жизненной силой: лечит союзников, усиливает безоружные удары некротической энергией и на вершине пути способен вернуть недавно погибшего к жизни.',
    'Лечение и вред используют общий запас Очков концентрации; отдельные дневные применения ведутся собственными ресурсами.',
    jsonb_build_array(
      private.monk_subclass_feature('mercy-hand-harm-rules','monk:mercy:hand-of-harm','mercy_hand_of_harm','Рука вреда',
        'Один раз за ход, когда монах попадает по существу Безоружным ударом и наносит урон, он может потратить 1 Очко концентрации и нанести дополнительный некротический урон: один бросок куба Боевых искусств + модификатор Мудрости.',
        '{"trigger":"unarmed_hit_damage","frequency":"once_per_turn","damage":"martial_arts_die + wisdom_modifier","damage_type":"necrotic"}'::jsonb),
      private.monk_subclass_action('mercy-hand-harm-action','monk:mercy:hand-of-harm','mercy_hand_of_harm','Рука вреда','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','bonus_necrotic_damage','payload',jsonb_build_object('formula','martial_arts_die + wisdom_modifier'))),
        '["subclass","on-unarmed-hit","once-per-turn"]'::jsonb),
      private.monk_subclass_feature('mercy-hand-healing-rules','monk:mercy:hand-of-healing','mercy_hand_of_healing','Рука исцеления',
        'Магическим действием монах может потратить 1 Очко концентрации, коснуться существа и восстановить ему HP: один бросок куба Боевых искусств + модификатор Мудрости. При использовании Шквала ударов один Безоружный удар можно заменить этим лечением без дополнительной траты Очка концентрации на лечение.'),
      private.monk_subclass_action('mercy-hand-healing-action','monk:mercy:hand-of-healing','mercy_hand_of_healing','Рука исцеления','magic',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','heal','payload',jsonb_build_object('formula','martial_arts_die + wisdom_modifier'))),
        '["subclass","touch","healing"]'::jsonb),
      private.monk_subclass_action('mercy-hand-healing-flurry','monk:mercy:hand-of-healing','mercy_hand_of_healing_flurry','Рука исцеления: вместо удара Шквала','free',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','heal','payload',jsonb_build_object('formula','martial_arts_die + wisdom_modifier'))),
        '["subclass","requires-flurry","replaces-one-unarmed-strike","no-extra-focus"]'::jsonb),
      private.monk_subclass_feature('mercy-implements-rules','monk:mercy:implements','mercy_implements','Орудия милосердия',
        'Монах получает владение навыками Проницательность и Медицина, а также Набором травника.'),
      private.monk_subclass_proficiency('mercy-insight-prof','monk:mercy:implements','skill:insight','Проницательность'),
      private.monk_subclass_proficiency('mercy-medicine-prof','monk:mercy:implements','skill:medicine','Медицина'),
      private.monk_subclass_proficiency('mercy-herbalism-prof','monk:mercy:implements','tool:herbalism_kit','Набор травника')
    ),
    jsonb_build_array(
      private.monk_subclass_feature('mercy-physicians-touch-rules','monk:mercy:physicians-touch','mercy_physicians_touch','Касание лекаря',
        'Рука вреда дополнительно может дать цели состояние Отравлен до конца следующего хода монаха. Рука исцеления дополнительно может снять с исцелённого существа одно состояние на выбор: Ослеплён, Оглох, Парализован, Отравлен или Ошеломлён.',
        '{"harm_condition":"poisoned_until_end_of_next_turn","healing_removes_one":["blinded","deafened","paralyzed","poisoned","stunned"]}'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('mercy-flurry-heal-harm-rules','monk:mercy:flurry-healing-harm','mercy_flurry_healing_harm','Шквал исцеления и вреда',
        'При Шквале ударов монах может заменить каждый Безоружный удар Рукой исцеления без траты Очков концентрации за лечение. Кроме того, один раз за ход Безоружный удар Шквала, который нанёс урон, может применить Руку вреда без траты Очка концентрации. Эти преимущества можно использовать суммарно число раз, равное модификатору Мудрости (минимум 1), и все использования возвращаются после долгого отдыха.'),
      private.monk_subclass_resource('mercy-flurry-heal-harm-uses','monk:mercy:flurry-healing-harm','monk_mercy_flurry_healing_harm_uses','Шквал исцеления и вреда',v_wis_uses,'["long_rest"]'::jsonb,11),
      private.monk_subclass_action('mercy-flurry-heal-harm-use','monk:mercy:flurry-healing-harm','mercy_flurry_healing_harm','Шквал исцеления и вреда: применить преимущество','free',0,
        jsonb_build_array(jsonb_build_object('key','monk_mercy_flurry_healing_harm_uses','amount',1)),
        '[]'::jsonb,'["subclass","requires-flurry"]'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('mercy-ultimate-rules','monk:mercy:ultimate','mercy_hand_of_ultimate_mercy','Высшее милосердие',
        'Магическим действием монах касается трупа существа, умершего не более 24 часов назад, и тратит 5 Очков концентрации. Существо возвращается к жизни с HP, равными 4к10 + модификатор Мудрости. С него также снимаются состояния Ослеплён, Оглох, Парализован, Отравлен и Ошеломлён, если оно умерло с ними. После применения способность недоступна до долгого отдыха.'),
      private.monk_subclass_resource('mercy-ultimate-use','monk:mercy:ultimate','monk_mercy_ultimate_mercy_use','Высшее милосердие',1,'["long_rest"]'::jsonb,17),
      private.monk_subclass_action('mercy-ultimate-action','monk:mercy:ultimate','mercy_hand_of_ultimate_mercy','Высшее милосердие','magic',5,
        jsonb_build_array(jsonb_build_object('key','monk_mercy_ultimate_mercy_use','amount',1)),
        jsonb_build_array(jsonb_build_object('kind','semantic','key','revive','payload',jsonb_build_object('dead_within_hours',24,'healing','4d10 + wisdom_modifier','remove_conditions',jsonb_build_array('blinded','deafened','paralyzed','poisoned','stunned')))),
        '["subclass","touch","revive","once-per-long-rest"]'::jsonb)
    )
  );

  -- Warrior of Shadow / Путь тени
  perform private.upsert_monk_subclass_batch1(
    p_campaign_id,v_monk,'monk-shadow','subclass:monk:shadow','Путь тени',
    'Монах тени управляет магической тьмой, перемещается между тенями и на высших уровнях становится почти бесплотным.',
    'Тьма и улучшенный теневой шаг расходуют общий Focus; освещение и фактическое положение на поле подтверждаются за столом.',
    jsonb_build_array(
      private.monk_subclass_feature('shadow-arts-rules','monk:shadow:arts','shadow_arts','Искусства тени',
        'Монах может потратить 1 Очко концентрации, чтобы наложить Тьму без компонентов, и видит внутри области Тьмы, созданной этой способностью. Пока заклинание действует, в начале каждого своего хода он может переместить его область в пространство в пределах 60 футов от себя. Монах также получает тёмное зрение 60 футов; если оно уже есть, дальность увеличивается на 60 футов. Кроме того, он знает Малую иллюзию и использует Мудрость как заклинательную характеристику для неё.'),
      private.monk_subclass_action('shadow-darkness-action','monk:shadow:arts','shadow_arts_darkness','Искусства тени: Тьма','magic',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','cast_darkness','payload',jsonb_build_object('components',false,'self_can_see',true,'move_area_at_start_turn_feet',60))),
        '["subclass","darkness","concentration"]'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('shadow-step-rules','monk:shadow:step','shadow_step','Шаг сквозь тень',
        'Пока монах целиком находится в тусклом свете или темноте, бонусным действием он телепортируется на расстояние до 60 футов в видимое незанятое пространство, которое также находится в тусклом свете или темноте. После этого следующий бросок рукопашной атаки монаха до конца текущего хода совершается с преимуществом.'),
      private.monk_subclass_action('shadow-step-action','monk:shadow:step','shadow_step','Шаг сквозь тень','bonus_action',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','teleport','payload',jsonb_build_object('feet',60,'requires_start_dim_or_dark',true,'requires_end_dim_or_dark',true,'advantage_next_melee_attack_this_turn',true))),
        '["subclass","teleport","light-condition"]'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('shadow-improved-step-rules','monk:shadow:improved-step','shadow_improved_step','Улучшенный шаг сквозь тень',
        'При использовании Шага сквозь тень монах может потратить 1 Очко концентрации и убрать для этого использования требование начинать и заканчивать телепортацию в тусклом свете или темноте. Сразу после телепортации в рамках того же бонусного действия он может сделать один Безоружный удар.'),
      private.monk_subclass_action('shadow-improved-step-action','monk:shadow:improved-step','shadow_improved_step','Улучшенный шаг сквозь тень','bonus_action',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','teleport_then_unarmed_strike','payload',jsonb_build_object('feet',60,'ignore_light_requirement',true))),
        '["subclass","teleport","unarmed-strike"]'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('shadow-cloak-rules','monk:shadow:cloak','shadow_cloak','Покров теней',
        'Магическим действием, находясь целиком в тусклом свете или темноте, монах тратит 3 Очка концентрации и окутывает себя тенями на 1 минуту. Эффект заканчивается раньше, если монах становится недееспособен или завершает ход в ярком свете. Пока эффект действует, монах Невидим, может проходить через занятые пространства как через труднопроходимую местность (если завершает там ход, его выталкивает в последнее незанятое пространство) и может использовать Шквал ударов без траты Очков концентрации.'),
      private.monk_subclass_action('shadow-cloak-action','monk:shadow:cloak','shadow_cloak','Покров теней','magic',3,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','shadow_cloak','payload',jsonb_build_object('duration_minutes',1,'invisible',true,'occupied_spaces_difficult_terrain',true,'free_flurry',true))),
        '["subclass","requires-dim-or-dark","duration-table"]'::jsonb)
    )
  );

  -- Warrior of the Elements / Путь четырёх стихий
  perform private.upsert_monk_subclass_batch1(
    p_campaign_id,v_monk,'monk-elements','subclass:monk:elements','Путь четырёх стихий',
    'Монах стихий насыщает безоружные удары элементальной энергией, создаёт взрывные области и получает воздушную и водную мобильность.',
    'Активация стихий и Взрыв стихий расходуют общий Focus; выбранный тип урона и перемещения целей применяются по точному правилу способности.',
    jsonb_build_array(
      private.monk_subclass_feature('elements-attunement-rules','monk:elements:attunement','elemental_attunement','Единение со стихиями',
        'В начале своего хода монах может потратить 1 Очко концентрации и активировать Единение со стихиями на 10 минут или пока не станет недееспособен. Пока оно активно, дальность его Безоружных ударов увеличивается на 10 футов. При каждом Безоружном ударе можно выбрать урон кислотой, холодом, огнём, электричеством или звуком вместо обычного типа. Когда такой удар попадает, цель должна преуспеть в спасброске Силы против СЛ концентрации, иначе монах может переместить её на 10 футов к себе или от себя.'),
      private.monk_subclass_action('elements-attunement-action','monk:elements:attunement','elemental_attunement','Единение со стихиями','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','elemental_attunement','payload',jsonb_build_object('duration_minutes',10,'unarmed_reach_bonus_feet',10,'damage_types',jsonb_build_array('acid','cold','fire','lightning','thunder'),'push_pull_feet',10))),
        '["subclass","start-of-turn","duration-table"]'::jsonb),
      private.monk_subclass_feature('elements-manipulate-rules','monk:elements:manipulate','manipulate_elements','Управление стихиями',
        'Монах знает заклинание Элементализм и использует Мудрость как заклинательную характеристику для него.')
    ),
    jsonb_build_array(
      private.monk_subclass_feature('elements-burst-rules','monk:elements:burst','elemental_burst','Взрыв стихий',
        'Магическим действием монах тратит 2 Очка концентрации и выбирает точку в пределах 120 футов. В сфере радиусом 20 футов вокруг точки каждое существо делает спасбросок Ловкости против СЛ концентрации. При провале оно получает урон выбранного типа — кислота, холод, огонь, электричество или звук — равный трём броскам куба Боевых искусств; при успехе получает половину этого урона.'),
      private.monk_subclass_action('elements-burst-action','monk:elements:burst','elemental_burst','Взрыв стихий','magic',2,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','area_damage_save','payload',jsonb_build_object('range_feet',120,'radius_feet',20,'save','dexterity','save_dc_key','monk_focus_save_dc','damage','3 martial_arts_dice','success','half','damage_types',jsonb_build_array('acid','cold','fire','lightning','thunder')))),
        '["subclass","aoe","dexterity-save"]'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('elements-stride-rules','monk:elements:stride','stride_of_the_elements','Поступь стихий',
        'Пока активно Единение со стихиями, монах получает скорость полёта и скорость плавания, равные его Скорости.')
    ),
    jsonb_build_array(
      private.monk_subclass_feature('elements-epitome-rules','monk:elements:epitome','elemental_epitome','Вершина стихий',
        'Пока активно Единение со стихиями, монах получает три преимущества. Сопротивление: выбирает сопротивление кислоте, холоду, огню, электричеству или звуку и может менять выбор в начале каждого хода. Разрушительная поступь: при Шаге ветра Скорость увеличивается ещё на 20 футов до конца хода; когда монах входит в пространство в 5 футах от выбранного существа, оно получает один куб Боевых искусств выбранного элементального урона, не более одного раза за ход на существо. Усиленные удары: один раз в каждый свой ход при попадании Безоружным ударом монах наносит ещё один куб Боевых искусств урона того же типа, что и удар.',
        '{"requires":"elemental_attunement_active","resistance_choice":["acid","cold","fire","lightning","thunder"],"step_speed_bonus_feet":20,"destructive_stride_die":1,"empowered_strike_die":1}'::jsonb)
    )
  );

  -- Warrior of the Open Hand / Путь открытой ладони
  perform private.upsert_monk_subclass_batch1(
    p_campaign_id,v_monk,'monk-open-hand','subclass:monk:open-hand','Путь открытой ладони',
    'Монах открытой ладони превращает Шквал ударов в инструмент контроля, умеет восстанавливать себя и завершать смертельные вибрации в теле противника.',
    'Контроль привязан к попаданиям Шквала, лечение имеет отдельный запас применений, а Дрожащая ладонь расходует общий Focus.',
    jsonb_build_array(
      private.monk_subclass_feature('open-hand-technique-rules','monk:open-hand:technique','open_hand_technique','Техника открытой ладони',
        'Каждый раз, когда монах попадает по существу атакой, предоставленной Шквалом ударов, он может применить к этой цели один эффект. Сбить с толку: цель не может совершать атаки по возможности до начала своего следующего хода. Оттолкнуть: цель делает спасбросок Силы; при провале её можно оттолкнуть на расстояние до 15 футов. Опрокинуть: цель делает спасбросок Ловкости; при провале получает состояние Лежащий.'),
      private.monk_subclass_action('open-hand-technique-addle','monk:open-hand:technique','open_hand_technique_addle','Открытая ладонь: сбить с толку','free',0,'[]'::jsonb,'[]'::jsonb,'["subclass","requires-flurry-hit","no-opportunity-attacks"]'::jsonb),
      private.monk_subclass_action('open-hand-technique-push','monk:open-hand:technique','open_hand_technique_push','Открытая ладонь: оттолкнуть','free',0,'[]'::jsonb,'[]'::jsonb,'["subclass","requires-flurry-hit","strength-save","push-15-feet"]'::jsonb),
      private.monk_subclass_action('open-hand-technique-topple','monk:open-hand:technique','open_hand_technique_topple','Открытая ладонь: опрокинуть','free',0,'[]'::jsonb,'[]'::jsonb,'["subclass","requires-flurry-hit","dexterity-save","prone"]'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('open-hand-wholeness-rules','monk:open-hand:wholeness','wholeness_of_body','Целостность тела',
        'Бонусным действием монах бросает куб Боевых искусств и восстанавливает HP в количестве, равном результату + модификатор Мудрости (минимум 1 HP). Способность можно использовать число раз, равное модификатору Мудрости (минимум 1), и все использования возвращаются после долгого отдыха.'),
      private.monk_subclass_resource('open-hand-wholeness-uses','monk:open-hand:wholeness','monk_open_hand_wholeness_uses','Целостность тела',v_wis_uses,'["long_rest"]'::jsonb,6),
      private.monk_subclass_action('open-hand-wholeness-action','monk:open-hand:wholeness','wholeness_of_body','Целостность тела','bonus_action',0,
        jsonb_build_array(jsonb_build_object('key','monk_open_hand_wholeness_uses','amount',1)),
        jsonb_build_array(jsonb_build_object('kind','semantic','key','heal','payload',jsonb_build_object('formula','max(1, martial_arts_die + wisdom_modifier)'))),
        '["subclass","self-heal"]'::jsonb)
    ),
    jsonb_build_array(
      private.monk_subclass_feature('open-hand-fleet-step-rules','monk:open-hand:fleet-step','fleet_step','Свободный шаг',
        'Когда монах совершает бонусное действие, отличное от Шага ветра, он может сразу после этого бонусного действия также использовать Шаг ветра. Шаг ветра сохраняет свои обычные правила и варианты траты Очка концентрации.')
    ),
    jsonb_build_array(
      private.monk_subclass_feature('open-hand-quivering-rules','monk:open-hand:quivering','quivering_palm','Дрожащая ладонь',
        'Когда монах попадает по существу Безоружным ударом, он может потратить 4 Очка концентрации и запустить в цели незаметные вибрации на число дней, равное уровню монаха. Одновременно под действием способности может быть только одно существо. Монах может без действия безвредно прекратить вибрации. Чтобы причинить вред, он может действием завершить вибрации либо при действии Атака отказаться от одной из своих атак. Монах и цель должны находиться на одном плане существования. Цель делает спасбросок Телосложения: при провале получает 10к12 урона силовым полем, при успехе — половину.'),
      private.monk_subclass_action('open-hand-quivering-mark','monk:open-hand:quivering','quivering_palm_mark','Дрожащая ладонь: запустить вибрации','free',4,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','mark_quivering_palm','payload',jsonb_build_object('duration_days','monk_level','one_target_only',true))),
        '["subclass","on-unarmed-hit","one-target-table"]'::jsonb),
      private.monk_subclass_action('open-hand-quivering-end','monk:open-hand:quivering','quivering_palm_end','Дрожащая ладонь: завершить вибрации','action',0,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object('kind','semantic','key','constitution_save_damage','payload',jsonb_build_object('save_dc_key','monk_focus_save_dc','fail','10d12 force','success','half','same_plane',true))),
        '["subclass","constitution-save","marked-target"]'::jsonb,
        jsonb_build_array(jsonb_build_object('key','quivering-palm-force','label','Дрожащая ладонь','damageType','force','count',10,'sides',12)) )
    )
  );
end;
$$;

revoke all on function private.install_monk_subclasses_batch1_v1(uuid) from public,anon,authenticated;
grant execute on function private.install_monk_subclasses_batch1_v1(uuid) to service_role;

create or replace function private.install_monk_subclasses_batch1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.install_monk_subclasses_batch1_v1(new.id);
  return new;
end;
$$;

revoke all on function private.install_monk_subclasses_batch1_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzz_campaigns_install_monk_subclasses_batch1 on public.campaigns;
create trigger zzzzzzzzzzz_campaigns_install_monk_subclasses_batch1
after insert on public.campaigns
for each row execute function private.install_monk_subclasses_batch1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_monk_subclasses_batch1_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;