-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_WORK_STATUS: sorcerer:catalog=STAGE1_READY, sorcerer:mechanics=PENDING_STAGE2
--
-- Stage 1 only: connect the existing Sorcerer 2024 presentation/reference to the
-- generic class catalog and Character Engine assignment/progression pipeline.
-- This migration adds core proficiencies, the class skill choice and structural
-- level 1-20 feature grants. Resource contracts are declared as metadata only.
-- Authoritative Sorcery Point spend/recovery, Font of Magic conversion,
-- Metamagic execution, spell-slot runtime and subclass runtime remain deferred.

begin;

create or replace function private.ensure_sorcerer_catalog_stage1_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sorcerer uuid;
  v_level integer;
  v_feature jsonb;
  v_level_mechanics jsonb;
  v_base jsonb := jsonb_build_array(
    jsonb_build_object(
      'id','sorcerer-hit-die','type','grant','sourceKey','hit-die',
      'target','feature','key','class:sorcerer:hit-die',
      'payload',jsonb_build_object('label','Кость здоровья: к6','hitDie',6)
    ),
    jsonb_build_object(
      'id','sorcerer-save-constitution','type','grant','sourceKey','saving-throw-constitution',
      'target','proficiency','key','savingThrow:constitution',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Телосложение')
    ),
    jsonb_build_object(
      'id','sorcerer-save-charisma','type','grant','sourceKey','saving-throw-charisma',
      'target','proficiency','key','savingThrow:charisma',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Харизма')
    ),
    jsonb_build_object(
      'id','sorcerer-weapon-simple','type','grant','sourceKey','weapon-simple',
      'target','proficiency','key','weapon:simple',
      'payload',jsonb_build_object('rank',1,'label','Простое оружие')
    )
  );
  v_choices jsonb := jsonb_build_array(
    jsonb_build_object(
      'key','sorcerer-skills',
      'label','Навыки: Чародей',
      'target','proficiency',
      'count',2,
      'options',jsonb_build_array(
        'skill:arcana','skill:deception','skill:insight',
        'skill:intimidation','skill:persuasion','skill:religion'
      ),
      'option_labels',jsonb_build_object(
        'skill:arcana','Магия',
        'skill:deception','Обман',
        'skill:insight','Проницательность',
        'skill:intimidation','Запугивание',
        'skill:persuasion','Убеждение',
        'skill:religion','Религия'
      )
    )
  );
  v_features jsonb := $features$[
    {"level":1,"key":"spellcasting","name":"Сотворение заклинаний","description":"Открывает заклинания чародея. Характеристика заклинаний: Харизма; прогрессия ячеек полного заклинателя. Исполнение ячеек подключается отдельным runtime-этапом."},
    {"level":1,"key":"innate-sorcery","name":"Врождённое чародейство","description":"Бонусным действием на 1 минуту усиливает заклинания чародея: +1 к Сл спасброска и преимущество на броски атаки заклинаниями. Два применения, восстановление после долгого отдыха; расход подключается на этапе ресурсов."},
    {"level":2,"key":"font-of-magic","name":"Источник магии","description":"Открывает очки чародейства и преобразование магической энергии. Максимум очков равен уровню чародея; авторитетный расход и конвертация подключаются следующими этапами."},
    {"level":2,"key":"metamagic","name":"Метамагия","description":"Открывает выбор вариантов Метамагии. Выбор и применение выполняются общим choice/runtime-контрактом на отдельном этапе."},
    {"level":3,"key":"sorcerer-subclass","name":"Подкласс чародея","description":"Открывает выбор происхождения/подкласса чародея."},
    {"level":4,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":5,"key":"sorcerous-restoration","name":"Чародейское восстановление","description":"Открывает восстановление части потраченных очков чародейства во время отдыха. Точный расход/восстановление подключается ресурсным runtime-этапом."},
    {"level":6,"key":"subclass","name":"Способность подкласса","description":"Открывает очередную способность выбранного подкласса."},
    {"level":7,"key":"sorcery-incarnate","name":"Воплощение чародейства","description":"Расширяет применение Врождённого чародейства и Метамагии. Исполняемая логика подключается вместе с runtime Метамагии."},
    {"level":8,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":10,"key":"metamagic","name":"Метамагия","description":"Расширяет набор доступных вариантов Метамагии."},
    {"level":12,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":14,"key":"subclass","name":"Способность подкласса","description":"Открывает очередную способность выбранного подкласса."},
    {"level":16,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Даёт улучшение характеристик или подходящий талант."},
    {"level":17,"key":"metamagic","name":"Метамагия","description":"Расширяет набор доступных вариантов Метамагии."},
    {"level":18,"key":"subclass","name":"Способность подкласса","description":"Открывает очередную способность выбранного подкласса."},
    {"level":19,"key":"epic-boon","name":"Эпический дар","description":"Открывает выбор эпического дара."},
    {"level":20,"key":"arcane-apotheosis","name":"Магический апофеоз","description":"Вершинная способность чародея усиливает работу с Метамагией. Исполняемая логика подключается вместе с runtime Метамагии."}
  ]$features$::jsonb;
begin
  if p_campaign_id is null then
    return;
  end if;

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
  order by is_active desc,version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    select id into v_sorcerer
    from public.rule_templates
    where campaign_id=p_campaign_id
      and kind='class'
      and slug='sorcerer-core'
    order by is_active desc,version desc,created_at desc
    limit 1;
  end if;

  if v_sorcerer is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    ) values (
      p_campaign_id,
      'class',
      'sorcerer-core',
      'Чародей',
      'Заклинатель, чья врождённая магия использует Харизму, очки чародейства и Метамагию.',
      1,
      v_base,
      v_choices,
      true,
      'class:sorcerer',
      'xphb-2024-sorcerer-stage1-foundation-v1',
      'official',
      'Player''s Handbook 2024',
      true,
      'К6 здоровья; Харизма; спасброски Телосложения и Харизмы; простое оружие; 2 навыка; структурная прогрессия 1–20.',
      '',
      '',
      jsonb_build_object(
        'class_key','sorcerer',
        'class_identity','sorcerer',
        'source_book','XPHB',
        'rules_revision','2024',
        'hit_die',6,
        'spell_progression','full',
        'spellcasting_ability','charisma',
        'presentation_source','src/data/classes/sorcererReferenceDraft.ts',
        'text_status','READY_CURRENT_AUTHORED_ROSTER_2026_09_04',
        'mechanics_status','STAGE1_FOUNDATION',
        'runtime_stage',1,
        'runtime_revision','xphb-2024-sorcerer-stage1-foundation-v1',
        'feature_runtime_included',false,
        'spell_runtime_included',false,
        'resource_runtime_included',false,
        'metamagic_runtime_included',false,
        'subclass_runtime_included',false,
        'core_traits',jsonb_build_object(
          'hit_die','d6',
          'primary_ability','charisma',
          'saving_throws',jsonb_build_array('constitution','charisma'),
          'armor_training',jsonb_build_array(),
          'weapon_training',jsonb_build_array('simple'),
          'skill_choice_count',2,
          'skill_choices',jsonb_build_array(
            'arcana','deception','insight','intimidation','persuasion','religion'
          )
        ),
        'spellcasting_contract',jsonb_build_object(
          'ability','charisma',
          'spell_list','sorcerer',
          'progression','full_caster',
          'runtime_status','stage2_pending'
        ),
        'resource_contracts',jsonb_build_object(
          'innate_sorcery',jsonb_build_object(
            'unlocks_at',1,
            'max',2,
            'recharge',jsonb_build_array('long_rest'),
            'runtime_status','stage2_pending'
          ),
          'sorcery_points',jsonb_build_object(
            'unlocks_at',2,
            'max',jsonb_build_object('kind','reference','key','source.level'),
            'recharge',jsonb_build_array('long_rest'),
            'runtime_status','stage2_pending'
          )
        ),
        'stage1_scope',jsonb_build_object(
          'assignable_template',true,
          'level_tree',true,
          'proficiencies',true,
          'feature_unlocks',true,
          'resources_actions_choices_active',false
        )
      )
    ) returning id into v_sorcerer;
  else
    update public.rule_templates
    set
      name=case when nullif(btrim(coalesce(name,'')),'') is null then 'Чародей' else name end,
      description=case when nullif(btrim(coalesce(description,'')),'') is null
        then 'Заклинатель, чья врождённая магия использует Харизму, очки чародейства и Метамагию.' else description end,
      mechanics=case when jsonb_array_length(coalesce(mechanics,'[]'::jsonb))=0 then v_base else mechanics end,
      choices=case when jsonb_array_length(coalesce(choices,'[]'::jsonb))=0 then v_choices else choices end,
      catalog_key='class:sorcerer',
      catalog_revision=case when nullif(btrim(coalesce(catalog_revision,'')),'') is null
        then 'xphb-2024-sorcerer-stage1-foundation-v1' else catalog_revision end,
      source_kind='official',
      source_label=case when nullif(btrim(coalesce(source_label,'')),'') is null then 'Player''s Handbook 2024' else source_label end,
      is_builtin=true,
      is_active=true,
      mechanical_summary=case when nullif(btrim(coalesce(mechanical_summary,'')),'') is null
        then 'К6 здоровья; Харизма; спасброски Телосложения и Харизмы; простое оружие; 2 навыка; структурная прогрессия 1–20.' else mechanical_summary end,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)
        || jsonb_build_object(
          'class_key','sorcerer',
          'class_identity','sorcerer',
          'source_book','XPHB',
          'rules_revision','2024',
          'hit_die',6,
          'spell_progression','full',
          'spellcasting_ability','charisma',
          'presentation_source','src/data/classes/sorcererReferenceDraft.ts',
          'text_status','READY_CURRENT_AUTHORED_ROSTER_2026_09_04',
          'mechanics_status','STAGE1_FOUNDATION',
          'runtime_stage',1,
          'runtime_revision','xphb-2024-sorcerer-stage1-foundation-v1',
          'feature_runtime_included',false,
          'spell_runtime_included',false,
          'resource_runtime_included',false,
          'metamagic_runtime_included',false,
          'subclass_runtime_included',false,
          'core_traits',jsonb_build_object(
            'hit_die','d6',
            'primary_ability','charisma',
            'saving_throws',jsonb_build_array('constitution','charisma'),
            'armor_training',jsonb_build_array(),
            'weapon_training',jsonb_build_array('simple'),
            'skill_choice_count',2,
            'skill_choices',jsonb_build_array(
              'arcana','deception','insight','intimidation','persuasion','religion'
            )
          ),
          'spellcasting_contract',jsonb_build_object(
            'ability','charisma','spell_list','sorcerer','progression','full_caster','runtime_status','stage2_pending'
          ),
          'resource_contracts',jsonb_build_object(
            'innate_sorcery',jsonb_build_object(
              'unlocks_at',1,'max',2,'recharge',jsonb_build_array('long_rest'),'runtime_status','stage2_pending'
            ),
            'sorcery_points',jsonb_build_object(
              'unlocks_at',2,
              'max',jsonb_build_object('kind','reference','key','source.level'),
              'recharge',jsonb_build_array('long_rest'),
              'runtime_status','stage2_pending'
            )
          ),
          'stage1_scope',jsonb_build_object(
            'assignable_template',true,
            'level_tree',true,
            'proficiencies',true,
            'feature_unlocks',true,
            'resources_actions_choices_active',false
          )
        ),
      updated_at=now()
    where id=v_sorcerer;
  end if;

  update public.rule_templates
  set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and id<>v_sorcerer
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
          'id','sorcerer-' || (v_feature->>'key') || '-feature-l' || v_level::text,
          'type','grant',
          'sourceKey',v_feature->>'key',
          'target','feature',
          'key','class:sorcerer:' || (v_feature->>'key'),
          'payload',jsonb_build_object(
            'label',v_feature->>'name',
            'description',v_feature->>'description'
          )
        )
      );
    end loop;

    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_sorcerer,v_level,v_level_mechanics,'[]'::jsonb)
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

revoke all on function private.ensure_sorcerer_catalog_stage1_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_catalog_stage1_v1(uuid) to service_role;

create or replace function private.ensure_sorcerer_catalog_stage1_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.ensure_sorcerer_catalog_stage1_v1(new.id);
  return new;
end;
$$;

revoke all on function private.ensure_sorcerer_catalog_stage1_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaad_campaigns_ensure_sorcerer_catalog_stage1_v1 on public.campaigns;
create trigger aaaaaaaad_campaigns_ensure_sorcerer_catalog_stage1_v1
after insert on public.campaigns
for each row execute function private.ensure_sorcerer_catalog_stage1_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_sorcerer_catalog_stage1_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
