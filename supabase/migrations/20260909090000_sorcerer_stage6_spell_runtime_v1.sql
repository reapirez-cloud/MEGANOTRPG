-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererMetamagicStage4.test.ts
-- CLASS_WORK_STATUS: sorcerer:text=READY_AUTHORING_SCOPE;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.sorcerer_stage6_spell_mechanic_v1(p_slug text)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
  v_payload jsonb;
begin
  select * into v_spell
  from public.spell_catalog
  where slug=p_slug;

  if not found then
    raise exception 'SORCERER_STAGE6_SPELL_NOT_FOUND:%',p_slug;
  end if;

  v_method := jsonb_build_object(
    'key','sorcerer-cast',
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

  if v_spell.spell_level > 0 then
    v_method := v_method || jsonb_build_object(
      'resourceOptions',private.class_spell_slot_options(v_spell.spell_level)
    );
  end if;

  v_payload := jsonb_build_object(
    'spell',jsonb_build_object(
      'name',coalesce(nullif(v_spell.name_ru,''),nullif(v_spell.name_en,''),v_spell.slug),
      'level',v_spell.spell_level,
      'school',v_spell.school,
      'ritual',coalesce(v_spell.ritual,false)
    ),
    'methods',jsonb_build_array(v_method),
    'preparation',jsonb_build_object('mode','always_prepared')
  );

  return jsonb_build_object(
    'id','sorcerer-stage6-spell-'||v_spell.slug,
    'key','spell:'||v_spell.slug,
    'type','spell',
    'payload',v_payload,
    'priority',1,
    'sourceKey','sorcerer-stage6:spellcasting',
    'variantKey','sorcerer:spellcasting:'||v_spell.slug,
    'catalogSlug',v_spell.slug,
    'grantOperation','GRANT'
  );
end;
$function$;

create or replace function private.ensure_sorcerer_stage6_spell_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_choices jsonb;
  v_cantrip_choice jsonb;
  v_spell_choice jsonb;
  v_cantrip_options jsonb;
  v_cantrip_labels jsonb;
  v_cantrip_mechanics jsonb;
  v_cantrip_unlocks jsonb;
  v_spell_options jsonb;
  v_spell_labels jsonb;
  v_spell_mechanics jsonb;
  v_spell_unlocks jsonb;
  r record;
begin
  perform private.ensure_sorcerer_stage5_base_runtime_v1(p_campaign_id);

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_STAGE6_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  select
    coalesce(jsonb_agg(s.slug order by s.sort_order,s.spell_level,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
    coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)),'{}'::jsonb),
    coalesce(jsonb_object_agg(s.slug,jsonb_build_array(private.sorcerer_stage6_spell_mechanic_v1(s.slug))),'{}'::jsonb),
    coalesce(jsonb_object_agg(s.slug,1),'{}'::jsonb)
  into v_cantrip_options,v_cantrip_labels,v_cantrip_mechanics,v_cantrip_unlocks
  from public.spell_catalog s
  where s.spell_level=0
    and exists (
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key='sorcerer'
    );

  select
    coalesce(jsonb_agg(s.slug order by s.spell_level,s.sort_order,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
    coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)),'{}'::jsonb),
    coalesce(jsonb_object_agg(s.slug,jsonb_build_array(private.sorcerer_stage6_spell_mechanic_v1(s.slug))),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      case s.spell_level
        when 1 then 1
        when 2 then 3
        when 3 then 5
        when 4 then 7
        when 5 then 9
        when 6 then 11
        when 7 then 13
        when 8 then 15
        when 9 then 17
        else 20
      end
    ),'{}'::jsonb)
  into v_spell_options,v_spell_labels,v_spell_mechanics,v_spell_unlocks
  from public.spell_catalog s
  where s.spell_level between 1 and 9
    and exists (
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key='sorcerer'
    );

  if jsonb_array_length(v_cantrip_options)=0 or jsonb_array_length(v_spell_options)=0 then
    raise exception 'SORCERER_STAGE6_EMPTY_SPELL_CATALOG:%',p_campaign_id;
  end if;

  v_cantrip_choice := jsonb_build_object(
    'key','sorcerer_cantrips',
    'label','Заговоры чародея',
    'target','spell',
    'count',4,
    'count_by_level',jsonb_build_object('1',4,'4',5,'10',6),
    'selection_mode','player_once',
    'replacement_policy','on_level_change',
    'replacement_limit',1,
    'options',v_cantrip_options,
    'option_labels',v_cantrip_labels,
    'option_unlock_level',v_cantrip_unlocks,
    'option_mechanics',v_cantrip_mechanics
  );

  v_spell_choice := jsonb_build_object(
    'key','sorcerer_prepared_spells',
    'label','Подготовленные заклинания чародея',
    'target','spell',
    'count',2,
    'count_by_level',jsonb_build_object(
      '1',2,'2',4,'3',6,'4',7,'5',9,'6',10,'7',11,'8',12,'9',14,'10',15,
      '11',16,'12',16,'13',17,'14',17,'15',18,'16',18,'17',19,'18',20,'19',21,'20',22
    ),
    'selection_mode','player_once',
    'replacement_policy','on_level_change',
    'replacement_limit',1,
    'options',v_spell_options,
    'option_labels',v_spell_labels,
    'option_unlock_level',v_spell_unlocks,
    'option_mechanics',v_spell_mechanics
  );

  select coalesce(choices,'[]'::jsonb) into v_choices
  from public.rule_template_levels
  where template_id=v_sorcerer and level=1
  for update;

  v_choices := (
    select coalesce(jsonb_agg(c.value order by c.ord),'[]'::jsonb)
    from jsonb_array_elements(v_choices) with ordinality c(value,ord)
    where c.value->>'key' not in ('sorcerer_cantrips','sorcerer_prepared_spells')
  );

  update public.rule_template_levels
  set choices=v_choices||jsonb_build_array(v_cantrip_choice,v_spell_choice),
      mechanics=(
        select coalesce(jsonb_agg(
          case
            when m.value->>'id'='sorcerer-spellcasting-feature-l1' then
              jsonb_set(
                m.value,
                '{payload,description}',
                to_jsonb('Открывает постоянный список подготовленных заклинаний чародея. Характеристика заклинаний: Харизма; прогрессия ячеек полного заклинателя. Выбранные заклинания сохраняются между отдыхами; при получении уровня чародея можно заменить не более одного подготовленного заклинания и не более одного заговора, соблюдая доступный уровень заклинаний.'::text),
                true
              )
            else m.value
          end
          order by m.ord
        ),'[]'::jsonb)
        from jsonb_array_elements(coalesce(mechanics,'[]'::jsonb)) with ordinality m(value,ord)
      )
  where template_id=v_sorcerer and level=1;

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage6-spell-runtime-v1',
      mechanical_summary='К6 здоровья; Харизма; спасброски Телосложения и Харизмы; полный заклинатель 1–20; постоянный список заклинаний; Очки чародейства, Источник магии, Метамагия и Врождённое чародейство работают через общий Character Engine.',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_revision','xphb-2024-sorcerer-stage6-spell-runtime-v1',
        'runtime_stage',6,
        'mechanics_status','STAGE6_SPELL_RUNTIME_READY',
        'stage6_spell_runtime_included',true,
        'stage6_ui_full_integration_pending',false,
        'spell_runtime_included',true,
        'spellcasting_ability','charisma',
        'spell_progression','full_caster',
        'spell_selection_mode','persistent_on_level_change',
        'prepared_spell_replacement_limit',1,
        'cantrip_replacement_limit',1,
        'spell_cast_runtime','shared_template_spell_and_metamagic_runtime',
        'metamagic_cast_rpc','send_chat_spell_with_template_modifiers_v2',
        'subclass_runtime_included',false,
        'stage7_subclass_runtime_pending',true
      )
  where id=v_sorcerer;

  perform private.sync_rule_template_spell_links(v_sorcerer);

  for r in
    select distinct a.character_id
    from public.character_template_assignments a
    where a.template_id=v_sorcerer
  loop
    perform private.sync_sorcerer_spell_slots_stage3_v1(r.character_id);
  end loop;
end;
$function$;

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_stage6_spell_runtime_v1(r.id);
  end loop;
end;
$block$;

create or replace function private.install_sorcerer_stage6_for_new_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_stage6_spell_runtime_v1(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_install_sorcerer_stage5_base_for_campaign on public.campaigns;
drop trigger if exists trg_install_sorcerer_stage6_spell_runtime_for_campaign on public.campaigns;
create trigger trg_install_sorcerer_stage6_spell_runtime_for_campaign
after insert on public.campaigns
for each row execute function private.install_sorcerer_stage6_for_new_campaign_v1();

do $cert$
declare
  r record;
  v_cantrip_count int;
  v_levelled_count int;
  v_link_count int;
  v_choice jsonb;
begin
  select count(*) into v_cantrip_count
  from public.spell_catalog s
  where s.spell_level=0
    and exists(select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='sorcerer');

  select count(*) into v_levelled_count
  from public.spell_catalog s
  where s.spell_level between 1 and 9
    and exists(select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='sorcerer');

  for r in
    select rt.id,rt.campaign_id,rt.catalog_revision,l.choices
    from public.rule_templates rt
    join public.rule_template_levels l on l.template_id=rt.id and l.level=1
    where rt.kind='class' and rt.catalog_key='class:sorcerer' and rt.is_active
  loop
    if r.catalog_revision<>'xphb-2024-sorcerer-stage6-spell-runtime-v1' then
      raise exception 'SORCERER_STAGE6_BAD_REVISION:%:%',r.campaign_id,r.catalog_revision;
    end if;

    select c.value into v_choice
    from jsonb_array_elements(coalesce(r.choices,'[]'::jsonb)) c(value)
    where c.value->>'key'='sorcerer_cantrips';
    if v_choice is null or jsonb_array_length(v_choice->'options')<>v_cantrip_count then
      raise exception 'SORCERER_STAGE6_CANTRIP_CHOICE_INVALID:%',r.campaign_id;
    end if;
    if (v_choice->'count_by_level'->>'10')::int<>6 or (v_choice->>'replacement_limit')::int<>1 then
      raise exception 'SORCERER_STAGE6_CANTRIP_PROGRESSION_INVALID:%',r.campaign_id;
    end if;

    select c.value into v_choice
    from jsonb_array_elements(coalesce(r.choices,'[]'::jsonb)) c(value)
    where c.value->>'key'='sorcerer_prepared_spells';
    if v_choice is null or jsonb_array_length(v_choice->'options')<>v_levelled_count then
      raise exception 'SORCERER_STAGE6_PREPARED_CHOICE_INVALID:%',r.campaign_id;
    end if;
    if (v_choice->'count_by_level'->>'2')::int<>4
       or (v_choice->'count_by_level'->>'20')::int<>22
       or (v_choice->>'replacement_limit')::int<>1 then
      raise exception 'SORCERER_STAGE6_PREPARED_PROGRESSION_INVALID:%',r.campaign_id;
    end if;

    select count(*) into v_link_count
    from public.rule_template_spell_links
    where template_id=r.id;
    if v_link_count<>v_cantrip_count+v_levelled_count then
      raise exception 'SORCERER_STAGE6_LINK_PARITY_INVALID:%:%:%',r.campaign_id,v_link_count,v_cantrip_count+v_levelled_count;
    end if;
  end loop;
end;
$cert$;

commit;