-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererSubclassesStage7.test.ts
-- CLASS_WORK_STATUS: sorcerer:text=READY_AUTHORING_SCOPE;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.sorcerer_stage7_feature_v1(
  p_id text, p_source_key text, p_key text, p_label text, p_description text, p_mechanic jsonb
) returns jsonb
language sql immutable set search_path=''
as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','feature','key',p_key,'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',coalesce(p_mechanic,'{}'::jsonb))
  );
$$;

create or replace function private.sorcerer_stage7_grant_v1(
  p_id text, p_source_key text, p_target text, p_key text, p_label text
) returns jsonb
language sql immutable set search_path=''
as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target',p_target,'key',p_key,'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label)
  );
$$;

create or replace function private.sorcerer_stage7_resource_v1(
  p_id text, p_source_key text, p_key text, p_label text, p_max jsonb, p_recharge jsonb
) returns jsonb
language sql immutable set search_path=''
as $$
  select jsonb_build_object(
    'id',p_id,'type','resource','sourceKey',p_source_key,'key',p_key,'label',p_label,
    'max',p_max,'recharge',p_recharge,'initial','full'
  );
$$;

create or replace function private.sorcerer_stage7_action_v1(
  p_id text, p_source_key text, p_key text, p_label text, p_economy text,
  p_costs jsonb, p_effects jsonb, p_tags jsonb
) returns jsonb
language sql immutable set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','action','sourceKey',p_source_key,'key',p_key,'label',p_label,'economy',p_economy,
    'resourceCosts',case when jsonb_array_length(coalesce(p_costs,'[]'::jsonb))>0 then p_costs else null end,
    'effects',case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects else null end,
    'tags',coalesce(p_tags,'["sorcerer","subclass"]'::jsonb)
  ));
$$;

create or replace function private.sorcerer_stage7_spell_v1(
  p_subclass text, p_source_key text, p_slug text, p_method_key text, p_resource_costs jsonb
) returns jsonb
language plpgsql stable set search_path=''
as $$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
begin
  select * into v_spell from public.spell_catalog where slug=p_slug;
  if not found then raise exception 'SORCERER_STAGE7_SPELL_NOT_FOUND:%',p_slug; end if;

  v_method:=jsonb_build_object(
    'key',p_method_key,
    'kind',case when p_resource_costs is null then 'class_spell' else 'class_feature' end,
    'ability','charisma',
    'saveDc',jsonb_build_object('kind','add','terms',jsonb_build_array(
      jsonb_build_object('kind','literal','value',8),
      jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
    )),
    'attackBonus',jsonb_build_object('kind','add','terms',jsonb_build_array(
      jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
    )),
    'requiresPrepared',false
  );

  if v_spell.spell_level>0 then
    v_method:=v_method||jsonb_build_object(
      'resourceOptions',
      case
        when p_resource_costs is null then private.class_spell_slot_options(v_spell.spell_level)
        else jsonb_build_array(jsonb_build_object('key',p_method_key,'castLevel',v_spell.spell_level,'costs',p_resource_costs))
      end
    );
  end if;

  return jsonb_build_object(
    'id',p_subclass||'-'||p_method_key||'-'||p_slug,
    'type','spell','sourceKey',p_source_key,'key','spell:'||p_slug,'catalogSlug',p_slug,
    'variantKey','sorcerer-subclass:'||p_subclass||':'||p_method_key||':'||p_slug,
    'grantOperation','GRANT',
    'payload',jsonb_build_object(
      'spell',jsonb_build_object(
        'name',coalesce(nullif(v_spell.name_ru,''),nullif(v_spell.name_en,''),v_spell.slug),
        'level',v_spell.spell_level,'school',v_spell.school,'ritual',coalesce(v_spell.ritual,false)
      ),
      'preparation',jsonb_build_object('mode','always_prepared'),
      'methods',jsonb_build_array(v_method)
    )
  );
end;
$$;

create or replace function private.sorcerer_stage7_spells_for_level_v1(p_subclass text,p_level integer)
returns jsonb language plpgsql stable set search_path=''
as $$
declare v_result jsonb:='[]'::jsonb; r record;
begin
  for r in
    select x.slug
    from (values
      ('aberrant-sorcery','arms-of-hadar',3),('aberrant-sorcery','calm-emotions',3),('aberrant-sorcery','detect-thoughts',3),('aberrant-sorcery','dissonant-whispers',3),('aberrant-sorcery','mind-sliver',3),
      ('aberrant-sorcery','hunger-of-hadar',5),('aberrant-sorcery','sending',5),('aberrant-sorcery','black-tentacles',7),('aberrant-sorcery','summon-aberration',7),('aberrant-sorcery','telepathic-bond',9),('aberrant-sorcery','telekinesis',9),
      ('clockwork-sorcery','aid',3),('clockwork-sorcery','alarm',3),('clockwork-sorcery','lesser-restoration',3),('clockwork-sorcery','protection-from-evil-and-good',3),
      ('clockwork-sorcery','dispel-magic',5),('clockwork-sorcery','protection-from-energy',5),('clockwork-sorcery','freedom-of-movement',7),('clockwork-sorcery','summon-construct',7),('clockwork-sorcery','greater-restoration',9),('clockwork-sorcery','wall-of-force',9),
      ('draconic-sorcery','alter-self',3),('draconic-sorcery','chromatic-orb',3),('draconic-sorcery','command',3),('draconic-sorcery','dragon-s-breath',3),
      ('draconic-sorcery','fear',5),('draconic-sorcery','fly',5),('draconic-sorcery','arcane-eye',7),('draconic-sorcery','charm-monster',7),('draconic-sorcery','legend-lore',9),('draconic-sorcery','summon-dragon',9),
      ('lunar-sorcery','shield',3),('lunar-sorcery','ray-of-sickness',3),('lunar-sorcery','color-spray',3),('lunar-sorcery','lesser-restoration',3),('lunar-sorcery','blindness-deafness',3),('lunar-sorcery','alter-self',3),
      ('lunar-sorcery','dispel-magic',5),('lunar-sorcery','vampiric-touch',5),('lunar-sorcery','phantom-steed',5),
      ('lunar-sorcery','death-ward',7),('lunar-sorcery','confusion',7),('lunar-sorcery','hallucinatory-terrain',7),
      ('lunar-sorcery','telepathic-bond',9),('lunar-sorcery','hold-monster',9),('lunar-sorcery','mislead',9)
    ) as x(subclass,slug,unlock_level)
    where x.subclass=p_subclass and x.unlock_level=p_level
    order by x.slug
  loop
    v_result:=v_result||jsonb_build_array(private.sorcerer_stage7_spell_v1(
      p_subclass,'sorcerer:'||p_subclass||':spells',r.slug,'sorcerer-subclass',null
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.sorcerer_stage7_aberrant_psionic_for_level_v1(p_level integer)
returns jsonb language plpgsql stable set search_path=''
as $$
declare v_result jsonb:='[]'::jsonb; r record; v_spell public.spell_catalog%rowtype;
begin
  for r in
    select * from (values
      ('arms-of-hadar',6),('calm-emotions',6),('detect-thoughts',6),('dissonant-whispers',6),('hunger-of-hadar',6),('sending',6),
      ('black-tentacles',7),('summon-aberration',7),('telepathic-bond',9),('telekinesis',9)
    ) as x(slug,stage_level)
    where x.stage_level=p_level
  loop
    select * into v_spell from public.spell_catalog where slug=r.slug;
    if not found then raise exception 'SORCERER_STAGE7_PSIONIC_SPELL_NOT_FOUND:%',r.slug; end if;
    v_result:=v_result||jsonb_build_array(private.sorcerer_stage7_spell_v1(
      'aberrant-sorcery','sorcerer:aberrant:psionic',r.slug,'psionic-sorcery',
      jsonb_build_array(jsonb_build_object('key','sorcery_points','amount',v_spell.spell_level))
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.sorcerer_stage7_draconic_affinity_choice_v1()
returns jsonb language sql immutable set search_path=''
as $$
  select jsonb_build_object(
    'key','sorcerer_draconic_affinity','label','Стихийное сродство','target','trait','count',1,
    'selection_mode','player_once','replacement_policy','locked',
    'options',jsonb_build_array('acid','cold','fire','lightning','poison'),
    'option_labels',jsonb_build_object('acid','Кислота','cold','Холод','fire','Огонь','lightning','Электричество','poison','Яд'),
    'option_mechanics',jsonb_build_object(
      'acid',jsonb_build_array(private.sorcerer_stage7_grant_v1('draconic-affinity-acid','sorcerer:draconic:affinity','resistance','damage:acid','Стихийное сродство')),
      'cold',jsonb_build_array(private.sorcerer_stage7_grant_v1('draconic-affinity-cold','sorcerer:draconic:affinity','resistance','damage:cold','Стихийное сродство')),
      'fire',jsonb_build_array(private.sorcerer_stage7_grant_v1('draconic-affinity-fire','sorcerer:draconic:affinity','resistance','damage:fire','Стихийное сродство')),
      'lightning',jsonb_build_array(private.sorcerer_stage7_grant_v1('draconic-affinity-lightning','sorcerer:draconic:affinity','resistance','damage:lightning','Стихийное сродство')),
      'poison',jsonb_build_array(private.sorcerer_stage7_grant_v1('draconic-affinity-poison','sorcerer:draconic:affinity','resistance','damage:poison','Стихийное сродство'))
    )
  );
$$;

create or replace function private.sorcerer_stage7_divine_affinity_choice_v1()
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'key','sorcerer_divine_soul_affinity','label','Божественная душа: источник силы','target','trait','count',1,
    'selection_mode','player_once','replacement_policy','locked',
    'options',jsonb_build_array('good','evil','law','chaos','neutrality'),
    'option_labels',jsonb_build_object('good','Добро','evil','Зло','law','Закон','chaos','Хаос','neutrality','Нейтральность'),
    'option_mechanics',jsonb_build_object(
      'good',jsonb_build_array(private.sorcerer_stage7_spell_v1('divine-soul','sorcerer:divine-soul:divine-magic','cure-wounds','sorcerer-subclass',null)),
      'evil',jsonb_build_array(private.sorcerer_stage7_spell_v1('divine-soul','sorcerer:divine-soul:divine-magic','inflict-wounds','sorcerer-subclass',null)),
      'law',jsonb_build_array(private.sorcerer_stage7_spell_v1('divine-soul','sorcerer:divine-soul:divine-magic','bless','sorcerer-subclass',null)),
      'chaos',jsonb_build_array(private.sorcerer_stage7_spell_v1('divine-soul','sorcerer:divine-soul:divine-magic','bane','sorcerer-subclass',null)),
      'neutrality',jsonb_build_array(private.sorcerer_stage7_spell_v1('divine-soul','sorcerer:divine-soul:divine-magic','protection-from-evil-and-good','sorcerer-subclass',null))
    )
  );
$$;

create or replace function private.sorcerer_stage7_lunar_phase_choice_v1()
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'key','sorcerer_lunar_phase','label','Лунная фаза','target','trait','count',1,
    'selection_mode','player_once','refresh','long_rest','replacement_policy','preparation','replacement_limit',1,
    'options',jsonb_build_array('full','new','crescent'),
    'option_labels',jsonb_build_object('full','Полная луна','new','Новолуние','crescent','Серп луны'),
    'option_mechanics',jsonb_build_object(
      'full',jsonb_build_array(private.sorcerer_stage7_spell_v1('lunar-sorcery','sorcerer:lunar:embodiment','shield','lunar-free-full',jsonb_build_array(jsonb_build_object('key','sorcerer_lunar_free_phase_cast','amount',1)))),
      'new',jsonb_build_array(private.sorcerer_stage7_spell_v1('lunar-sorcery','sorcerer:lunar:embodiment','ray-of-sickness','lunar-free-new',jsonb_build_array(jsonb_build_object('key','sorcerer_lunar_free_phase_cast','amount',1)))),
      'crescent',jsonb_build_array(private.sorcerer_stage7_spell_v1('lunar-sorcery','sorcerer:lunar:embodiment','color-spray','lunar-free-crescent',jsonb_build_array(jsonb_build_object('key','sorcerer_lunar_free_phase_cast','amount',1))))
    )
  );
$$;

create or replace function private.sorcerer_stage7_upsert_v1(
  p_campaign_id uuid,p_parent_id uuid,p_catalog_key text,p_slug text,p_name text,
  p_source_label text,p_summary text,p_levels jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_level record;
begin
  select id into v_id from public.rule_templates
  where campaign_id=p_campaign_id and catalog_key=p_catalog_key and is_builtin=true
  order by updated_at desc limit 1;

  if v_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,
      is_builtin,mechanical_summary,rules_meta
    ) values (
      p_campaign_id,'subclass',p_slug,p_name,p_summary,1,'[]'::jsonb,'[]'::jsonb,true,
      p_parent_id,3,p_catalog_key,'xphb-2024-sorcerer-stage7-subclass-runtime-v1','official',p_source_label,
      true,p_summary,jsonb_build_object(
        'base_class','class:sorcerer','runtime_status','READY_STAGE7','parent_level_source','class:sorcerer',
        'chat_template_actions',true,'chat_template_spells',true
      )
    ) returning id into v_id;
  else
    update public.rule_templates
    set kind='subclass',slug=p_slug,name=p_name,description=p_summary,mechanics='[]'::jsonb,choices='[]'::jsonb,
        is_active=true,parent_template_id=p_parent_id,unlock_level=3,
        catalog_revision='xphb-2024-sorcerer-stage7-subclass-runtime-v1',
        source_kind='official',source_label=p_source_label,is_builtin=true,mechanical_summary=p_summary,
        rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
          'base_class','class:sorcerer','runtime_status','READY_STAGE7','parent_level_source','class:sorcerer',
          'chat_template_actions',true,'chat_template_spells',true
        ),updated_at=now()
    where id=v_id;
  end if;

  delete from public.rule_template_levels where template_id=v_id;
  for v_level in select value from jsonb_array_elements(p_levels) x(value)
  loop
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_id,(v_level.value->>'level')::integer,coalesce(v_level.value->'mechanics','[]'::jsonb),coalesce(v_level.value->'choices','[]'::jsonb));
  end loop;
  return v_id;
end;
$$;

create or replace function private.sorcerer_stage7_extend_divine_spell_choices_v1(p_parent_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_choices jsonb;
  v_cantrip_options jsonb:='[]'::jsonb; v_cantrip_labels jsonb:='{}'::jsonb; v_cantrip_mechanics jsonb:='{}'::jsonb; v_cantrip_unlocks jsonb:='{}'::jsonb; v_cantrip_rules jsonb:='{}'::jsonb;
  v_spell_options jsonb:='[]'::jsonb; v_spell_labels jsonb:='{}'::jsonb; v_spell_mechanics jsonb:='{}'::jsonb; v_spell_unlocks jsonb:='{}'::jsonb; v_spell_rules jsonb:='{}'::jsonb;
  v_cantrip_choice jsonb; v_spell_choice jsonb; r record; v_unlock integer;
begin
  for r in
    select s.*, 
      exists(select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='sorcerer') is_sorcerer,
      exists(select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='cleric') is_cleric
    from public.spell_catalog s
    where s.spell_level=0 and exists(
      select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key in ('sorcerer','cleric')
    )
    order by s.sort_order,coalesce(s.name_ru,s.name_en),s.slug
  loop
    v_cantrip_options:=v_cantrip_options||jsonb_build_array(r.slug);
    v_cantrip_labels:=jsonb_set(v_cantrip_labels,array[r.slug],to_jsonb(coalesce(nullif(r.name_ru,''),nullif(r.name_en,''),r.slug)),true);
    v_cantrip_mechanics:=jsonb_set(v_cantrip_mechanics,array[r.slug],jsonb_build_array(private.sorcerer_stage6_spell_mechanic_v1(r.slug)),true);
    v_cantrip_unlocks:=jsonb_set(v_cantrip_unlocks,array[r.slug],to_jsonb(1),true);
    if not r.is_sorcerer and r.is_cleric then
      v_cantrip_rules:=jsonb_set(v_cantrip_rules,array[r.slug],jsonb_build_object(
        'source_requirements_any',jsonb_build_array(jsonb_build_object('catalog_key','subclass:sorcerer:divine-soul'))
      ),true);
    end if;
  end loop;

  for r in
    select s.*,
      exists(select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='sorcerer') is_sorcerer,
      exists(select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='cleric') is_cleric
    from public.spell_catalog s
    where s.spell_level between 1 and 9 and exists(
      select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key in ('sorcerer','cleric')
    )
    order by s.spell_level,s.sort_order,coalesce(s.name_ru,s.name_en),s.slug
  loop
    v_unlock:=case r.spell_level when 1 then 1 when 2 then 3 when 3 then 5 when 4 then 7 when 5 then 9 when 6 then 11 when 7 then 13 when 8 then 15 else 17 end;
    v_spell_options:=v_spell_options||jsonb_build_array(r.slug);
    v_spell_labels:=jsonb_set(v_spell_labels,array[r.slug],to_jsonb(coalesce(nullif(r.name_ru,''),nullif(r.name_en,''),r.slug)),true);
    v_spell_mechanics:=jsonb_set(v_spell_mechanics,array[r.slug],jsonb_build_array(private.sorcerer_stage6_spell_mechanic_v1(r.slug)),true);
    v_spell_unlocks:=jsonb_set(v_spell_unlocks,array[r.slug],to_jsonb(v_unlock),true);
    if not r.is_sorcerer and r.is_cleric then
      v_spell_rules:=jsonb_set(v_spell_rules,array[r.slug],jsonb_build_object(
        'source_requirements_any',jsonb_build_array(jsonb_build_object('catalog_key','subclass:sorcerer:divine-soul'))
      ),true);
    end if;
  end loop;

  v_cantrip_choice:=jsonb_build_object(
    'key','sorcerer_cantrips','label','Заговоры чародея','target','spell','count',4,
    'count_by_level',jsonb_build_object('1',4,'4',5,'10',6),
    'selection_mode','player_once','replacement_policy','on_level_change','replacement_limit',1,
    'options',v_cantrip_options,'option_labels',v_cantrip_labels,'option_unlock_level',v_cantrip_unlocks,
    'option_rules',v_cantrip_rules,'option_mechanics',v_cantrip_mechanics
  );
  v_spell_choice:=jsonb_build_object(
    'key','sorcerer_prepared_spells','label','Подготовленные заклинания чародея','target','spell','count',2,
    'count_by_level',jsonb_build_object(
      '1',2,'2',4,'3',6,'4',7,'5',9,'6',10,'7',11,'8',12,'9',14,'10',15,
      '11',16,'12',16,'13',17,'14',17,'15',18,'16',18,'17',19,'18',20,'19',21,'20',22
    ),
    'selection_mode','player_once','replacement_policy','on_level_change','replacement_limit',1,
    'options',v_spell_options,'option_labels',v_spell_labels,'option_unlock_level',v_spell_unlocks,
    'option_rules',v_spell_rules,'option_mechanics',v_spell_mechanics
  );

  select coalesce(choices,'[]'::jsonb) into v_choices
  from public.rule_template_levels where template_id=p_parent_id and level=1 for update;

  v_choices:=(
    select coalesce(jsonb_agg(c.value order by c.ord),'[]'::jsonb)
    from jsonb_array_elements(v_choices) with ordinality c(value,ord)
    where c.value->>'key' not in ('sorcerer_cantrips','sorcerer_prepared_spells')
  );

  update public.rule_template_levels
  set choices=v_choices||jsonb_build_array(v_cantrip_choice,v_spell_choice)
  where template_id=p_parent_id and level=1;
end;
$$;

create or replace function private.ensure_sorcerer_stage7_subclass_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_parent uuid; v_id uuid; v_levels jsonb; r record; i integer;
  v_cha_max jsonb:=jsonb_build_object('kind','max','values',jsonb_build_array(jsonb_build_object('kind','literal','value',1),jsonb_build_object('kind','reference','key','abilities.charisma.modifier')));
begin
  perform private.ensure_sorcerer_stage6_spell_runtime_v1(p_campaign_id);

  select id into v_parent from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:sorcerer' and is_active
  order by version desc,created_at desc limit 1;
  if v_parent is null then raise exception 'SORCERER_STAGE7_PARENT_MISSING:%',p_campaign_id; end if;

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',private.sorcerer_stage7_spells_for_level_v1('aberrant-sorcery',3)||jsonb_build_array(
      private.sorcerer_stage7_feature_v1('aberrant-telepathy','sorcerer:aberrant:telepathy','sorcerer_aberrant_telepathic_speech','Телепатическая речь','Бонусным действием установите телепатическую связь с видимым существом; дальность и длительность зависят от уровня чародея, общение возможно при общем языке.','{"kind":"telepathic_speech"}'::jsonb)
    )),
    jsonb_build_object('level',5,'mechanics',private.sorcerer_stage7_spells_for_level_v1('aberrant-sorcery',5)),
    jsonb_build_object('level',6,'mechanics',private.sorcerer_stage7_aberrant_psionic_for_level_v1(6)||jsonb_build_array(
      private.sorcerer_stage7_feature_v1('aberrant-psionic','sorcerer:aberrant:psionic','sorcerer_aberrant_psionic_sorcery','Псионическое чародейство','Псионические заклинания 1 уровня и выше можно сотворять за Очки чародейства, равные уровню заклинания, вместо ячейки; не нужны вербальные и соматические компоненты, а материальные компоненты с указанной стоимостью по-прежнему требуются.','{"kind":"psionic_sorcery"}'::jsonb),
      private.sorcerer_stage7_grant_v1('aberrant-psychic-resistance','sorcerer:aberrant:psychic-defenses','resistance','damage:psychic','Психическая защита'),
      private.sorcerer_stage7_feature_v1('aberrant-psychic-defenses','sorcerer:aberrant:psychic-defenses','sorcerer_aberrant_psychic_defenses','Психическая защита','Сопротивление психическому урону и преимущество на спасброски против Очарования и Испуга.','{"kind":"psychic_defenses"}'::jsonb)
    )),
    jsonb_build_object('level',7,'mechanics',private.sorcerer_stage7_spells_for_level_v1('aberrant-sorcery',7)||private.sorcerer_stage7_aberrant_psionic_for_level_v1(7)),
    jsonb_build_object('level',9,'mechanics',private.sorcerer_stage7_spells_for_level_v1('aberrant-sorcery',9)||private.sorcerer_stage7_aberrant_psionic_for_level_v1(9)),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('aberrant-revelation','sorcerer:aberrant:revelation','sorcerer_aberrant_revelation_in_flesh','Откровение во плоти','Бонусным действием тратьте по 1 Очку чародейства за каждое выбранное телесное изменение на 10 минут: видение невидимого, полёт, плавание и дыхание под водой или прохождение через узкие пространства.','{"kind":"revelation_in_flesh","durationMinutes":10}'::jsonb),
      private.sorcerer_stage7_action_v1('aberrant-revelation-action','sorcerer:aberrant:revelation','sorcerer_aberrant_revelation_in_flesh','Откровение во плоти','bonus_action',jsonb_build_array(jsonb_build_object('key','sorcery_points','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','revelation_in_flesh','payload',jsonb_build_object('durationMinutes',10))),null)
    )),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('aberrant-implosion','sorcerer:aberrant:implosion','sorcerer_aberrant_warping_implosion','Искривляющее схлопывание','Действием телепортируйтесь на 120 футов. Существа в пределах 30 футов от оставленной точки совершают спасбросок Силы; при провале получают 3d10 силового урона и притягиваются к центру. Одно бесплатное применение после долгого отдыха; повторное стоит 5 Очков чародейства.','{"kind":"warping_implosion","rangeFeet":120,"radiusFeet":30,"damage":"3d10","save":"strength"}'::jsonb),
      private.sorcerer_stage7_resource_v1('aberrant-implosion-use','sorcerer:aberrant:implosion','sorcerer_aberrant_warping_implosion','Искривляющее схлопывание','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('aberrant-implosion-free','sorcerer:aberrant:implosion','sorcerer_aberrant_warping_implosion_free','Искривляющее схлопывание','action',jsonb_build_array(jsonb_build_object('key','sorcerer_aberrant_warping_implosion','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','warping_implosion','payload',jsonb_build_object('rangeFeet',120,'radiusFeet',30,'damage','3d10'))),null),
      private.sorcerer_stage7_action_v1('aberrant-implosion-paid','sorcerer:aberrant:implosion','sorcerer_aberrant_warping_implosion_paid','Искривляющее схлопывание за Очки чародейства','action',jsonb_build_array(jsonb_build_object('key','sorcery_points','amount',5)),jsonb_build_array(jsonb_build_object('kind','semantic','key','warping_implosion','payload',jsonb_build_object('rangeFeet',120,'radiusFeet',30,'damage','3d10'))),null)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:aberrant-sorcery','sorcerer-aberrant-sorcery','Аберрантное чародейство','Player''s Handbook 2024','Псионические заклинания, телепатия, Псионическое чародейство, Психическая защита, Откровение во плоти и Искривляющее схлопывание.',v_levels);

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',private.sorcerer_stage7_spells_for_level_v1('clockwork-sorcery',3)||jsonb_build_array(
      private.sorcerer_stage7_feature_v1('clockwork-restore','sorcerer:clockwork:restore-balance','sorcerer_clockwork_restore_balance','Восстановление баланса','Реакцией отмените преимущество или помеху на видимом броске d20 в пределах 60 футов. Число применений равно модификатору Харизмы, минимум 1, и восстанавливается после долгого отдыха.','{"kind":"restore_balance","rangeFeet":60}'::jsonb),
      private.sorcerer_stage7_resource_v1('clockwork-restore-resource','sorcerer:clockwork:restore-balance','sorcerer_clockwork_restore_balance','Восстановление баланса',v_cha_max,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('clockwork-restore-action','sorcerer:clockwork:restore-balance','sorcerer_clockwork_restore_balance','Восстановление баланса','reaction',jsonb_build_array(jsonb_build_object('key','sorcerer_clockwork_restore_balance','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','restore_balance','payload',jsonb_build_object('rangeFeet',60))),null)
    )),
    jsonb_build_object('level',5,'mechanics',private.sorcerer_stage7_spells_for_level_v1('clockwork-sorcery',5)),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('clockwork-bastion','sorcerer:clockwork:bastion','sorcerer_clockwork_bastion_of_law','Бастион закона','Действием потратьте от 1 до 5 Очков чародейства и создайте столько d8 защиты у существа в 30 футах; цель расходует эти кости, чтобы уменьшать получаемый урон.','{"kind":"bastion_of_law","maxDice":5,"die":8}'::jsonb),
      private.sorcerer_stage7_action_v1('clockwork-bastion-1','sorcerer:clockwork:bastion','sorcerer_clockwork_bastion_1','Бастион закона: 1d8','action','[{"key":"sorcery_points","amount":1}]'::jsonb,'[{"kind":"semantic","key":"bastion_of_law","payload":{"dice":1,"sides":8,"rangeFeet":30}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('clockwork-bastion-2','sorcerer:clockwork:bastion','sorcerer_clockwork_bastion_2','Бастион закона: 2d8','action','[{"key":"sorcery_points","amount":2}]'::jsonb,'[{"kind":"semantic","key":"bastion_of_law","payload":{"dice":2,"sides":8,"rangeFeet":30}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('clockwork-bastion-3','sorcerer:clockwork:bastion','sorcerer_clockwork_bastion_3','Бастион закона: 3d8','action','[{"key":"sorcery_points","amount":3}]'::jsonb,'[{"kind":"semantic","key":"bastion_of_law","payload":{"dice":3,"sides":8,"rangeFeet":30}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('clockwork-bastion-4','sorcerer:clockwork:bastion','sorcerer_clockwork_bastion_4','Бастион закона: 4d8','action','[{"key":"sorcery_points","amount":4}]'::jsonb,'[{"kind":"semantic","key":"bastion_of_law","payload":{"dice":4,"sides":8,"rangeFeet":30}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('clockwork-bastion-5','sorcerer:clockwork:bastion','sorcerer_clockwork_bastion_5','Бастион закона: 5d8','action','[{"key":"sorcery_points","amount":5}]'::jsonb,'[{"kind":"semantic","key":"bastion_of_law","payload":{"dice":5,"sides":8,"rangeFeet":30}}]'::jsonb,null)
    )),
    jsonb_build_object('level',7,'mechanics',private.sorcerer_stage7_spells_for_level_v1('clockwork-sorcery',7)),
    jsonb_build_object('level',9,'mechanics',private.sorcerer_stage7_spells_for_level_v1('clockwork-sorcery',9)),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('clockwork-trance','sorcerer:clockwork:trance','sorcerer_clockwork_trance_of_order','Транс порядка','Бонусным действием на 1 минуту атаки против вас не получают преимущества, а ваши d20 на проверки, атаки и спасброски со значением 9 или меньше считаются 10. Одно бесплатное применение; повторное стоит 5 Очков чародейства.','{"kind":"trance_of_order","durationMinutes":1}'::jsonb),
      private.sorcerer_stage7_resource_v1('clockwork-trance-use','sorcerer:clockwork:trance','sorcerer_clockwork_trance_of_order','Транс порядка','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('clockwork-trance-free','sorcerer:clockwork:trance','sorcerer_clockwork_trance_of_order_free','Транс порядка','bonus_action','[{"key":"sorcerer_clockwork_trance_of_order","amount":1}]'::jsonb,'[{"kind":"semantic","key":"trance_of_order","payload":{"durationMinutes":1}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('clockwork-trance-paid','sorcerer:clockwork:trance','sorcerer_clockwork_trance_of_order_paid','Транс порядка за Очки чародейства','bonus_action','[{"key":"sorcery_points","amount":5}]'::jsonb,'[{"kind":"semantic","key":"trance_of_order","payload":{"durationMinutes":1}}]'::jsonb,null)
    )),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('clockwork-cavalcade','sorcerer:clockwork:cavalcade','sorcerer_clockwork_cavalcade','Заводная кавалькада','Действием заполните куб 30 футов духами порядка: распределите до 100 HP лечения между существами, восстановите повреждённые предметы и завершите выбранные заклинания 6 уровня и ниже. Одно бесплатное применение; повторное стоит 7 Очков чародейства.','{"kind":"clockwork_cavalcade","cubeFeet":30,"healingPool":100}'::jsonb),
      private.sorcerer_stage7_resource_v1('clockwork-cavalcade-use','sorcerer:clockwork:cavalcade','sorcerer_clockwork_cavalcade','Заводная кавалькада','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('clockwork-cavalcade-free','sorcerer:clockwork:cavalcade','sorcerer_clockwork_cavalcade_free','Заводная кавалькада','action','[{"key":"sorcerer_clockwork_cavalcade","amount":1}]'::jsonb,'[{"kind":"semantic","key":"clockwork_cavalcade","payload":{"cubeFeet":30,"healingPool":100}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('clockwork-cavalcade-paid','sorcerer:clockwork:cavalcade','sorcerer_clockwork_cavalcade_paid','Заводная кавалькада за Очки чародейства','action','[{"key":"sorcery_points","amount":7}]'::jsonb,'[{"kind":"semantic","key":"clockwork_cavalcade","payload":{"cubeFeet":30,"healingPool":100}}]'::jsonb,null)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:clockwork-sorcery','sorcerer-clockwork-sorcery','Заводное чародейство','Player''s Handbook 2024','Заводные заклинания, Восстановление баланса, Бастион закона, Транс порядка и Заводная кавалькада.',v_levels);

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',private.sorcerer_stage7_spells_for_level_v1('draconic-sorcery',3)||jsonb_build_array(
      private.sorcerer_stage7_feature_v1('draconic-resilience','sorcerer:draconic:resilience','sorcerer_draconic_resilience','Драконья стойкость','При получении подкласса максимум HP увеличивается на 3; каждый следующий уровень чародея добавляет ещё 1 HP. Без доспеха базовая КД равна 10 + Ловкость + Харизма.','{"kind":"draconic_resilience","armorClassFormula":"10+dex+cha","requiresUnarmored":true}'::jsonb)
    )),
    jsonb_build_object('level',5,'mechanics',private.sorcerer_stage7_spells_for_level_v1('draconic-sorcery',5)),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('draconic-affinity','sorcerer:draconic:affinity','sorcerer_draconic_elemental_affinity','Стихийное сродство','Выберите кислоту, холод, огонь, электричество или яд. Вы получаете сопротивление выбранному типу; один бросок урона подходящего заклинания получает бонус Харизмы.','{"kind":"elemental_affinity"}'::jsonb)
    ),'choices',jsonb_build_array(private.sorcerer_stage7_draconic_affinity_choice_v1())),
    jsonb_build_object('level',7,'mechanics',private.sorcerer_stage7_spells_for_level_v1('draconic-sorcery',7)),
    jsonb_build_object('level',9,'mechanics',private.sorcerer_stage7_spells_for_level_v1('draconic-sorcery',9)),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('draconic-wings','sorcerer:draconic:wings','sorcerer_draconic_wings','Драконьи крылья','Бонусным действием получите скорость полёта 60 футов на 1 час. Одно применение после долгого отдыха; без действия можно восстановить его за 3 Очка чародейства.','{"kind":"dragon_wings","flySpeed":60,"durationMinutes":60}'::jsonb),
      private.sorcerer_stage7_resource_v1('draconic-wings-use','sorcerer:draconic:wings','sorcerer_draconic_wings','Драконьи крылья','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('draconic-wings-action','sorcerer:draconic:wings','sorcerer_draconic_wings','Драконьи крылья','bonus_action','[{"key":"sorcerer_draconic_wings","amount":1}]'::jsonb,'[{"kind":"semantic","key":"dragon_wings","payload":{"flySpeed":60,"durationMinutes":60}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('draconic-wings-restore','sorcerer:draconic:wings','sorcerer_draconic_wings_restore','Восстановить Драконьи крылья','no_action','[{"key":"sorcery_points","amount":3}]'::jsonb,'[{"kind":"resource","key":"sorcerer_draconic_wings","operation":"RESTORE","amount":1}]'::jsonb,null)
    )),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('draconic-companion','sorcerer:draconic:companion','sorcerer_draconic_companion','Драконий спутник','Призыв дракона не требует материального компонента. Один раз после долгого отдыха сотворите его без ячейки; можно убрать концентрацию, сократив длительность до 1 минуты.','{"kind":"dragon_companion","spell":"summon-dragon","freeCast":1}'::jsonb),
      private.sorcerer_stage7_resource_v1('draconic-companion-use','sorcerer:draconic:companion','sorcerer_draconic_companion','Драконий спутник','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('draconic-companion-free','sorcerer:draconic:companion','sorcerer_draconic_companion','Призвать драконьего спутника','action','[{"key":"sorcerer_draconic_companion","amount":1}]'::jsonb,'[{"kind":"semantic","key":"dragon_companion","payload":{"spell":"summon-dragon","ignoreMaterialComponent":true,"concentrationOptional":true,"durationMinutesWithoutConcentration":1}}]'::jsonb,null)
    ))
  );
  v_id:=private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:draconic-sorcery','sorcerer-draconic-sorcery','Драконье чародейство','Player''s Handbook 2024','Драконья стойкость, десять драконьих заклинаний, Стихийное сродство, Драконьи крылья и Драконий спутник.',v_levels);
  for i in 3..20 loop
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_id,i,'[]'::jsonb,'[]'::jsonb)
    on conflict(template_id,level) do nothing;
    update public.rule_template_levels
    set mechanics=jsonb_build_array(jsonb_build_object(
      'id','draconic-resilience-hp-'||i,'type','numeric','sourceKey','sorcerer:draconic:resilience',
      'target','combat.maxHp','operation','ADD','value',case when i=3 then 3 else 1 end
    ))||coalesce(mechanics,'[]'::jsonb)
    where template_id=v_id and level=i;
  end loop;

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('wild-surge','sorcerer:wild:surge','sorcerer_wild_magic_surge','Дикий всплеск','Один раз за ход сразу после заклинания чародея с расходом ячейки можно бросить d20; на 20 происходит Дикий всплеск. Заклинание, созданное таблицей всплеска, нельзя изменить Метамагией.','{"kind":"wild_magic_surge","triggerRoll":"1d20","triggerResult":20}'::jsonb),
      private.sorcerer_stage7_feature_v1('wild-tides','sorcerer:wild:tides','sorcerer_wild_tides_of_chaos','Приливы хаоса','До одного D20 Test дайте себе преимущество. После применения оно возвращается после долгого отдыха или после следующего заклинания чародея с ячейкой; во втором случае автоматически происходит Дикий всплеск.','{"kind":"tides_of_chaos","rechargeOnNextSorcererSlotSpell":true,"automaticSurgeOnRecharge":true}'::jsonb),
      private.sorcerer_stage7_resource_v1('wild-tides-use','sorcerer:wild:tides','sorcerer_wild_tides_of_chaos','Приливы хаоса','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('wild-tides-action','sorcerer:wild:tides','sorcerer_wild_tides_of_chaos','Приливы хаоса','no_action','[{"key":"sorcerer_wild_tides_of_chaos","amount":1}]'::jsonb,'[{"kind":"semantic","key":"tides_of_chaos","payload":{"advantage":true}}]'::jsonb,null),
      private.sorcerer_stage7_action_v1('wild-tides-restore','sorcerer:wild:tides','sorcerer_wild_tides_of_chaos_restore_after_spell','Дикий всплеск после Приливов хаоса','no_action','[]'::jsonb,'[{"kind":"resource","key":"sorcerer_wild_tides_of_chaos","operation":"RESTORE","amount":1},{"kind":"semantic","key":"wild_magic_surge","payload":{"automatic":true,"trigger":"next_sorcerer_spell_with_slot"}}]'::jsonb,null)
    )),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('wild-bend-luck','sorcerer:wild:bend-luck','sorcerer_wild_bend_luck','Изгиб удачи','Реакцией на видимый D20 Test в 60 футах потратьте 1 Очко чародейства, бросьте 1d4 и прибавьте или вычтите результат.','{"kind":"bend_luck","die":4,"rangeFeet":60}'::jsonb),
      private.sorcerer_stage7_action_v1('wild-bend-luck-action','sorcerer:wild:bend-luck','sorcerer_wild_bend_luck','Изгиб удачи','reaction','[{"key":"sorcery_points","amount":1}]'::jsonb,'[{"kind":"semantic","key":"bend_luck","payload":{"die":4,"rangeFeet":60}}]'::jsonb,null)
    )),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.sorcerer_stage7_feature_v1('wild-controlled','sorcerer:wild:controlled','sorcerer_wild_controlled_chaos','Управляемый хаос','Когда бросаете по таблице Дикой магии, бросьте два результата и выберите один.','{"kind":"controlled_chaos","rolls":2,"choose":1}'::jsonb))),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('wild-tamed','sorcerer:wild:tamed','sorcerer_wild_tamed_surge','Укрощённый всплеск','Один раз после долгого отдыха выберите результат Дикого всплеска вместо случайного результата; вложенные случайные броски выполняются как обычно.','{"kind":"tamed_surge","chooseResult":true}'::jsonb),
      private.sorcerer_stage7_resource_v1('wild-tamed-use','sorcerer:wild:tamed','sorcerer_wild_tamed_surge','Укрощённый всплеск','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('wild-tamed-action','sorcerer:wild:tamed','sorcerer_wild_tamed_surge','Укрощённый всплеск','no_action','[{"key":"sorcerer_wild_tamed_surge","amount":1}]'::jsonb,'[{"kind":"semantic","key":"tamed_surge","payload":{"chooseResult":true}}]'::jsonb,null)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:wild-magic-sorcery','sorcerer-wild-magic-sorcery','Чародейство дикой магии','Player''s Handbook 2024','Дикий всплеск, Приливы хаоса, Изгиб удачи, Управляемый хаос и Укрощённый всплеск по правилам 2024.',v_levels);

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('divine-magic','sorcerer:divine-soul:divine-magic','sorcerer_divine_soul_divine_magic','Божественная магия','При выборе или замене заговора или подготовленного заклинания чародея можно выбирать также из списка Жреца; выбранное заклинание становится заклинанием чародея. Источник силы дополнительно даёт одно связанное заклинание.','{"kind":"divine_magic","extendsSpellList":"cleric"}'::jsonb),
      private.sorcerer_stage7_feature_v1('divine-favored','sorcerer:divine-soul:favored','sorcerer_divine_soul_favored_by_the_gods','Благосклонность богов','После провала спасброска или промаха атакой добавьте 2d4. Одно применение восстанавливается после короткого или долгого отдыха.','{"kind":"favored_by_the_gods","dice":"2d4"}'::jsonb),
      private.sorcerer_stage7_resource_v1('divine-favored-use','sorcerer:divine-soul:favored','sorcerer_divine_soul_favored_by_the_gods','Благосклонность богов','1'::jsonb,'["short_rest","long_rest"]'::jsonb),
      private.sorcerer_stage7_action_v1('divine-favored-action','sorcerer:divine-soul:favored','sorcerer_divine_soul_favored_by_the_gods','Благосклонность богов','no_action','[{"key":"sorcerer_divine_soul_favored_by_the_gods","amount":1}]'::jsonb,'[{"kind":"semantic","key":"favored_by_the_gods","payload":{"dice":"2d4"}}]'::jsonb,null)
    ),'choices',jsonb_build_array(private.sorcerer_stage7_divine_affinity_choice_v1())),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('divine-empowered','sorcerer:divine-soul:healing','sorcerer_divine_soul_empowered_healing','Усиленное исцеление','Один раз за ход при броске лечения заклинанием рядом с вами потратьте 1 Очко чародейства и перебросьте любое число костей лечения, используя новые результаты.','{"kind":"empowered_healing"}'::jsonb),
      private.sorcerer_stage7_action_v1('divine-empowered-action','sorcerer:divine-soul:healing','sorcerer_divine_soul_empowered_healing','Усиленное исцеление','no_action','[{"key":"sorcery_points","amount":1}]'::jsonb,'[{"kind":"semantic","key":"empowered_healing","payload":{"rerollHealingDice":true}}]'::jsonb,null)
    )),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.sorcerer_stage7_feature_v1('divine-wings','sorcerer:divine-soul:wings','sorcerer_divine_soul_otherworldly_wings','Иномирные крылья','Бонусным действием проявите крылья и получите скорость полёта 30 футов; бонусным действием можно убрать крылья.','{"kind":"otherworldly_wings","flySpeed":30}'::jsonb))),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('divine-recovery','sorcerer:divine-soul:recovery','sorcerer_divine_soul_unearthly_recovery','Неземное восстановление','Бонусным действием при HP ниже половины максимума восстановите половину максимума HP. Одно применение после долгого отдыха.','{"kind":"unearthly_recovery","heal":"half_max_hp","requiresBelowHalfHp":true}'::jsonb),
      private.sorcerer_stage7_resource_v1('divine-recovery-use','sorcerer:divine-soul:recovery','sorcerer_divine_soul_unearthly_recovery','Неземное восстановление','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('divine-recovery-action','sorcerer:divine-soul:recovery','sorcerer_divine_soul_unearthly_recovery','Неземное восстановление','bonus_action','[{"key":"sorcerer_divine_soul_unearthly_recovery","amount":1}]'::jsonb,'[{"kind":"semantic","key":"unearthly_recovery","payload":{"heal":"half_max_hp"}}]'::jsonb,null)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:divine-soul','sorcerer-divine-soul','Божественная душа','Xanathar''s Guide to Everything','Список Жреца становится доступен при выборе заклинаний чародея; Источник силы, Благосклонность богов, Усиленное исцеление, крылья и Неземное восстановление используют общий ресурс Очков чародейства.',v_levels);

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('shadow-eyes','sorcerer:shadow:eyes','sorcerer_shadow_eyes_of_the_dark','Глаза тьмы','Тёмное зрение 120 футов. Можно сотворить Тьму за 2 Очка чародейства и видеть сквозь созданную таким образом Тьму.','{"kind":"eyes_of_the_dark","darkvisionFeet":120,"seeThroughOwnDarkness":true}'::jsonb),
      private.sorcerer_stage7_spell_v1('shadow-magic','sorcerer:shadow:eyes','darkness','eyes-of-the-dark','[{"key":"sorcery_points","amount":2}]'::jsonb),
      private.sorcerer_stage7_feature_v1('shadow-grave','sorcerer:shadow:grave','sorcerer_shadow_strength_of_grave','Сила могилы','Когда урон должен снизить вас до 0 HP, сделайте спасбросок Харизмы Сл 5 + полученный урон; при успехе останьтесь на 1 HP. Не работает против критического попадания или сияющего урона. Одно применение после долгого отдыха.','{"kind":"strength_of_the_grave"}'::jsonb),
      private.sorcerer_stage7_resource_v1('shadow-grave-use','sorcerer:shadow:grave','sorcerer_shadow_strength_of_grave','Сила могилы','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_action_v1('shadow-grave-action','sorcerer:shadow:grave','sorcerer_shadow_strength_of_grave','Сила могилы','reaction','[{"key":"sorcerer_shadow_strength_of_grave","amount":1}]'::jsonb,'[{"kind":"semantic","key":"strength_of_the_grave","payload":{"save":"charisma","dc":"5+damage","successHp":1}}]'::jsonb,null)
    )),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('shadow-hound','sorcerer:shadow:hound','sorcerer_shadow_hound_of_ill_omen','Гончая дурного предзнаменования','Бонусным действием потратьте 3 Очка чародейства и призовите гончую рядом с существом в пределах 120 футов; она преследует цель и даёт ей помеху на спасброски против ваших заклинаний, пока находится рядом.','{"kind":"hound_of_ill_omen","rangeFeet":120}'::jsonb),
      private.sorcerer_stage7_action_v1('shadow-hound-action','sorcerer:shadow:hound','sorcerer_shadow_hound_of_ill_omen','Гончая дурного предзнаменования','bonus_action','[{"key":"sorcery_points","amount":3}]'::jsonb,'[{"kind":"semantic","key":"hound_of_ill_omen","payload":{"rangeFeet":120}}]'::jsonb,null)
    )),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.sorcerer_stage7_feature_v1('shadow-walk','sorcerer:shadow:walk','sorcerer_shadow_walk','Хождение по теням','Бонусным действием телепортируйтесь на 120 футов между областями тусклого света или тьмы.','{"kind":"shadow_walk","rangeFeet":120}'::jsonb))),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('shadow-form','sorcerer:shadow:form','sorcerer_shadow_umbral_form','Мрачная форма','Бонусным действием потратьте 6 Очков чародейства на 1 минуту: получаете сопротивление всему урону, кроме силового и сияющего, и можете проходить через существ и предметы как через труднопроходимую местность.','{"kind":"umbral_form","durationMinutes":1}'::jsonb),
      private.sorcerer_stage7_action_v1('shadow-form-action','sorcerer:shadow:form','sorcerer_shadow_umbral_form','Мрачная форма','bonus_action','[{"key":"sorcery_points","amount":6}]'::jsonb,'[{"kind":"semantic","key":"umbral_form","payload":{"durationMinutes":1}}]'::jsonb,null)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:shadow-magic','sorcerer-shadow-magic','Теневая магия','Xanathar''s Guide to Everything','Тёмное зрение и Тьма за Очки чародейства, Сила могилы, Гончая дурного предзнаменования, Хождение по теням и Мрачная форма.',v_levels);

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('storm-speaker','sorcerer:storm:wind-speaker','sorcerer_storm_wind_speaker','Вестник ветра','Вы умеете говорить, читать и писать на Первичном и его диалектах по правилам источника.','{"kind":"wind_speaker"}'::jsonb),
      private.sorcerer_stage7_feature_v1('storm-tempestuous','sorcerer:storm:tempestuous','sorcerer_storm_tempestuous_magic','Бурная магия','Бонусным действием непосредственно до или после заклинания 1 уровня и выше взлетите на 10 футов без провоцирования атак.','{"kind":"tempestuous_magic","flyFeet":10}'::jsonb)
    )),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_grant_v1('storm-lightning-resistance','sorcerer:storm:heart','resistance','damage:lightning','Сердце бури'),
      private.sorcerer_stage7_grant_v1('storm-thunder-resistance','sorcerer:storm:heart','resistance','damage:thunder','Сердце бури'),
      private.sorcerer_stage7_feature_v1('storm-heart','sorcerer:storm:heart','sorcerer_storm_heart_of_the_storm','Сердце бури','Сопротивление электричеству и звуку. Когда начинаете сотворять заклинание 1 уровня и выше с таким уроном, выбранные существа рядом получают урон, равный половине уровня чародея.','{"kind":"heart_of_the_storm"}'::jsonb),
      private.sorcerer_stage7_feature_v1('storm-guide','sorcerer:storm:guide','sorcerer_storm_guide','Проводник шторма','Управляйте дождём и ветром рядом с собой в пределах ограничений способности.','{"kind":"storm_guide"}'::jsonb)
    )),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.sorcerer_stage7_feature_v1('storm-fury','sorcerer:storm:fury','sorcerer_storm_fury','Ярость бури','Реакцией после попадания рукопашной атакой нанесите атакующему электрический урон, равный уровню чародея; спасбросок Силы может также отбросить его на 20 футов.','{"kind":"storms_fury","pushFeet":20}'::jsonb))),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_grant_v1('storm-lightning-immunity','sorcerer:storm:wind-soul','immunity','damage:lightning','Душа ветра'),
      private.sorcerer_stage7_grant_v1('storm-thunder-immunity','sorcerer:storm:wind-soul','immunity','damage:thunder','Душа ветра'),
      private.sorcerer_stage7_feature_v1('storm-wind-soul','sorcerer:storm:wind-soul','sorcerer_storm_wind_soul','Душа ветра','Иммунитет к электричеству и звуку и постоянная скорость полёта 60 футов. Действием можно на 1 час дать скорость полёта 30 футов нескольким существам; групповое применение восстанавливается после короткого или долгого отдыха.','{"kind":"wind_soul","flySpeed":60,"groupFlySpeed":30,"durationMinutes":60}'::jsonb),
      private.sorcerer_stage7_resource_v1('storm-group-flight-use','sorcerer:storm:wind-soul','sorcerer_storm_wind_soul_group_flight','Душа ветра: полёт союзников','1'::jsonb,'["short_rest","long_rest"]'::jsonb),
      private.sorcerer_stage7_action_v1('storm-group-flight-action','sorcerer:storm:wind-soul','sorcerer_storm_wind_soul_group_flight','Душа ветра: полёт союзников','action','[{"key":"sorcerer_storm_wind_soul_group_flight","amount":1}]'::jsonb,'[{"kind":"semantic","key":"wind_soul_group_flight","payload":{"flySpeed":30,"durationMinutes":60}}]'::jsonb,null)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:storm-sorcery','sorcerer-storm-sorcery','Штормовое чародейство','Xanathar''s Guide to Everything','Бурная магия, Сердце бури, Проводник шторма, Ярость бури и Душа ветра; способности перенесены на уровни совместимости класса 2024.',v_levels);

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',private.sorcerer_stage7_spells_for_level_v1('lunar-sorcery',3)||jsonb_build_array(
      private.sorcerer_stage7_spell_v1('lunar-sorcery','sorcerer:lunar:moon-fire','sacred-flame','sorcerer-subclass',null),
      private.sorcerer_stage7_feature_v1('lunar-embodiment','sorcerer:lunar:embodiment','sorcerer_lunar_embodiment','Лунное воплощение','Все заклинания Лунных заклинаний всегда подготовлены. Выбранная фаза определяет бесплатное заклинание 1 уровня; фаза выбирается после долгого отдыха и может меняться позже особенностями подкласса.','{"kind":"lunar_embodiment"}'::jsonb),
      private.sorcerer_stage7_resource_v1('lunar-free-cast','sorcerer:lunar:embodiment','sorcerer_lunar_free_phase_cast','Лунное воплощение: бесплатное заклинание','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_feature_v1('lunar-moon-fire','sorcerer:lunar:moon-fire','sorcerer_lunar_moon_fire','Лунный огонь','Вы изучаете Священное пламя; при его сотворении можно выбрать две цели в пределах 5 футов друг от друга.','{"kind":"moon_fire","secondTargetDistanceFeet":5}'::jsonb)
    ),'choices',jsonb_build_array(private.sorcerer_stage7_lunar_phase_choice_v1())),
    jsonb_build_object('level',5,'mechanics',private.sorcerer_stage7_spells_for_level_v1('lunar-sorcery',5)),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('lunar-boons','sorcerer:lunar:boons','sorcerer_lunar_boons','Лунные дары','Активная фаза даёт преимущество на связанные проверки характеристик. Ограниченное число применений восстанавливается после долгого отдыха.','{"kind":"lunar_boons"}'::jsonb),
      private.sorcerer_stage7_resource_v1('lunar-boons-use','sorcerer:lunar:boons','sorcerer_lunar_boons','Лунные дары',jsonb_build_object('kind','reference','key','core.proficiencyBonus'),'"long_rest"'::jsonb),
      private.sorcerer_stage7_feature_v1('lunar-waxing','sorcerer:lunar:waxing','sorcerer_lunar_waxing_and_waning','Прибывание и убывание','После Метамагии на заклинании школы, связанной с активной фазой, стоимость Метамагии уменьшается на 1 Очко чародейства, минимум до 0. Бонусным действием за 1 Очко чародейства можно сменить фазу.','{"kind":"waxing_and_waning","metamagicDiscount":1,"phaseChangeCost":1}'::jsonb),
      private.sorcerer_stage7_action_v1('lunar-change-phase','sorcerer:lunar:waxing','sorcerer_lunar_change_phase','Сменить лунную фазу','bonus_action','[{"key":"sorcery_points","amount":1}]'::jsonb,'[{"kind":"semantic","key":"change_lunar_phase","payload":{"choiceKey":"sorcerer_lunar_phase"}}]'::jsonb,null)
    )),
    jsonb_build_object('level',7,'mechanics',private.sorcerer_stage7_spells_for_level_v1('lunar-sorcery',7)),
    jsonb_build_object('level',9,'mechanics',private.sorcerer_stage7_spells_for_level_v1('lunar-sorcery',9)),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(private.sorcerer_stage7_feature_v1('lunar-empowerment','sorcerer:lunar:empowerment','sorcerer_lunar_empowerment','Лунное усиление','Активная фаза даёт постоянное преимущество: Полная луна усиливает защиту, Новолуние скрытность, Серп луны сопротивляемость определённым эффектам согласно правилам способности.','{"kind":"lunar_empowerment"}'::jsonb))),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(private.sorcerer_stage7_feature_v1('lunar-phenomenon','sorcerer:lunar:phenomenon','sorcerer_lunar_phenomenon','Лунное явление','Бонусным действием активируйте явление текущей фазы. Каждая из трёх фаз имеет отдельное применение, которое восстанавливается после долгого отдыха.','{"kind":"lunar_phenomenon"}'::jsonb),
      private.sorcerer_stage7_resource_v1('lunar-phenomenon-full','sorcerer:lunar:phenomenon','sorcerer_lunar_phenomenon_full','Лунное явление: Полная луна','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_resource_v1('lunar-phenomenon-new','sorcerer:lunar:phenomenon','sorcerer_lunar_phenomenon_new','Лунное явление: Новолуние','1'::jsonb,'"long_rest"'::jsonb),
      private.sorcerer_stage7_resource_v1('lunar-phenomenon-crescent','sorcerer:lunar:phenomenon','sorcerer_lunar_phenomenon_crescent','Лунное явление: Серп луны','1'::jsonb,'"long_rest"'::jsonb)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:lunar-sorcery','sorcerer-lunar-sorcery','Лунное чародейство','Dragonlance: Shadow of the Dragon Queen','Пятнадцать Лунных заклинаний, Священное пламя, фазы луны, бесплатное заклинание активной фазы, Лунные дары и Лунное явление.',v_levels);

  v_levels:=jsonb_build_array(
    jsonb_build_object('level',3,'mechanics',jsonb_build_array(private.sorcerer_stage7_feature_v1('pyro-heart','sorcerer:pyromancer:heart','sorcerer_pyromancer_heart_of_fire','Сердце огня','Когда сотворяете заклинание 1 уровня и выше, наносящее огненный урон, существа рядом с вами могут получить дополнительный огненный урон, равный половине уровня чародея.','{"kind":"heart_of_fire"}'::jsonb))),
    jsonb_build_object('level',6,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_grant_v1('pyro-fire-resistance','sorcerer:pyromancer:fire','resistance','damage:fire','Огонь в венах'),
      private.sorcerer_stage7_feature_v1('pyro-fire','sorcerer:pyromancer:fire','sorcerer_pyromancer_fire_in_the_veins','Огонь в венах','Сопротивление огню; ваши заклинания игнорируют сопротивление огню цели.','{"kind":"fire_in_the_veins","ignoreFireResistance":true}'::jsonb)
    )),
    jsonb_build_object('level',14,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_feature_v1('pyro-fury','sorcerer:pyromancer:fury','sorcerer_pyromancer_fury','Ярость пироманта','Реакцией после попадания по вам рукопашной атакой нанесите атакующему огненный урон, равный уровню чародея; этот урон игнорирует сопротивление огню.','{"kind":"pyromancers_fury"}'::jsonb),
      private.sorcerer_stage7_action_v1('pyro-fury-action','sorcerer:pyromancer:fury','sorcerer_pyromancer_fury','Ярость пироманта','reaction','[]'::jsonb,'[{"kind":"semantic","key":"pyromancers_fury","payload":{"damage":"sorcerer_level","damageType":"fire","ignoreFireResistance":true}}]'::jsonb,null)
    )),
    jsonb_build_object('level',18,'mechanics',jsonb_build_array(
      private.sorcerer_stage7_grant_v1('pyro-fire-immunity','sorcerer:pyromancer:soul','immunity','damage:fire','Огненная душа'),
      private.sorcerer_stage7_feature_v1('pyro-soul','sorcerer:pyromancer:soul','sorcerer_pyromancer_fiery_soul','Огненная душа','Иммунитет к огню. Ваш огненный урон игнорирует сопротивление, а иммунитет цели к огню считается сопротивлением против вашего урона.','{"kind":"fiery_soul","ignoreFireResistance":true,"treatFireImmunityAsResistance":true}'::jsonb)
    ))
  );
  perform private.sorcerer_stage7_upsert_v1(p_campaign_id,v_parent,'subclass:sorcerer:pyromancer','sorcerer-pyromancer','Пиромант','Plane Shift: Kaladesh','Огненный подкласс совместимости: Сердце огня, сопротивление и пробитие сопротивления, Ярость пироманта и Огненная душа.',v_levels);

  perform private.sorcerer_stage7_extend_divine_spell_choices_v1(v_parent);

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage7-subclass-runtime-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_revision','xphb-2024-sorcerer-stage7-subclass-runtime-v1',
        'runtime_stage',7,'mechanics_status','STAGE7_SUBCLASS_RUNTIME_READY',
        'stage7_subclass_runtime_included',true,'stage7_subclass_runtime_pending',false,
        'subclass_runtime_included',true,'subclass_runtime_count',9,
        'subclass_runtime_scope','PROJECT_APPROVED_9',
        'divine_soul_cleric_spell_choice_source_gate',true,
        'spell_runtime_included',true,'metamagic_cast_rpc','send_chat_spell_with_template_modifiers_v2'
      ),updated_at=now()
  where id=v_parent;

  perform private.sync_rule_template_spell_links(v_parent);
  for r in
    select id from public.rule_templates
    where campaign_id=p_campaign_id and kind='subclass' and parent_template_id=v_parent
      and catalog_key in (
        'subclass:sorcerer:aberrant-sorcery','subclass:sorcerer:clockwork-sorcery','subclass:sorcerer:draconic-sorcery',
        'subclass:sorcerer:wild-magic-sorcery','subclass:sorcerer:divine-soul','subclass:sorcerer:shadow-magic',
        'subclass:sorcerer:storm-sorcery','subclass:sorcerer:lunar-sorcery','subclass:sorcerer:pyromancer'
      ) and is_active
  loop
    perform private.sync_rule_template_spell_links(r.id);
  end loop;
end;
$$;

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_stage7_subclass_runtime_v1(r.id);
  end loop;
end;
$$;

create or replace function private.install_sorcerer_stage7_for_new_campaign_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform private.ensure_sorcerer_stage7_subclass_runtime_v1(new.id);
  return new;
end;
$$;

drop trigger if exists trg_install_sorcerer_stage6_spell_runtime_for_campaign on public.campaigns;
drop trigger if exists trg_install_sorcerer_stage7_subclass_runtime_for_campaign on public.campaigns;
create trigger trg_install_sorcerer_stage7_subclass_runtime_for_campaign
after insert on public.campaigns
for each row execute function private.install_sorcerer_stage7_for_new_campaign_v1();

do $$
declare r record; v_count integer; v_bad integer; v_choice jsonb; v_divine_rule_count integer;
begin
  for r in
    select id,campaign_id,rules_meta,catalog_revision
    from public.rule_templates
    where kind='class' and catalog_key='class:sorcerer' and is_active
  loop
    if r.catalog_revision<>'xphb-2024-sorcerer-stage7-subclass-runtime-v1' then
      raise exception 'SORCERER_STAGE7_BAD_PARENT_REVISION:%',r.campaign_id;
    end if;
    if coalesce((r.rules_meta->>'subclass_runtime_count')::integer,0)<>9 then
      raise exception 'SORCERER_STAGE7_BAD_SUBCLASS_COUNT_META:%',r.campaign_id;
    end if;

    select count(*) into v_count from public.rule_templates
    where campaign_id=r.campaign_id and kind='subclass' and parent_template_id=r.id and is_active
      and catalog_key in (
        'subclass:sorcerer:aberrant-sorcery','subclass:sorcerer:clockwork-sorcery','subclass:sorcerer:draconic-sorcery',
        'subclass:sorcerer:wild-magic-sorcery','subclass:sorcerer:divine-soul','subclass:sorcerer:shadow-magic',
        'subclass:sorcerer:storm-sorcery','subclass:sorcerer:lunar-sorcery','subclass:sorcerer:pyromancer'
      );
    if v_count<>9 then raise exception 'SORCERER_STAGE7_RUNTIME_COUNT_INVALID:%:%',r.campaign_id,v_count; end if;

    select count(*) into v_bad from public.rule_templates
    where campaign_id=r.campaign_id and kind='subclass' and parent_template_id=r.id and is_active
      and catalog_key in (
        'subclass:sorcerer:aberrant-sorcery','subclass:sorcerer:clockwork-sorcery','subclass:sorcerer:draconic-sorcery',
        'subclass:sorcerer:wild-magic-sorcery','subclass:sorcerer:divine-soul','subclass:sorcerer:shadow-magic',
        'subclass:sorcerer:storm-sorcery','subclass:sorcerer:lunar-sorcery','subclass:sorcerer:pyromancer'
      )
      and (unlock_level<>3 or catalog_revision<>'xphb-2024-sorcerer-stage7-subclass-runtime-v1');
    if v_bad<>0 then raise exception 'SORCERER_STAGE7_PARENT_OR_REVISION_INVALID:%',r.campaign_id; end if;

    select c.value into v_choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where l.template_id=r.id and l.level=1 and c.value->>'key'='sorcerer_prepared_spells';
    if v_choice is null then raise exception 'SORCERER_STAGE7_PREPARED_CHOICE_MISSING:%',r.campaign_id; end if;

    select count(*) into v_divine_rule_count
    from jsonb_each(coalesce(v_choice->'option_rules','{}'::jsonb)) e(slug,rule)
    where rule @> '{"source_requirements_any":[{"catalog_key":"subclass:sorcerer:divine-soul"}]}'::jsonb;
    if v_divine_rule_count=0 then raise exception 'SORCERER_STAGE7_DIVINE_SOURCE_GATE_MISSING:%',r.campaign_id; end if;
  end loop;
end;
$$;

commit;
