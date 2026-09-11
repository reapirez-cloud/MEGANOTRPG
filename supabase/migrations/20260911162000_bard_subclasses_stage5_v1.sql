-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:bard
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/bardSubclassesStage5.test.ts
-- CLASS_WORK_STATUS: bard:stage5_subclasses=READY,bard:mechanics=PENDING_STAGE6
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Bard Stage 5 runtime package.
-- Runtime roster:
--   PHB 2024: Dance, Glamour, Lore, Valor
--   approved legacy/supplement: Eloquence, Swords, Whispers, Creation, Spirits
-- College of Tragedy deliberately remains reference-only.
-- All Bardic Inspiration spenders point at the canonical bardic_inspiration resource.

begin;

create or replace function private.bard_stage5_feature_v1(
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
set search_path=''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','grant',
    'target','feature',
    'key',p_key,
    'sourceKey',p_source_key,
    'payload',jsonb_build_object(
      'label',p_label,
      'description',p_description,
      'mechanic',coalesce(p_mechanic,'{}'::jsonb)
    )
  );
$$;

create or replace function private.bard_stage5_grant_v1(
  p_id text,
  p_source_key text,
  p_target text,
  p_key text,
  p_label text
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','grant',
    'target',p_target,
    'key',p_key,
    'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label)
  );
$$;

create or replace function private.bard_stage5_resource_v1(
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
set search_path=''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','resource',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'max',p_max,
    'recharge',p_recharge,
    'initial','full'
  );
$$;

create or replace function private.bard_stage5_action_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_economy text,
  p_costs jsonb,
  p_cost_options jsonb,
  p_effects jsonb,
  p_tags jsonb,
  p_range jsonb default null
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,
    'type','action',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'economy',p_economy,
    'range',p_range,
    'resourceCosts',case
      when jsonb_array_length(coalesce(p_costs,'[]'::jsonb))>0 then p_costs
      else null
    end,
    'costOptions',case
      when jsonb_array_length(coalesce(p_cost_options,'[]'::jsonb))>0 then p_cost_options
      else null
    end,
    'effects',case
      when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects
      else null
    end,
    'tags',coalesce(p_tags,'["bard","subclass"]'::jsonb)
  ));
$$;

create or replace function private.bard_stage5_spell_v1(
  p_subclass text,
  p_source_key text,
  p_slug text,
  p_method_key text default 'bard-subclass'
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
begin
  select * into v_spell
  from public.spell_catalog
  where slug=p_slug;

  if not found then
    raise exception 'BARD_STAGE5_SPELL_NOT_FOUND:%',p_slug;
  end if;

  v_method:=jsonb_build_object(
    'key',p_method_key,
    'kind','class_spell',
    'ability','charisma',
    'saveDc',jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','literal','value',8),
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'attackBonus',jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'requiresPrepared',false
  );

  if v_spell.spell_level>0 then
    v_method:=v_method||jsonb_build_object(
      'resourceOptions',private.class_spell_slot_options(v_spell.spell_level)
    );
  end if;

  return jsonb_build_object(
    'id',p_subclass||'-'||p_method_key||'-'||p_slug,
    'type','spell',
    'sourceKey',p_source_key,
    'key','spell:'||p_slug,
    'catalogSlug',p_slug,
    'variantKey','bard-subclass:'||p_subclass||':'||p_method_key||':'||p_slug,
    'grantOperation','GRANT',
    'payload',jsonb_build_object(
      'spell',jsonb_build_object(
        'name',coalesce(nullif(v_spell.name_ru,''),nullif(v_spell.name_en,''),v_spell.slug),
        'level',v_spell.spell_level,
        'school',v_spell.school,
        'ritual',coalesce(v_spell.ritual,false)
      ),
      'preparation',jsonb_build_object('mode','always_prepared'),
      'methods',jsonb_build_array(v_method)
    )
  );
end;
$$;

create or replace function private.bard_stage5_full_caster_unlock_level_v1(p_spell_level integer)
returns integer
language sql
immutable
set search_path=''
as $$
  select case
    when p_spell_level<=1 then 1
    when p_spell_level=2 then 3
    when p_spell_level=3 then 5
    when p_spell_level=4 then 7
    when p_spell_level=5 then 9
    when p_spell_level=6 then 11
    when p_spell_level=7 then 13
    when p_spell_level=8 then 15
    when p_spell_level=9 then 17
    else 20
  end;
$$;

create or replace function private.bard_stage5_feature_or_slot_options_v1(
  p_feature_resource text,
  p_min_slot integer
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_array(
    jsonb_build_object(
      'key','feature-use',
      'label','Бесплатное применение',
      'costs',jsonb_build_array(jsonb_build_object('key',p_feature_resource,'amount',1))
    )
  ) ||
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'key','slot-'||g::text,
        'label','Ячейка '||g::text||' уровня',
        'costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||g::text,'amount',1))
      )
      order by g
    )
    from generate_series(greatest(1,p_min_slot),9) g
  ),'[]'::jsonb);
$$;

create or replace function private.bard_stage5_lore_magical_discoveries_choice_v1()
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_options jsonb;
  v_labels jsonb;
  v_unlocks jsonb;
  v_mechanics jsonb;
begin
  select
    coalesce(jsonb_agg(
      s.slug
      order by s.spell_level,s.sort_order,coalesce(s.name_ru,s.name_en),s.slug
    ),'[]'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)
    ),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      greatest(6,private.bard_stage5_full_caster_unlock_level_v1(s.spell_level))
    ),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      jsonb_build_array(
        private.bard_stage5_spell_v1(
          'lore',
          'bard:lore:magical-discoveries',
          s.slug,
          'lore-magical-discovery'
        )
      )
    ),'{}'::jsonb)
  into v_options,v_labels,v_unlocks,v_mechanics
  from public.spell_catalog s
  where exists(
    select 1
    from public.spell_catalog_classes c
    where c.spell_id=s.id
      and c.class_key in ('cleric','druid','wizard')
  );

  return jsonb_build_object(
    'key','bard_lore_magical_discoveries',
    'label','Магические открытия',
    'target','spell',
    'count',2,
    'selection_mode','player_once',
    'replacement_policy','on_level_change',
    'replacement_limit',1,
    'options',v_options,
    'option_labels',v_labels,
    'option_unlock_level',v_unlocks,
    'option_mechanics',v_mechanics
  );
end;
$$;

create or replace function private.bard_stage5_spirit_session_choice_v1()
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_options jsonb;
  v_labels jsonb;
  v_unlocks jsonb;
  v_mechanics jsonb;
begin
  select
    coalesce(jsonb_agg(
      s.slug
      order by s.spell_level,s.sort_order,coalesce(s.name_ru,s.name_en),s.slug
    ),'[]'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)
    ),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      greatest(6,private.bard_stage5_full_caster_unlock_level_v1(s.spell_level))
    ),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      jsonb_build_array(
        private.bard_stage5_spell_v1(
          'spirits',
          'bard:spirits:spirit-session',
          s.slug,
          'spirit-session'
        )
      )
    ),'{}'::jsonb)
  into v_options,v_labels,v_unlocks,v_mechanics
  from public.spell_catalog s
  where s.school in ('Divination','Necromancy');

  return jsonb_build_object(
    'key','bard_spirits_spirit_session',
    'label','Спиритический сеанс',
    'target','spell',
    'count',1,
    'selection_mode','player_once',
    'refresh','long_rest',
    'replacement_policy','preparation',
    'replacement_limit',1,
    'options',v_options,
    'option_labels',v_labels,
    'option_unlock_level',v_unlocks,
    'option_mechanics',v_mechanics
  );
end;
$$;

create or replace function private.bard_stage5_lore_skills_choice_v1()
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'key','bard_lore_bonus_skills',
    'label','Дополнительные владения',
    'target','proficiency',
    'count',3,
    'selection_mode','player_once',
    'replacement_policy','locked',
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
  );
$$;

create or replace function private.bard_stage5_swords_style_choice_v1()
returns jsonb
language sql
stable
set search_path=''
as $$
  select jsonb_build_object(
    'key','bard_swords_fighting_style',
    'label','Боевой стиль',
    'target','trait',
    'count',1,
    'selection_mode','player_once',
    'replacement_policy','locked',
    'options',jsonb_build_array('dueling','two_weapon_fighting'),
    'option_labels',jsonb_build_object(
      'dueling','Дуэлянт',
      'two_weapon_fighting','Бой двумя оружиями'
    ),
    'option_mechanics',jsonb_build_object(
      'dueling',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'swords-style-dueling',
          'bard:swords:fighting-style',
          'bard_swords_dueling',
          'Дуэлянт',
          'Когда вы держите рукопашное оружие в одной руке и не держите другого оружия, подходящие броски урона этим оружием получают +2.',
          '{"kind":"fighting_style_dueling","damageBonus":2,"requiresOneHandedMeleeWeapon":true,"requiresNoOtherWeapon":true}'::jsonb
        )
      ),
      'two_weapon_fighting',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'swords-style-two-weapon',
          'bard:swords:fighting-style',
          'bard_swords_two_weapon_fighting',
          'Бой двумя оружиями',
          'При бое двумя оружиями модификатор характеристики добавляется к урону дополнительной атаки.',
          '{"kind":"fighting_style_two_weapon","addAbilityModifierToOffhandDamage":true}'::jsonb
        )
      )
    )
  );
$$;

create or replace function private.bard_stage5_upsert_subclass_v1(
  p_campaign_id uuid,
  p_parent_id uuid,
  p_catalog_key text,
  p_slug text,
  p_name text,
  p_source_label text,
  p_summary text,
  p_levels jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_level record;
begin
  select id into v_id
  from public.rule_templates
  where campaign_id=p_campaign_id
    and catalog_key=p_catalog_key
    and is_builtin=true
  order by updated_at desc
  limit 1;

  if v_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,
      is_builtin,mechanical_summary,rules_meta
    ) values (
      p_campaign_id,
      'subclass',
      p_slug,
      p_name,
      p_summary,
      1,
      '[]'::jsonb,
      '[]'::jsonb,
      true,
      p_parent_id,
      3,
      p_catalog_key,
      'bard-stage5-subclasses-runtime-v1',
      'official',
      p_source_label,
      true,
      p_summary,
      jsonb_build_object(
        'base_class','class:bard',
        'runtime_status','READY_STAGE5',
        'runtime_revision','bard-stage5-subclasses-runtime-v1',
        'parent_level_source','class:bard',
        'chat_template_actions',true,
        'chat_template_spells',true,
        'canonical_bardic_inspiration_resource','bardic_inspiration'
      )
    )
    returning id into v_id;
  else
    update public.rule_templates
    set kind='subclass',
        slug=p_slug,
        name=p_name,
        description=p_summary,
        mechanics='[]'::jsonb,
        choices='[]'::jsonb,
        is_active=true,
        parent_template_id=p_parent_id,
        unlock_level=3,
        catalog_revision='bard-stage5-subclasses-runtime-v1',
        source_kind='official',
        source_label=p_source_label,
        is_builtin=true,
        mechanical_summary=p_summary,
        rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
          'base_class','class:bard',
          'runtime_status','READY_STAGE5',
          'runtime_revision','bard-stage5-subclasses-runtime-v1',
          'parent_level_source','class:bard',
          'chat_template_actions',true,
          'chat_template_spells',true,
          'canonical_bardic_inspiration_resource','bardic_inspiration'
        ),
        updated_at=now()
    where id=v_id;
  end if;

  delete from public.rule_template_levels
  where template_id=v_id;

  for v_level in
    select value from jsonb_array_elements(p_levels) x(value)
  loop
    insert into public.rule_template_levels(
      template_id,level,mechanics,choices
    )
    values(
      v_id,
      (v_level.value->>'level')::integer,
      coalesce(v_level.value->'mechanics','[]'::jsonb),
      coalesce(v_level.value->'choices','[]'::jsonb)
    );
  end loop;

  perform private.sync_rule_template_spell_links(v_id);
  return v_id;
end;
$$;

revoke all on function private.bard_stage5_upsert_subclass_v1(
  uuid,uuid,text,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function private.bard_stage5_upsert_subclass_v1(
  uuid,uuid,text,text,text,text,text,jsonb
) to service_role;

create or replace function private.ensure_bard_subclasses_stage5_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_parent uuid;
  v_levels jsonb;
  v_cha_max jsonb:=jsonb_build_object(
    'kind','max',
    'values',jsonb_build_array(
      jsonb_build_object('kind','literal','value',1),
      jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
    )
  );
  v_id uuid;
begin
  perform private.ensure_bard_base_runtime_stage4_v1(p_campaign_id);

  select id into v_parent
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_parent is null then
    raise exception 'BARD_STAGE5_PARENT_NOT_FOUND:%',p_campaign_id;
  end if;

  -- College of Dance (PHB 2024)
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'dance-dazzling-footwork',
          'bard:dance:dazzling-footwork',
          'bard_dance_dazzling_footwork',
          'Ослепительная работа ног',
          'Без доспеха и щита КД равен 10 + Ловкость + Харизма; танцевальные проверки Выступления совершаются с преимуществом. Безоружный удар может использовать кость Вдохновения барда + Ловкость, а трата Вдохновения как части действия, бонусного действия или реакции позволяет включить один безоружный удар в то же действие.',
          '{"kind":"dazzling_footwork","unarmoredDefense":{"base":10,"abilities":["dexterity","charisma"]},"dancePerformanceAdvantage":true,"unarmedDamage":{"dieValueKey":"bardic_inspiration_die_sides","ability":"dexterity"},"agileStrikes":{"trigger":"spend_bardic_inspiration_as_action_bonus_or_reaction","extraUnarmedStrike":1},"equipmentState":"table_adjudicated"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'mechanics',jsonb_build_array(
        private.bard_stage5_action_v1(
          'dance-inspiring-movement',
          'bard:dance:inspiring-movement',
          'bard_dance_inspiring_movement',
          'Вдохновляющее движение',
          'reaction',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"dance_inspiring_movement","payload":{"trigger":"visible_enemy_ends_turn_within_5_feet","selfMove":"half_speed","allyRangeFeet":30,"allyReactionMove":"half_speed","noOpportunityAttacks":true}}]'::jsonb,
          '["bard","subclass","dance","bardic-inspiration","table-adjudicated-trigger"]'::jsonb,
          '{"kind":"self"}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'dance-tandem-footwork',
          'bard:dance:tandem-footwork',
          'bard_dance_tandem_footwork',
          'Совместная работа ног',
          'special',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"dance_tandem_footwork","payload":{"trigger":"initiative_roll","radiusFeet":30,"targets":"self_and_allies_that_see_or_hear","bonus":"bardic_inspiration_die_roll"}}]'::jsonb,
          '["bard","subclass","dance","bardic-inspiration","initiative-trigger","table-adjudicated"]'::jsonb,
          '{"kind":"area","shape":"emanation","size":30,"unit":"feet"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'dance-leading-evasion',
          'bard:dance:leading-evasion',
          'bard_dance_leading_evasion',
          'Ведущее уклонение',
          'При спасброске Ловкости для половины урона успех даёт ноль урона, а провал — половину. При том же спасброске можно распространить эффект на существ в 5 футах; черта недоступна в состоянии Недееспособности.',
          '{"kind":"leading_evasion","save":"dexterity","successDamageFraction":0,"failureDamageFraction":0.5,"shareRadiusFeet":5,"blockedBy":"incapacitated"}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:dance',
    'bard-dance',
    'Коллегия Танца',
    'Player''s Handbook 2024',
    'PHB 2024: бездоспешная танцевальная техника, движение через Вдохновение барда и групповое уклонение.',
    v_levels
  );

  -- College of Glamour (PHB 2024)
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'mechanics',jsonb_build_array(
        private.bard_stage5_spell_v1('glamour','bard:glamour:beguiling-magic','charm-person','glamour-always-prepared'),
        private.bard_stage5_spell_v1('glamour','bard:glamour:beguiling-magic','mirror-image','glamour-always-prepared'),
        private.bard_stage5_resource_v1(
          'glamour-beguiling-resource',
          'bard:glamour:beguiling-magic',
          'bard_glamour_beguiling_magic',
          'Обольщающая магия',
          '1'::jsonb,
          '["long_rest"]'::jsonb
        ),
        private.bard_stage5_feature_v1(
          'glamour-beguiling-feature',
          'bard:glamour:beguiling-magic',
          'bard_glamour_beguiling_magic_rule',
          'Обольщающая магия',
          'После сотворения заклинания Очарования или Иллюзии с расходом ячейки можно применить эффект к видимому существу в 60 футах: спасбросок Мудрости против Сл заклинаний, при провале цель Очарована или Испугана на 1 минуту и повторяет спасбросок в конце каждого хода. Одно применение между долгими отдыхами; применение можно восстановить, потратив Вдохновение барда без действия.',
          '{"kind":"beguiling_magic","trigger":"cast_enchantment_or_illusion_with_slot","rangeFeet":60,"save":"wisdom","conditions":["charmed","frightened"],"durationMinutes":1,"repeatSave":"end_of_target_turn","resource":"bard_glamour_beguiling_magic"}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'glamour-beguiling-use',
          'bard:glamour:beguiling-magic',
          'bard_glamour_beguiling_magic_use',
          'Обольщающая магия',
          'special',
          '[{"key":"bard_glamour_beguiling_magic","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"beguiling_magic_effect","payload":{"trigger":"after_enchantment_or_illusion_slot_spell","rangeFeet":60,"save":"wisdom","conditionChoice":["charmed","frightened"],"durationMinutes":1}}]'::jsonb,
          '["bard","subclass","glamour","table-adjudicated-trigger"]'::jsonb,
          '{"kind":"ranged","normal":60,"unit":"feet"}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'glamour-beguiling-restore',
          'bard:glamour:beguiling-magic',
          'bard_glamour_restore_beguiling_magic',
          'Восстановить Обольщающую магию',
          'special',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"resource","key":"bard_glamour_beguiling_magic","operation":"RESTORE","amount":1}]'::jsonb,
          '["bard","subclass","glamour","bardic-inspiration","no-action"]'::jsonb,
          '{"kind":"self"}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'glamour-mantle-inspiration',
          'bard:glamour:mantle-inspiration',
          'bard_glamour_mantle_of_inspiration',
          'Мантия вдохновения',
          'bonus_action',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"glamour_mantle_of_inspiration","payload":{"rangeFeet":60,"targetCount":"charisma_modifier_min_1","temporaryHp":"2_x_bardic_inspiration_die_roll","allowReactionMove":"speed","noOpportunityAttacks":true}}]'::jsonb,
          '["bard","subclass","glamour","bardic-inspiration"]'::jsonb,
          '{"kind":"area","shape":"emanation","size":60,"unit":"feet"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'mechanics',jsonb_build_array(
        private.bard_stage5_spell_v1('glamour','bard:glamour:mantle-majesty','command','glamour-always-prepared'),
        private.bard_stage5_resource_v1(
          'glamour-majesty-resource',
          'bard:glamour:mantle-majesty',
          'bard_glamour_mantle_of_majesty',
          'Мантия величия',
          '1'::jsonb,
          '["long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'glamour-majesty-action',
          'bard:glamour:mantle-majesty',
          'bard_glamour_mantle_of_majesty_activate',
          'Мантия величия',
          'bonus_action',
          '[]'::jsonb,
          private.bard_stage5_feature_or_slot_options_v1('bard_glamour_mantle_of_majesty',3),
          '[{"kind":"semantic","key":"glamour_mantle_of_majesty","payload":{"durationMinutes":1,"concentration":true,"commandAsBonusActionWithoutSlot":true,"charmedTargetsAutoFailCommandSave":true}}]'::jsonb,
          '["bard","subclass","glamour","concentration"]'::jsonb,
          '{"kind":"self"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_resource_v1(
          'glamour-unbreakable-resource',
          'bard:glamour:unbreakable-majesty',
          'bard_glamour_unbreakable_majesty',
          'Нерушимое величие',
          '1'::jsonb,
          '["short_rest","long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'glamour-unbreakable-action',
          'bard:glamour:unbreakable-majesty',
          'bard_glamour_unbreakable_majesty_activate',
          'Нерушимое величие',
          'bonus_action',
          '[{"key":"bard_glamour_unbreakable_majesty","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"glamour_unbreakable_majesty","payload":{"durationMinutes":1,"endsIf":"incapacitated","trigger":"first_attack_hit_by_creature_each_turn","save":"charisma","onFail":"attack_misses"}}]'::jsonb,
          '["bard","subclass","glamour","table-adjudicated-turn"]'::jsonb,
          '{"kind":"self"}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:glamour',
    'bard-glamour',
    'Коллегия Очарования',
    'Player''s Handbook 2024',
    'PHB 2024: Обольщающая магия, Мантия вдохновения, Мантия величия и Нерушимое величие.',
    v_levels
  );

  -- College of Lore (PHB 2024)
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'choices',jsonb_build_array(private.bard_stage5_lore_skills_choice_v1()),
      'mechanics',jsonb_build_array(
        private.bard_stage5_action_v1(
          'lore-cutting-words',
          'bard:lore:cutting-words',
          'bard_lore_cutting_words',
          'Острое словцо',
          'reaction',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"lore_cutting_words","payload":{"rangeFeet":60,"trigger":["successful_attack_roll","successful_ability_check","damage_roll"],"subtract":"bardic_inspiration_die_roll","requiresTargetVisible":true}}]'::jsonb,
          '["bard","subclass","lore","bardic-inspiration","table-adjudicated-trigger"]'::jsonb,
          '{"kind":"ranged","normal":60,"unit":"feet"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'choices',jsonb_build_array(private.bard_stage5_lore_magical_discoveries_choice_v1())
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'lore-peerless-skill',
          'bard:lore:peerless-skill',
          'bard_lore_peerless_skill',
          'Непревзойдённое мастерство',
          'После провала проверки характеристики или атаки можно бросить кость Вдохновения барда и прибавить к d20. Вдохновение расходуется только если добавка превращает провал в успех.',
          '{"kind":"peerless_skill","trigger":["failed_ability_check","failed_attack_roll"],"die":"bardic_inspiration_die","spendOnlyOnSuccess":true,"action":"none","resolution":"table_adjudicated"}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:lore',
    'bard-lore',
    'Коллегия Знаний',
    'Player''s Handbook 2024',
    'PHB 2024: дополнительные навыки, Острое словцо, Магические открытия и Непревзойдённое мастерство.',
    v_levels
  );

  -- College of Valor (PHB 2024)
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'mechanics',jsonb_build_array(
        private.bard_stage5_grant_v1('valor-martial-weapons','bard:valor:martial-training','proficiency','weapon:martial','Воинское оружие'),
        private.bard_stage5_grant_v1('valor-medium-armor','bard:valor:martial-training','proficiency','armor:medium','Средние доспехи'),
        private.bard_stage5_grant_v1('valor-shields','bard:valor:martial-training','proficiency','armor:shield','Щиты'),
        private.bard_stage5_grant_v1('valor-weapon-focus','bard:valor:martial-training','permission','spellcasting_focus:simple_or_martial_weapon','Оружие как фокусировка'),
        private.bard_stage5_feature_v1(
          'valor-combat-inspiration',
          'bard:valor:combat-inspiration',
          'bard_valor_combat_inspiration',
          'Боевое вдохновение',
          'Существо с вашей костью Вдохновения барда может после попадания атакой добавить бросок кости к урону либо реакцией после попадания по нему добавить бросок к КД против этой атаки.',
          '{"kind":"combat_inspiration","usesExistingGrantedDie":true,"offense":{"trigger":"after_attack_hit","bonusDamage":"bardic_inspiration_die_roll"},"defense":{"trigger":"hit_by_attack","reaction":true,"acBonus":"bardic_inspiration_die_roll"}}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'valor-extra-attack',
          'bard:valor:extra-attack',
          'bard_valor_extra_attack',
          'Дополнительная атака',
          'Действие Атака позволяет атаковать дважды; одну атаку можно заменить заговором со временем сотворения Действие.',
          '{"kind":"extra_attack","attacks":2,"replaceOneAttackWithActionCantrip":true}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'valor-battle-magic',
          'bard:valor:battle-magic',
          'bard_valor_battle_magic',
          'Боевая магия',
          'После сотворения заклинания со временем сотворения Действие можно бонусным действием совершить одну атаку оружием.',
          '{"kind":"battle_magic","trigger":"cast_action_spell","bonusActionWeaponAttack":1}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:valor',
    'bard-valor',
    'Коллегия Доблести',
    'Player''s Handbook 2024',
    'PHB 2024: боевое Вдохновение, воинская подготовка, две атаки и Боевая магия.',
    v_levels
  );

  -- College of Eloquence
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'eloquence-silver-tongue',
          'bard:eloquence:silver-tongue',
          'bard_eloquence_silver_tongue',
          'Серебряный язык',
          'При проверке Харизмы (Убеждение или Обман) результат d20 9 или меньше считается 10.',
          '{"kind":"minimum_d20_result","skills":["persuasion","deception"],"ability":"charisma","minimum":10}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'eloquence-unsettling-words',
          'bard:eloquence:unsettling-words',
          'bard_eloquence_unsettling_words',
          'Тревожные слова',
          'bonus_action',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"eloquence_unsettling_words","payload":{"rangeFeet":60,"subtractFrom":"next_saving_throw","amount":"bardic_inspiration_die_roll","expires":"start_of_bard_next_turn"}}]'::jsonb,
          '["bard","subclass","eloquence","bardic-inspiration"]'::jsonb,
          '{"kind":"ranged","normal":60,"unit":"feet"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'eloquence-unfailing-inspiration',
          'bard:eloquence:unfailing-inspiration',
          'bard_eloquence_unfailing_inspiration',
          'Неиссякаемое вдохновение',
          'Если существо использует вашу кость Вдохновения барда на d20-проверке и всё равно проваливает её, кость сохраняется.',
          '{"kind":"unfailing_inspiration","retainDieOnFailedD20Test":true}'::jsonb
        ),
        private.bard_stage5_resource_v1(
          'eloquence-universal-speech-resource',
          'bard:eloquence:universal-speech',
          'bard_eloquence_universal_speech',
          'Всеобщая речь',
          '1'::jsonb,
          '["long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'eloquence-universal-speech-action',
          'bard:eloquence:universal-speech',
          'bard_eloquence_universal_speech_use',
          'Всеобщая речь',
          'action',
          '[]'::jsonb,
          private.bard_stage5_feature_or_slot_options_v1('bard_eloquence_universal_speech',1),
          '[{"kind":"semantic","key":"eloquence_universal_speech","payload":{"rangeFeet":60,"targetCount":"charisma_modifier_min_1","durationHours":1,"effect":"targets_understand_bard_regardless_of_language"}}]'::jsonb,
          '["bard","subclass","eloquence"]'::jsonb,
          '{"kind":"area","shape":"emanation","size":60,"unit":"feet"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_resource_v1(
          'eloquence-infectious-resource',
          'bard:eloquence:infectious-inspiration',
          'bard_eloquence_infectious_inspiration',
          'Заразительное вдохновение',
          v_cha_max,
          '["long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'eloquence-infectious-action',
          'bard:eloquence:infectious-inspiration',
          'bard_eloquence_infectious_inspiration_use',
          'Заразительное вдохновение',
          'reaction',
          '[{"key":"bard_eloquence_infectious_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"eloquence_infectious_inspiration","payload":{"trigger":"another_creature_succeeds_after_using_your_bardic_inspiration","rangeFeet":60,"target":"different_creature_other_than_self","grantsBardicInspirationWithoutPoolCost":true}}]'::jsonb,
          '["bard","subclass","eloquence","table-adjudicated-trigger"]'::jsonb,
          '{"kind":"ranged","normal":60,"unit":"feet"}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:eloquence',
    'bard-eloquence',
    'Коллегия Красноречия',
    'Tasha''s Cauldron of Everything / Mythic Odysseys of Theros',
    'Официальное дополнение: Серебряный язык, Тревожные слова, Всеобщая речь и Заразительное вдохновение.',
    v_levels
  );

  -- College of Swords
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'choices',jsonb_build_array(private.bard_stage5_swords_style_choice_v1()),
      'mechanics',jsonb_build_array(
        private.bard_stage5_grant_v1('swords-medium-armor','bard:swords:training','proficiency','armor:medium','Средние доспехи'),
        private.bard_stage5_grant_v1('swords-scimitar','bard:swords:training','proficiency','weapon:scimitar','Скимитар'),
        private.bard_stage5_grant_v1('swords-weapon-focus','bard:swords:training','permission','spellcasting_focus:proficient_simple_or_martial_melee_weapon','Оружие как фокусировка'),
        private.bard_stage5_feature_v1(
          'swords-blade-flourish-rule',
          'bard:swords:blade-flourish',
          'bard_swords_blade_flourish',
          'Росчерк клинка',
          'После действия Атака скорость увеличивается на 10 футов до конца хода. Раз за ход после попадания оружием можно потратить Вдохновение барда на Защитный, Рубящий или Мобильный росчерк.',
          '{"kind":"blade_flourish","trigger":"weapon_hit_during_attack_action","speedBonusFeet":10,"oncePerTurn":true,"resource":"bardic_inspiration","variants":["defensive","slashing","mobile"],"turnBoundary":"table_adjudicated"}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'swords-defensive-flourish',
          'bard:swords:blade-flourish',
          'bard_swords_defensive_flourish',
          'Защитный росчерк',
          'special',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"swords_defensive_flourish","payload":{"extraDamage":"bardic_inspiration_die_roll","acBonus":"bardic_inspiration_die_roll","acDuration":"start_of_next_turn"}}]'::jsonb,
          '["bard","subclass","swords","bardic-inspiration","table-adjudicated-hit"]'::jsonb,
          '{"kind":"self"}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'swords-slashing-flourish',
          'bard:swords:blade-flourish',
          'bard_swords_slashing_flourish',
          'Рубящий росчерк',
          'special',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"swords_slashing_flourish","payload":{"extraDamage":"bardic_inspiration_die_roll","secondaryTargets":"creatures_of_choice_within_5_feet","secondaryDamage":"same_die_roll"}}]'::jsonb,
          '["bard","subclass","swords","bardic-inspiration","table-adjudicated-hit"]'::jsonb,
          '{"kind":"area","shape":"emanation","size":5,"unit":"feet"}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'swords-mobile-flourish',
          'bard:swords:blade-flourish',
          'bard_swords_mobile_flourish',
          'Мобильный росчерк',
          'special',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"swords_mobile_flourish","payload":{"extraDamage":"bardic_inspiration_die_roll","pushFeet":"5_plus_die_roll","reactionMove":"up_to_speed_to_within_5_feet_of_target"}}]'::jsonb,
          '["bard","subclass","swords","bardic-inspiration","table-adjudicated-hit"]'::jsonb,
          '{"kind":"self"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'swords-extra-attack',
          'bard:swords:extra-attack',
          'bard_swords_extra_attack',
          'Дополнительная атака',
          'Действие Атака позволяет атаковать дважды.',
          '{"kind":"extra_attack","attacks":2}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'swords-masters-flourish',
          'bard:swords:masters-flourish',
          'bard_swords_masters_flourish',
          'Росчерк мастера',
          'Для Росчерка клинка можно использовать d6 вместо траты Вдохновения барда.',
          '{"kind":"masters_flourish","freeFlourishDie":{"count":1,"sides":6},"replacesBardicInspirationCost":true}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:swords',
    'bard-swords',
    'Коллегия Мечей',
    'Xanathar''s Guide to Everything',
    'Официальное дополнение: боевой стиль, Росчерк клинка, Дополнительная атака и Росчерк мастера.',
    v_levels
  );

  -- College of Whispers
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'mechanics',jsonb_build_array(
        private.bard_stage5_action_v1(
          'whispers-psychic-blades',
          'bard:whispers:psychic-blades',
          'bard_whispers_psychic_blades',
          'Психические клинки',
          'special',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"whispers_psychic_blades","payload":{"trigger":"weapon_hit","oncePerTurn":true,"psychicDamageDiceByBardLevel":{"3":"2d6","5":"3d6","10":"5d6","15":"8d6"}}}]'::jsonb,
          '["bard","subclass","whispers","bardic-inspiration","table-adjudicated-hit","table-adjudicated-turn"]'::jsonb,
          '{"kind":"self"}'::jsonb
        ),
        private.bard_stage5_resource_v1(
          'whispers-terror-resource',
          'bard:whispers:words-of-terror',
          'bard_whispers_words_of_terror',
          'Слова ужаса',
          '1'::jsonb,
          '["short_rest","long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'whispers-terror-action',
          'bard:whispers:words-of-terror',
          'bard_whispers_words_of_terror_use',
          'Слова ужаса',
          'special',
          '[{"key":"bard_whispers_words_of_terror","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"whispers_words_of_terror","payload":{"setupMinutes":1,"target":"humanoid_alone","save":"wisdom","onFail":"frightened","durationHours":1,"endsOn":["target_attacked_or_damaged","target_witnesses_ally_attacked_or_damaged"]}}]'::jsonb,
          '["bard","subclass","whispers","scene-setup"]'::jsonb,
          '{"kind":"ranged","normal":60,"unit":"feet"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'mechanics',jsonb_build_array(
        private.bard_stage5_resource_v1(
          'whispers-mantle-resource',
          'bard:whispers:mantle',
          'bard_whispers_mantle_capture',
          'Мантия шёпотов',
          '1'::jsonb,
          '["short_rest","long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'whispers-mantle-capture',
          'bard:whispers:mantle',
          'bard_whispers_capture_shadow',
          'Захватить тень',
          'reaction',
          '[{"key":"bard_whispers_mantle_capture","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"whispers_capture_shadow","payload":{"trigger":"humanoid_dies_within_30_feet","retainedUntil":"used_or_long_rest"}}]'::jsonb,
          '["bard","subclass","whispers","table-adjudicated-trigger"]'::jsonb,
          '{"kind":"ranged","normal":30,"unit":"feet"}'::jsonb
        ),
        private.bard_stage5_feature_v1(
          'whispers-mantle-use',
          'bard:whispers:mantle',
          'bard_whispers_mantle_of_whispers',
          'Мантия шёпотов',
          'Захваченную тень можно действием превратить в облик умершего гуманоида на 1 час. Вы получаете поверхностные сведения для имитации личности; при попытке распознать обман ваша проверка Харизмы (Обман) получает +5.',
          '{"kind":"mantle_of_whispers","requiresCapturedShadow":true,"activation":"action","durationHours":1,"deceptionBonus":5,"retainedShadowState":"table_adjudicated"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_resource_v1(
          'whispers-shadow-lore-resource',
          'bard:whispers:shadow-lore',
          'bard_whispers_shadow_lore',
          'Знание теней',
          '1'::jsonb,
          '["long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'whispers-shadow-lore-action',
          'bard:whispers:shadow-lore',
          'bard_whispers_shadow_lore_use',
          'Знание теней',
          'action',
          '[{"key":"bard_whispers_shadow_lore","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"whispers_shadow_lore","payload":{"rangeFeet":30,"requiresSharedLanguageAndHearing":true,"save":"wisdom","onFail":"charmed","durationHours":8,"endsOn":"bard_or_allies_attack_or_damage_target","socialControl":"close_friend_favors_without_suicidal_orders"}}]'::jsonb,
          '["bard","subclass","whispers"]'::jsonb,
          '{"kind":"ranged","normal":30,"unit":"feet"}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:whispers',
    'bard-whispers',
    'Коллегия Шёпотов',
    'Xanathar''s Guide to Everything',
    'Официальное дополнение: Психические клинки, Слова ужаса, Мантия шёпотов и Знание теней.',
    v_levels
  );

  -- College of Creation
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'creation-mote-potential',
          'bard:creation:mote-potential',
          'bard_creation_mote_of_potential',
          'Нотка потенциала',
          'Выданная вами кость Вдохновения барда получает дополнительный эффект: для проверки можно перебросить кость; для атаки — вызвать громовой урон рядом с целью; для спасброска — дать временные HP, равные броску + модификатор Харизмы.',
          '{"kind":"mote_of_potential","usesExistingGrantedDie":true,"abilityCheck":"reroll_inspiration_die_choose_either","attackRoll":{"save":"constitution","radiusFeet":5,"damageType":"thunder","damage":"bardic_inspiration_die_roll"},"savingThrow":{"temporaryHp":"bardic_inspiration_die_roll_plus_charisma_modifier_min_1"}}'::jsonb
        ),
        private.bard_stage5_resource_v1(
          'creation-performance-resource',
          'bard:creation:performance',
          'bard_creation_performance_of_creation',
          'Выступление творения',
          '1'::jsonb,
          '["long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'creation-performance-action',
          'bard:creation:performance',
          'bard_creation_performance_of_creation_use',
          'Выступление творения',
          'action',
          '[]'::jsonb,
          private.bard_stage5_feature_or_slot_options_v1('bard_creation_performance_of_creation',2),
          '[{"kind":"semantic","key":"creation_performance","payload":{"rangeFeet":10,"item":"nonmagical","maxGoldValue":"20_x_bard_level","maxSizeByBardLevel":{"3":"Medium","6":"Large","14":"Huge"},"durationHours":"proficiency_bonus","maxConcurrent":1}}]'::jsonb,
          '["bard","subclass","creation","created-object-state-table-adjudicated"]'::jsonb,
          '{"kind":"ranged","normal":10,"unit":"feet"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'mechanics',jsonb_build_array(
        private.bard_stage5_resource_v1(
          'creation-animate-resource',
          'bard:creation:animating-performance',
          'bard_creation_animating_performance',
          'Оживляющее выступление',
          '1'::jsonb,
          '["long_rest"]'::jsonb
        ),
        private.bard_stage5_action_v1(
          'creation-animate-action',
          'bard:creation:animating-performance',
          'bard_creation_animating_performance_use',
          'Оживляющее выступление',
          'action',
          '[]'::jsonb,
          private.bard_stage5_feature_or_slot_options_v1('bard_creation_animating_performance',3),
          '[{"kind":"semantic","key":"creation_animating_performance","payload":{"target":"large_or_smaller_nonmagical_unworn_object","rangeFeet":30,"durationHours":1,"sharesInitiative":true,"turn":"immediately_after_bard","defaultAction":"dodge","command":"bonus_action","bardicInspirationCanShareCommandBonusAction":true}}]'::jsonb,
          '["bard","subclass","creation","summon-state-table-adjudicated"]'::jsonb,
          '{"kind":"ranged","normal":30,"unit":"feet"}'::jsonb
        ),
        private.bard_stage5_feature_v1(
          'creation-dancing-item',
          'bard:creation:animating-performance',
          'bard_creation_dancing_item',
          'Танцующий предмет',
          'Оживлённый предмет использует КД 16, HP 10 + 5 × уровень барда, скорость 30 и полёт 30 (парение), иммунитет к яду и психическому урону и наносит силовой урон ударом 1d10 + бонус мастерства с вашим бонусом атаки заклинанием.',
          '{"kind":"dancing_item_statblock","ac":16,"hp":"10_plus_5_x_bard_level","speedFeet":30,"flyFeet":30,"hover":true,"damageImmunities":["poison","psychic"],"conditionImmunities":["charmed","exhaustion","poisoned","frightened"],"slam":{"attack":"bard_spell_attack","damage":"1d10_plus_proficiency_bonus","damageType":"force"},"irrepressibleDance":{"radiusFeet":10,"speedDeltaFeet":10}}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'creation-creative-crescendo',
          'bard:creation:creative-crescendo',
          'bard_creation_creative_crescendo',
          'Творческое крещендо',
          'Выступление творения больше не ограничено стоимостью; одновременно можно создавать число предметов, равное модификатору Харизмы (минимум 2), причём только один может быть максимального разрешённого размера.',
          '{"kind":"creative_crescendo","removeGoldLimit":true,"maxConcurrent":"charisma_modifier_min_2","onlyOneAtMaximumSize":true}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:creation',
    'bard-creation',
    'Коллегия Творения',
    'Tasha''s Cauldron of Everything',
    'Официальное дополнение: Нотка потенциала, Выступление творения, Танцующий предмет и Творческое крещендо.',
    v_levels
  );

  -- College of Spirits
  v_levels:=jsonb_build_array(
    jsonb_build_object(
      'level',3,
      'mechanics',jsonb_build_array(
        private.bard_stage5_spell_v1('spirits','bard:spirits:guiding-whispers','guidance','spirits-guidance'),
        private.bard_stage5_feature_v1(
          'spirits-channeler',
          'bard:spirits:channeler',
          'bard_spirits_channeler',
          'Духовная фокусировка',
          'Для вас Указание имеет дальность 60 футов. В качестве фокусировки для заклинаний барда можно использовать свечу, хрустальный шар, череп, спиритическую доску или колоду тарокка.',
          '{"kind":"spiritual_focus","guidanceRangeFeet":60,"focuses":["candle","crystal_ball","skull","spirit_board","tarokka_deck"]}'::jsonb
        ),
        private.bard_stage5_action_v1(
          'spirits-tales-roll',
          'bard:spirits:tales-beyond',
          'bard_spirits_tales_from_beyond',
          'Байки из запределья',
          'bonus_action',
          '[{"key":"bardic_inspiration","amount":1}]'::jsonb,
          '[]'::jsonb,
          '[{"kind":"semantic","key":"spirits_tales_from_beyond","payload":{"requiresSpiritualFocus":true,"roll":"bardic_inspiration_die","retainOneTaleUntil":"bestowed_or_short_or_long_rest","bestowAction":"action","targetRangeFeet":30,"saveDc":"bard_spell_save_dc","table":{"1":"int_wis_cha_check_bonus_die_for_10_minutes","2":"melee_spell_attack_force_damage_2_inspiration_dice_plus_charisma","3":"two_targets_temp_hp_inspiration_die_plus_charisma","4":"reaction_teleport_30_and_spread_to_charisma_targets","5":"melee_attackers_take_force_inspiration_die_for_1_minute","6":"temp_hp_inspiration_die_plus_bard_level_speed_plus_10_ac_plus_1","7":"wis_save_psychic_2_inspiration_dice_and_incapacitated_until_end_next_turn","8":"temporary_invisibility_then_necrotic_inspiration_die_and_frightened","9":"strength_save_3_inspiration_dice_thunder_and_prone_half_on_success","10":"30_foot_cone_dex_save_4_inspiration_dice_fire_half_on_success","11":"heal_2_inspiration_dice_plus_charisma_and_end_one_listed_condition","12":"int_save_3_inspiration_dice_psychic_and_stunned_until_end_next_turn"}}}]'::jsonb,
          '["bard","subclass","spirits","bardic-inspiration","random-table","table-adjudicated-resolution"]'::jsonb,
          '{"kind":"self"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',6,
      'choices',jsonb_build_array(private.bard_stage5_spirit_session_choice_v1()),
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'spirits-spiritual-focus-empowered',
          'bard:spirits:spiritual-focus',
          'bard_spirits_spiritual_focus_empowered',
          'Усиленная духовная фокусировка',
          'Когда через духовную фокусировку заклинание барда наносит урон или восстанавливает HP, один бросок урона или лечения получает дополнительный d6.',
          '{"kind":"spiritual_focus_bonus","trigger":"bard_spell_damage_or_healing_through_focus","bonus":"1d6_to_one_damage_or_healing_roll"}'::jsonb
        ),
        private.bard_stage5_feature_v1(
          'spirits-session-rule',
          'bard:spirits:spirit-session',
          'bard_spirits_spirit_session_rule',
          'Спиритический сеанс',
          'После часового ритуала с числом согласных участников до бонуса мастерства выберите одно заклинание Прорицания или Некромантии из любого списка. Его уровень не может превышать число участников и доступный вам уровень заклинаний. Вы знаете его как заклинание барда до следующего долгого отдыха.',
          '{"kind":"spirit_session","ritualMinutes":60,"participantMaximum":"proficiency_bonus","spellSchools":["Divination","Necromancy"],"maxSpellLevel":"min(participant_count,highest_castable_spell_level)","refresh":"long_rest","participantCount":"table_adjudicated"}'::jsonb
        )
      )
    ),
    jsonb_build_object(
      'level',14,
      'mechanics',jsonb_build_array(
        private.bard_stage5_feature_v1(
          'spirits-mystical-connection',
          'bard:spirits:mystical-connection',
          'bard_spirits_mystical_connection',
          'Мистическая связь',
          'Для Баек из запределья бросайте кость Вдохновения дважды и выбирайте результат; при одинаковых значениях можно выбрать любую байку таблицы.',
          '{"kind":"mystical_connection","talesRollCount":2,"chooseEither":true,"matchingRollsAllowAnyTale":true}'::jsonb
        )
      )
    )
  );
  perform private.bard_stage5_upsert_subclass_v1(
    p_campaign_id,v_parent,
    'subclass:bard:spirits',
    'bard-spirits',
    'Коллегия Духов',
    'Van Richten''s Guide to Ravenloft',
    'Официальное дополнение: духовная фокусировка, Байки из запределья, Спиритический сеанс и Мистическая связь.',
    v_levels
  );

  -- College of Tragedy is explicitly outside runtime scope.
  update public.rule_templates
  set is_active=false,
      updated_at=now()
  where campaign_id=p_campaign_id
    and catalog_key='subclass:bard:tragedy'
    and is_builtin=true;

  update public.rule_templates
  set catalog_revision='xphb-2024-bard-stage5-subclasses-runtime-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_revision','xphb-2024-bard-stage5-subclasses-runtime-v1',
        'runtime_stage',5,
        'mechanics_status','IN_PROGRESS_STAGE5_SUBCLASS_RUNTIME_READY',
        'subclass_runtime_included',true,
        'subclass_runtime_count',9,
        'subclass_runtime_scope','PHB2024_4_PLUS_APPROVED_LEGACY_5',
        'subclass_runtime_catalog_keys',jsonb_build_array(
          'subclass:bard:dance',
          'subclass:bard:glamour',
          'subclass:bard:lore',
          'subclass:bard:valor',
          'subclass:bard:eloquence',
          'subclass:bard:swords',
          'subclass:bard:whispers',
          'subclass:bard:creation',
          'subclass:bard:spirits'
        ),
        'subclass_reference_only_catalog_keys',jsonb_build_array('subclass:bard:tragedy'),
        'canonical_bardic_inspiration_resource','bardic_inspiration',
        'next_stage','bard_final_certification'
      ),
      updated_at=now()
  where id=v_parent;
end;
$$;

revoke all on function private.ensure_bard_subclasses_stage5_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_bard_subclasses_stage5_v1(uuid)
to service_role;

create or replace function private.ensure_bard_subclasses_stage5_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.ensure_bard_subclasses_stage5_v1(new.id);
  return new;
end;
$$;

revoke all on function private.ensure_bard_subclasses_stage5_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists aaaaaaaaj_campaigns_ensure_bard_base_runtime_stage4_v1
on public.campaigns;
drop trigger if exists aaaaaaaak_campaigns_ensure_bard_subclasses_stage5_v1
on public.campaigns;

create trigger aaaaaaaak_campaigns_ensure_bard_subclasses_stage5_v1
after insert on public.campaigns
for each row execute function private.ensure_bard_subclasses_stage5_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_bard_subclasses_stage5_v1(r.id);
  end loop;
end;
$apply$;

do $cert$
declare
  r record;
  v_count integer;
  v_bad integer;
  v_bi_bad integer;
  v_spell_links integer;
  v_lore_choice jsonb;
  v_spirit_choice jsonb;
begin
  for r in
    select id,campaign_id,catalog_revision,rules_meta
    from public.rule_templates
    where kind='class'
      and catalog_key='class:bard'
      and is_active
  loop
    if r.catalog_revision<>'xphb-2024-bard-stage5-subclasses-runtime-v1' then
      raise exception 'BARD_STAGE5_BAD_PARENT_REVISION:%:%',r.campaign_id,r.catalog_revision;
    end if;

    if coalesce((r.rules_meta->>'subclass_runtime_count')::integer,0)<>9 then
      raise exception 'BARD_STAGE5_BAD_SUBCLASS_COUNT_META:%',r.campaign_id;
    end if;

    select count(*) into v_count
    from public.rule_templates
    where campaign_id=r.campaign_id
      and kind='subclass'
      and parent_template_id=r.id
      and is_active
      and catalog_key in (
        'subclass:bard:dance',
        'subclass:bard:glamour',
        'subclass:bard:lore',
        'subclass:bard:valor',
        'subclass:bard:eloquence',
        'subclass:bard:swords',
        'subclass:bard:whispers',
        'subclass:bard:creation',
        'subclass:bard:spirits'
      );
    if v_count<>9 then
      raise exception 'BARD_STAGE5_RUNTIME_COUNT_INVALID:%:%',r.campaign_id,v_count;
    end if;

    select count(*) into v_bad
    from public.rule_templates
    where campaign_id=r.campaign_id
      and kind='subclass'
      and parent_template_id=r.id
      and is_active
      and catalog_key in (
        'subclass:bard:dance',
        'subclass:bard:glamour',
        'subclass:bard:lore',
        'subclass:bard:valor',
        'subclass:bard:eloquence',
        'subclass:bard:swords',
        'subclass:bard:whispers',
        'subclass:bard:creation',
        'subclass:bard:spirits'
      )
      and (
        unlock_level<>3
        or catalog_revision<>'bard-stage5-subclasses-runtime-v1'
        or rules_meta->>'parent_level_source'<>'class:bard'
      );
    if v_bad<>0 then
      raise exception 'BARD_STAGE5_PARENT_OR_REVISION_INVALID:%:%',r.campaign_id,v_bad;
    end if;

    if exists(
      select 1 from public.rule_templates
      where campaign_id=r.campaign_id
        and catalog_key='subclass:bard:tragedy'
        and is_builtin=true
        and is_active
    ) then
      raise exception 'BARD_STAGE5_TRAGEDY_MUST_REMAIN_REFERENCE_ONLY:%',r.campaign_id;
    end if;

    select count(*) into v_bi_bad
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=r.campaign_id
      and t.parent_template_id=r.id
      and t.is_active
      and coalesce(m.value->'tags','[]'::jsonb) @> '["bardic-inspiration"]'::jsonb
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(m.value->'resourceCosts','[]'::jsonb)) c(value)
        where c.value->>'key'='bardic_inspiration'
      );

    if v_bi_bad<>0 then
      raise exception 'BARD_STAGE5_NONCANONICAL_INSPIRATION_RESOURCE:%:%',r.campaign_id,v_bi_bad;
    end if;

    select c.value into v_lore_choice
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=6
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where t.campaign_id=r.campaign_id
      and t.catalog_key='subclass:bard:lore'
      and t.is_active
      and c.value->>'key'='bard_lore_magical_discoveries'
    limit 1;

    if v_lore_choice is null
       or (v_lore_choice->>'count')::integer<>2
       or v_lore_choice->>'replacement_policy'<>'on_level_change'
       or (v_lore_choice->>'replacement_limit')::integer<>1
    then
      raise exception 'BARD_STAGE5_LORE_DISCOVERIES_INVALID:%',r.campaign_id;
    end if;

    select c.value into v_spirit_choice
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=6
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where t.campaign_id=r.campaign_id
      and t.catalog_key='subclass:bard:spirits'
      and t.is_active
      and c.value->>'key'='bard_spirits_spirit_session'
    limit 1;

    if v_spirit_choice is null
       or v_spirit_choice->>'refresh'<>'long_rest'
       or (v_spirit_choice->>'count')::integer<>1
    then
      raise exception 'BARD_STAGE5_SPIRIT_SESSION_INVALID:%',r.campaign_id;
    end if;

    select count(*) into v_spell_links
    from public.rule_template_spell_links sl
    join public.rule_templates t on t.id=sl.template_id
    where t.campaign_id=r.campaign_id
      and t.parent_template_id=r.id
      and t.catalog_key in (
        'subclass:bard:glamour',
        'subclass:bard:lore',
        'subclass:bard:spirits'
      )
      and t.is_active;

    if v_spell_links=0 then
      raise exception 'BARD_STAGE5_SUBCLASS_SPELL_LINKS_MISSING:%',r.campaign_id;
    end if;
  end loop;
end;
$cert$;

commit;
