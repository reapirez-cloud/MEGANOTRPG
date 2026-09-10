-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererRuntimeFinalCertification.test.ts
-- CLASS_WORK_STATUS: sorcerer:runtime=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.sorcerer_stage8_patch_precision_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_clockwork uuid;
  v_level integer;
  v_amount integer;
begin
  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_STAGE8_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  -- 2024 Sorcerous Restoration is floor(Sorcerer level / 2) at every level 5-20.
  -- Earlier Stage 2 rows only advanced on odd levels and under-restored even-level Sorcerers.
  for v_level in 5..20 loop
    v_amount:=floor(v_level::numeric/2)::integer;

    update public.rule_template_levels l
    set mechanics=(
      select coalesce(jsonb_agg(m.value order by m.ord),'[]'::jsonb)
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality m(value,ord)
      where not (
        m.value->>'key'='sorcerous_restoration_amount'
        and m.value->>'sourceKey'='sorcerous-restoration'
      )
    ) || jsonb_build_array(jsonb_build_object(
      'id','sorcerer-restoration-amount-l'||v_level::text,
      'type','grant',
      'sourceKey','sorcerous-restoration',
      'target','value',
      'key','sorcerous_restoration_amount',
      'grantOperation','REPLACE',
      'priority',v_level,
      'payload',jsonb_build_object(
        'label','Возврат Очков чародейства',
        'value',v_amount
      )
    ))
    where l.template_id=v_sorcerer and l.level=v_level;

    if not found then
      raise exception 'SORCERER_STAGE8_RESTORATION_LEVEL_ROW_MISSING:%:%',p_campaign_id,v_level;
    end if;
  end loop;

  select id into v_clockwork
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key='subclass:sorcerer:clockwork-sorcery'
    and parent_template_id=v_sorcerer
    and is_active
  order by updated_at desc
  limit 1;

  if v_clockwork is not null then
    update public.rule_template_levels l
    set mechanics=(
      select coalesce(jsonb_agg(
        case
          when m.value->>'id'='clockwork-bastion' then
            jsonb_set(
              m.value,
              '{payload,description}',
              to_jsonb('Действием потратьте от 1 до 5 Очков чародейства и создайте вокруг существа в 30 футах столько d8 защиты; когда цель получает урон, она может потратить любое число этих костей и уменьшить урон на выпавшую сумму. Созданные кости существуют до окончания долгого отдыха или пока вы не примените эту способность снова.'::text),
              true
            )
          else m.value
        end
        order by m.ord
      ),'[]'::jsonb)
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality m(value,ord)
    )
    where l.template_id=v_clockwork and l.level=6;
  end if;

  perform private.patch_sorcerer_stage7_lunar_choice_action_v1(p_campaign_id);
end;
$function$;

revoke all on function private.sorcerer_stage8_patch_precision_v1(uuid) from public,anon,authenticated;
grant execute on function private.sorcerer_stage8_patch_precision_v1(uuid) to service_role;

create or replace function private.certify_sorcerer_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_count integer;
  v_bad integer;
  v_cantrips jsonb;
  v_prepared jsonb;
  v_metamagic jsonb;
  v_expected record;
  v_subclass uuid;
  v_levels integer[];
  v_meta jsonb;
  v_spellcasting_contract jsonb;
begin
  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_FINAL_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  select count(*) into v_count
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active;
  if v_count<>1 then
    raise exception 'SORCERER_FINAL_ACTIVE_CLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  select count(*),array_agg(level order by level)
  into v_count,v_levels
  from public.rule_template_levels
  where template_id=v_sorcerer;

  if v_count<>20
     or v_levels is distinct from array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]::integer[]
  then
    raise exception 'SORCERER_FINAL_LEVEL_ROWS_INVALID:%:%:%',p_campaign_id,v_count,v_levels;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    where t.id=v_sorcerer
      and t.rules_meta->>'spellcasting_ability'='charisma'
      and t.rules_meta->>'spell_progression'='full_caster'
      and coalesce((t.rules_meta->>'resource_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'font_of_magic_conversion_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'metamagic_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'stage5_base_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'stage6_spell_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'stage7_subclass_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'spell_slot_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'subclass_runtime_count')::integer,0)=9
      and coalesce((t.rules_meta->>'metamagic_option_count')::integer,0)=10
  ) then
    raise exception 'SORCERER_FINAL_STAGE_STACK_INCOMPLETE:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_sorcerer
      and l.level=1
      and m.value->>'type'='resource'
      and m.value->>'key'='innate_sorcery'
      and (m.value->>'max')::integer=2
      and m.value->'recharge' @> '["long_rest"]'::jsonb
  ) then
    raise exception 'SORCERER_FINAL_INNATE_RESOURCE_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_sorcerer
      and l.level=2
      and m.value->>'type'='resource'
      and m.value->>'key'='sorcery_points'
      and m.value#>>'{max,kind}'='reference'
      and m.value#>>'{max,key}'='source.level'
      and m.value->'recharge' @> '["long_rest"]'::jsonb
  ) then
    raise exception 'SORCERER_FINAL_SORCERY_POINTS_RESOURCE_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_sorcerer
      and l.level=5
      and m.value->>'type'='resource'
      and m.value->>'key'='sorcerous_restoration'
      and (m.value->>'max')::integer=1
      and m.value->'recharge' @> '["long_rest"]'::jsonb
  ) then
    raise exception 'SORCERER_FINAL_RESTORATION_RESOURCE_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from generate_series(5,20) g(level)
  where not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_sorcerer
      and l.level=g.level
      and m.value->>'type'='grant'
      and m.value->>'target'='value'
      and m.value->>'key'='sorcerous_restoration_amount'
      and m.value->>'grantOperation'='REPLACE'
      and (m.value#>>'{payload,value}')::integer=floor(g.level::numeric/2)::integer
  );
  if v_bad<>0 then
    raise exception 'SORCERER_FINAL_RESTORATION_SCALING_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  select c.value into v_cantrips
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_sorcerer and l.level=1 and c.value->>'key'='sorcerer_cantrips'
  limit 1;

  select c.value into v_prepared
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_sorcerer and l.level=1 and c.value->>'key'='sorcerer_prepared_spells'
  limit 1;

  select c.value into v_metamagic
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_sorcerer and l.level=2 and c.value->>'key'='sorcerer_metamagic'
  limit 1;

  if v_cantrips is null
     or v_cantrips->>'selection_mode'<>'player_once'
     or v_cantrips->>'replacement_policy'<>'on_level_change'
     or coalesce((v_cantrips->>'replacement_limit')::integer,0)<>1
     or (v_cantrips->'count_by_level') is distinct from '{"1":4,"4":5,"10":6}'::jsonb
  then
    raise exception 'SORCERER_FINAL_CANTRIP_CHOICE_INVALID:%',p_campaign_id;
  end if;

  if v_prepared is null
     or v_prepared->>'selection_mode'<>'player_once'
     or v_prepared->>'replacement_policy'<>'on_level_change'
     or coalesce((v_prepared->>'replacement_limit')::integer,0)<>1
     or (v_prepared->'count_by_level') is distinct from
       '{"1":2,"2":4,"3":6,"4":7,"5":9,"6":10,"7":11,"8":12,"9":14,"10":15,"11":16,"12":16,"13":17,"14":17,"15":18,"16":18,"17":19,"18":20,"19":21,"20":22}'::jsonb
  then
    raise exception 'SORCERER_FINAL_PREPARED_CHOICE_INVALID:%',p_campaign_id;
  end if;

  if v_metamagic is null
     or v_metamagic->>'selection_mode'<>'player_once'
     or v_metamagic->>'replacement_policy'<>'on_level_change'
     or coalesce((v_metamagic->>'replacement_limit')::integer,0)<>1
     or (v_metamagic->'count_by_level') is distinct from '{"2":2,"10":4,"17":6}'::jsonb
     or v_metamagic->'options' is distinct from
       '["careful-spell","distant-spell","empowered-spell","extended-spell","heightened-spell","quickened-spell","seeking-spell","subtle-spell","transmuted-spell","twinned-spell"]'::jsonb
  then
    raise exception 'SORCERER_FINAL_METAMAGIC_CHOICE_INVALID:%',p_campaign_id;
  end if;

  if jsonb_array_length(v_cantrips->'options')<>(
       select count(*) from jsonb_object_keys(coalesce(v_cantrips->'option_mechanics','{}'::jsonb))
     )
     or jsonb_array_length(v_prepared->'options')<>(
       select count(*) from jsonb_object_keys(coalesce(v_prepared->'option_mechanics','{}'::jsonb))
     )
     or jsonb_array_length(v_metamagic->'options')<>(
       select count(*) from jsonb_object_keys(coalesce(v_metamagic->'option_mechanics','{}'::jsonb))
     )
  then
    raise exception 'SORCERER_FINAL_CHOICE_MECHANICS_PARITY_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from jsonb_each(coalesce(v_cantrips->'option_mechanics','{}'::jsonb)) e(slug,mechanics)
  join public.spell_catalog s on s.slug=e.slug
  where s.spell_level<>0
     or exists(
       select 1
       from jsonb_array_elements(e.mechanics) m(value)
       cross join lateral jsonb_array_elements(coalesce(m.value#>'{payload,methods}','[]'::jsonb)) method(value)
       where method.value->>'ability'<>'charisma'
          or jsonb_array_length(coalesce(method.value->'resourceOptions','[]'::jsonb))<>0
     );
  if v_bad<>0 then
    raise exception 'SORCERER_FINAL_CANTRIP_RUNTIME_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from jsonb_each(coalesce(v_prepared->'option_mechanics','{}'::jsonb)) e(slug,mechanics)
  join public.spell_catalog s on s.slug=e.slug
  where s.spell_level<1
     or exists(
       select 1
       from jsonb_array_elements(e.mechanics) m(value)
       cross join lateral jsonb_array_elements(coalesce(m.value#>'{payload,methods}','[]'::jsonb)) method(value)
       where method.value->>'ability'<>'charisma'
          or method.value->>'kind'<>'class_spell'
          or jsonb_array_length(coalesce(method.value->'resourceOptions','[]'::jsonb))=0
          or exists(
            select 1
            from jsonb_array_elements(coalesce(method.value->'resourceOptions','[]'::jsonb)) o(value)
            cross join lateral jsonb_array_elements(coalesce(o.value->'costs','[]'::jsonb)) cost(value)
            where cost.value->>'key' !~ '^spell_slot_[1-9]$'
               or coalesce((cost.value->>'amount')::integer,0)<>1
          )
     );
  if v_bad<>0 then
    raise exception 'SORCERER_FINAL_PREPARED_SPELL_RUNTIME_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  if (
    select count(*)
    from public.rule_template_spell_links sl
    where sl.template_id=v_sorcerer
  ) <> jsonb_array_length(v_cantrips->'options') + jsonb_array_length(v_prepared->'options')
  then
    raise exception 'SORCERER_FINAL_BASE_SPELL_LINK_PARITY_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from (
    select o.value slug,v_cantrips choice
    from jsonb_array_elements_text(v_cantrips->'options') o(value)
    union all
    select o.value slug,v_prepared
    from jsonb_array_elements_text(v_prepared->'options') o(value)
  ) selected
  join public.spell_catalog s on s.slug=selected.slug
  where exists(
      select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='cleric'
    )
    and not exists(
      select 1 from public.spell_catalog_classes c where c.spell_id=s.id and c.class_key='sorcerer'
    )
    and not coalesce(selected.choice->'option_rules'->selected.slug,'{}'::jsonb)
      @> '{"source_requirements_any":[{"catalog_key":"subclass:sorcerer:divine-soul"}]}'::jsonb;
  if v_bad<>0 then
    raise exception 'SORCERER_FINAL_DIVINE_SOUL_SOURCE_GATE_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  for v_expected in
    select * from (values
      (2,1,2),(3,2,3),(5,3,5),(7,4,6),(9,5,7)
    ) as x(unlock_level,slot_level,point_cost)
  loop
    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_sorcerer
        and l.level=v_expected.unlock_level
        and m.value->>'id'='sorcerer-font-create-slot-'||v_expected.slot_level::text
        and m.value->>'type'='action'
        and m.value#>>'{resourceCosts,0,key}'='sorcery_points'
        and (m.value#>>'{resourceCosts,0,amount}')::integer=v_expected.point_cost
        and m.value#>>'{effects,0,kind}'='resource'
        and m.value#>>'{effects,0,key}'='spell_slot_'||v_expected.slot_level::text
        and m.value#>>'{effects,0,operation}'='GRANT_TEMPORARY_MAX'
        and (m.value#>>'{effects,0,amount}')::integer=1
    ) then
      raise exception 'SORCERER_FINAL_FONT_CREATE_SLOT_INVALID:%:%',p_campaign_id,v_expected.slot_level;
    end if;
  end loop;

  for v_expected in
    select * from (values
      (2,1),(3,2),(5,3),(7,4),(9,5),(11,6),(13,7),(15,8),(17,9)
    ) as x(unlock_level,slot_level)
  loop
    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_sorcerer
        and l.level=v_expected.unlock_level
        and m.value->>'id'='sorcerer-font-convert-slot-'||v_expected.slot_level::text
        and m.value->>'type'='action'
        and m.value#>>'{resourceCosts,0,key}'='spell_slot_'||v_expected.slot_level::text
        and (m.value#>>'{resourceCosts,0,amount}')::integer=1
        and m.value#>>'{effects,0,kind}'='resource'
        and m.value#>>'{effects,0,key}'='sorcery_points'
        and m.value#>>'{effects,0,operation}'='RESTORE'
        and (m.value#>>'{effects,0,amount}')::integer=v_expected.slot_level
    ) then
      raise exception 'SORCERER_FINAL_FONT_REVERSE_SLOT_INVALID:%:%',p_campaign_id,v_expected.slot_level;
    end if;
  end loop;

  select count(*) into v_count
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and parent_template_id=v_sorcerer
    and catalog_key like 'subclass:sorcerer:%'
    and is_active;
  if v_count<>9 then
    raise exception 'SORCERER_FINAL_ACTIVE_SUBCLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  for v_expected in
    select * from (values
      ('subclass:sorcerer:aberrant-sorcery',array[3,5,6,7,9,14,18]::integer[],11),
      ('subclass:sorcerer:clockwork-sorcery',array[3,5,6,7,9,14,18]::integer[],10),
      ('subclass:sorcerer:draconic-sorcery',array[3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]::integer[],10),
      ('subclass:sorcerer:wild-magic-sorcery',array[3,6,14,18]::integer[],0),
      ('subclass:sorcerer:divine-soul',array[3,6,14,18]::integer[],5),
      ('subclass:sorcerer:shadow-magic',array[3,6,14,18]::integer[],1),
      ('subclass:sorcerer:storm-sorcery',array[3,6,14,18]::integer[],0),
      ('subclass:sorcerer:lunar-sorcery',array[3,5,6,7,9,14,18]::integer[],16),
      ('subclass:sorcerer:pyromancer',array[3,6,14,18]::integer[],0)
    ) as x(catalog_key,expected_levels,spell_links)
  loop
    select id into v_subclass
    from public.rule_templates
    where campaign_id=p_campaign_id
      and kind='subclass'
      and catalog_key=v_expected.catalog_key
      and parent_template_id=v_sorcerer
      and is_active
      and unlock_level=3
      and catalog_revision='xphb-2024-sorcerer-stage7-subclass-runtime-v1'
    order by updated_at desc
    limit 1;

    if v_subclass is null then
      raise exception 'SORCERER_FINAL_SUBCLASS_MISSING:%:%',p_campaign_id,v_expected.catalog_key;
    end if;

    select array_agg(level order by level)
    into v_levels
    from public.rule_template_levels
    where template_id=v_subclass;
    if v_levels is distinct from v_expected.expected_levels then
      raise exception 'SORCERER_FINAL_SUBCLASS_LEVELS_INVALID:%:%:%',p_campaign_id,v_expected.catalog_key,v_levels;
    end if;

    select count(*) into v_count
    from public.rule_template_spell_links
    where template_id=v_subclass;
    if v_count<>v_expected.spell_links then
      raise exception 'SORCERER_FINAL_SUBCLASS_SPELL_LINKS_INVALID:%:%:%',p_campaign_id,v_expected.catalog_key,v_count;
    end if;
  end loop;

  select count(*) into v_bad
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and is_active
    and catalog_key in (
      'subclass:sorcerer:runechild',
      'subclass:sorcerer:phoenix-sorcery',
      'subclass:sorcerer:stone-sorcery'
    );
  if v_bad<>0 then
    raise exception 'SORCERER_FINAL_REFERENCE_ONLY_SUBCLASS_LEAK:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from (
    select t.id,t.catalog_key,m.value->>'id' mechanic_id,count(*) n
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.is_active
      and (t.id=v_sorcerer or t.parent_template_id=v_sorcerer)
      and nullif(m.value->>'id','') is not null
    group by t.id,t.catalog_key,m.value->>'id'
    having count(*)>1
  ) d;
  if v_bad<>0 then
    raise exception 'SORCERER_FINAL_DUPLICATE_MECHANIC_IDS:%:%',p_campaign_id,v_bad;
  end if;

  with active as (
    select t.id,t.catalog_key
    from public.rule_templates t
    where t.campaign_id=p_campaign_id
      and t.is_active
      and (t.id=v_sorcerer or t.parent_template_id=v_sorcerer)
  ),
  mechs as (
    select a.catalog_key,m.value mech
    from active a
    join public.rule_template_levels l on l.template_id=a.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  ),
  resources as (
    select distinct mech->>'key' key
    from mechs
    where mech->>'type'='resource'
  ),
  refs as (
    select mech->>'id' mechanic_id,c.value->>'key' key
    from mechs
    cross join lateral jsonb_array_elements(coalesce(mech->'resourceCosts','[]'::jsonb)) c(value)
    where mech->>'type'='action'
    union all
    select mech->>'id',c.value->>'key'
    from mechs
    cross join lateral jsonb_array_elements(coalesce(mech->'costOptions','[]'::jsonb)) o(value)
    cross join lateral jsonb_array_elements(coalesce(o.value->'costs','[]'::jsonb)) c(value)
    where mech->>'type'='action'
    union all
    select mech->>'id',e.value->>'key'
    from mechs
    cross join lateral jsonb_array_elements(coalesce(mech->'effects','[]'::jsonb)) e(value)
    where mech->>'type'='action' and e.value->>'kind'='resource'
  )
  select count(*) into v_bad
  from refs r
  where r.key !~ '^spell_slot_[1-9]$'
    and not exists(select 1 from resources d where d.key=r.key);
  if v_bad<>0 then
    raise exception 'SORCERER_FINAL_BROKEN_RESOURCE_REFS:%:%',p_campaign_id,v_bad;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=6
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.catalog_key='subclass:sorcerer:clockwork-sorcery'
      and t.is_active
      and m.value->>'key'='sorcerer_clockwork_restore_balance'
      and m.value->>'type'='resource'
      and m.value#>>'{max,kind}'='max'
      and m.value#>'{max,values}' @> '[{"kind":"reference","key":"abilities.charisma.modifier"}]'::jsonb
  ) then
    raise exception 'SORCERER_FINAL_CLOCKWORK_BALANCE_INVALID:%',p_campaign_id;
  end if;

  if (
    select count(*)
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.catalog_key='subclass:sorcerer:draconic-sorcery'
      and t.is_active
      and m.value->>'type'='numeric'
      and m.value->>'target'='combat.maxHp'
      and m.value->>'sourceKey'='sorcerer:draconic:resilience'
  )<>18
  or (
    select coalesce(sum((m.value->>'value')::integer),0)
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.catalog_key='subclass:sorcerer:draconic-sorcery'
      and t.is_active
      and m.value->>'type'='numeric'
      and m.value->>'target'='combat.maxHp'
      and m.value->>'sourceKey'='sorcerer:draconic:resilience'
  )<>20
  then
    raise exception 'SORCERER_FINAL_DRACONIC_HP_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.catalog_key='subclass:sorcerer:aberrant-sorcery'
      and t.is_active
      and m.value->>'catalogSlug'='detect-thoughts'
      and m.value->>'sourceKey'='sorcerer:aberrant:psionic'
      and m.value#>>'{payload,methods,0,key}'='psionic-sorcery'
      and m.value#>>'{payload,methods,0,kind}'='class_feature'
      and m.value#>>'{payload,methods,0,resourceOptions,0,costs,0,key}'='sorcery_points'
      and (m.value#>>'{payload,methods,0,resourceOptions,0,costs,0,amount}')::integer=2
  ) then
    raise exception 'SORCERER_FINAL_ABERRANT_PSIONIC_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=3
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.catalog_key='subclass:sorcerer:wild-magic-sorcery'
      and t.is_active
      and m.value->>'id'='wild-surge'
      and (m.value#>>'{payload,mechanic,triggerResult}')::integer=20
  ) then
    raise exception 'SORCERER_FINAL_WILD_SURGE_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=3
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.catalog_key='subclass:sorcerer:shadow-magic'
      and t.is_active
      and m.value->>'catalogSlug'='darkness'
      and m.value#>>'{payload,methods,0,key}'='eyes-of-the-dark'
      and m.value#>>'{payload,methods,0,resourceOptions,0,costs,0,key}'='sorcery_points'
      and (m.value#>>'{payload,methods,0,resourceOptions,0,costs,0,amount}')::integer=2
  ) then
    raise exception 'SORCERER_FINAL_SHADOW_DARKNESS_INVALID:%',p_campaign_id;
  end if;

  if (
    select count(*)
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=6
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id
      and t.catalog_key='subclass:sorcerer:lunar-sorcery'
      and t.is_active
      and m.value->>'id'='lunar-waxing-action'
      and m.value->>'type'='action'
      and m.value#>>'{effects,0,kind}'='template_choice'
      and m.value#>>'{effects,0,choiceKey}'='sorcerer_lunar_phase'
      and jsonb_array_length(m.value#>'{effects,0,options}')=3
      and m.value#>>'{resourceCosts,0,key}'='sorcery_points'
      and (m.value#>>'{resourceCosts,0,amount}')::integer=1
  )<>1 then
    raise exception 'SORCERER_FINAL_LUNAR_PHASE_ACTION_INVALID:%',p_campaign_id;
  end if;

  if to_regprocedure('public.use_sorcerer_innate_sorcery_v1(uuid)') is null
     or to_regprocedure('public.send_chat_spell_with_template_modifiers_v2(uuid,uuid,text,text,text,jsonb,text[],text,jsonb,uuid)') is null
     or to_regprocedure('public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.commit_character_template_choice_v2(uuid,text,jsonb)') is null
  then
    raise exception 'SORCERER_FINAL_RUNTIME_RPC_MISSING';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',
       'public.use_sorcerer_innate_sorcery_v1(uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.send_chat_spell_with_template_modifiers_v2(uuid,uuid,text,text,text,jsonb,text[],text,jsonb,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.commit_character_template_choice_v2(uuid,text,jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'SORCERER_FINAL_RUNTIME_RPC_PRIVILEGES_INVALID';
  end if;

  if position(
    'apply_character_template_choice_action_effect_v1'
    in pg_get_functiondef('public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)'::regprocedure)
  )=0 then
    raise exception 'SORCERER_FINAL_TEMPLATE_CHOICE_ACTION_BRIDGE_MISSING';
  end if;

  v_meta:=coalesce((select rules_meta from public.rule_templates where id=v_sorcerer),'{}'::jsonb)
    || jsonb_build_object(
      'mechanics_status','READY',
      'runtime_stage',8,
      'runtime_revision','xphb-2024-sorcerer-runtime-final-v1',
      'runtime_certified_at','2026-09-10',
      'class_work_status','READY',
      'stage8_final_certification',true,
      'feature_runtime_included',true,
      'resource_runtime_included',true,
      'font_of_magic_conversion_runtime',true,
      'metamagic_runtime_included',true,
      'stage5_base_runtime_included',true,
      'spell_runtime_included',true,
      'stage6_spell_runtime_included',true,
      'subclass_runtime_included',true,
      'stage7_subclass_runtime_included',true,
      'subclass_runtime_count',9,
      'ui_class_runtime_certified',true,
      'ui_chat_runtime_certified',true,
      'multiclass_parent_level_certified',true,
      'persistent_resource_ledger','character_resource_states',
      'metamagic_cast_rpc','send_chat_spell_with_template_modifiers_v2',
      'metamagic_execution','gena_atomic_spell_with_template_modifiers_v2',
      'sorcerous_restoration_scaling','floor_sorcerer_level_div_2_every_level_5_20',
      'reference_runtime_status','base_plus_9_runtime_3_reference_only'
    );

  v_spellcasting_contract:=coalesce(v_meta->'spellcasting_contract','{}'::jsonb)
    || jsonb_build_object(
      'ability','charisma',
      'spell_list','sorcerer',
      'progression','full_caster',
      'runtime_status','ready'
    );
  v_meta:=jsonb_set(v_meta,'{spellcasting_contract}',v_spellcasting_contract,true);

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-runtime-final-v1',
      rules_meta=v_meta,
      updated_at=now()
  where id=v_sorcerer;

  update public.rule_templates t
  set rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY',
        'runtime_status','READY',
        'runtime_stage',8,
        'runtime_certified_at','2026-09-10',
        'class_runtime_revision','xphb-2024-sorcerer-runtime-final-v1'
      ),
      updated_at=now()
  where t.campaign_id=p_campaign_id
    and t.kind='subclass'
    and t.parent_template_id=v_sorcerer
    and t.is_active
    and t.catalog_key like 'subclass:sorcerer:%';
end;
$function$;

revoke all on function private.certify_sorcerer_runtime_final_v1(uuid) from public,anon,authenticated;
grant execute on function private.certify_sorcerer_runtime_final_v1(uuid) to service_role;

create or replace function private.install_sorcerer_stage7_for_new_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_stage7_subclass_runtime_v1(new.id);
  perform private.sorcerer_stage8_patch_precision_v1(new.id);
  perform private.certify_sorcerer_runtime_final_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.install_sorcerer_stage7_for_new_campaign_v1() from public,anon,authenticated;

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.sorcerer_stage8_patch_precision_v1(v_campaign.id);
    perform private.certify_sorcerer_runtime_final_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
