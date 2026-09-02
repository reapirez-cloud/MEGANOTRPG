-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardSubclassRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard-subclasses:text=READY;mechanics=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Forward-only v2 patch: persistent ledgers only; scene legality remains GM-adjudicated.

begin;

create or replace function private.wizard_replace_level_runtime_v2(
  p_template_id uuid,
  p_level integer,
  p_remove_ids text[],
  p_append jsonb,
  p_choices jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kept jsonb;
begin
  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
  into v_kept
  from jsonb_array_elements(
    coalesce((select mechanics from public.rule_template_levels where template_id=p_template_id and level=p_level), '[]'::jsonb)
  ) with ordinality as rows(item, ordinal)
  where not ((item->>'id') = any(coalesce(p_remove_ids, array[]::text[])));

  update public.rule_template_levels
  set mechanics=v_kept || coalesce(p_append,'[]'::jsonb),
      choices=coalesce(p_choices, choices)
  where template_id=p_template_id and level=p_level;
end;
$$;

create or replace function private.wizard_gm_restore_slot_actions_v2(
  p_prefix text,
  p_source_key text,
  p_from integer,
  p_to integer,
  p_label text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_level integer;
begin
  for v_level in p_from..p_to loop
    v_result := v_result || jsonb_build_array(private.wizard_subclass_action(
      p_prefix||'-slot-'||v_level::text,
      p_source_key,
      p_prefix||'_slot_'||v_level::text,
      p_label||' '||v_level::text||' уровня',
      'special',
      jsonb_build_object(
        'effects',jsonb_build_array(jsonb_build_object('kind','resource','key','spell_slot_'||v_level::text,'operation','RESTORE','amount',1)),
        'tags',jsonb_build_array('wizard','subclass','gm-adjudicated-trigger','slot-restore','slot:'||v_level::text)
      )
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.wizard_ward_actions_v2(p_mode text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_level integer;
  v_state_key text := 'recovery-state[long_rest]::wizard_abjurer_arcane_ward_created';
begin
  if p_mode not in ('cast','spend') then raise exception 'Unsupported ward action mode: %', p_mode; end if;

  for v_level in 1..9 loop
    if p_mode='cast' then
      v_result := v_result || jsonb_build_array(private.wizard_subclass_action(
        'abjurer-ward-cast-restore-'||v_level::text,
        'wizard:abjurer:arcane-ward',
        'abjurer_ward_cast_restore_'||v_level::text,
        'Учесть Ограждение ячейкой '||v_level::text||' уровня',
        'special',
        jsonb_build_object(
          'effects',jsonb_build_array(
            jsonb_build_object('kind','state','key',v_state_key,'operation','SET','value',true),
            jsonb_build_object('kind','resource','key','wizard_abjurer_arcane_ward','operation','RESTORE','amount',v_level*2),
            jsonb_build_object('kind','semantic','key','arcane_ward_abjuration_cast','payload',jsonb_build_object('slotLevel',v_level,'createsWardIfAbsent',true))
          ),
          'tags',jsonb_build_array('wizard','subclass','gm-adjudicated-trigger','slot:'||v_level::text)
        )
      ));
    else
      v_result := v_result || jsonb_build_array(private.wizard_subclass_action(
        'abjurer-ward-spend-slot-'||v_level::text,
        'wizard:abjurer:arcane-ward',
        'abjurer_ward_spend_slot_'||v_level::text,
        'Подпитать Тайный заслон ячейкой '||v_level::text||' уровня',
        'bonus_action',
        jsonb_build_object(
          'resourceCosts',jsonb_build_array(jsonb_build_object('key','spell_slot_'||v_level::text,'amount',1)),
          'requirements',jsonb_build_array(jsonb_build_object(
            'kind','condition',
            'condition',jsonb_build_object('kind','state','key',v_state_key,'operator','EQUALS','value',true),
            'label','Тайный заслон уже создан'
          )),
          'effects',jsonb_build_array(jsonb_build_object('kind','resource','key','wizard_abjurer_arcane_ward','operation','RESTORE','amount',v_level*2)),
          'tags',jsonb_build_array('wizard','subclass','resource-conversion','slot:'||v_level::text)
        )
      ));
    end if;
  end loop;
  return v_result;
end;
$$;

create or replace function private.wizard_portent_choice_v2(p_index integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_options jsonb := '[]'::jsonb;
  v_labels jsonb := '{}'::jsonb;
  v_mechanics jsonb := '{}'::jsonb;
  v_value integer;
  v_resource_key text := 'wizard_diviner_portent_'||p_index::text;
  v_choice_key text := 'wizard_diviner_portent_'||p_index::text||'_value';
begin
  if p_index not between 1 and 3 then raise exception 'Portent index must be 1..3'; end if;

  for v_value in 1..20 loop
    v_options := v_options || jsonb_build_array(v_value::text);
    v_labels := v_labels || jsonb_build_object(v_value::text,'d20 = '||v_value::text);
    v_mechanics := v_mechanics || jsonb_build_object(
      v_value::text,
      jsonb_build_array(private.wizard_subclass_action(
        'diviner-portent-'||p_index::text||'-value-'||v_value::text,
        'wizard:diviner:portent',
        'wizard_diviner_use_portent_'||p_index::text||'_'||v_value::text,
        'Использовать Знамение '||p_index::text||': '||v_value::text,
        'special',
        jsonb_build_object(
          'resourceKey',v_resource_key,
          'resourceCost',1,
          'effects',jsonb_build_array(jsonb_build_object(
            'kind','semantic','key','replace_d20_before_roll',
            'payload',jsonb_build_object('portentIndex',p_index,'portentValue',v_value)
          )),
          'tags',jsonb_build_array('wizard','subclass','d20','gm-adjudicated-trigger')
        )
      ))
    );
  end loop;

  return jsonb_build_object(
    'key',v_choice_key,
    'label','Знамение '||p_index::text||': выпавшее значение d20',
    'target','trait',
    'options',v_options,
    'option_labels',v_labels,
    'count',1,
    'selection_mode','player_once',
    'refresh','long_rest',
    'option_mechanics',v_mechanics
  );
end;
$$;

create or replace function private.install_wizard_2024_subclass_runtime_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wizard uuid;
  v_abjurer uuid;
  v_diviner uuid;
  v_evoker uuid;
  v_illusionist uuid;
  v_remove text[];
  v_state_ward text := 'recovery-state[long_rest]::wizard_abjurer_arcane_ward_created';
  v_state_third_eye text := 'recovery-state[long_rest,short_rest]::wizard_diviner_third_eye_mode';
  v_state_overchannel text := 'recovery-state[long_rest]::wizard_evoker_overchannel_repeat_count';
begin
  perform private.install_wizard_2024_subclass_runtime_v1(p_campaign_id);

  select id into v_wizard from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:wizard' and is_builtin is true
  order by is_active desc, version desc, created_at desc limit 1;

  select id into v_abjurer from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key='subclass:wizard:abjurer' and is_builtin is true
  order by is_active desc, version desc, created_at desc limit 1;
  select id into v_diviner from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key='subclass:wizard:diviner' and is_builtin is true
  order by is_active desc, version desc, created_at desc limit 1;
  select id into v_evoker from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key='subclass:wizard:evoker' and is_builtin is true
  order by is_active desc, version desc, created_at desc limit 1;
  select id into v_illusionist from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key='subclass:wizard:illusionist' and is_builtin is true
  order by is_active desc, version desc, created_at desc limit 1;

  update public.rule_templates
  set catalog_revision='phb-2024-wizard-subclasses-runtime@2', updated_at=now()
  where id=any(array[v_abjurer,v_diviner,v_evoker,v_illusionist]);

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object('subclass_runtime_revision','phb-2024-wizard-subclasses-runtime@2'),
      updated_at=now()
  where id=v_wizard;

  -- Abjurer: the Ward exists across scenes until long rest. Visibility, hit timing and spell failure remain GM adjudication.
  v_remove := array['abjurer-arcane-ward-rules'];
  for i in 1..9 loop v_remove := array_append(v_remove,'abjurer-ward-restore-slot-'||i::text); end loop;
  perform private.wizard_replace_level_runtime_v2(
    v_abjurer,3,v_remove,
    jsonb_build_array(private.wizard_subclass_feature(
      'abjurer-arcane-ward-rules','wizard:abjurer:arcane-ward','subclass:wizard:abjurer:arcane-ward','Тайный заслон',
      'Когда вы впервые после долгого отдыха накладываете заклинание Ограждения ячейкой, создайте Тайный заслон с максимумом HP, равным удвоенному уровню Волшебника + модификатор Интеллекта. Заслон существует до долгого отдыха даже при 0 HP. При каждом заклинании Ограждения, наложенном ячейкой, восстановите HP заслона на удвоенный уровень ячейки. Бонусным действием можно потратить ячейку и восстановить столько же HP.',
      jsonb_build_object('kind','damage_buffer','resource','wizard_abjurer_arcane_ward','createdState',v_state_ward,'maximum','2 * wizard_level + intelligence_modifier','restoreOnAbjurationSlotCast','2 * slot_level','bonusActionSlotRestore',true)
    )) || private.wizard_ward_actions_v2('cast') || private.wizard_ward_actions_v2('spend')
  );

  perform private.wizard_replace_level_runtime_v2(
    v_abjurer,6,array['abjurer-projected-ward-rules','abjurer-projected-ward-action'],
    jsonb_build_array(
      private.wizard_subclass_feature(
        'abjurer-projected-ward-rules','wizard:abjurer:projected-ward','subclass:wizard:abjurer:projected-ward','Переданный заслон',
        'Когда видимое существо в пределах 30 футов получает урон, реакцией направьте на него созданный Тайный заслон. Урон уменьшает HP заслона; остаток получает защищаемое существо. Приложение не проверяет видимость, дистанцию или момент получения урона — это решает ГМ.',
        jsonb_build_object('kind','reaction_damage_buffer','resource','wizard_abjurer_arcane_ward','rangeFeet',30,'usesReaction',true)
      ),
      private.wizard_subclass_action(
        'abjurer-projected-ward-action','wizard:abjurer:projected-ward','wizard_abjurer_projected_ward','Передать Тайный заслон','reaction',
        jsonb_build_object(
          'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
          'requirements',jsonb_build_array(
            jsonb_build_object('kind','condition','condition',jsonb_build_object('kind','state','key',v_state_ward,'operator','EQUALS','value',true),'label','Тайный заслон создан'),
            jsonb_build_object('kind','resource','key','wizard_abjurer_arcane_ward','minimum',1,'label','У заслона есть HP')
          ),
          'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','damage_buffer_redirect','payload',jsonb_build_object('resource','wizard_abjurer_arcane_ward','rangeFeet',30))),
          'tags',jsonb_build_array('wizard','subclass','reaction','gm-adjudicated-trigger')
        )
      )
    )
  );

  v_remove := array['abjurer-spell-breaker-rules'];
  for i in 3..9 loop v_remove := array_append(v_remove,'abjurer_spell_breaker_refund-slot-'||i::text); end loop;
  perform private.wizard_replace_level_runtime_v2(
    v_abjurer,10,v_remove,
    jsonb_build_array(private.wizard_subclass_feature(
      'abjurer-spell-breaker-rules','wizard:abjurer:spell-breaker','subclass:wizard:abjurer:spell-breaker','Разрушитель чар',
      'Контрзаклинание и Рассеивание магии всегда подготовлены и не занимают лимит подготовки. Рассеивание магии можно накладывать бонусным действием. Если Контрзаклинание или Рассеивание магии, наложенное ячейкой, не прекращает заклинание, ячейка не расходуется. ГМ определяет, когда условие выполнено; кнопка только возвращает соответствующую ячейку.',
      jsonb_build_object('kind','spell_breaker','alwaysPrepared',jsonb_build_array('counterspell','dispel-magic'),'dispelMagicBonusAction',true,'addProficiencyToDispelCheck',true,'refundSlotOnFailedBreak',true)
    )) || private.wizard_gm_restore_slot_actions_v2('abjurer_spell_breaker_refund','wizard:abjurer:spell-breaker',3,9,'Вернуть ячейку Разрушителя чар')
  );

  -- Diviner: each recorded d20 is a long-rest choice with its own one-use ledger.
  perform private.wizard_replace_level_runtime_v2(
    v_diviner,3,array['diviner-portent-dice','diviner-portent-rules','diviner-portent-action'],
    jsonb_build_array(
      private.wizard_subclass_resource('diviner-portent-1','wizard:diviner:portent','wizard_diviner_portent_1','Знамение 1','1'::jsonb,to_jsonb('long_rest'::text)),
      private.wizard_subclass_resource('diviner-portent-2','wizard:diviner:portent','wizard_diviner_portent_2','Знамение 2','1'::jsonb,to_jsonb('long_rest'::text)),
      private.wizard_subclass_feature(
        'diviner-portent-rules','wizard:diviner:portent','subclass:wizard:diviner:portent','Знамение',
        'После долгого отдыха бросьте два d20 и запишите каждое значение отдельно. До следующего долгого отдыха можно до броска d20 Теста видимого существа потратить одно записанное Знамение и заменить бросок его значением. Одно Знамение можно применить не более одного раза, а правило «раз в ход» не создаёт отдельного ресурса — момент применения контролирует ГМ.',
        jsonb_build_object('kind','portent','resources',jsonb_build_array('wizard_diviner_portent_1','wizard_diviner_portent_2'),'values',jsonb_build_array('wizard_diviner_portent_1_value','wizard_diviner_portent_2_value'),'die','d20','replaceBeforeRoll',true,'perTurnLimit',1)
      )
    ),
    jsonb_build_array(private.wizard_portent_choice_v2(1),private.wizard_portent_choice_v2(2))
  );

  v_remove := array['diviner-expert-divination-rules'];
  for i in 1..5 loop v_remove := array_append(v_remove,'diviner_expert_restore-slot-'||i::text); end loop;
  perform private.wizard_replace_level_runtime_v2(
    v_diviner,6,v_remove,
    jsonb_build_array(private.wizard_subclass_feature(
      'diviner-expert-divination-rules','wizard:diviner:expert-divination','subclass:wizard:diviner:expert-divination','Опытное прорицание',
      'Когда вы накладываете заклинание Прорицания ячейкой 2 уровня или выше, восстановите одну потраченную ячейку более низкого уровня, но не выше 5. ГМ определяет, выполнено ли условие; приложение только возвращает выбранную ячейку.',
      jsonb_build_object('kind','expert_divination','maximumRestoredSlotLevel',5)
    )) || private.wizard_gm_restore_slot_actions_v2('diviner_expert_restore','wizard:diviner:expert-divination',1,5,'Вернуть ячейку Опытным прорицанием')
  );

  perform private.wizard_replace_level_runtime_v2(
    v_diviner,10,array['diviner-third-eye-rules','diviner-third-eye-darkvision','diviner-third-eye-read-languages','diviner-third-eye-see-invisibility'],
    jsonb_build_array(
      private.wizard_subclass_feature(
        'diviner-third-eye-rules','wizard:diviner:third-eye','subclass:wizard:diviner:third-eye','Третий глаз',
        'Бонусным действием выберите один режим до начала короткого или долгого отдыха: тёмное зрение 120 футов, чтение любого языка или возможность накладывать Видение невидимого без траты ячейки. После короткого или долгого отдыха режим заканчивается и использование восстанавливается.',
        jsonb_build_object('kind','third_eye','resource','wizard_diviner_third_eye','modeState',v_state_third_eye,'options',jsonb_build_array('darkvision','greater_comprehension','see_invisibility'))
      ),
      private.wizard_subclass_action('diviner-third-eye-darkvision','wizard:diviner:third-eye','wizard_diviner_third_eye_darkvision','Третий глаз: тёмное зрение','bonus_action',jsonb_build_object('resourceKey','wizard_diviner_third_eye','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','state','key',v_state_third_eye,'operation','SET','value','darkvision'),jsonb_build_object('kind','semantic','key','third_eye_mode','payload',jsonb_build_object('mode','darkvision','rangeFeet',120))))),
      private.wizard_subclass_action('diviner-third-eye-comprehension','wizard:diviner:third-eye','wizard_diviner_third_eye_comprehension','Третий глаз: читать любой язык','bonus_action',jsonb_build_object('resourceKey','wizard_diviner_third_eye','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','state','key',v_state_third_eye,'operation','SET','value','greater_comprehension'),jsonb_build_object('kind','semantic','key','third_eye_mode','payload',jsonb_build_object('mode','greater_comprehension','readAnyLanguage',true))))),
      private.wizard_subclass_action('diviner-third-eye-see-invisibility','wizard:diviner:third-eye','wizard_diviner_third_eye_see_invisibility','Третий глаз: Видение невидимого','bonus_action',jsonb_build_object('resourceKey','wizard_diviner_third_eye','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','state','key',v_state_third_eye,'operation','SET','value','see_invisibility'),jsonb_build_object('kind','semantic','key','third_eye_mode','payload',jsonb_build_object('mode','see_invisibility','castWithoutSlot','see-invisibility')))))
    )
  );

  perform private.wizard_replace_level_runtime_v2(
    v_diviner,14,array['diviner-greater-portent-rules'],
    jsonb_build_array(
      private.wizard_subclass_resource('diviner-portent-3','wizard:diviner:portent','wizard_diviner_portent_3','Знамение 3','1'::jsonb,to_jsonb('long_rest'::text)),
      private.wizard_subclass_feature('diviner-greater-portent-rules','wizard:diviner:portent','subclass:wizard:diviner:greater-portent','Великое знамение','После долгого отдыха бросайте и записывайте три d20 для Знамения вместо двух. Третье значение хранится и расходуется отдельно; дополнительного ресурса «Великого знамения» нет.',jsonb_build_object('kind','portent_upgrade','addedResource','wizard_diviner_portent_3','newMaximum',3))
    ),
    jsonb_build_array(private.wizard_portent_choice_v2(3))
  );

  -- Evoker: per-spell cadence is not a resource, but repeated Overchannel count affects future backlash until long rest.
  perform private.wizard_replace_level_runtime_v2(
    v_evoker,14,array['evoker-overchannel-rules'],
    jsonb_build_array(
      private.wizard_subclass_feature(
        'evoker-overchannel-rules','wizard:evoker:overchannel','subclass:wizard:evoker:overchannel','Перегрузка',
        'При сотворении наносящего урон заклинания Волшебника ячейкой 1–5 уровня можно назначить максимальный урон вместо броска в ход сотворения. Первое использование после долгого отдыха безопасно. При каждом повторном использовании до следующего долгого отдыха вы получаете некротическую отдачу: 2d12 за уровень ячейки при первом повторе и ещё +1d12 за уровень ячейки за каждый следующий повтор. Число повторов хранится до долгого отдыха.',
        jsonb_build_object('kind','overchannel','resource','wizard_evoker_overchannel_safe','repeatState',v_state_overchannel,'spellSlotMin',1,'spellSlotMax',5,'maximizeDamageThisTurn',true,'repeatNecroticBacklash',jsonb_build_object('dicePerSlotLevel','repeat_count + 1','ignoresResistanceAndImmunity',true))
      ),
      private.wizard_subclass_action(
        'evoker-overchannel-repeat-action','wizard:evoker:overchannel','wizard_evoker_overchannel_repeat','Повторно перегрузить заклинание','special',
        jsonb_build_object(
          'effects',jsonb_build_array(
            jsonb_build_object('kind','state','key',v_state_overchannel,'operation','ADD','value',1),
            jsonb_build_object('kind','semantic','key','overchannel_repeat','payload',jsonb_build_object('slotMin',1,'slotMax',5,'counterState',v_state_overchannel,'backlashDicePerSlotLevel','repeat_count + 1','damageType','necrotic','ignoresResistanceAndImmunity',true))
          ),
          'tags',jsonb_build_array('wizard','subclass','persistent-counter')
        )
      )
    )
  );

  -- Illusionist: only the real finite ledgers remain; hit/object legality is adjudicated by the GM.
  perform private.wizard_replace_level_runtime_v2(
    v_illusionist,10,array['illusionist-illusory-self-rules','illusionist-illusory-self-action'],
    jsonb_build_array(
      private.wizard_subclass_feature('illusionist-illusory-self-rules','wizard:illusionist:illusory-self','subclass:wizard:illusionist:illusory-self','Иллюзорное я','Когда существо попадает по вам броском атаки, реакцией потратьте Иллюзорное я, чтобы атака промахнулась. Приложение не проверяет факт попадания. Ресурс восстанавливается после короткого или долгого отдыха; его также можно восстановить без действия, потратив ячейку 2 уровня или выше.',jsonb_build_object('kind','illusory_self','resource','wizard_illusionist_illusory_self','restoreBySlotMinLevel',2)),
      private.wizard_subclass_action('illusionist-illusory-self-action','wizard:illusionist:illusory-self','wizard_illusionist_illusory_self','Подставить Иллюзорное я','reaction',jsonb_build_object('resourceKey','wizard_illusionist_illusory_self','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','force_attack_miss','payload',jsonb_build_object('adjudicatedBy','gm'))),'tags',jsonb_build_array('wizard','subclass','reaction','gm-adjudicated-trigger')))
    )
  );

  perform private.wizard_replace_level_runtime_v2(
    v_illusionist,14,array['illusionist-illusory-reality-rules','illusionist-illusory-reality-action'],
    jsonb_build_array(
      private.wizard_subclass_feature('illusionist-illusory-reality-rules','wizard:illusionist:illusory-reality','subclass:wizard:illusionist:illusory-reality','Иллюзорная реальность','При сотворении заклинания Иллюзии ячейкой можно бонусным действием сделать один немагический неодушевлённый объект из иллюзии реальным на 1 минуту. Объект не может наносить урон или накладывать состояния. Наличие подходящей иллюзии и объекта определяет ГМ; отдельного ресурса нет.',jsonb_build_object('kind','illusory_reality','duration','1_minute','object','nonmagical_inanimate_part_of_illusion','cannotDealDamage',true,'cannotApplyConditions',true)),
      private.wizard_subclass_action('illusionist-illusory-reality-action','wizard:illusionist:illusory-reality','wizard_illusionist_illusory_reality','Сделать иллюзию реальной','bonus_action',jsonb_build_object('effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','make_illusion_object_real','payload',jsonb_build_object('duration','1_minute','cannotDealDamage',true,'cannotApplyConditions',true,'adjudicatedBy','gm'))),'tags',jsonb_build_array('wizard','subclass','gm-adjudicated-trigger')))
    )
  );
end;
$$;

create or replace function private.install_wizard_2024_subclass_runtime_for_new_campaign_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_wizard_2024_subclass_runtime_v2(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzz_campaigns_install_wizard_2024_subclass_runtime on public.campaigns;
create trigger zzzzz_campaigns_install_wizard_2024_subclass_runtime
after insert on public.campaigns
for each row execute function private.install_wizard_2024_subclass_runtime_for_new_campaign_v2();

do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_wizard_2024_subclass_runtime_v2(v_campaign.id);
  end loop;
end
$$;

commit;
