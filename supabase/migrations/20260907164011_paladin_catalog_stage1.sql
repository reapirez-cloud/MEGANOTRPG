-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:catalog=READY, paladin:mechanics=PENDING_STAGE2
--
-- Stage 1 only: restore the existing Paladin 2024 catalog identity, core class
-- proficiencies/skill choice, and structural level 1-20 feature grants so the
-- generic Character Engine assignment/progression pipeline can bind the class.
-- Active feature resources/actions, spell-slot runtime, subclass runtime and
-- other executable mechanics are intentionally deferred to later stages.

begin;

create or replace function private.ensure_paladin_catalog_stage1_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_paladin uuid;
  v_level integer;
  v_feature jsonb;
  v_level_mechanics jsonb;
  v_base jsonb := jsonb_build_array(
    jsonb_build_object(
      'id','paladin-hit-die','type','grant','sourceKey','hit-die',
      'target','feature','key','class:paladin:hit-die',
      'payload',jsonb_build_object('label','Кость здоровья: к10','hitDie',10)
    ),
    jsonb_build_object(
      'id','paladin-save-wisdom','type','grant','sourceKey','saving-throw-wisdom',
      'target','proficiency','key','savingThrow:wisdom',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Мудрость')
    ),
    jsonb_build_object(
      'id','paladin-save-charisma','type','grant','sourceKey','saving-throw-charisma',
      'target','proficiency','key','savingThrow:charisma',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Харизма')
    ),
    jsonb_build_object(
      'id','paladin-armor-light','type','grant','sourceKey','armor-light',
      'target','proficiency','key','armor:light',
      'payload',jsonb_build_object('rank',1,'label','Лёгкие доспехи')
    ),
    jsonb_build_object(
      'id','paladin-armor-medium','type','grant','sourceKey','armor-medium',
      'target','proficiency','key','armor:medium',
      'payload',jsonb_build_object('rank',1,'label','Средние доспехи')
    ),
    jsonb_build_object(
      'id','paladin-armor-heavy','type','grant','sourceKey','armor-heavy',
      'target','proficiency','key','armor:heavy',
      'payload',jsonb_build_object('rank',1,'label','Тяжёлые доспехи')
    ),
    jsonb_build_object(
      'id','paladin-armor-shield','type','grant','sourceKey','armor-shield',
      'target','proficiency','key','armor:shield',
      'payload',jsonb_build_object('rank',1,'label','Щиты')
    ),
    jsonb_build_object(
      'id','paladin-weapon-simple','type','grant','sourceKey','weapon-simple',
      'target','proficiency','key','weapon:simple',
      'payload',jsonb_build_object('rank',1,'label','Простое оружие')
    ),
    jsonb_build_object(
      'id','paladin-weapon-martial','type','grant','sourceKey','weapon-martial',
      'target','proficiency','key','weapon:martial',
      'payload',jsonb_build_object('rank',1,'label','Воинское оружие')
    )
  );
  v_choices jsonb := jsonb_build_array(
    jsonb_build_object(
      'key','paladin-skills',
      'label','Навыки: Паладин',
      'target','proficiency',
      'count',2,
      'options',jsonb_build_array(
        'skill:athletics','skill:insight','skill:intimidation',
        'skill:medicine','skill:persuasion','skill:religion'
      ),
      'option_labels',jsonb_build_object(
        'skill:athletics','Атлетика',
        'skill:insight','Проницательность',
        'skill:intimidation','Запугивание',
        'skill:medicine','Медицина',
        'skill:persuasion','Убеждение',
        'skill:religion','Религия'
      )
    )
  );
  v_features jsonb := $features$[
    {"level":1,"key":"lay-on-hands","name":"Наложение рук","description":"Бонусным действием расходует очки целительного запаса на восстановление здоровья или снятие некоторых состояний."},
    {"level":1,"key":"spellcasting","name":"Заклинания","description":"Класс получает заклинания, характеристику магии и ячейки согласно своей прогрессии."},
    {"level":1,"key":"weapon-mastery","name":"Мастерство владения оружием","description":"Мастерство владения оружием расширяет возможности паладин на этом уровне. Восстановление: долгий отдых."},
    {"level":2,"key":"fighting-style","name":"Боевой стиль","description":"Боевой стиль расширяет возможности паладин на этом уровне."},
    {"level":2,"key":"paladin-s-smite","name":"Кара паладина","description":"Кара паладина расширяет возможности паладин на этом уровне. Восстановление: долгий отдых."},
    {"level":3,"key":"channel-divinity","name":"Божественный канал","description":"Запас священной силы оплачивает способности клятвы и божественное чутьё."},
    {"level":3,"key":"paladin-subclass","name":"Клятва паладина","description":"Открывает выбор клятвы."},
    {"level":4,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":5,"key":"extra-attack","name":"Дополнительная атака","description":"Позволяет атаковать дважды вместо одного раза действием Атака."},
    {"level":5,"key":"faithful-steed","name":"Верный скакун","description":"Верный скакун расширяет возможности паладин на этом уровне. Восстановление: долгий отдых."},
    {"level":6,"key":"aura-of-protection","name":"Аура защиты","description":"Аура защиты расширяет возможности паладин на этом уровне. Указанная дистанция: 10 фт."},
    {"level":7,"key":"subclass","name":"Способность специализации","description":"Открывает очередную способность выбранного подкласса."},
    {"level":8,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":9,"key":"abjure-foes","name":"Изгнание врагов","description":"Изгнание врагов расширяет возможности паладин на этом уровне. Применение: бонусное действие. Затрагивает спасбросок: Мудрость."},
    {"level":10,"key":"aura-of-courage","name":"Аура отваги","description":"Аура отваги расширяет возможности паладин на этом уровне."},
    {"level":11,"key":"radiant-strikes","name":"Сияющие удары","description":"Сияющие удары расширяет возможности паладин на этом уровне. Кости эффекта: 1d8."},
    {"level":12,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":14,"key":"restoring-touch","name":"Целительное касание","description":"Целительное касание расширяет возможности паладин на этом уровне."},
    {"level":15,"key":"subclass","name":"Способность специализации","description":"Открывает очередную способность выбранного подкласса."},
    {"level":16,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":18,"key":"aura-expansion","name":"Расширение ауры","description":"Расширение ауры расширяет возможности паладин на этом уровне. Указанная дистанция: 30 фт."},
    {"level":19,"key":"epic-boon","name":"Эпический дар","description":"Открывает выбор эпического дара."},
    {"level":20,"key":"subclass","name":"Способность специализации","description":"Открывает очередную способность выбранного подкласса."}
  ]$features$::jsonb;
begin
  select id into v_paladin
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:paladin'
  order by is_active desc,version desc,created_at desc
  limit 1;

  if v_paladin is null then
    select id into v_paladin
    from public.rule_templates
    where campaign_id=p_campaign_id
      and kind='class'
      and slug='paladin-core'
    order by is_active desc,version desc,created_at desc
    limit 1;
  end if;

  if v_paladin is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    ) values (
      p_campaign_id,
      'class',
      'paladin-core',
      'Паладин',
      'Тяжёлый боец и заклинатель поддержки, чья клятва даёт лечение, защитные ауры и разрушительные кары.',
      1,
      v_base,
      v_choices,
      true,
      'class:paladin',
      'xphb-2024-paladin-stage1-catalog-v1',
      'official',
      'Player''s Handbook 2024',
      true,
      'К10 здоровья, Харизма, тяжёлая защита, лечение, ауры и магия клятвы.',
      'Клятва паладина — не украшение биографии, а рабочий договор с собственной совестью. Нарушения обычно сопровождаются громом, светом и неловкими разговорами.',
      'Паладин полезен, пока уверен в цели. Если начал рассуждать о формулировках клятвы посреди боя, толкните его в сторону врага.',
      jsonb_build_object(
        'class_key','paladin',
        'class_identity','paladin',
        'source_book','XPHB',
        'rules_revision','2024',
        'hit_die',10,
        'spell_progression','half',
        'spellcasting_ability','charisma',
        'text_status','READY',
        'mechanics_status','PENDING_RUNTIME',
        'runtime_stage',1,
        'runtime_revision','xphb-2024-paladin-stage1-catalog-v1',
        'feature_runtime_included',false,
        'spell_runtime_included',false,
        'subclass_runtime_included',false,
        'core_traits',jsonb_build_object(
          'hit_die','d10',
          'saving_throws',jsonb_build_array('wisdom','charisma'),
          'armor_training',jsonb_build_array('light','medium','heavy','shield'),
          'weapon_training',jsonb_build_array('simple','martial'),
          'skill_choice_count',2,
          'skill_choices',jsonb_build_array(
            'athletics','insight','intimidation','medicine','persuasion','religion'
          )
        )
      )
    ) returning id into v_paladin;
  else
    update public.rule_templates
    set
      name=case when nullif(btrim(coalesce(name,'')),'') is null then 'Паладин' else name end,
      description=case when nullif(btrim(coalesce(description,'')),'') is null
        then 'Тяжёлый боец и заклинатель поддержки, чья клятва даёт лечение, защитные ауры и разрушительные кары.' else description end,
      mechanics=case when jsonb_array_length(coalesce(mechanics,'[]'::jsonb))=0 then v_base else mechanics end,
      choices=case when jsonb_array_length(coalesce(choices,'[]'::jsonb))=0 then v_choices else choices end,
      catalog_key='class:paladin',
      catalog_revision=case when nullif(btrim(coalesce(catalog_revision,'')),'') is null
        then 'xphb-2024-paladin-stage1-catalog-v1' else catalog_revision end,
      source_kind='official',
      source_label=case when nullif(btrim(coalesce(source_label,'')),'') is null then 'Player''s Handbook 2024' else source_label end,
      is_builtin=true,
      is_active=true,
      mechanical_summary=case when nullif(btrim(coalesce(mechanical_summary,'')),'') is null
        then 'К10 здоровья, Харизма, тяжёлая защита, лечение, ауры и магия клятвы.' else mechanical_summary end,
      author_description=case when nullif(btrim(coalesce(author_description,'')),'') is null
        then 'Клятва паладина — не украшение биографии, а рабочий договор с собственной совестью. Нарушения обычно сопровождаются громом, светом и неловкими разговорами.' else author_description end,
      author_comment=case when nullif(btrim(coalesce(author_comment,'')),'') is null
        then 'Паладин полезен, пока уверен в цели. Если начал рассуждать о формулировках клятвы посреди боя, толкните его в сторону врага.' else author_comment end,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)
        || jsonb_build_object(
          'class_key','paladin',
          'class_identity','paladin',
          'source_book','XPHB',
          'rules_revision','2024',
          'hit_die',10,
          'spell_progression','half',
          'spellcasting_ability','charisma',
          'text_status','READY'
        )
        || case when not (coalesce(rules_meta,'{}'::jsonb) ? 'mechanics_status')
          then jsonb_build_object('mechanics_status','PENDING_RUNTIME') else '{}'::jsonb end
        || case when not (coalesce(rules_meta,'{}'::jsonb) ? 'runtime_stage')
          then jsonb_build_object('runtime_stage',1) else '{}'::jsonb end
        || case when not (coalesce(rules_meta,'{}'::jsonb) ? 'runtime_revision')
          then jsonb_build_object('runtime_revision','xphb-2024-paladin-stage1-catalog-v1') else '{}'::jsonb end
        || case when not (coalesce(rules_meta,'{}'::jsonb) ? 'feature_runtime_included')
          then jsonb_build_object('feature_runtime_included',false) else '{}'::jsonb end
        || case when not (coalesce(rules_meta,'{}'::jsonb) ? 'spell_runtime_included')
          then jsonb_build_object('spell_runtime_included',false) else '{}'::jsonb end
        || case when not (coalesce(rules_meta,'{}'::jsonb) ? 'subclass_runtime_included')
          then jsonb_build_object('subclass_runtime_included',false) else '{}'::jsonb end
        || case when not (coalesce(rules_meta,'{}'::jsonb) ? 'core_traits')
          then jsonb_build_object('core_traits',jsonb_build_object(
            'hit_die','d10',
            'saving_throws',jsonb_build_array('wisdom','charisma'),
            'armor_training',jsonb_build_array('light','medium','heavy','shield'),
            'weapon_training',jsonb_build_array('simple','martial'),
            'skill_choice_count',2,
            'skill_choices',jsonb_build_array(
              'athletics','insight','intimidation','medicine','persuasion','religion'
            )
          )) else '{}'::jsonb end,
      updated_at=now()
    where id=v_paladin;
  end if;

  update public.rule_templates
  set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:paladin'
    and id<>v_paladin
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
          'id','paladin-' || (v_feature->>'key') || '-feature-l' || v_level::text,
          'type','grant',
          'sourceKey',v_feature->>'key',
          'target','feature',
          'key','class:paladin:' || (v_feature->>'key'),
          'payload',jsonb_build_object(
            'label',v_feature->>'name',
            'description',v_feature->>'description'
          )
        )
      );
    end loop;

    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_paladin,v_level,v_level_mechanics,'[]'::jsonb)
    on conflict(template_id,level) do update
    set
      mechanics=case
        when jsonb_array_length(coalesce(public.rule_template_levels.mechanics,'[]'::jsonb))=0
          then excluded.mechanics
        else public.rule_template_levels.mechanics
      end,
      choices=case
        when jsonb_array_length(coalesce(public.rule_template_levels.choices,'[]'::jsonb))=0
          then excluded.choices
        else public.rule_template_levels.choices
      end;
  end loop;
end;
$$;

revoke all on function private.ensure_paladin_catalog_stage1_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_paladin_catalog_stage1_v1(uuid) to service_role;

create or replace function private.ensure_paladin_catalog_stage1_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.ensure_paladin_catalog_stage1_v1(new.id);
  return new;
end;
$$;

revoke all on function private.ensure_paladin_catalog_stage1_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaac_campaigns_ensure_paladin_catalog_stage1_v1 on public.campaigns;
create trigger aaaaaaaac_campaigns_ensure_paladin_catalog_stage1_v1
after insert on public.campaigns
for each row execute function private.ensure_paladin_catalog_stage1_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_paladin_catalog_stage1_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
