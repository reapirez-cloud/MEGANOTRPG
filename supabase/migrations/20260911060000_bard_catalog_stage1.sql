-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:bard
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/bardCatalogStage1.test.ts
-- CLASS_WORK_STATUS: bard:catalog=STAGE1_READY,bard:mechanics=PENDING_STAGE2
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Bard Stage 1 establishes the safe 2024 class foundation only:
-- catalog identity, core proficiencies, starting skill/instrument choices and the
-- structural 1-20 feature tree. Bardic Inspiration, spell execution, active
-- sheet_profile data and subclass runtime remain deliberately deferred.

begin;

create or replace function private.ensure_bard_catalog_stage1_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard uuid;
  v_level integer;
  v_feature jsonb;
  v_level_mechanics jsonb;
  v_meta jsonb;
  v_spell_slots_by_level jsonb := '{
    "1":{"1":2},
    "2":{"1":3},
    "3":{"1":4,"2":2},
    "4":{"1":4,"2":3},
    "5":{"1":4,"2":3,"3":2},
    "6":{"1":4,"2":3,"3":3},
    "7":{"1":4,"2":3,"3":3,"4":1},
    "8":{"1":4,"2":3,"3":3,"4":2},
    "9":{"1":4,"2":3,"3":3,"4":3,"5":1},
    "10":{"1":4,"2":3,"3":3,"4":3,"5":2},
    "11":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1},
    "12":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1},
    "13":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1},
    "14":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1},
    "15":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1},
    "16":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1},
    "17":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1,"9":1},
    "18":{"1":4,"2":3,"3":3,"4":3,"5":3,"6":1,"7":1,"8":1,"9":1},
    "19":{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":1,"8":1,"9":1},
    "20":{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":2,"8":1,"9":1}
  }'::jsonb;
  v_prepared_by_level jsonb := '{
    "1":4,"2":5,"3":6,"4":7,"5":9,"6":10,"7":11,"8":12,"9":14,"10":15,
    "11":16,"12":16,"13":17,"14":17,"15":18,"16":18,"17":19,"18":20,"19":21,"20":22
  }'::jsonb;
  v_cantrips_by_level jsonb := '{
    "1":2,"2":2,"3":2,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3,"10":4,
    "11":4,"12":4,"13":4,"14":4,"15":4,"16":4,"17":4,"18":4,"19":4,"20":4
  }'::jsonb;
  v_base jsonb := jsonb_build_array(
    jsonb_build_object(
      'id','bard-hit-die','type','grant','sourceKey','hit-die',
      'target','feature','key','class:bard:hit-die',
      'payload',jsonb_build_object(
        'label','Кость здоровья: к8',
        'hitDie',8,
        'description','Бард использует к8 как кость здоровья класса; эта кость определяет базовую прогрессию здоровья при получении уровней барда.'
      )
    ),
    jsonb_build_object(
      'id','bard-save-dexterity','type','grant','sourceKey','saving-throw-dexterity',
      'target','proficiency','key','savingThrow:dexterity',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Ловкость')
    ),
    jsonb_build_object(
      'id','bard-save-charisma','type','grant','sourceKey','saving-throw-charisma',
      'target','proficiency','key','savingThrow:charisma',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Харизма')
    ),
    jsonb_build_object(
      'id','bard-armor-light','type','grant','sourceKey','armor-light',
      'target','proficiency','key','armor:light',
      'payload',jsonb_build_object('rank',1,'label','Лёгкие доспехи')
    ),
    jsonb_build_object(
      'id','bard-weapon-simple','type','grant','sourceKey','weapon-simple',
      'target','proficiency','key','weapon:simple',
      'payload',jsonb_build_object('rank',1,'label','Простое оружие')
    )
  );
  v_choices jsonb := jsonb_build_array(
    jsonb_build_object(
      'key','bard-skills',
      'label','Навыки: Бард',
      'target','proficiency',
      'count',3,
      'selection_mode','player_once',
      'required',true,
      'options',jsonb_build_array(
        'skill:acrobatics','skill:animal_handling','skill:arcana','skill:athletics',
        'skill:deception','skill:history','skill:insight','skill:intimidation',
        'skill:investigation','skill:medicine','skill:nature','skill:perception',
        'skill:performance','skill:persuasion','skill:religion','skill:sleight_of_hand',
        'skill:stealth','skill:survival'
      ),
      'option_labels',jsonb_build_object(
        'skill:acrobatics','Акробатика',
        'skill:animal_handling','Уход за животными',
        'skill:arcana','Магия',
        'skill:athletics','Атлетика',
        'skill:deception','Обман',
        'skill:history','История',
        'skill:insight','Проницательность',
        'skill:intimidation','Запугивание',
        'skill:investigation','Расследование',
        'skill:medicine','Медицина',
        'skill:nature','Природа',
        'skill:perception','Восприятие',
        'skill:performance','Выступление',
        'skill:persuasion','Убеждение',
        'skill:religion','Религия',
        'skill:sleight_of_hand','Ловкость рук',
        'skill:stealth','Скрытность',
        'skill:survival','Выживание'
      )
    ),
    jsonb_build_object(
      'key','bard-musical-instruments',
      'label','Музыкальные инструменты: Бард',
      'target','proficiency',
      'count',3,
      'selection_mode','player_once',
      'required',true,
      'options',jsonb_build_array(
        'tool:musical:bagpipes','tool:musical:drum','tool:musical:dulcimer',
        'tool:musical:flute','tool:musical:horn','tool:musical:lute',
        'tool:musical:lyre','tool:musical:pan_flute','tool:musical:shawm',
        'tool:musical:viol'
      ),
      'option_labels',jsonb_build_object(
        'tool:musical:bagpipes','Волынка',
        'tool:musical:drum','Барабан',
        'tool:musical:dulcimer','Цимбалы',
        'tool:musical:flute','Флейта',
        'tool:musical:horn','Рожок',
        'tool:musical:lute','Лютня',
        'tool:musical:lyre','Лира',
        'tool:musical:pan_flute','Свирель Пана',
        'tool:musical:shawm','Шалмей',
        'tool:musical:viol','Виола'
      )
    )
  );
  v_features jsonb := '[
    {"level":1,"key":"bardic-inspiration","name":"Вдохновение барда","description":"Бонусным действием выберите другое существо в пределах 60 футов, которое видит или слышит вас: оно получает кость Вдохновения барда для одного проваленного D20-теста в течение следующего часа."},
    {"level":1,"key":"spellcasting","name":"Сотворение заклинаний","description":"Бард использует Харизму для заклинаний своего списка, музыкальный инструмент как фокусировку и получает магию по прогрессии полного заклинателя."},
    {"level":2,"key":"expertise","name":"Экспертиза","description":"Выберите два навыка, которыми владеете: для их проверок бонус мастерства удваивается. На 9 уровне эта черта позволяет выбрать ещё два таких навыка."},
    {"level":2,"key":"jack-of-all-trades","name":"Мастер на все руки","description":"К проверке характеристики, использующей навык без вашего владения, добавляйте половину бонуса мастерства с округлением вниз, если бонус мастерства иначе не применяется."},
    {"level":3,"key":"bard-subclass","name":"Подкласс барда","description":"На 3 уровне выберите коллегию барда; выбранная коллегия определяет дополнительные способности, которые открываются вместе с дальнейшими уровнями барда."},
    {"level":4,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; эта возможность повторяется на 8, 12 и 16 уровнях."},
    {"level":5,"key":"font-of-inspiration","name":"Источник вдохновения","description":"С 5 уровня Вдохновение барда возвращается также после короткого отдыха, а одну ячейку заклинаний можно потратить без действия, чтобы вернуть одно потраченное применение."},
    {"level":6,"key":"subclass","name":"Способность подкласса","description":"На 6 уровне выбранная коллегия барда открывает следующую способность своего подкласса согласно точным правилам этой коллегии."},
    {"level":7,"key":"countercharm","name":"Контрочарование","description":"Когда вы или существо в пределах 30 футов проваливает спасбросок против Очарования или Испуга, вы можете реакцией позволить цели перебросить его с преимуществом."},
    {"level":8,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; это отдельное повышение на 8 уровне барда."},
    {"level":9,"key":"expertise","name":"Экспертиза","description":"Выберите ещё два навыка, которыми владеете: для их проверок бонус мастерства удваивается в дополнение к двум навыкам, выбранным на 2 уровне."},
    {"level":10,"key":"magical-secrets","name":"Тайны магии","description":"Новые и заменяемые подготовленные заклинания барда можно выбирать из списков Барда, Жреца, Друида и Волшебника; выбранные заклинания считаются заклинаниями барда."},
    {"level":12,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; это отдельное повышение на 12 уровне барда."},
    {"level":14,"key":"subclass","name":"Способность подкласса","description":"На 14 уровне выбранная коллегия барда открывает следующую способность своего подкласса согласно точным правилам этой коллегии."},
    {"level":16,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; это отдельное повышение на 16 уровне барда."},
    {"level":18,"key":"superior-inspiration","name":"Превосходное вдохновение","description":"Когда вы бросаете инициативу и имеете меньше двух доступных применений Вдохновения барда, количество доступных применений поднимается до двух."},
    {"level":19,"key":"epic-boon","name":"Эпический дар","description":"Получите эпический дар либо другой талант, требованиям которого соответствуете; выбор выполняется по общим правилам талантов персонажа."},
    {"level":20,"key":"words-of-creation","name":"Слова созидания","description":"«Слово силы: Исцеление» и «Слово силы: Смерть» всегда подготовлены; вершина класса также позволяет одному из этих заклинаний затронуть дополнительную подходящую цель рядом с первой."}
  ]'::jsonb;
begin
  if p_campaign_id is null then
    return;
  end if;

  v_meta := jsonb_build_object(
    'class_key','bard',
    'class_identity','bard',
    'source_book','XPHB',
    'rules_revision','2024',
    'hit_die',8,
    'spell_progression','full_caster',
    'spellcasting_ability','charisma',
    'presentation_source','src/data/classes/bardReferenceCurrent.ts',
    'text_status','READY_CURRENT_AUTHORED_ROSTER_2026_09_04',
    'mechanics_status','STAGE1_FOUNDATION',
    'runtime_stage',1,
    'runtime_revision','xphb-2024-bard-stage1-foundation-v1',
    'feature_runtime_included',false,
    'resource_runtime_included',false,
    'spell_runtime_included',false,
    'subclass_runtime_included',false,
    'sheet_profile_deferred',true,
    'core_traits',jsonb_build_object(
      'hit_die','d8',
      'primary_ability','charisma',
      'saving_throws',jsonb_build_array('dexterity','charisma'),
      'armor_training',jsonb_build_array('light'),
      'weapon_training',jsonb_build_array('simple'),
      'skill_choice_count',3,
      'skill_choices',jsonb_build_array(
        'acrobatics','animal_handling','arcana','athletics','deception','history',
        'insight','intimidation','investigation','medicine','nature','perception',
        'performance','persuasion','religion','sleight_of_hand','stealth','survival'
      ),
      'musical_instrument_choice_count',3,
      'musical_instruments',jsonb_build_array(
        'bagpipes','drum','dulcimer','flute','horn','lute','lyre','pan_flute','shawm','viol'
      )
    ),
    'spellcasting_contract',jsonb_build_object(
      'ability','charisma',
      'spell_list','bard',
      'progression','full_caster',
      'runtime_status','stage3_pending',
      'cantrips_by_level',v_cantrips_by_level,
      'prepared_spells_by_level',v_prepared_by_level,
      'spell_slots_by_level',v_spell_slots_by_level,
      'replacement_policy','one_cantrip_and_one_prepared_spell_on_bard_level_gain',
      'magical_secrets_unlock_level',10
    ),
    'resource_contracts',jsonb_build_object(
      'bardic_inspiration',jsonb_build_object(
        'unlocks_at',1,
        'max',jsonb_build_object(
          'kind','max',
          'values',jsonb_build_array(
            jsonb_build_object('kind','literal','value',1),
            jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
          )
        ),
        'die_by_level',jsonb_build_object('1',6,'5',8,'10',10,'15',12),
        'recharge',jsonb_build_array('long_rest'),
        'short_rest_recharge_from_level',5,
        'runtime_status','stage2_pending'
      )
    ),
    'stage1_scope',jsonb_build_object(
      'assignable_template',true,
      'level_tree',true,
      'proficiencies',true,
      'feature_unlocks',true,
      'starting_choices',true,
      'resource_runtime_active',false,
      'spell_runtime_active',false,
      'subclass_runtime_active',false
    ),
    'next_stage','bardic_inspiration_resource_runtime'
  );

  select id into v_bard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
  order by is_active desc,version desc,created_at desc
  limit 1;

  if v_bard is null then
    select id into v_bard
    from public.rule_templates
    where campaign_id=p_campaign_id
      and kind='class'
      and slug='bard-core'
    order by is_active desc,version desc,created_at desc
    limit 1;
  end if;

  if v_bard is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    ) values (
      p_campaign_id,
      'class',
      'bard-core',
      'Бард',
      'Полный заклинатель Харизмы, который сочетает Вдохновение барда, широкие навыки и магические секреты.',
      1,
      v_base,
      v_choices,
      true,
      'class:bard',
      'xphb-2024-bard-stage1-foundation-v1',
      'official',
      'Player''s Handbook 2024',
      true,
      'К8 здоровья; Харизма; спасброски Ловкости и Харизмы; лёгкая броня; простое оружие; три навыка и три музыкальных инструмента; структурная прогрессия Барда 1–20.',
      '',
      '',
      v_meta
    ) returning id into v_bard;
  else
    update public.rule_templates
    set
      slug='bard-core',
      name='Бард',
      description='Полный заклинатель Харизмы, который сочетает Вдохновение барда, широкие навыки и магические секреты.',
      mechanics=v_base,
      choices=v_choices,
      catalog_key='class:bard',
      catalog_revision='xphb-2024-bard-stage1-foundation-v1',
      source_kind='official',
      source_label='Player''s Handbook 2024',
      is_builtin=true,
      is_active=true,
      mechanical_summary='К8 здоровья; Харизма; спасброски Ловкости и Харизмы; лёгкая броня; простое оружие; три навыка и три музыкальных инструмента; структурная прогрессия Барда 1–20.',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||v_meta,
      updated_at=now()
    where id=v_bard;
  end if;

  update public.rule_templates
  set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and id<>v_bard
    and is_active;

  for v_level in 1..20 loop
    v_level_mechanics := '[]'::jsonb;

    for v_feature in
      select value
      from jsonb_array_elements(v_features)
      where (value->>'level')::integer=v_level
    loop
      v_level_mechanics := v_level_mechanics || jsonb_build_array(
        jsonb_build_object(
          'id','bard-'||(v_feature->>'key')||'-feature-l'||v_level::text,
          'type','grant',
          'sourceKey',v_feature->>'key',
          'target','feature',
          'key','class:bard:'||(v_feature->>'key')||':l'||v_level::text,
          'payload',jsonb_build_object(
            'label',v_feature->>'name',
            'description',v_feature->>'description'
          )
        )
      );
    end loop;

    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_bard,v_level,v_level_mechanics,'[]'::jsonb)
    on conflict(template_id,level) do update
    set mechanics=excluded.mechanics,
        choices=excluded.choices;
  end loop;
end;
$function$;

revoke all on function private.ensure_bard_catalog_stage1_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_bard_catalog_stage1_v1(uuid) to service_role;

create or replace function private.ensure_bard_catalog_stage1_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_bard_catalog_stage1_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_bard_catalog_stage1_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaaf_campaigns_ensure_bard_catalog_stage1_v1 on public.campaigns;
create trigger aaaaaaaaf_campaigns_ensure_bard_catalog_stage1_v1
after insert on public.campaigns
for each row execute function private.ensure_bard_catalog_stage1_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_bard_catalog_stage1_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
