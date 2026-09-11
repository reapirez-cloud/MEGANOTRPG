-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:bard
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/bardRuntimeFinalCertification.test.ts
-- CLASS_WORK_STATUS: bard:runtime=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.certify_bard_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard uuid;
  v_count integer;
  v_bad integer;
  v_levels integer[];
  v_skills jsonb;
  v_instruments jsonb;
  v_cantrips jsonb;
  v_prepared jsonb;
  v_expertise jsonb;
  v_expected record;
  v_subclass record;
  v_subclass_levels integer[];
  v_lore_discoveries jsonb;
  v_spirit_session jsonb;
begin
  select id into v_bard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_bard is null then
    raise exception 'BARD_FINAL_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  select count(*) into v_count
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and is_active;

  if v_count<>1 then
    raise exception 'BARD_FINAL_ACTIVE_CLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  select count(*),array_agg(level order by level)
  into v_count,v_levels
  from public.rule_template_levels
  where template_id=v_bard;

  if v_count<>20
     or v_levels is distinct from array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]::integer[]
  then
    raise exception 'BARD_FINAL_LEVEL_ROWS_INVALID:%:%:%',p_campaign_id,v_count,v_levels;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    where t.id=v_bard
      and coalesce((t.rules_meta->>'resource_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'bardic_inspiration_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'font_of_inspiration_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'spell_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'spell_slot_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'magical_secrets_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'feature_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'expertise_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'jack_of_all_trades_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'words_of_creation_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'subclass_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'subclass_runtime_count')::integer,0)=9
      and t.rules_meta->>'spellcasting_ability'='charisma'
      and t.rules_meta->>'spell_progression'='full_caster'
      and t.rules_meta->>'canonical_bardic_inspiration_resource'='bardic_inspiration'
      and t.rules_meta->>'expertise_dynamic_provider'='skill_proficiencies'
      and coalesce((t.rules_meta->>'jack_of_all_trades_initiative')::boolean,true)=false
  ) then
    raise exception 'BARD_FINAL_STAGE_STACK_INCOMPLETE:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    where t.id=v_bard
      and t.rules_meta#>>'{sheet_profile,spellcasting_ability}'='charisma'
      and coalesce((t.rules_meta#>>'{sheet_profile,spellcasting_enabled}')::boolean,false)
      and t.rules_meta#>>'{sheet_profile,spellcasting_focus}'='musical_instrument'
      and jsonb_typeof(t.rules_meta#>'{sheet_profile,spell_slots_by_level}')='object'
      and jsonb_typeof(t.rules_meta#>'{sheet_profile,prepared_spells_by_level}')='object'
  ) then
    raise exception 'BARD_FINAL_SHEET_PROFILE_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1 from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m(value)
    where t.id=v_bard
      and m.value->>'id'='bard-hit-die'
      and m.value->>'type'='grant'
      and m.value->>'target'='feature'
      and coalesce((m.value#>>'{payload,hitDie}')::integer,0)=8
  ) then
    raise exception 'BARD_FINAL_HIT_DIE_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from (values
    ('savingThrow:dexterity'),
    ('savingThrow:charisma'),
    ('armor:light'),
    ('weapon:simple')
  ) expected(key)
  where not exists(
    select 1
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m(value)
    where t.id=v_bard
      and m.value->>'type'='grant'
      and m.value->>'target'='proficiency'
      and m.value->>'key'=expected.key
      and coalesce((m.value#>>'{payload,rank}')::integer,0)=1
  );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_CORE_PROFICIENCIES_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  select c.value into v_skills
  from public.rule_templates t
  cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c(value)
  where t.id=v_bard and c.value->>'key'='bard-skills'
  limit 1;

  select c.value into v_instruments
  from public.rule_templates t
  cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c(value)
  where t.id=v_bard and c.value->>'key'='bard-musical-instruments'
  limit 1;

  if v_skills is null
     or v_skills->>'selection_mode'<>'player_once'
     or coalesce((v_skills->>'count')::integer,0)<>3
     or jsonb_array_length(coalesce(v_skills->'options','[]'::jsonb))<>18
  then
    raise exception 'BARD_FINAL_STARTING_SKILLS_INVALID:%',p_campaign_id;
  end if;

  if v_instruments is null
     or v_instruments->>'selection_mode'<>'player_once'
     or coalesce((v_instruments->>'count')::integer,0)<>3
     or jsonb_array_length(coalesce(v_instruments->'options','[]'::jsonb))<>10
  then
    raise exception 'BARD_FINAL_STARTING_INSTRUMENTS_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=1
      and m.value->>'type'='resource'
      and m.value->>'key'='bardic_inspiration'
      and m.value#>>'{max,kind}'='max'
      and m.value->'recharge' @> '["long_rest"]'::jsonb
      and not (m.value->'recharge' ? 'short_rest')
  ) then
    raise exception 'BARD_FINAL_INSPIRATION_LEVEL1_RESOURCE_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=5
      and m.value->>'type'='resource'
      and m.value->>'key'='bardic_inspiration'
      and m.value->'recharge' @> '["short_rest","long_rest"]'::jsonb
  ) then
    raise exception 'BARD_FINAL_INSPIRATION_LEVEL5_RESOURCE_INVALID:%',p_campaign_id;
  end if;

  for v_expected in
    select * from (values (1,6),(5,8),(10,10),(15,12)) x(level,die_sides)
  loop
    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_bard
        and l.level=v_expected.level
        and m.value->>'type'='grant'
        and m.value->>'target'='value'
        and m.value->>'key'='bardic_inspiration_die_sides'
        and m.value->>'grantOperation'='REPLACE'
        and coalesce((m.value#>>'{payload,value}')::integer,0)=v_expected.die_sides
    ) then
      raise exception 'BARD_FINAL_INSPIRATION_DIE_INVALID:%:%:%',p_campaign_id,v_expected.level,v_expected.die_sides;
    end if;
  end loop;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=1
      and m.value->>'type'='action'
      and m.value->>'key'='bardic_inspiration_grant'
      and exists(
        select 1 from jsonb_array_elements(coalesce(m.value->'resourceCosts','[]'::jsonb)) c(value)
        where c.value->>'key'='bardic_inspiration' and coalesce((c.value->>'amount')::integer,0)=1
      )
  ) then
    raise exception 'BARD_FINAL_INSPIRATION_ACTION_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=5
      and m.value->>'type'='action'
      and m.value->>'key'='font_of_inspiration_restore'
      and jsonb_array_length(coalesce(m.value->'costOptions','[]'::jsonb))=9
      and exists(
        select 1
        from jsonb_array_elements(coalesce(m.value->'effects','[]'::jsonb)) e(value)
        where e.value->>'kind'='resource'
          and e.value->>'key'='bardic_inspiration'
          and e.value->>'operation'='RESTORE'
          and coalesce((e.value->>'amount')::integer,0)=1
      )
  ) then
    raise exception 'BARD_FINAL_FONT_ACTION_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  cross join lateral jsonb_array_elements(coalesce(m.value->'costOptions','[]'::jsonb)) o(value)
  cross join lateral jsonb_array_elements(coalesce(o.value->'costs','[]'::jsonb)) c(value)
  where l.template_id=v_bard
    and l.level=5
    and m.value->>'key'='font_of_inspiration_restore'
    and (
      c.value->>'key' !~ '^spell_slot_[1-9]$'
      or coalesce((c.value->>'amount')::integer,0)<>1
    );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_FONT_SLOT_COST_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    cross join lateral jsonb_array_elements(coalesce(m.value->'effects','[]'::jsonb)) e(value)
    where l.template_id=v_bard
      and l.level=18
      and m.value->>'key'='superior_inspiration'
      and e.value->>'kind'='resource'
      and e.value->>'key'='bardic_inspiration'
      and e.value->>'operation'='ENSURE_MINIMUM'
      and coalesce((e.value->>'amount')::integer,0)=2
  ) then
    raise exception 'BARD_FINAL_SUPERIOR_INSPIRATION_INVALID:%',p_campaign_id;
  end if;

  select c.value into v_expertise
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_bard
    and l.level=2
    and c.value->>'key'='bard_expertise'
  limit 1;

  if v_expertise is null
     or v_expertise->>'selection_mode'<>'player_once'
     or v_expertise->'count_by_level' is distinct from '{"2":2,"9":4}'::jsonb
     or v_expertise#>>'{option_provider,kind}'<>'skill_proficiencies'
     or coalesce((v_expertise#>>'{option_provider,minimum_rank}')::integer,0)<>1
     or coalesce((v_expertise#>>'{option_provider,maximum_rank}')::integer,0)<>1
     or jsonb_array_length(coalesce(v_expertise->'options','[]'::jsonb))<>18
  then
    raise exception 'BARD_FINAL_EXPERTISE_CHOICE_INVALID:%',p_campaign_id;
  end if;

  if jsonb_array_length(v_expertise->'options')<>(select count(*) from jsonb_object_keys(coalesce(v_expertise->'option_mechanics','{}'::jsonb)))
  then
    raise exception 'BARD_FINAL_EXPERTISE_MECHANICS_PARITY_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=2
      and m.value->>'type'='grant'
      and m.value->>'target'='permission'
      and m.value->>'key'='skill_check:untrained_proficiency_fraction'
      and coalesce((m.value#>>'{payload,numerator}')::integer,0)=1
      and coalesce((m.value#>>'{payload,denominator}')::integer,0)=2
      and m.value#>>'{payload,round}'='down'
  ) then
    raise exception 'BARD_FINAL_JACK_OF_ALL_TRADES_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=7
      and m.value->>'type'='action'
      and m.value->>'key'='countercharm'
      and m.value->>'economy'='reaction'
      and coalesce((m.value#>>'{range,size}')::integer,0)=30
      and m.value#>>'{range,kind}'='area'
      and coalesce(m.value->'tags','[]'::jsonb) @> '["table-adjudicated"]'::jsonb
  ) then
    raise exception 'BARD_FINAL_COUNTERCHARM_INVALID:%',p_campaign_id;
  end if;

  select c.value into v_cantrips
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_bard and l.level=1 and c.value->>'key'='bard_cantrips'
  limit 1;

  select c.value into v_prepared
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_bard and l.level=1 and c.value->>'key'='bard_prepared_spells'
  limit 1;

  if v_cantrips is null
     or v_cantrips->>'selection_mode'<>'player_once'
     or v_cantrips->>'replacement_policy'<>'on_level_change'
     or coalesce((v_cantrips->>'replacement_limit')::integer,0)<>1
     or v_cantrips->'count_by_level' is distinct from '{"1":2,"4":3,"10":4}'::jsonb
     or jsonb_array_length(coalesce(v_cantrips->'options','[]'::jsonb))<>11
  then
    raise exception 'BARD_FINAL_CANTRIP_CHOICE_INVALID:%',p_campaign_id;
  end if;

  if v_prepared is null
     or v_prepared->>'selection_mode'<>'player_once'
     or v_prepared->>'replacement_policy'<>'on_level_change'
     or coalesce((v_prepared->>'replacement_limit')::integer,0)<>1
     or v_prepared->'count_by_level' is distinct from
       '{"1":4,"2":5,"3":6,"4":7,"5":9,"6":10,"7":11,"8":12,"9":14,"10":15,"11":16,"12":16,"13":17,"14":17,"15":18,"16":18,"17":19,"18":20,"19":21,"20":22}'::jsonb
  then
    raise exception 'BARD_FINAL_PREPARED_CHOICE_INVALID:%',p_campaign_id;
  end if;

  if jsonb_array_length(v_cantrips->'options')<>(select count(*) from jsonb_object_keys(coalesce(v_cantrips->'option_mechanics','{}'::jsonb)))
     or jsonb_array_length(v_prepared->'options')<>(select count(*) from jsonb_object_keys(coalesce(v_prepared->'option_mechanics','{}'::jsonb)))
  then
    raise exception 'BARD_FINAL_SPELL_CHOICE_MECHANICS_PARITY_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from jsonb_array_elements_text(v_cantrips->'options') o(slug)
  join public.spell_catalog s on s.slug=o.slug
  where s.spell_level<>0
     or not exists(
       select 1 from public.spell_catalog_classes c
       where c.spell_id=s.id and c.class_key='bard'
     );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_CANTRIP_SOURCE_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from jsonb_array_elements_text(v_prepared->'options') o(slug)
  join public.spell_catalog s on s.slug=o.slug
  where s.spell_level<1
     or not exists(
       select 1 from public.spell_catalog_classes c
       where c.spell_id=s.id and c.class_key in ('bard','cleric','druid','wizard')
     )
     or coalesce((v_prepared->'option_unlock_level'->>o.slug)::integer,999) <>
       greatest(
         case
           when s.spell_level<=1 then 1
           when s.spell_level=2 then 3
           when s.spell_level=3 then 5
           when s.spell_level=4 then 7
           when s.spell_level=5 then 9
           when s.spell_level=6 then 11
           when s.spell_level=7 then 13
           when s.spell_level=8 then 15
           when s.spell_level=9 then 17
           else 20
         end,
         case when exists(
           select 1 from public.spell_catalog_classes bc
           where bc.spell_id=s.id and bc.class_key='bard'
         ) then 1 else 10 end
       );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_MAGICAL_SECRETS_GATE_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from jsonb_each(coalesce(v_prepared->'option_mechanics','{}'::jsonb)) e(slug,mechanics)
  join public.spell_catalog s on s.slug=e.slug
  where exists(
    select 1
    from jsonb_array_elements(e.mechanics) m(value)
    cross join lateral jsonb_array_elements(coalesce(m.value#>'{payload,methods}','[]'::jsonb)) method(value)
    where method.value->>'kind'<>'class_spell'
       or method.value->>'ability'<>'charisma'
       or jsonb_array_length(coalesce(method.value->'resourceOptions','[]'::jsonb))=0
       or exists(
         select 1
         from jsonb_array_elements(coalesce(method.value->'resourceOptions','[]'::jsonb)) ro(value)
         cross join lateral jsonb_array_elements(coalesce(ro.value->'costs','[]'::jsonb)) cost(value)
         where cost.value->>'key' !~ '^spell_slot_[1-9]$'
            or coalesce((cost.value->>'amount')::integer,0)<>1
       )
  );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_PREPARED_SPELL_RUNTIME_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  if (
    select count(distinct sl.spell_id)
    from public.rule_template_spell_links sl
    where sl.template_id=v_bard
  ) <> (
    select count(distinct slug)
    from (
      select value slug from jsonb_array_elements_text(v_cantrips->'options')
      union
      select value slug from jsonb_array_elements_text(v_prepared->'options')
    ) s
  ) then
    raise exception 'BARD_FINAL_BASE_SPELL_LINK_PARITY_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from (values ('power-word-heal'),('power-word-kill')) expected(slug)
  where not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=20
      and m.value->>'type'='spell'
      and m.value->>'catalogSlug'=expected.slug
      and m.value#>>'{payload,preparation,mode}'='always_prepared'
      and exists(
        select 1 from jsonb_array_elements(coalesce(m.value#>'{payload,methods}','[]'::jsonb)) method(value)
        where method.value->>'ability'='charisma'
          and exists(
            select 1
            from jsonb_array_elements(coalesce(method.value->'resourceOptions','[]'::jsonb)) ro(value)
            cross join lateral jsonb_array_elements(coalesce(ro.value->'costs','[]'::jsonb)) cost(value)
            where cost.value->>'key'='spell_slot_9'
              and coalesce((cost.value->>'amount')::integer,0)=1
          )
      )
  );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_WORDS_OF_CREATION_SPELLS_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard
      and l.level=20
      and m.value->>'key'='class:bard:words-of-creation:l20'
      and m.value#>>'{payload,mechanic,kind}'='spell_second_target_option'
      and coalesce((m.value#>>'{payload,mechanic,second_target_within_feet_of_first}')::integer,0)=10
  ) then
    raise exception 'BARD_FINAL_WORDS_OF_CREATION_RULE_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_count
  from public.rule_templates t
  where t.campaign_id=p_campaign_id
    and t.kind='subclass'
    and t.parent_template_id=v_bard
    and t.is_active
    and t.catalog_key in (
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
    raise exception 'BARD_FINAL_ACTIVE_SUBCLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  select count(*) into v_bad
  from public.rule_templates t
  where t.campaign_id=p_campaign_id
    and t.kind='subclass'
    and t.parent_template_id=v_bard
    and t.is_active
    and t.catalog_key not in (
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

  if v_bad<>0 then
    raise exception 'BARD_FINAL_UNAPPROVED_ACTIVE_SUBCLASS:%:%',p_campaign_id,v_bad;
  end if;

  if exists(
    select 1
    from public.rule_templates
    where campaign_id=p_campaign_id
      and catalog_key='subclass:bard:tragedy'
      and is_builtin=true
      and is_active
  ) then
    raise exception 'BARD_FINAL_TRAGEDY_RUNTIME_LEAK:%',p_campaign_id;
  end if;

  for v_subclass in
    select id,catalog_key
    from public.rule_templates
    where campaign_id=p_campaign_id
      and kind='subclass'
      and parent_template_id=v_bard
      and is_active
  loop
    select array_agg(level order by level)
    into v_subclass_levels
    from public.rule_template_levels
    where template_id=v_subclass.id;

    if v_subclass_levels is distinct from array[3,6,14]::integer[] then
      raise exception 'BARD_FINAL_SUBCLASS_LEVELS_INVALID:%:%:%',p_campaign_id,v_subclass.catalog_key,v_subclass_levels;
    end if;
  end loop;

  with active_templates as (
    select t.id,t.catalog_key
    from public.rule_templates t
    where t.id=v_bard
       or (t.parent_template_id=v_bard and t.kind='subclass' and t.is_active)
  ),
  mechanics as (
    select t.id template_id,t.catalog_key,m.value mechanic
    from active_templates t
    join public.rule_templates rt on rt.id=t.id
    cross join lateral jsonb_array_elements(coalesce(rt.mechanics,'[]'::jsonb)) m(value)
    union all
    select t.id,t.catalog_key,m.value
    from active_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  ),
  choice_mechanics as (
    select t.id template_id,t.catalog_key,om.value mechanic
    from active_templates t
    join public.rule_templates rt on rt.id=t.id
    cross join lateral jsonb_array_elements(coalesce(rt.choices,'[]'::jsonb)) c(value)
    cross join lateral jsonb_each(coalesce(c.value->'option_mechanics','{}'::jsonb)) e(k,v)
    cross join lateral jsonb_array_elements(e.v) om(value)
    union all
    select t.id,t.catalog_key,om.value
    from active_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    cross join lateral jsonb_each(coalesce(c.value->'option_mechanics','{}'::jsonb)) e(k,v)
    cross join lateral jsonb_array_elements(e.v) om(value)
  ),
  all_mechanics as (
    select * from mechanics
    union all
    select * from choice_mechanics
  ),
  resources as (
    select distinct mechanic->>'key' key
    from all_mechanics
    where mechanic->>'type'='resource'
  ),
  costs as (
    select distinct c.value->>'key' key
    from all_mechanics a
    cross join lateral jsonb_array_elements(coalesce(a.mechanic->'resourceCosts','[]'::jsonb)) c(value)
    union
    select distinct c.value->>'key'
    from all_mechanics a
    cross join lateral jsonb_array_elements(coalesce(a.mechanic->'costOptions','[]'::jsonb)) o(value)
    cross join lateral jsonb_array_elements(coalesce(o.value->'costs','[]'::jsonb)) c(value)
    union
    select distinct c.value->>'key'
    from all_mechanics a
    cross join lateral jsonb_array_elements(coalesce(a.mechanic#>'{payload,methods}','[]'::jsonb)) method(value)
    cross join lateral jsonb_array_elements(coalesce(method.value->'resourceOptions','[]'::jsonb)) ro(value)
    cross join lateral jsonb_array_elements(coalesce(ro.value->'costs','[]'::jsonb)) c(value)
  )
  select count(*) into v_bad
  from costs
  where key not in (select key from resources)
    and key !~ '^spell_slot_[1-9]$';

  if v_bad<>0 then
    raise exception 'BARD_FINAL_BROKEN_RESOURCE_REFS:%:%',p_campaign_id,v_bad;
  end if;

  with active_templates as (
    select t.id,t.catalog_key
    from public.rule_templates t
    where t.id=v_bard
       or (t.parent_template_id=v_bard and t.kind='subclass' and t.is_active)
  ),
  mechanics as (
    select t.id template_id,t.catalog_key,m.value mechanic
    from active_templates t
    join public.rule_templates rt on rt.id=t.id
    cross join lateral jsonb_array_elements(coalesce(rt.mechanics,'[]'::jsonb)) m(value)
    union all
    select t.id,t.catalog_key,m.value
    from active_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  )
  select count(*) into v_bad
  from (
    select catalog_key,mechanic->>'id' id,count(*) cnt
    from mechanics
    where nullif(mechanic->>'id','') is not null
    group by catalog_key,mechanic->>'id'
    having count(*)>1
  ) duplicates;

  if v_bad<>0 then
    raise exception 'BARD_FINAL_DUPLICATE_MECHANIC_IDS:%:%',p_campaign_id,v_bad;
  end if;

  with active_subclass_mechanics as (
    select t.id template_id,t.catalog_key,l.level,m.value mechanic
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.parent_template_id=v_bard
      and t.kind='subclass'
      and t.is_active
  )
  select count(*) into v_bad
  from active_subclass_mechanics a
  where a.mechanic->>'type'='action'
    and coalesce(a.mechanic->'tags','[]'::jsonb) @> '["bardic-inspiration"]'::jsonb
    and not exists(
      select 1
      from jsonb_array_elements(coalesce(a.mechanic->'resourceCosts','[]'::jsonb)) c(value)
      where c.value->>'key'='bardic_inspiration'
        and coalesce((c.value->>'amount')::integer,0)=1
    );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_NONCANONICAL_INSPIRATION_SPENDER:%:%',p_campaign_id,v_bad;
  end if;

  with active_subclass_mechanics as (
    select t.id template_id,t.catalog_key,l.level,m.value mechanic
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.parent_template_id=v_bard
      and t.kind='subclass'
      and t.is_active
  )
  select count(*) into v_bad
  from active_subclass_mechanics a
  where a.mechanic->>'type'='action'
    and not exists(
      select 1
      from active_subclass_mechanics f
      where f.template_id=a.template_id
        and f.mechanic->>'type'='grant'
        and f.mechanic->>'target'='feature'
        and f.mechanic->>'sourceKey'=a.mechanic->>'sourceKey'
        and length(coalesce(f.mechanic#>>'{payload,description}',''))>=45
    );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_ACTION_WITHOUT_FEATURE:%:%',p_campaign_id,v_bad;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=6
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where t.parent_template_id=v_bard
      and t.catalog_key='subclass:bard:lore'
      and t.is_active
      and c.value->>'key'='bard_lore_magical_discoveries'
      and coalesce((c.value->>'count')::integer,0)=2
      and c.value->>'replacement_policy'='on_level_change'
      and coalesce((c.value->>'replacement_limit')::integer,0)=1
  ) then
    raise exception 'BARD_FINAL_LORE_DISCOVERIES_INVALID:%',p_campaign_id;
  end if;

  select c.value into v_lore_discoveries
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id and l.level=6
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where t.parent_template_id=v_bard
    and t.catalog_key='subclass:bard:lore'
    and t.is_active
    and c.value->>'key'='bard_lore_magical_discoveries'
  limit 1;

  select count(*) into v_bad
  from jsonb_array_elements_text(coalesce(v_lore_discoveries->'options','[]'::jsonb)) o(slug)
  join public.spell_catalog s on s.slug=o.slug
  where not exists(
    select 1
    from public.spell_catalog_classes sc
    where sc.spell_id=s.id and sc.class_key in ('cleric','druid','wizard')
  );

  if v_bad<>0 then
    raise exception 'BARD_FINAL_LORE_DISCOVERIES_SOURCE_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=3
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.parent_template_id=v_bard
      and t.catalog_key='subclass:bard:valor'
      and t.is_active
      and m.value->>'type'='grant'
      and m.value->>'target'='proficiency'
      and m.value->>'key'='weapon:martial'
  ) or not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=3
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.parent_template_id=v_bard
      and t.catalog_key='subclass:bard:valor'
      and t.is_active
      and m.value->>'type'='grant'
      and m.value->>'target'='proficiency'
      and m.value->>'key'='armor:medium'
  ) then
    raise exception 'BARD_FINAL_VALOR_TRAINING_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=3
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.parent_template_id=v_bard
      and t.catalog_key='subclass:bard:swords'
      and t.is_active
      and m.value->>'key'='bard_swords_defensive_flourish'
      and exists(
        select 1 from jsonb_array_elements(coalesce(m.value->'resourceCosts','[]'::jsonb)) c(value)
        where c.value->>'key'='bardic_inspiration'
      )
  ) then
    raise exception 'BARD_FINAL_SWORDS_FLOURISH_INVALID:%',p_campaign_id;
  end if;

  select c.value into v_spirit_session
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id and l.level=6
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where t.parent_template_id=v_bard
    and t.catalog_key='subclass:bard:spirits'
    and t.is_active
    and c.value->>'key'='bard_spirits_spirit_session'
  limit 1;

  if v_spirit_session is null
     or v_spirit_session->>'refresh'<>'long_rest'
     or coalesce((v_spirit_session->>'count')::integer,0)<>1
     or v_spirit_session->>'replacement_policy'<>'preparation'
  then
    raise exception 'BARD_FINAL_SPIRIT_SESSION_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from jsonb_array_elements_text(coalesce(v_spirit_session->'options','[]'::jsonb)) o(slug)
  join public.spell_catalog s on s.slug=o.slug
  where s.school not in ('Divination','Necromancy');

  if v_bad<>0 then
    raise exception 'BARD_FINAL_SPIRIT_SESSION_SOURCE_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  if to_regprocedure('public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.commit_character_template_choice_v2(uuid,text,jsonb)') is null
     or to_regprocedure('public.commit_character_template_rest_choice_v1(uuid,text,jsonb)') is null
  then
    raise exception 'BARD_FINAL_REQUIRED_RPC_MISSING:%',p_campaign_id;
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.commit_character_template_choice_v2(uuid,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.commit_character_template_choice_v2(uuid,text,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.commit_character_template_rest_choice_v1(uuid,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.commit_character_template_rest_choice_v1(uuid,text,jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'BARD_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID:%',p_campaign_id;
  end if;

  update public.rule_templates
  set catalog_revision='xphb-2024-bard-runtime-final-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_revision','xphb-2024-bard-runtime-final-v1',
        'runtime_stage',6,
        'mechanics_status','READY',
        'runtime_status','ready',
        'runtime_certified_at','2026-09-11',
        'runtime_certification_scope','SUPPORTED_BARD_RUNTIME_V1',
        'multiclass_parent_level_certified',true,
        'multiclass_entry_profile_runtime','generic_pending',
        'multiclass_spell_slot_aggregation_runtime','generic_pending',
        'feat_source_runtime','generic_pending',
        'reference_runtime_ready',true,
        'next_stage',null
      ),
      updated_at=now()
  where id=v_bard;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_status','ready',
        'runtime_certified_at','2026-09-11',
        'runtime_certified_parent_revision','xphb-2024-bard-runtime-final-v1',
        'parent_level_certified',true
      ),
      updated_at=now()
  where parent_template_id=v_bard
    and kind='subclass'
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
end;
$function$;

revoke all on function private.certify_bard_runtime_final_v1(uuid)
from public,anon,authenticated;
grant execute on function private.certify_bard_runtime_final_v1(uuid)
to service_role;

create or replace function private.ensure_bard_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_bard_subclasses_stage5_v1(p_campaign_id);
  perform private.certify_bard_runtime_final_v1(p_campaign_id);
end;
$function$;

revoke all on function private.ensure_bard_runtime_final_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_bard_runtime_final_v1(uuid)
to service_role;

create or replace function private.ensure_bard_runtime_final_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_bard_runtime_final_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_bard_runtime_final_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists aaaaaaaak_campaigns_ensure_bard_subclasses_stage5_v1
on public.campaigns;
drop trigger if exists aaaaaaaal_campaigns_ensure_bard_runtime_final_v1
on public.campaigns;

create trigger aaaaaaaal_campaigns_ensure_bard_runtime_final_v1
after insert on public.campaigns
for each row execute function private.ensure_bard_runtime_final_v1_after_campaign();

do $certify_existing$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.certify_bard_runtime_final_v1(r.id);
  end loop;
end;
$certify_existing$;

commit;
