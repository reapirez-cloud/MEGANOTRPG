-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardSubclassRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard-subclasses:text=READY;mechanics=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.wizard_subclass_feature(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_description text,
  p_mechanic jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','grant',
    'sourceKey',p_source_key,
    'target','feature',
    'key',p_key,
    'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',p_mechanic)
  );
$$;

create or replace function private.wizard_subclass_permission(
  p_id text,
  p_source_key text,
  p_school text,
  p_label text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','grant',
    'sourceKey',p_source_key,
    'target','permission',
    'key','wizard.school_savant.'||p_school,
    'payload',jsonb_build_object(
      'label',p_label,
      'school',p_school,
      'destination','spellbook',
      'initialSpells',2,
      'initialMaxSpellLevel',2,
      'additionalSpellOnNewSlotLevel',1
    )
  );
$$;

create or replace function private.wizard_school_savant(
  p_prefix text,
  p_school text,
  p_school_ru text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(
    private.wizard_subclass_feature(
      p_prefix||'-savant-rules',
      'wizard:'||p_prefix||':savant',
      'subclass:wizard:'||p_prefix||':savant',
      'Знаток '||p_school_ru,
      'Когда подкласс открыт, добавьте в книгу два заклинания Волшебника школы '||p_school_ru||' не выше 2 уровня. Каждый раз, когда уровень Волшебника впервые даёт доступ к новому уровню ячеек, добавьте в книгу ещё одно заклинание Волшебника этой школы доступного уровня; эти добавления не занимают обычные два заклинания за уровень.',
      jsonb_build_object('kind','wizard_school_savant','school',p_school,'addsToSpellbook',true,'initialSpells',2,'initialMaxSpellLevel',2,'additionalSpellOnNewSlotLevel',1)
    ),
    private.wizard_subclass_permission(
      p_prefix||'-savant-permission',
      'wizard:'||p_prefix||':savant',
      p_school,
      'Бесплатные заклинания: '||p_school_ru
    )
  );
$$;

create or replace function private.wizard_subclass_resource(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_max jsonb,
  p_recharge jsonb,
  p_initial text default 'full'
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','resource',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'max',p_max,
    'recharge',p_recharge,
    'restore','full',
    'initial',p_initial,
    'presentation',jsonb_build_object('tone','violet','display','pips')
  );
$$;

create or replace function private.wizard_subclass_action(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_economy text,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','action',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'economy',p_economy
  ) || coalesce(p_extra,'{}'::jsonb);
$$;

create or replace function private.wizard_spell_dc_formula()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind','add',
    'terms',jsonb_build_array(
      jsonb_build_object('kind','literal','value',8),
      jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
    )
  );
$$;

create or replace function private.wizard_spell_attack_formula()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind','add',
    'terms',jsonb_build_array(
      jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
    )
  );
$$;

create or replace function private.wizard_slot_options(p_from integer, p_to integer default 9)
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
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'key','slot-'||v_level::text,
      'castLevel',v_level,
      'label','Ячейка '||v_level::text||' уровня',
      'costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||v_level::text,'amount',1))
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.wizard_slot_method(p_key text, p_kind text, p_from integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'key',p_key,
    'kind',p_kind,
    'ability','intelligence',
    'saveDc',private.wizard_spell_dc_formula(),
    'attackBonus',private.wizard_spell_attack_formula(),
    'requiresPrepared',false,
    'resourceOptions',private.wizard_slot_options(p_from,9)
  );
$$;

create or replace function private.wizard_spell_mechanic(
  p_id text,
  p_source_key text,
  p_slug text,
  p_name text,
  p_level integer,
  p_school text,
  p_preparation text,
  p_methods jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','spell',
    'sourceKey',p_source_key,
    'key','spell:'||p_slug,
    'catalogSlug',p_slug,
    'variantKey',p_source_key||':'||p_slug,
    'payload',jsonb_build_object(
      'spell',jsonb_build_object('name',p_name,'level',p_level,'school',p_school),
      'preparation',jsonb_build_object('mode',p_preparation),
      'methods',p_methods
    )
  );
$$;

create or replace function private.wizard_ward_restore_actions()
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_level integer;
begin
  for v_level in 1..9 loop
    v_result := v_result || jsonb_build_array(private.wizard_subclass_action(
      'abjurer-ward-restore-slot-'||v_level::text,
      'wizard:abjurer:arcane-ward',
      'abjurer_ward_restore_slot_'||v_level::text,
      'Подпитать Тайный заслон ячейкой '||v_level::text||' уровня',
      'bonus_action',
      jsonb_build_object(
        'resourceCosts',jsonb_build_array(jsonb_build_object('key','spell_slot_'||v_level::text,'amount',1)),
        'effects',jsonb_build_array(jsonb_build_object('kind','resource','key','wizard_abjurer_arcane_ward','operation','RESTORE','amount',v_level*2)),
        'tags',jsonb_build_array('wizard','subclass','resource-conversion','slot:'||v_level::text)
      )
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.wizard_restore_slot_actions(p_prefix text, p_source_key text, p_from integer, p_to integer, p_label text)
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
        'tags',jsonb_build_array('wizard','subclass','slot-restore','slot:'||v_level::text)
      )
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.wizard_restore_by_slot_actions(p_prefix text, p_source_key text, p_from integer, p_to integer, p_target text, p_label text)
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
        'resourceCosts',jsonb_build_array(jsonb_build_object('key','spell_slot_'||v_level::text,'amount',1)),
        'effects',jsonb_build_array(jsonb_build_object('kind','resource','key',p_target,'operation','RESTORE','amount',1)),
        'tags',jsonb_build_array('wizard','subclass','resource-conversion','slot:'||v_level::text)
      )
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.upsert_wizard_2024_subclass_runtime(
  p_campaign_id uuid,
  p_parent_template_id uuid,
  p_slug text,
  p_catalog_key text,
  p_name text,
  p_description text,
  p_mechanical_summary text,
  p_level_3 jsonb,
  p_level_6 jsonb,
  p_level_10 jsonb,
  p_level_14 jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template uuid;
begin
  select id into v_template
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key=p_catalog_key and is_builtin is true
  order by is_active desc, version desc, created_at desc
  limit 1;

  if v_template is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,
      author_description,author_comment,rules_meta,created_by,is_active
    ) values (
      p_campaign_id,'subclass',p_slug,p_name,p_description,1,'[]'::jsonb,'[]'::jsonb,p_parent_template_id,3,
      p_catalog_key,'phb-2024-wizard-subclasses-runtime@1','official','Player''s Handbook 2024',true,p_mechanical_summary,
      '','',jsonb_build_object('base_class','class:wizard','rules_revision','2024','mechanics_status','READY','feature_levels',jsonb_build_array(3,6,10,14),'chat_template_actions',true,'chat_template_spells',true),null,true
    ) returning id into v_template;
  else
    update public.rule_templates
    set slug=p_slug,
        name=p_name,
        description=p_description,
        mechanics='[]'::jsonb,
        choices='[]'::jsonb,
        parent_template_id=p_parent_template_id,
        unlock_level=3,
        catalog_revision='phb-2024-wizard-subclasses-runtime@1',
        source_kind='official',
        source_label='Player''s Handbook 2024',
        is_builtin=true,
        mechanical_summary=p_mechanical_summary,
        author_description='',
        author_comment='',
        rules_meta=jsonb_build_object('base_class','class:wizard','rules_revision','2024','mechanics_status','READY','feature_levels',jsonb_build_array(3,6,10,14),'chat_template_actions',true,'chat_template_spells',true),
        is_active=true,
        updated_at=now()
    where id=v_template;
  end if;

  delete from public.rule_template_levels where template_id=v_template;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
    (v_template,3,p_level_3,'[]'::jsonb),
    (v_template,6,p_level_6,'[]'::jsonb),
    (v_template,10,p_level_10,'[]'::jsonb),
    (v_template,14,p_level_14,'[]'::jsonb);
end;
$$;

create or replace function private.install_wizard_2024_subclass_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wizard uuid;
  v_arcane_ward_max jsonb;
  v_portent_max jsonb;
begin
  perform private.install_wizard_2024_text_pack(p_campaign_id);
  perform private.install_wizard_2024_mechanics_v1(p_campaign_id);

  select id into v_wizard
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:wizard' and is_builtin is true
  order by is_active desc, version desc, created_at desc
  limit 1;
  if v_wizard is null then raise exception 'Built-in Wizard was not installed'; end if;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object('subclasses_included',true,'subclass_mechanics_status','READY','subclass_runtime_revision','phb-2024-wizard-subclasses-runtime@1'),
      updated_at=now()
  where id=v_wizard;

  v_arcane_ward_max := jsonb_build_object('kind','add','terms',jsonb_build_array(
    jsonb_build_object('kind','multiply','factors',jsonb_build_array(jsonb_build_object('kind','literal','value',2),jsonb_build_object('kind','reference','key','source.level'))),
    jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
  ));
  v_portent_max := jsonb_build_object('kind','add','terms',jsonb_build_array(
    jsonb_build_object('kind','literal','value',2),
    jsonb_build_object('kind','clamp','min',0,'max',1,'value',jsonb_build_object('kind','subtract','left',jsonb_build_object('kind','reference','key','source.level'),'right',jsonb_build_object('kind','literal','value',13)))
  ));

  perform private.upsert_wizard_2024_subclass_runtime(
    p_campaign_id,v_wizard,'wizard-abjurer','subclass:wizard:abjurer','Абьюратор',
    'Абьюратор превращает Ограждение в рабочую защиту: книгу защитных заклинаний, запас HP Тайного заслона, реакцию защиты союзника, подготовленные контрчары и сопротивление заклинаниям.',
    'Тайный заслон как отдельный запас HP, реакция защиты союзника, Контрзаклинание и Рассеивание магии как всегда подготовленные инструменты, финальная устойчивость к заклинаниям.',
    private.wizard_school_savant('abjurer','abjuration','Ограждения')
    || jsonb_build_array(
      private.wizard_subclass_resource('abjurer-arcane-ward-hp','wizard:abjurer:arcane-ward','wizard_abjurer_arcane_ward','HP Тайного заслона',v_arcane_ward_max,to_jsonb('long_rest'::text)),
      private.wizard_subclass_feature('abjurer-arcane-ward-rules','wizard:abjurer:arcane-ward','subclass:wizard:abjurer:arcane-ward','Тайный заслон','Пока действует Тайный заслон, отдельный запас HP принимает урон до HP Волшебника. Максимум запаса равен удвоенному уровню Волшебника + модификатор Интеллекта. При сотворении заклинания Ограждения ячейкой заслон восстанавливает HP на удвоенный уровень потраченной ячейки; бонусным действием можно потратить ячейку и восстановить тот же запас без сотворения заклинания.',jsonb_build_object('kind','damage_buffer','resource','wizard_abjurer_arcane_ward','maximum','2 * wizard_level + intelligence_modifier','restoreOnAbjurationSlotCast','2 * slot_level','bonusActionSlotRestore',true))
    ) || private.wizard_ward_restore_actions(),
    jsonb_build_array(
      private.wizard_subclass_feature('abjurer-projected-ward-rules','wizard:abjurer:projected-ward','subclass:wizard:abjurer:projected-ward','Переданный заслон','Когда видимое существо в пределах 30 футов получает урон, реакцией направьте свой Тайный заслон на эту цель. Урон сначала уменьшает HP заслона; если их не хватает, оставшийся урон получает защищаемое существо.',jsonb_build_object('kind','reaction_damage_buffer','resource','wizard_abjurer_arcane_ward','rangeFeet',30,'usesReaction',true)),
      private.wizard_subclass_action('abjurer-projected-ward-action','wizard:abjurer:projected-ward','wizard_abjurer_projected_ward','Передать Тайный заслон','reaction',jsonb_build_object('range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),'requirements',jsonb_build_array(jsonb_build_object('kind','resource','key','wizard_abjurer_arcane_ward','minimum',1,'label','Тайный заслон должен иметь HP')),'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','damage_buffer_redirect','payload',jsonb_build_object('resource','wizard_abjurer_arcane_ward','rangeFeet',30)))))
    ),
    jsonb_build_array(
      private.wizard_subclass_feature('abjurer-spell-breaker-rules','wizard:abjurer:spell-breaker','subclass:wizard:abjurer:spell-breaker','Разрушитель чар','Контрзаклинание и Рассеивание магии всегда подготовлены и не занимают лимит подготовки. Рассеивание магии можно сотворить бонусным действием. Если одно из этих заклинаний, сотворённое ячейкой, не останавливает чужое заклинание, потраченная ячейка возвращается тем же уровнем.',jsonb_build_object('kind','spell_breaker','alwaysPrepared',jsonb_build_array('counterspell','dispel-magic'),'dispelMagicBonusAction',true,'addProficiencyToDispelCheck',true,'refundSlotOnFailedBreak',true)),
      private.wizard_spell_mechanic('abjurer-counterspell-access','wizard:abjurer:spell-breaker','counterspell','Контрзаклинание',3,'abjuration','always_prepared',jsonb_build_array(private.wizard_slot_method('slot','reaction',3))),
      private.wizard_spell_mechanic('abjurer-dispel-magic-access','wizard:abjurer:spell-breaker','dispel-magic','Рассеивание магии',3,'abjuration','always_prepared',jsonb_build_array(private.wizard_slot_method('slot','spell',3),private.wizard_slot_method('spell-breaker-bonus-action','bonus_action',3)))
    ) || private.wizard_restore_slot_actions('abjurer_spell_breaker_refund','wizard:abjurer:spell-breaker',3,9,'Вернуть ячейку Разрушителя чар'),
    jsonb_build_array(
      private.wizard_subclass_feature('abjurer-spell-resistance-rules','wizard:abjurer:spell-resistance','subclass:wizard:abjurer:spell-resistance','Сопротивление заклинаниям','Вы получаете преимущество на спасброски против заклинаний. Урон, источником которого является заклинание, наносится вам с сопротивлением; немагические способности и эффекты не получают это ограничение автоматически.',jsonb_build_object('kind','spell_resistance','advantageOnSpellSavingThrows',true,'resistanceToSpellDamage',true)),
      jsonb_build_object('id','abjurer-spell-damage-resistance','type','grant','sourceKey','wizard:abjurer:spell-resistance','target','resistance','key','damage:spell','payload',jsonb_build_object('label','Сопротивление урону заклинаний'))
    )
  );

  perform private.upsert_wizard_2024_subclass_runtime(
    p_campaign_id,v_wizard,'wizard-diviner','subclass:wizard:diviner','Прорицатель',
    'Прорицатель играет через заранее записанные d20, восстановление ячеек после магии Прорицания и режимы Третьего глаза, которые открываются как реальные ресурсы и действия.',
    'Знамения как расходуемые d20 после долгого отдыха, возврат ячеек за Прорицание, режимы Третьего глаза и увеличение запаса знамений на 14 уровне.',
    private.wizard_school_savant('diviner','divination','Прорицания')
    || jsonb_build_array(
      private.wizard_subclass_resource('diviner-portent-dice','wizard:diviner:portent','wizard_diviner_portent','Знамения',v_portent_max,to_jsonb('long_rest'::text)),
      private.wizard_subclass_feature('diviner-portent-rules','wizard:diviner:portent','subclass:wizard:diviner:portent','Знамение','После долгого отдыха бросьте d20 за каждое доступное Знамение и запишите значения. До следующего долгого отдыха, до броска d20 видимого существа, потратьте одно Знамение и замените этот бросок записанным значением. Каждое записанное значение используется один раз.',jsonb_build_object('kind','portent','resource','wizard_diviner_portent','die','d20','replaceBeforeRoll',true,'perTurnLimit',1)),
      private.wizard_subclass_action('diviner-portent-action','wizard:diviner:portent','wizard_diviner_use_portent','Использовать Знамение','special',jsonb_build_object('resourceKey','wizard_diviner_portent','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','replace_d20_before_roll','payload',jsonb_build_object('source','recorded_portent_value')))))
    ),
    jsonb_build_array(private.wizard_subclass_feature('diviner-expert-divination-rules','wizard:diviner:expert-divination','subclass:wizard:diviner:expert-divination','Опытное прорицание','Когда вы тратите ячейку 2 уровня или выше на заклинание Прорицания, восстановите одну потраченную ячейку ниже уровня потраченной ячейки. Восстановленная ячейка не может быть выше 5 уровня и не может превысить максимум ячеек персонажа.',jsonb_build_object('kind','expert_divination','trigger','cast_divination_spell_with_slot_2_plus','maximumRestoredSlotLevel',5))) || private.wizard_restore_slot_actions('diviner_expert_restore','wizard:diviner:expert-divination',1,5,'Вернуть ячейку Опытным прорицанием'),
    jsonb_build_array(
      private.wizard_subclass_resource('diviner-third-eye-use','wizard:diviner:third-eye','wizard_diviner_third_eye','Третий глаз',to_jsonb(1),jsonb_build_array('short_rest','long_rest')),
      private.wizard_subclass_feature('diviner-third-eye-rules','wizard:diviner:third-eye','subclass:wizard:diviner:third-eye','Третий глаз','Бонусным действием выберите один режим Третьего глаза до начала короткого или долгого отдыха: тёмное зрение 120 футов, чтение любых языков или Видение невидимого без траты ячейки. Запас использования восстанавливается после короткого или долгого отдыха.',jsonb_build_object('kind','third_eye','resource','wizard_diviner_third_eye','options',jsonb_build_array('darkvision','read_languages','see_invisibility'))),
      private.wizard_subclass_action('diviner-third-eye-darkvision','wizard:diviner:third-eye','wizard_diviner_third_eye_darkvision','Третий глаз: тёмное зрение','bonus_action',jsonb_build_object('resourceKey','wizard_diviner_third_eye','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','third_eye_mode','payload',jsonb_build_object('mode','darkvision','rangeFeet',120))))),
      private.wizard_subclass_action('diviner-third-eye-read-languages','wizard:diviner:third-eye','wizard_diviner_third_eye_read_languages','Третий глаз: читать языки','bonus_action',jsonb_build_object('resourceKey','wizard_diviner_third_eye','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','third_eye_mode','payload',jsonb_build_object('mode','read_languages'))))),
      private.wizard_subclass_action('diviner-third-eye-see-invisibility','wizard:diviner:third-eye','wizard_diviner_third_eye_see_invisibility','Третий глаз: видеть невидимое','bonus_action',jsonb_build_object('resourceKey','wizard_diviner_third_eye','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','third_eye_mode','payload',jsonb_build_object('mode','see_invisibility')))))
    ),
    jsonb_build_array(private.wizard_subclass_feature('diviner-greater-portent-rules','wizard:diviner:portent','subclass:wizard:diviner:greater-portent','Великое знамение','После достижения 14 уровня Волшебника запас Знамений после долгого отдыха становится равен трём d20 вместо двух. Все правила записи, траты и замены броска остаются теми же.',jsonb_build_object('kind','portent_upgrade','resource','wizard_diviner_portent','newMaximum',3)))
  );

  perform private.upsert_wizard_2024_subclass_runtime(
    p_campaign_id,v_wizard,'wizard-evoker','subclass:wizard:evoker','Воплотитель',
    'Воплотитель усиливает прямой урон: половина урона заговоров при неудачном попадании, безопасные зоны в массовых Воплощениях, Интеллект к урону и Перегрузка.',
    'Частичный урон заговоров, защита союзников от собственных областей, модификатор Интеллекта к Воплощению и разовая безопасная Перегрузка после долгого отдыха.',
    private.wizard_school_savant('evoker','evocation','Воплощения')
    || jsonb_build_array(private.wizard_subclass_feature('evoker-potent-cantrip-rules','wizard:evoker:potent-cantrip','subclass:wizard:evoker:potent-cantrip','Мощный заговор','Когда заговор Волшебника наносит урон существу, промах атакой заклинанием или успешный спасбросок цели не отменяет урон полностью: цель получает половину урона заговора. Дополнительные эффекты этого заговора при таком частичном результате не применяются.',jsonb_build_object('kind','potent_cantrip','appliesTo','wizard_cantrip_damage','missOrSuccessfulSave','half_damage','noAdditionalEffects',true))),
    jsonb_build_array(private.wizard_subclass_feature('evoker-sculpt-spells-rules','wizard:evoker:sculpt-spells','subclass:wizard:evoker:sculpt-spells','Ваяние заклинаний','Когда вы накладываете заклинание Воплощения, которое затрагивает видимых существ, выберите до 1 + уровень заклинания таких существ. Выбранные существа автоматически успешно проходят спасброски против этого заклинания и не получают урон, если при успехе обычно получили бы половину.',jsonb_build_object('kind','sculpt_spells','school','evocation','protectedCreaturesFormula','1 + spell_level','autoSaveSuccess',true,'negatesHalfDamageOnSuccessfulSave',true))),
    jsonb_build_array(private.wizard_subclass_feature('evoker-empowered-evocation-rules','wizard:evoker:empowered-evocation','subclass:wizard:evoker:empowered-evocation','Усиленное воплощение','Когда вы накладываете заклинание Волшебника школы Воплощения, добавьте модификатор Интеллекта к одному броску урона этого заклинания. Бонус применяется один раз на заклинание, даже если урон распределён по нескольким целям.',jsonb_build_object('kind','spell_damage_modifier','appliesTo','wizard_evocation_spell','modifier','intelligence_modifier','oncePerSpell',true))),
    jsonb_build_array(
      private.wizard_subclass_resource('evoker-overchannel-safe-use','wizard:evoker:overchannel','wizard_evoker_overchannel_safe','Безопасная перегрузка',to_jsonb(1),to_jsonb('long_rest'::text)),
      private.wizard_subclass_feature('evoker-overchannel-rules','wizard:evoker:overchannel','subclass:wizard:evoker:overchannel','Перегрузка','Когда вы накладываете заклинание Волшебника ячейкой 1–5 уровня и оно наносит урон в ход сотворения, можно назначить максимальный урон вместо броска. Первое использование после долгого отдыха тратит запас Безопасной перегрузки; повторные использования до долгого отдыха требуют ручного учёта отдачи: сначала 2d12 некротического урона за уровень ячейки, затем на 1d12 за уровень ячейки больше за каждую следующую перегрузку.',jsonb_build_object('kind','overchannel','resource','wizard_evoker_overchannel_safe','spellSlotMin',1,'spellSlotMax',5,'maximizeDamageThisTurn',true,'repeatNecroticBacklash',jsonb_build_object('firstRepeatDicePerSlotLevel','2d12','additionalRepeatDicePerSlotLevel','1d12','ignoresResistanceAndImmunity',true))),
      private.wizard_subclass_action('evoker-overchannel-safe-action','wizard:evoker:overchannel','wizard_evoker_overchannel_safe','Перегрузить заклинание без отдачи','special',jsonb_build_object('resourceKey','wizard_evoker_overchannel_safe','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','maximize_spell_damage','payload',jsonb_build_object('slotMin',1,'slotMax',5)))))
    )
  );

  perform private.upsert_wizard_2024_subclass_runtime(
    p_campaign_id,v_wizard,'wizard-illusionist','subclass:wizard:illusionist','Иллюзионист',
    'Иллюзионист получает бессловесные и дальние иллюзии, улучшенную Малую иллюзию, подготовленные призывы-фантомы, защитного двойника и временно реальный объект.',
    'Улучшенная Малая иллюзия, бесплатные призрачные призывы через ресурсы, реакция Иллюзорного я с восстановлением ячейкой и Иллюзорная реальность как бонусное действие.',
    private.wizard_school_savant('illusionist','illusion','Иллюзии')
    || jsonb_build_array(
      private.wizard_subclass_feature('illusionist-improved-illusions-rules','wizard:illusionist:improved-illusions','subclass:wizard:illusionist:improved-illusions','Улучшенные иллюзии','Заклинания Иллюзии можно накладывать без словесных компонентов; жестовые и материальные компоненты остаются. Дальность ваших заклинаний Иллюзии с базовой дальностью 10 футов или больше увеличивается на 60 футов. Вы знаете Малую иллюзию сверх лимита заговоров; при её сотворении можно создать звук и изображение вместе, а также использовать бонусное действие.',jsonb_build_object('kind','improved_illusions','removeVerbalComponentsFromIllusionSpells',true,'rangeBonusFeet',60,'minorIllusion',jsonb_build_object('granted',true,'soundAndImageTogether',true,'canCastAsBonusAction',true))),
      private.wizard_spell_mechanic('illusionist-minor-illusion-access','wizard:illusionist:improved-illusions','minor-illusion','Малая иллюзия',0,'illusion','not_required',jsonb_build_array(jsonb_build_object('key','cantrip','kind','cantrip','ability','intelligence','saveDc',private.wizard_spell_dc_formula(),'requiresPrepared',false)))
    ),
    jsonb_build_array(
      private.wizard_subclass_resource('illusionist-free-summon-beast-resource','wizard:illusionist:phantasmal-creatures','wizard_illusionist_free_summon_beast','Призрачный зверь без ячейки',to_jsonb(1),to_jsonb('long_rest'::text)),
      private.wizard_subclass_resource('illusionist-free-summon-fey-resource','wizard:illusionist:phantasmal-creatures','wizard_illusionist_free_summon_fey','Призрачная фея без ячейки',to_jsonb(1),to_jsonb('long_rest'::text)),
      private.wizard_subclass_feature('illusionist-phantasmal-creatures-rules','wizard:illusionist:phantasmal-creatures','subclass:wizard:illusionist:phantasmal-creatures','Фантомные существа','Призыв зверя и Призыв феи всегда подготовлены и не занимают лимит подготовки. Когда вы накладываете одно из этих заклинаний, оно может считаться Иллюзией, а призванное существо выглядит призрачным. Каждое из двух заклинаний можно сотворить без ячейки один раз до долгого отдыха; существо от бесплатного сотворения получает половину обычных HP.',jsonb_build_object('kind','phantasmal_creatures','alwaysPrepared',jsonb_build_array('summon-beast','summon-fey'),'canTreatAsIllusion',true,'freeCastEachPerLongRest',true,'freeCastSummonHpMultiplier',0.5)),
      private.wizard_spell_mechanic('illusionist-summon-beast-access','wizard:illusionist:phantasmal-creatures','summon-beast','Призыв зверя',2,'conjuration','always_prepared',jsonb_build_array(private.wizard_slot_method('slot','spell',2),jsonb_build_object('key','phantom-free','kind','spell','ability','intelligence','saveDc',private.wizard_spell_dc_formula(),'requiresPrepared',false,'resourceOptions',jsonb_build_array(jsonb_build_object('key','free','label','Бесплатный призрачный призыв','costs',jsonb_build_array(jsonb_build_object('key','wizard_illusionist_free_summon_beast','amount',1))))))),
      private.wizard_spell_mechanic('illusionist-summon-fey-access','wizard:illusionist:phantasmal-creatures','summon-fey','Призыв феи',3,'conjuration','always_prepared',jsonb_build_array(private.wizard_slot_method('slot','spell',3),jsonb_build_object('key','phantom-free','kind','spell','ability','intelligence','saveDc',private.wizard_spell_dc_formula(),'requiresPrepared',false,'resourceOptions',jsonb_build_array(jsonb_build_object('key','free','label','Бесплатный призрачный призыв','costs',jsonb_build_array(jsonb_build_object('key','wizard_illusionist_free_summon_fey','amount',1)))))))
    ),
    jsonb_build_array(
      private.wizard_subclass_resource('illusionist-illusory-self-resource','wizard:illusionist:illusory-self','wizard_illusionist_illusory_self','Иллюзорное я',to_jsonb(1),jsonb_build_array('short_rest','long_rest')),
      private.wizard_subclass_feature('illusionist-illusory-self-rules','wizard:illusionist:illusory-self','subclass:wizard:illusionist:illusory-self','Иллюзорное я','Когда существо попадает по вам броском атаки, реакцией потратьте запас Иллюзорного я: эта атака автоматически промахивается, затем иллюзия исчезает. Запас восстанавливается после короткого или долгого отдыха; его также можно восстановить без действия, потратив ячейку 2 уровня или выше.',jsonb_build_object('kind','illusory_self','resource','wizard_illusionist_illusory_self','trigger','hit_by_attack_roll','effect','attack_misses','restoreBySlotMinLevel',2)),
      private.wizard_subclass_action('illusionist-illusory-self-action','wizard:illusionist:illusory-self','wizard_illusionist_illusory_self','Подставить Иллюзорное я','reaction',jsonb_build_object('resourceKey','wizard_illusionist_illusory_self','resourceCost',1,'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','force_attack_miss','payload',jsonb_build_object('trigger','hit_by_attack_roll')))))
    ) || private.wizard_restore_by_slot_actions('illusionist_restore_illusory_self','wizard:illusionist:illusory-self',2,9,'wizard_illusionist_illusory_self','Восстановить Иллюзорное я ячейкой'),
    jsonb_build_array(
      private.wizard_subclass_feature('illusionist-illusory-reality-rules','wizard:illusionist:illusory-reality','subclass:wizard:illusionist:illusory-reality','Иллюзорная реальность','Когда вы накладываете заклинание Иллюзии ячейкой, выберите один немагический неодушевлённый объект, являющийся частью иллюзии, и сделайте его реальным на 1 минуту. Пока заклинание продолжается, на своём ходу можно сделать это бонусным действием. Такой объект не наносит урон и не накладывает состояния.',jsonb_build_object('kind','illusory_reality','duration','1_minute','object','nonmagical_inanimate_part_of_illusion','cannotDealDamage',true,'cannotApplyConditions',true)),
      private.wizard_subclass_action('illusionist-illusory-reality-action','wizard:illusionist:illusory-reality','wizard_illusionist_illusory_reality','Сделать иллюзию реальной','bonus_action',jsonb_build_object('effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','make_illusion_object_real','payload',jsonb_build_object('duration','1_minute','cannotDealDamage',true,'cannotApplyConditions',true)))))
    )
  );
end;
$$;

create or replace function private.install_wizard_2024_subclass_runtime_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_wizard_2024_subclass_runtime_v1(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzz_campaigns_install_wizard_2024_subclass_runtime on public.campaigns;
create trigger zzzzz_campaigns_install_wizard_2024_subclass_runtime
after insert on public.campaigns
for each row execute function private.install_wizard_2024_subclass_runtime_after_campaign();

do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_wizard_2024_subclass_runtime_v1(v_campaign.id);
  end loop;
end
$$;

commit;
