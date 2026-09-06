-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:warlock
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/warlockPhb2024SubclassesRuntime.test.ts
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

create or replace function private.warlock_subclass_feature_v1(
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
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', p_id,
    'type', 'grant',
    'target', 'feature',
    'key', p_key,
    'sourceKey', p_source_key,
    'payload', jsonb_build_object(
      'label', p_label,
      'description', p_description,
      'mechanic', coalesce(p_mechanic, '{}'::jsonb)
    )
  );
$$;

create or replace function private.warlock_subclass_resource_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_max jsonb,
  p_recharge jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', p_id,
    'type', 'resource',
    'sourceKey', p_source_key,
    'key', p_key,
    'label', p_label,
    'max', p_max,
    'recharge', p_recharge,
    'initial', 'full',
    'presentation', jsonb_build_object('tone','violet','display','pips')
  );
$$;

create or replace function private.warlock_subclass_action_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_economy text,
  p_costs jsonb default '[]'::jsonb,
  p_effects jsonb default '[]'::jsonb,
  p_tags jsonb default '["warlock","subclass"]'::jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id,
    'type', 'action',
    'sourceKey', p_source_key,
    'key', p_key,
    'label', p_label,
    'economy', p_economy,
    'resourceCosts', case when jsonb_array_length(coalesce(p_costs,'[]'::jsonb)) > 0 then p_costs else null end,
    'effects', case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb)) > 0 then p_effects else null end,
    'tags', p_tags
  ));
$$;

create or replace function private.warlock_subclass_spell_v1(
  p_patron text,
  p_slug text,
  p_unlock_level integer,
  p_stage_level integer
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_spell public.spell_catalog%rowtype;
  v_cast_level integer;
  v_method jsonb;
begin
  select * into v_spell
  from public.spell_catalog
  where slug = p_slug;

  if not found then
    raise exception 'WARLOCK_PATRON_SPELL_MISSING:%', p_slug;
  end if;

  v_cast_level := case
    when p_stage_level >= 9 then 5
    when p_stage_level >= 7 then 4
    when p_stage_level >= 5 then 3
    else 2
  end;

  v_method := jsonb_build_object(
    'key', format('pact-%s', case when v_spell.spell_level = 0 then 0 else v_cast_level end),
    'kind', 'pact_magic',
    'ability', 'charisma',
    'saveDc', jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','literal','value',8),
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'attackBonus', jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'requiresPrepared', false
  );

  if v_spell.spell_level > 0 then
    v_method := v_method || jsonb_build_object(
      'resourceOptions', jsonb_build_array(jsonb_build_object(
        'key', format('pact-%s', v_cast_level),
        'castLevel', v_cast_level,
        'costs', jsonb_build_array(jsonb_build_object('key','warlock_pact_slots','amount',1))
      ))
    );
  end if;

  return jsonb_build_object(
    'id', format('%s-spell-%s-l%s', p_patron, p_slug, p_stage_level),
    'type', 'spell',
    'sourceKey', format('warlock:%s:patron-spells', p_patron),
    'key', format('spell:%s', p_slug),
    'catalogSlug', p_slug,
    'variantKey', format('warlock-subclass:%s:%s', p_patron, p_slug),
    'grantOperation', case when p_stage_level > p_unlock_level then 'REPLACE' else 'GRANT' end,
    'priority', p_stage_level,
    'payload', jsonb_build_object(
      'spell', jsonb_build_object(
        'name', coalesce(nullif(v_spell.name_ru,''), v_spell.name_en, p_slug),
        'level', v_spell.spell_level,
        'school', v_spell.school
      ),
      'preparation', jsonb_build_object('mode','always_prepared'),
      'methods', jsonb_build_array(v_method)
    )
  );
end;
$$;

create or replace function private.warlock_patron_spells_for_level_v1(
  p_patron text,
  p_stage_level integer
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_record record;
begin
  for v_record in
    select *
    from (values
      ('archfey','calm-emotions',3),('archfey','faerie-fire',3),('archfey','misty-step',3),('archfey','phantasmal-force',3),('archfey','sleep',3),
      ('archfey','blink',5),('archfey','plant-growth',5),('archfey','dominate-beast',7),('archfey','greater-invisibility',7),('archfey','dominate-person',9),('archfey','seeming',9),
      ('celestial','aid',3),('celestial','cure-wounds',3),('celestial','guiding-bolt',3),('celestial','lesser-restoration',3),('celestial','light',3),('celestial','sacred-flame',3),
      ('celestial','daylight',5),('celestial','revivify',5),('celestial','guardian-of-faith',7),('celestial','wall-of-fire',7),('celestial','greater-restoration',9),('celestial','summon-celestial',9),
      ('fiend','burning-hands',3),('fiend','command',3),('fiend','scorching-ray',3),('fiend','suggestion',3),('fiend','fireball',5),('fiend','stinking-cloud',5),
      ('fiend','fire-shield',7),('fiend','wall-of-fire',7),('fiend','geas',9),('fiend','insect-plague',9),
      ('great-old-one','detect-thoughts',3),('great-old-one','dissonant-whispers',3),('great-old-one','phantasmal-force',3),('great-old-one','hideous-laughter',3),
      ('great-old-one','clairvoyance',5),('great-old-one','hunger-of-hadar',5),('great-old-one','confusion',7),('great-old-one','summon-aberration',7),('great-old-one','modify-memory',9),('great-old-one','telekinesis',9)
    ) as x(patron, slug, unlock_level)
    join public.spell_catalog sc on sc.slug = x.slug
    where x.patron = p_patron
      and x.unlock_level <= p_stage_level
      and (sc.spell_level > 0 or x.unlock_level = p_stage_level)
    order by x.unlock_level, x.slug
  loop
    v_result := v_result || jsonb_build_array(private.warlock_subclass_spell_v1(p_patron, v_record.slug, v_record.unlock_level, p_stage_level));
  end loop;
  return v_result;
end;
$$;

create or replace function private.warlock_subclass_upsert_v1(
  p_campaign_id uuid,
  p_parent_id uuid,
  p_catalog_key text,
  p_slug text,
  p_name text,
  p_description text,
  p_summary text,
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
  where campaign_id = p_campaign_id
    and catalog_key = p_catalog_key
    and is_builtin = true
  order by updated_at desc
  limit 1;

  if v_template_id is null then
    insert into public.rule_templates (
      campaign_id, kind, slug, name, description, version, mechanics, choices,
      is_active, parent_template_id, unlock_level, catalog_key, catalog_revision,
      source_kind, source_label, is_builtin, mechanical_summary, rules_meta
    ) values (
      p_campaign_id, 'subclass', p_slug, p_name, p_description, 1, '[]'::jsonb, '[]'::jsonb,
      true, p_parent_id, 3, p_catalog_key, 'xphb-2024-warlock-subclasses-runtime-v1',
      'official', 'Player''s Handbook 2024', true, p_summary,
      jsonb_build_object(
        'base_class','class:warlock','rules_revision','2024','mechanics_status','READY',
        'feature_levels',jsonb_build_array(3,6,10,14),
        'patron_spell_unlock_levels',jsonb_build_array(3,5,7,9),
        'chat_template_actions',true,'chat_template_spells',true
      )
    ) returning id into v_template_id;
  else
    update public.rule_templates
    set kind = 'subclass', slug = p_slug, name = p_name, description = p_description,
        mechanics = '[]'::jsonb, choices = '[]'::jsonb, is_active = true,
        parent_template_id = p_parent_id, unlock_level = 3,
        catalog_revision = 'xphb-2024-warlock-subclasses-runtime-v1',
        source_kind = 'official', source_label = 'Player''s Handbook 2024', is_builtin = true,
        mechanical_summary = p_summary,
        rules_meta = coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
          'base_class','class:warlock','rules_revision','2024','mechanics_status','READY',
          'feature_levels',jsonb_build_array(3,6,10,14),
          'patron_spell_unlock_levels',jsonb_build_array(3,5,7,9),
          'chat_template_actions',true,'chat_template_spells',true
        ),
        updated_at = now()
    where id = v_template_id;
  end if;

  delete from public.rule_template_levels where template_id = v_template_id;
  for v_level in select * from jsonb_array_elements(p_levels) x(value)
  loop
    insert into public.rule_template_levels (template_id, level, mechanics, choices)
    values (
      v_template_id,
      (v_level.value->>'level')::integer,
      coalesce(v_level.value->'mechanics','[]'::jsonb),
      coalesce(v_level.value->'choices','[]'::jsonb)
    );
  end loop;

  return v_template_id;
end;
$$;

create or replace function private.install_warlock_phb2024_subclasses_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_parent_id uuid;
  v_cha_max jsonb := jsonb_build_object('kind','max','values',jsonb_build_array(jsonb_build_object('kind','literal','value',1),jsonb_build_object('kind','reference','key','abilities.charisma.modifier')));
  v_level_plus_one jsonb := jsonb_build_object('kind','add','terms',jsonb_build_array(jsonb_build_object('kind','literal','value',1),jsonb_build_object('kind','reference','key','source.level')));
  v_resilience_choice jsonb;
  v_healing_actions jsonb := '[]'::jsonb;
  i integer;
begin
  perform private.apply_warlock_base_runtime_v1(p_campaign_id);
  perform private.apply_warlock_invocations_runtime_v1(p_campaign_id);
  perform private.apply_warlock_stage4_choice_policy_v1(p_campaign_id);

  select id into v_parent_id
  from public.rule_templates
  where campaign_id = p_campaign_id
    and catalog_key = 'class:warlock'
    and kind = 'class'
    and is_builtin = true
  order by updated_at desc
  limit 1;

  if v_parent_id is null then
    raise exception 'WARLOCK_PARENT_MISSING:%', p_campaign_id;
  end if;

  update public.rule_templates
  set rules_meta = coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
        'subclass_runtime_included', true,
        'subclass_runtime_count', 4,
        'subclass_runtime_scope', 'PHB_2024_4',
        'subclass_runtime_revision', 'xphb-2024-warlock-subclasses-runtime-v1'
      ),
      updated_at = now()
  where id = v_parent_id;

  for i in 1..5 loop
    v_healing_actions := v_healing_actions || jsonb_build_array(private.warlock_subclass_action_v1(
      format('celestial-healing-light-%s',i), 'warlock:celestial:healing-light', format('warlock_celestial_healing_light_%sd6',i),
      format('Лечащий свет: %sd6',i), 'bonus_action',
      jsonb_build_array(jsonb_build_object('key','warlock_celestial_healing_light','amount',i)),
      jsonb_build_array(jsonb_build_object('kind','semantic','key','healing','payload',jsonb_build_object('dice',jsonb_build_object('count',i,'sides',6),'rangeFeet',60,'maximumDice','charisma_modifier_min_1'))),
      '["warlock","subclass","healing-light"]'::jsonb
    ));
  end loop;

  v_resilience_choice := jsonb_build_object(
    'key','warlock_fiend_fiendish_resilience','label','Стойкость исчадия: тип урона','target','trait',
    'selection_mode','player_once','refresh','short_or_long_rest','count',1,
    'options',jsonb_build_array('acid','bludgeoning','cold','fire','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'),
    'option_labels',jsonb_build_object('acid','Кислота','bludgeoning','Дробящий','cold','Холод','fire','Огонь','lightning','Электричество','necrotic','Некротический','piercing','Колющий','poison','Яд','psychic','Психический','radiant','Сияющий','slashing','Рубящий','thunder','Звук'),
    'option_mechanics',jsonb_build_object(
      'acid',jsonb_build_array(jsonb_build_object('id','fiend-resilience-acid','type','grant','target','resistance','key','damage:acid','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Кислота'))),
      'bludgeoning',jsonb_build_array(jsonb_build_object('id','fiend-resilience-bludgeoning','type','grant','target','resistance','key','damage:bludgeoning','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Дробящий'))),
      'cold',jsonb_build_array(jsonb_build_object('id','fiend-resilience-cold','type','grant','target','resistance','key','damage:cold','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Холод'))),
      'fire',jsonb_build_array(jsonb_build_object('id','fiend-resilience-fire','type','grant','target','resistance','key','damage:fire','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Огонь'))),
      'lightning',jsonb_build_array(jsonb_build_object('id','fiend-resilience-lightning','type','grant','target','resistance','key','damage:lightning','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Электричество'))),
      'necrotic',jsonb_build_array(jsonb_build_object('id','fiend-resilience-necrotic','type','grant','target','resistance','key','damage:necrotic','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Некротический'))),
      'piercing',jsonb_build_array(jsonb_build_object('id','fiend-resilience-piercing','type','grant','target','resistance','key','damage:piercing','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Колющий'))),
      'poison',jsonb_build_array(jsonb_build_object('id','fiend-resilience-poison','type','grant','target','resistance','key','damage:poison','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Яд'))),
      'psychic',jsonb_build_array(jsonb_build_object('id','fiend-resilience-psychic','type','grant','target','resistance','key','damage:psychic','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Психический'))),
      'radiant',jsonb_build_array(jsonb_build_object('id','fiend-resilience-radiant','type','grant','target','resistance','key','damage:radiant','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Сияющий'))),
      'slashing',jsonb_build_array(jsonb_build_object('id','fiend-resilience-slashing','type','grant','target','resistance','key','damage:slashing','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Рубящий'))),
      'thunder',jsonb_build_array(jsonb_build_object('id','fiend-resilience-thunder','type','grant','target','resistance','key','damage:thunder','sourceKey','warlock:fiend:fiendish-resilience','payload',jsonb_build_object('label','Сопротивление: Звук')))
    )
  );

  perform private.warlock_subclass_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:archfey','warlock-archfey','Архифея',
    'Покровительство Архифеи превращает Туманный шаг в основной инструмент перемещения, защиты и давления.',
    'Всегда подготовленные заклинания Архифеи, бесплатные Туманные шаги, новые эффекты шага, Фейская защита и Блуждающие чары.',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',private.warlock_patron_spells_for_level_v1('archfey',3) || jsonb_build_array(
        private.warlock_subclass_feature_v1('archfey-steps-rules','warlock:archfey:steps','warlock_archfey_steps_of_the_fey','Шаги фей','Туманный шаг можно бесплатно сотворить число раз, равное модификатору Харизмы (минимум 1), с полным восстановлением после долгого отдыха. Каждый такой шаг получает дополнительный эффект по правилам способности.',jsonb_build_object('kind','archfey_steps_of_the_fey','freeMistyStepUses','charisma_modifier_min_1','refreshingStep',jsonb_build_object('tempHp','1d10','rangeFeet',10),'tauntingStep',jsonb_build_object('radiusFeet',5,'save','wisdom','duration','until_start_of_next_turn'))),
        private.warlock_subclass_resource_v1('archfey-steps-resource','warlock:archfey:steps','warlock_archfey_steps_of_the_fey','Шаги фей',v_cha_max,to_jsonb('long_rest'::text)),
        jsonb_build_object('id','archfey-free-misty-step','type','spell','sourceKey','warlock:archfey:steps','key','spell:misty-step','catalogSlug','misty-step','variantKey','warlock-subclass:archfey:steps-of-the-fey','payload',jsonb_build_object('spell',jsonb_build_object('name','Туманный шаг','level',2,'school','Conjuration'),'preparation',jsonb_build_object('mode','always_prepared'),'methods',jsonb_build_array(jsonb_build_object('key','steps-of-the-fey','kind','class_feature','ability','charisma','requiresPrepared',false,'resourceOptions',jsonb_build_array(jsonb_build_object('key','free-step','castLevel',2,'costs',jsonb_build_array(jsonb_build_object('key','warlock_archfey_steps_of_the_fey','amount',1))))))))
      ),'choices','[]'::jsonb),
      jsonb_build_object('level',5,'mechanics',private.warlock_patron_spells_for_level_v1('archfey',5),'choices','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('archfey-misty-escape','warlock:archfey:misty-escape','warlock_archfey_misty_escape','Туманный побег','Получив урон, колдун может сотворить Туманный шаг реакцией и применить новые варианты шага.',jsonb_build_object('kind','archfey_misty_escape','reactionTrigger','takes_damage','disappearingStep',true,'dreadfulStep',jsonb_build_object('radiusFeet',5,'damage','2d10','damageType','psychic','save','wisdom'),'gm_trigger_gate',true))),'choices','[]'::jsonb),
      jsonb_build_object('level',7,'mechanics',private.warlock_patron_spells_for_level_v1('archfey',7),'choices','[]'::jsonb),
      jsonb_build_object('level',9,'mechanics',private.warlock_patron_spells_for_level_v1('archfey',9),'choices','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(
        private.warlock_subclass_feature_v1('archfey-beguiling-rules','warlock:archfey:beguiling-defenses','warlock_archfey_beguiling_defenses','Фейская защита','Колдун невосприимчив к Очарованию и ограниченно может реакцией уменьшить урон с ответным психическим эффектом.',jsonb_build_object('kind','archfey_beguiling_defenses','reaction',true,'halveDamage',true,'retaliationSave','wisdom','retaliationDamage','damage_taken','gm_hit_gate',true)),
        jsonb_build_object('id','archfey-charmed-immunity','type','grant','sourceKey','warlock:archfey:beguiling-defenses','target','immunity','key','condition:charmed','payload',jsonb_build_object('label','Невосприимчивость к Очарованию')),
        private.warlock_subclass_resource_v1('archfey-beguiling-resource','warlock:archfey:beguiling-defenses','warlock_archfey_beguiling_defenses','Фейская защита','1'::jsonb,to_jsonb('long_rest'::text)),
        private.warlock_subclass_action_v1('archfey-beguiling-action','warlock:archfey:beguiling-defenses','warlock_archfey_beguiling_defenses','Фейская защита','reaction',jsonb_build_array(jsonb_build_object('key','warlock_archfey_beguiling_defenses','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','reduce_and_reflect_damage','payload',jsonb_build_object('fraction',0.5,'save','wisdom','reflectedType','psychic','gm_hit_gate',true)))),
        private.warlock_subclass_action_v1('warlock_archfey_beguiling_defenses-restore-by-pact-slot','warlock:archfey:beguiling-defenses','warlock_archfey_beguiling_defenses_restore_by_pact_slot','Восстановить Фейскую защиту ячейкой Магии договора','no_action',jsonb_build_array(jsonb_build_object('key','warlock_pact_slots','amount',1)),jsonb_build_array(jsonb_build_object('kind','resource','key','warlock_archfey_beguiling_defenses','operation','RESTORE','amount',1)))
      ),'choices','[]'::jsonb),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('archfey-bewitching','warlock:archfey:bewitching-magic','warlock_archfey_bewitching_magic','Блуждающие чары','После заклинания Очарования или Иллюзии действием и с расходом ячейки можно частью того же действия бесплатно сотворить Туманный шаг.',jsonb_build_object('kind','archfey_bewitching_magic','triggerSchools',jsonb_build_array('enchantment','illusion'),'requiresAction',true,'requiresSpellSlot',true,'freeSpell','misty-step','gm_trigger_gate',true))),'choices','[]'::jsonb)
    )
  );

  perform private.warlock_subclass_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:celestial','warlock-celestial','Небожитель',
    'Покровительство Небожителя даёт собственный запас лечения и усиливает светлую и огненную магию.',
    'Всегда подготовленные небесные заклинания, Лечащий свет, Сияющая душа, Небесная стойкость и Испепеляющая месть.',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',private.warlock_patron_spells_for_level_v1('celestial',3) || jsonb_build_array(
        private.warlock_subclass_feature_v1('celestial-healing-light-rules','warlock:celestial:healing-light','warlock_celestial_healing_light','Лечащий свет','Запас d6 равен уровню Колдуна + 1. Бонусным действием можно лечить себя или видимое существо в 60 футах, расходуя ограниченное число костей; запас восстанавливается после долгого отдыха.',jsonb_build_object('kind','celestial_healing_light','die','d6','pool','warlock_level_plus_1','maxDicePerUse','charisma_modifier_min_1','rangeFeet',60)),
        private.warlock_subclass_resource_v1('celestial-healing-light-resource','warlock:celestial:healing-light','warlock_celestial_healing_light','Кости Лечащего света',v_level_plus_one,to_jsonb('long_rest'::text))
      ) || v_healing_actions,'choices','[]'::jsonb),
      jsonb_build_object('level',5,'mechanics',private.warlock_patron_spells_for_level_v1('celestial',5),'choices','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(
        private.warlock_subclass_feature_v1('celestial-radiant-soul-rules','warlock:celestial:radiant-soul','warlock_celestial_radiant_soul','Сияющая душа','Колдун получает сопротивление сияющему урону и один раз за ход усиливает одной целью сияющий или огненный урон заклинания модификатором Харизмы.',jsonb_build_object('kind','celestial_radiant_soul','damageTypes',jsonb_build_array('radiant','fire'),'bonus','charisma_modifier','cadence','once_per_turn','gm_turn_gate',true)),
        jsonb_build_object('id','celestial-radiant-resistance','type','grant','sourceKey','warlock:celestial:radiant-soul','target','resistance','key','damage:radiant','payload',jsonb_build_object('label','Сопротивление сияющему урону'))
      ),'choices','[]'::jsonb),
      jsonb_build_object('level',7,'mechanics',private.warlock_patron_spells_for_level_v1('celestial',7),'choices','[]'::jsonb),
      jsonb_build_object('level',9,'mechanics',private.warlock_patron_spells_for_level_v1('celestial',9),'choices','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('celestial-resilience-rules','warlock:celestial:resilience','warlock_celestial_resilience','Небесная стойкость','После Магической хитрости, короткого или долгого отдыха колдун получает временные хиты и может дать временные хиты до пяти видимых существ.',jsonb_build_object('kind','celestial_resilience','triggers',jsonb_build_array('magical_cunning','short_rest','long_rest'),'selfTempHp','warlock_level_plus_charisma','allyCount',5,'allyTempHp','floor_half_warlock_level_plus_charisma','gm_target_gate',true))),'choices','[]'::jsonb),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(
        private.warlock_subclass_feature_v1('celestial-searing-rules','warlock:celestial:searing-vengeance','warlock_celestial_searing_vengeance','Испепеляющая месть','Когда колдун или союзник в 60 футах собирается сделать спасбросок от смерти, способность восстанавливает хиты цели и поражает выбранных врагов сияющей вспышкой. Использование восстанавливается после долгого отдыха.',jsonb_build_object('kind','celestial_searing_vengeance','trigger','about_to_make_death_save','rangeFeet',60,'heal','half_max_hp','areaFeet',30,'damage','2d8_plus_charisma','damageType','radiant','blindedUntil','end_of_current_turn','gm_trigger_gate',true)),
        private.warlock_subclass_resource_v1('celestial-searing-resource','warlock:celestial:searing-vengeance','warlock_celestial_searing_vengeance','Испепеляющая месть','1'::jsonb,to_jsonb('long_rest'::text)),
        private.warlock_subclass_action_v1('celestial-searing-action','warlock:celestial:searing-vengeance','warlock_celestial_searing_vengeance','Испепеляющая месть','no_action',jsonb_build_array(jsonb_build_object('key','warlock_celestial_searing_vengeance','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','searing_vengeance','payload',jsonb_build_object('rangeFeet',60,'heal','half_max_hp','damage','2d8_plus_charisma','damageType','radiant','gm_trigger_gate',true))))
      ),'choices','[]'::jsonb)
    )
  );

  perform private.warlock_subclass_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:fiend','warlock-fiend','Исчадие',
    'Покровительство Исчадия вознаграждает гибель врагов, искажает удачу и позволяет переживать выбранный тип урона.',
    'Всегда подготовленные инфернальные заклинания, Благословение Тёмного, Удача Тёмного, Стойкость исчадия и Бросок сквозь Ад.',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',private.warlock_patron_spells_for_level_v1('fiend',3) || jsonb_build_array(private.warlock_subclass_feature_v1('fiend-blessing-rules','warlock:fiend:dark-ones-blessing','warlock_fiend_dark_ones_blessing','Благословение Тёмного','Когда враг падает до 0 хитов от колдуна или другого существа рядом с ним, колдун получает временные хиты, равные уровню Колдуна + модификатору Харизмы.',jsonb_build_object('kind','fiend_dark_ones_blessing','trigger','enemy_reduced_to_zero','allyTriggerRadiusFeet',10,'tempHp','charisma_plus_warlock_level_min_1','gm_trigger_gate',true))),'choices','[]'::jsonb),
      jsonb_build_object('level',5,'mechanics',private.warlock_patron_spells_for_level_v1('fiend',5),'choices','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(
        private.warlock_subclass_feature_v1('fiend-luck-rules','warlock:fiend:dark-ones-own-luck','warlock_fiend_dark_ones_own_luck','Удача Тёмного','После проверки характеристики или спасброска до применения результата можно добавить 1d10. Использований за долгий отдых равно модификатору Харизмы, минимум 1.',jsonb_build_object('kind','fiend_dark_ones_own_luck','die','1d10','triggers',jsonb_build_array('ability_check','saving_throw'),'uses','charisma_modifier_min_1','cadence','once_per_roll','gm_trigger_gate',true)),
        private.warlock_subclass_resource_v1('fiend-luck-resource','warlock:fiend:dark-ones-own-luck','warlock_fiend_dark_ones_own_luck','Удача Тёмного',v_cha_max,to_jsonb('long_rest'::text)),
        private.warlock_subclass_action_v1('fiend-luck-action','warlock:fiend:dark-ones-own-luck','warlock_fiend_dark_ones_own_luck','Удача Тёмного','reaction',jsonb_build_array(jsonb_build_object('key','warlock_fiend_dark_ones_own_luck','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','add_die_to_d20_test','payload',jsonb_build_object('die','1d10','timing','after_roll_before_effect','gm_trigger_gate',true))))
      ),'choices','[]'::jsonb),
      jsonb_build_object('level',7,'mechanics',private.warlock_patron_spells_for_level_v1('fiend',7),'choices','[]'::jsonb),
      jsonb_build_object('level',9,'mechanics',private.warlock_patron_spells_for_level_v1('fiend',9),'choices','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('fiend-resilience-rules','warlock:fiend:fiendish-resilience','warlock_fiend_fiendish_resilience','Стойкость исчадия','После короткого или долгого отдыха выберите один тип урона, кроме силового; до следующего выбора колдун имеет сопротивление выбранному типу.',jsonb_build_object('kind','fiend_fiendish_resilience','refresh','short_or_long_rest','excludedDamageTypes',jsonb_build_array('force')))),'choices',jsonb_build_array(v_resilience_choice)),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(
        private.warlock_subclass_feature_v1('fiend-hurl-rules','warlock:fiend:hurl-through-hell','warlock_fiend_hurl_through_hell','Бросок сквозь Ад','После попадания атакой цель проходит спасбросок Харизмы; при провале она исчезает до конца следующего хода колдуна и получает эффекты способности. Бесплатное использование восстанавливается после долгого отдыха или ячейкой Магии договора.',jsonb_build_object('kind','fiend_hurl_through_hell','trigger','attack_hit','save','charisma','damage','8d10','damageType','psychic','excludesDamageFor','fiend','condition','incapacitated','return','end_of_next_turn','cadence','once_per_turn','gm_hit_gate',true,'gm_turn_gate',true)),
        private.warlock_subclass_resource_v1('fiend-hurl-resource','warlock:fiend:hurl-through-hell','warlock_fiend_hurl_through_hell','Бросок сквозь Ад','1'::jsonb,to_jsonb('long_rest'::text)),
        private.warlock_subclass_action_v1('fiend-hurl-action','warlock:fiend:hurl-through-hell','warlock_fiend_hurl_through_hell','Бросок сквозь Ад','no_action',jsonb_build_array(jsonb_build_object('key','warlock_fiend_hurl_through_hell','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','hurl_through_hell','payload',jsonb_build_object('save','charisma','damage','8d10','damageType','psychic','gm_hit_gate',true)))),
        private.warlock_subclass_action_v1('warlock_fiend_hurl_through_hell-restore-by-pact-slot','warlock:fiend:hurl-through-hell','warlock_fiend_hurl_through_hell_restore_by_pact_slot','Восстановить Бросок сквозь Ад ячейкой Магии договора','no_action',jsonb_build_array(jsonb_build_object('key','warlock_pact_slots','amount',1)),jsonb_build_array(jsonb_build_object('kind','resource','key','warlock_fiend_hurl_through_hell','operation','RESTORE','amount',1)))
      ),'choices','[]'::jsonb)
    )
  );

  perform private.warlock_subclass_upsert_v1(
    p_campaign_id,v_parent_id,'subclass:warlock:great-old-one','warlock-great-old-one','Великий Древний',
    'Покровительство Великого Древнего строится на телепатической связи, психическом уроне, Сглазе и призванных аберрациях.',
    'Всегда подготовленные чуждые заклинания, Пробуждённый разум, Психические заклинания, Ясновидящий боец, Потусторонний сглаз, Щит мыслей и Создание раба.',
    jsonb_build_array(
      jsonb_build_object('level',3,'mechanics',private.warlock_patron_spells_for_level_v1('great-old-one',3) || jsonb_build_array(
        private.warlock_subclass_feature_v1('goo-awakened-mind','warlock:great-old-one:awakened-mind','warlock_goo_awakened_mind','Пробуждённый разум','Бонусным действием можно связать разум с видимым существом в 30 футах и поддерживать телепатическую связь по правилам способности.',jsonb_build_object('kind','goo_awakened_mind','activation','bonus_action','initialRangeFeet',30,'communicationRangeMiles','charisma_modifier_min_1','durationMinutes','warlock_level','requiresSharedLanguage',true,'gm_target_gate',true)),
        private.warlock_subclass_action_v1('goo-awakened-mind-action','warlock:great-old-one:awakened-mind','warlock_goo_awakened_mind','Пробуждённый разум','bonus_action','[]'::jsonb,jsonb_build_array(jsonb_build_object('kind','semantic','key','create_telepathic_bond','payload',jsonb_build_object('initialRangeFeet',30,'durationMinutes','warlock_level','gm_target_gate',true)))),
        private.warlock_subclass_feature_v1('goo-psychic-spells','warlock:great-old-one:psychic-spells','warlock_goo_psychic_spells','Психические заклинания','Наносящее урон заклинание Колдуна может заменить тип урона на психический; заклинания Колдуна школ Очарования и Иллюзии можно сотворять без вербальных и соматических компонентов.',jsonb_build_object('kind','goo_psychic_spells','replaceDamageWith','psychic','componentlessSchools',jsonb_build_array('enchantment','illusion'),'removesComponents',jsonb_build_array('verbal','somatic')))
      ),'choices','[]'::jsonb),
      jsonb_build_object('level',5,'mechanics',private.warlock_patron_spells_for_level_v1('great-old-one',5),'choices','[]'::jsonb),
      jsonb_build_object('level',6,'mechanics',jsonb_build_array(
        private.warlock_subclass_feature_v1('goo-clairvoyant-rules','warlock:great-old-one:clairvoyant-combatant','warlock_goo_clairvoyant_combatant','Ясновидящий боец','При создании телепатической связи можно навязать противнику боевое преимущество по правилам способности. Использование восстанавливается после короткого или долгого отдыха либо ячейкой Магии договора.',jsonb_build_object('kind','goo_clairvoyant_combatant','trigger','awakened_mind_bond','save','wisdom','targetAttackDisadvantage',true,'selfAttackAdvantage',true,'duration','bond','gm_target_gate',true)),
        private.warlock_subclass_resource_v1('goo-clairvoyant-resource','warlock:great-old-one:clairvoyant-combatant','warlock_goo_clairvoyant_combatant','Ясновидящий боец','1'::jsonb,jsonb_build_array('short_rest','long_rest')),
        private.warlock_subclass_action_v1('goo-clairvoyant-action','warlock:great-old-one:clairvoyant-combatant','warlock_goo_clairvoyant_combatant','Ясновидящий боец','no_action',jsonb_build_array(jsonb_build_object('key','warlock_goo_clairvoyant_combatant','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','clairvoyant_combatant','payload',jsonb_build_object('save','wisdom','duration','awakened_mind_bond','gm_target_gate',true)))),
        private.warlock_subclass_action_v1('warlock_goo_clairvoyant_combatant-restore-by-pact-slot','warlock:great-old-one:clairvoyant-combatant','warlock_goo_clairvoyant_combatant_restore_by_pact_slot','Восстановить Ясновидящего бойца ячейкой Магии договора','no_action',jsonb_build_array(jsonb_build_object('key','warlock_pact_slots','amount',1)),jsonb_build_array(jsonb_build_object('kind','resource','key','warlock_goo_clairvoyant_combatant','operation','RESTORE','amount',1)))
      ),'choices','[]'::jsonb),
      jsonb_build_object('level',7,'mechanics',private.warlock_patron_spells_for_level_v1('great-old-one',7),'choices','[]'::jsonb),
      jsonb_build_object('level',9,'mechanics',private.warlock_patron_spells_for_level_v1('great-old-one',9),'choices','[]'::jsonb),
      jsonb_build_object('level',10,'mechanics',jsonb_build_array(
        private.warlock_subclass_spell_v1('great-old-one','hex',10,10),
        private.warlock_subclass_feature_v1('goo-eldritch-hex','warlock:great-old-one:eldritch-hex','warlock_goo_eldritch_hex','Потусторонний сглаз','Сглаз всегда подготовлен. Выбранная при сотворении характеристика также определяет спасброски, на которые цель получает помеху на время Сглаза.',jsonb_build_object('kind','goo_eldritch_hex','spell','hex','savingThrowDisadvantageForChosenAbility',true)),
        private.warlock_subclass_feature_v1('goo-thought-shield','warlock:great-old-one:thought-shield','warlock_goo_thought_shield','Щит мыслей','Мысли колдуна нельзя читать без разрешения. Колдун имеет сопротивление психическому урону и отражает фактически полученный психический урон источнику.',jsonb_build_object('kind','goo_thought_shield','blocksMindReadingUnlessAllowed',true,'reflectPsychicDamageTaken',true,'gm_trigger_gate',true)),
        jsonb_build_object('id','goo-psychic-resistance','type','grant','sourceKey','warlock:great-old-one:thought-shield','target','resistance','key','damage:psychic','payload',jsonb_build_object('label','Сопротивление психическому урону'))
      ),'choices','[]'::jsonb),
      jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.warlock_subclass_feature_v1('goo-create-thrall','warlock:great-old-one:create-thrall','warlock_goo_create_thrall','Создание раба','При сотворении Призыва аберрации можно убрать концентрацию и изменить длительность и свойства призыва; призванная аберрация дополнительно взаимодействует со Сглазом по правилам способности.',jsonb_build_object('kind','goo_create_thrall','spell','summon-aberration','concentration',false,'durationMinutes',1,'summonTempHp','warlock_level_plus_charisma','hexRider',jsonb_build_object('cadence','once_per_turn','damage','hex_bonus_damage','damageType','psychic'),'gm_turn_gate',true))),'choices','[]'::jsonb)
    )
  );
end;
$$;

create or replace function private.apply_warlock_phb2024_subclasses_on_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.install_warlock_phb2024_subclasses_v1(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzzf_campaigns_apply_warlock_phb2024_subclasses_v1 on public.campaigns;
create trigger zzzzzzzzf_campaigns_apply_warlock_phb2024_subclasses_v1
after insert on public.campaigns
for each row execute function private.apply_warlock_phb2024_subclasses_on_campaign_v1();

do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_warlock_phb2024_subclasses_v1(v_campaign.id);
  end loop;
end;
$$;