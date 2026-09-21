-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:rogue
-- CLASS_PACKAGE_TEST: tests/rogueRuntimeStage7FinalCertification.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: rogue:runtime=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Rogue Stage 7: fail-closed final certification and public runtime activation.
-- No new Rogue gameplay feature is authored here. The only runtime repair is a
-- generic assignment-resource cleanup required by the final remove/reassign smoke.

begin;

-- ---------------------------------------------------------------------------
-- Generic assignment resource ownership / cleanup
-- ---------------------------------------------------------------------------

create or replace function private.template_assignment_resource_keys_v1(
  p_template_id uuid,
  p_source_level integer,
  p_selected_choices jsonb
)
returns table(state_key text)
language sql
stable
security definer
set search_path=''
as $function$
with template_row as (
  select t.mechanics,t.choices
  from public.rule_templates t
  where t.id=p_template_id and t.is_active
),
choice_defs as (
  select 0 as level,c.value choice
  from template_row t
  cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c(value)
  union all
  select l.level,c.value
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=p_template_id
    and l.level<=greatest(1,coalesce(p_source_level,1))
),
selected as (
  select d.level,d.choice,o.value option_key
  from choice_defs d
  cross join lateral jsonb_array_elements_text(
    case jsonb_typeof(coalesce(p_selected_choices,'{}'::jsonb)->(d.choice->>'key'))
      when 'array' then coalesce(p_selected_choices,'{}'::jsonb)->(d.choice->>'key')
      when 'string' then jsonb_build_array(
        coalesce(p_selected_choices,'{}'::jsonb)->>(d.choice->>'key')
      )
      else '[]'::jsonb
    end
  ) o(value)
  where exists(
    select 1
    from jsonb_array_elements_text(coalesce(d.choice->'options','[]'::jsonb)) allowed(value)
    where allowed.value=o.value
  )
),
mechanics as (
  select m.value mechanic
  from template_row t
  cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m(value)

  union all

  select m.value
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  where l.template_id=p_template_id
    and l.level<=greatest(1,coalesce(p_source_level,1))

  union all

  select m.value
  from selected s
  cross join lateral jsonb_array_elements(
    coalesce(s.choice->'option_mechanics'->s.option_key,'[]'::jsonb)
  ) m(value)

  union all

  select m.value
  from selected s
  cross join lateral jsonb_each(
    coalesce(s.choice->'option_mechanics_by_level'->s.option_key,'{}'::jsonb)
  ) g(level_key,level_mechanics)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.level_mechanics)='array'
      then g.level_mechanics else '[]'::jsonb end
  ) m(value)
  where g.level_key~'^[0-9]+$'
    and g.level_key::integer<=greatest(1,coalesce(p_source_level,1))
)
select distinct
  case
    when coalesce(nullif(mechanic->>'variantKey',''),'default')='default'
      then mechanic->>'key'
    else (mechanic->>'key')||'::'||(mechanic->>'variantKey')
  end state_key
from mechanics
where mechanic->>'type'='resource'
  and nullif(btrim(coalesce(mechanic->>'key','')),'') is not null;
$function$;

revoke all on function private.template_assignment_resource_keys_v1(uuid,integer,jsonb)
from public,anon,authenticated;
grant execute on function private.template_assignment_resource_keys_v1(uuid,integer,jsonb)
to service_role;

create or replace function private.cleanup_template_resource_states_after_assignment_delete_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  delete from public.character_resource_states s
  where s.character_id=old.character_id
    and s.state_key in (
      select k.state_key
      from private.template_assignment_resource_keys_v1(
        old.template_id,
        greatest(1,coalesce(old.template_level,1)),
        coalesce(old.selected_choices,'{}'::jsonb)
      ) k
    )
    and not exists(
      select 1
      from public.character_template_assignments a
      cross join lateral private.template_assignment_resource_keys_v1(
        a.template_id,
        private.character_template_source_level(a.id),
        coalesce(a.selected_choices,'{}'::jsonb)
      ) remaining
      where a.character_id=old.character_id
        and remaining.state_key=s.state_key
    );

  return old;
end;
$function$;

revoke all on function private.cleanup_template_resource_states_after_assignment_delete_v1()
from public,anon,authenticated;

drop trigger if exists character_template_assignments_cleanup_resources_v1
on public.character_template_assignments;

create trigger character_template_assignments_cleanup_resources_v1
after delete on public.character_template_assignments
for each row execute function private.cleanup_template_resource_states_after_assignment_delete_v1();

-- ---------------------------------------------------------------------------
-- Final family mechanics view for fail-closed certification.
-- This expands every declared choice option, not character selections.
-- ---------------------------------------------------------------------------

create or replace function private.rogue_final_family_mechanics_v1(p_rogue uuid)
returns table(
  template_id uuid,
  catalog_key text,
  level integer,
  mechanic jsonb
)
language sql
stable
security definer
set search_path=''
as $function$
with family as (
  select t.id,t.catalog_key,t.mechanics,t.choices
  from public.rule_templates t
  where t.id=p_rogue
     or (
       t.parent_template_id=p_rogue
       and t.kind='subclass'
       and t.is_active
     )
),
all_choices as (
  select f.id template_id,f.catalog_key,0 level,c.value choice
  from family f
  cross join lateral jsonb_array_elements(coalesce(f.choices,'[]'::jsonb)) c(value)

  union all

  select f.id,f.catalog_key,l.level,c.value
  from family f
  join public.rule_template_levels l on l.template_id=f.id
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
)
select f.id,f.catalog_key,0,m.value
from family f
cross join lateral jsonb_array_elements(coalesce(f.mechanics,'[]'::jsonb)) m(value)

union all

select f.id,f.catalog_key,l.level,m.value
from family f
join public.rule_template_levels l on l.template_id=f.id
cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)

union all

select c.template_id,c.catalog_key,c.level,m.value
from all_choices c
cross join lateral jsonb_each(coalesce(c.choice->'option_mechanics','{}'::jsonb)) o(option_key,mechanics)
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(o.mechanics)='array' then o.mechanics else '[]'::jsonb end
) m(value)

union all

select c.template_id,c.catalog_key,g.level_key::integer,m.value
from all_choices c
cross join lateral jsonb_each(coalesce(c.choice->'option_mechanics_by_level','{}'::jsonb)) option_entry(option_key,level_map)
cross join lateral jsonb_each(
  case when jsonb_typeof(option_entry.level_map)='object'
    then option_entry.level_map else '{}'::jsonb end
) g(level_key,mechanics)
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(g.mechanics)='array' then g.mechanics else '[]'::jsonb end
) m(value)
where g.level_key~'^[0-9]+$';
$function$;

revoke all on function private.rogue_final_family_mechanics_v1(uuid)
from public,anon,authenticated;
grant execute on function private.rogue_final_family_mechanics_v1(uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Fail-closed final certifier
-- ---------------------------------------------------------------------------

create or replace function private.certify_rogue_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rogue uuid;
  v_count integer;
  v_bad integer;
  v_levels integer[];
  v_expected record;
  v_subclass uuid;
  v_cantrips jsonb;
  v_prepared jsonb;
  v_choice jsonb;
begin
  select id into v_rogue
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:rogue'
    and is_active
    and is_builtin
  order by updated_at desc
  limit 1;

  if v_rogue is null then
    raise exception 'ROGUE_FINAL_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  select count(*) into v_count
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:rogue'
    and is_active
    and is_builtin;
  if v_count<>1 then
    raise exception 'ROGUE_FINAL_ACTIVE_CLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  select count(*),array_agg(level order by level)
  into v_count,v_levels
  from public.rule_template_levels
  where template_id=v_rogue;

  if v_count<>20
     or v_levels is distinct from array[
       1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20
     ]::integer[]
  then
    raise exception 'ROGUE_FINAL_LEVEL_ROWS_INVALID:%:%:%',p_campaign_id,v_count,v_levels;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    where t.id=v_rogue
      and coalesce((t.rules_meta->>'base_runtime_certified')::boolean,false)
      and coalesce((t.rules_meta->>'stage5_phb_subclasses_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'stage6_legacy_subclasses_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'supported_subclass_count')::integer,0)=9
      and coalesce((t.rules_meta->>'runtime_stage')::integer,0)=6
  ) then
    raise exception 'ROGUE_FINAL_STAGE_STACK_INCOMPLETE:%',p_campaign_id;
  end if;

  select count(*) into v_count
  from public.rule_templates s
  where s.campaign_id=p_campaign_id
    and s.kind='subclass'
    and s.parent_template_id=v_rogue
    and s.is_active
    and s.catalog_key in (
      'subclass:rogue:thief',
      'subclass:rogue:assassin',
      'subclass:rogue:arcane-trickster',
      'subclass:rogue:soulknife',
      'subclass:rogue:swashbuckler',
      'subclass:rogue:inquisitive',
      'subclass:rogue:mastermind',
      'subclass:rogue:scout',
      'subclass:rogue:phantom'
    )
    and s.unlock_level=3;
  if v_count<>9 then
    raise exception 'ROGUE_FINAL_SUPPORTED_SUBCLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  select count(*) into v_bad
  from public.rule_templates s
  where s.campaign_id=p_campaign_id
    and s.kind='subclass'
    and s.is_active
    and (s.catalog_key like 'subclass:rogue:%' or s.slug like 'rogue-%')
    and (
      s.parent_template_id is distinct from v_rogue
      or s.catalog_key not in (
        'subclass:rogue:thief',
        'subclass:rogue:assassin',
        'subclass:rogue:arcane-trickster',
        'subclass:rogue:soulknife',
        'subclass:rogue:swashbuckler',
        'subclass:rogue:inquisitive',
        'subclass:rogue:mastermind',
        'subclass:rogue:scout',
        'subclass:rogue:phantom'
      )
    );
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_ORPHAN_OR_UNSUPPORTED_SUBCLASS:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from (
    select catalog_key,count(*) n
    from public.rule_templates
    where campaign_id=p_campaign_id
      and is_active
      and (
        catalog_key='class:rogue'
        or catalog_key like 'subclass:rogue:%'
      )
    group by catalog_key
    having count(*)<>1
  ) duplicates;
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_DUPLICATE_ACTIVE_CATALOG_KEYS:%:%',p_campaign_id,v_bad;
  end if;

  -- Exact representative Rogue-level Sneak Attack checkpoints.
  for v_expected in
    select * from (values
      (1,1),(3,2),(5,3),(7,4),(11,6),(14,7),(17,9),(20,10)
    ) x(level,dice)
  loop
    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_rogue
        and l.level<=v_expected.level
        and m.value->>'type'='grant'
        and m.value->>'target'='value'
        and m.value->>'key'='rogue_sneak_attack_dice'
        and m.value->>'grantOperation'='REPLACE'
        and (m.value#>>'{payload,value}')::integer=v_expected.dice
        and l.level=(
          select max(l2.level)
          from public.rule_template_levels l2
          cross join lateral jsonb_array_elements(coalesce(l2.mechanics,'[]'::jsonb)) m2(value)
          where l2.template_id=v_rogue
            and l2.level<=v_expected.level
            and m2.value->>'type'='grant'
            and m2.value->>'key'='rogue_sneak_attack_dice'
        )
    ) then
      raise exception 'ROGUE_FINAL_SNEAK_ATTACK_CHECKPOINT_INVALID:%:%',p_campaign_id,v_expected.level;
    end if;
  end loop;

  -- Every one of the 15 canonical base features must still be structured.
  select count(*) into v_bad
  from (values
    ('sneak-attack'),('expertise'),('thieves-cant'),('weapon-mastery'),
    ('cunning-action'),('steady-aim'),('cunning-strike'),('uncanny-dodge'),
    ('evasion'),('reliable-talent'),('improved-cunning-strike'),
    ('devious-strikes'),('slippery-mind'),('elusive'),('stroke-of-luck')
  ) expected(source_key)
  where not exists(
    select 1
    from private.rogue_final_family_mechanics_v1(v_rogue) m
    where m.template_id=v_rogue
      and m.mechanic->>'type'='grant'
      and m.mechanic->>'target'='feature'
      and m.mechanic->>'sourceKey'=expected.source_key
      and nullif(m.mechanic#>>'{payload,mechanic,kind}','') is not null
  );
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_BASE_FEATURE_GAP:%:%',p_campaign_id,v_bad;
  end if;

  -- No duplicate mechanic id inside one active family template.
  select count(*) into v_bad
  from (
    select template_id,mechanic->>'id' mechanic_id,count(*) n
    from private.rogue_final_family_mechanics_v1(v_rogue)
    where nullif(mechanic->>'id','') is not null
    group by template_id,mechanic->>'id'
    having count(*)>1
  ) duplicates;
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_DUPLICATE_MECHANIC_IDS:%:%',p_campaign_id,v_bad;
  end if;

  -- Every executable action is backed by a same-template feature source.
  select count(*) into v_bad
  from private.rogue_final_family_mechanics_v1(v_rogue) a
  where a.mechanic->>'type'='action'
    and (
      nullif(a.mechanic->>'sourceKey','') is null
      or not exists(
        select 1
        from private.rogue_final_family_mechanics_v1(v_rogue) f
        where f.template_id=a.template_id
          and f.mechanic->>'type'='grant'
          and f.mechanic->>'target'='feature'
          and f.mechanic->>'sourceKey'=a.mechanic->>'sourceKey'
      )
    );
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_ACTION_FEATURE_REF_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  -- Resource references must resolve inside the family, except shared spell slots
  -- which may be provided by another caster package in multiclass characters.
  with all_mechanics as (
    select * from private.rogue_final_family_mechanics_v1(v_rogue)
  ),
  resources as (
    select distinct
      case
        when coalesce(nullif(mechanic->>'variantKey',''),'default')='default'
          then mechanic->>'key'
        else (mechanic->>'key')||'::'||(mechanic->>'variantKey')
      end key
    from all_mechanics
    where mechanic->>'type'='resource'
  ),
  costs as (
    select c.value->>'key' key
    from all_mechanics a
    cross join lateral jsonb_array_elements(coalesce(a.mechanic->'resourceCosts','[]'::jsonb)) c(value)

    union all

    select c.value->>'key'
    from all_mechanics a
    cross join lateral jsonb_array_elements(coalesce(a.mechanic->'costOptions','[]'::jsonb)) o(value)
    cross join lateral jsonb_array_elements(coalesce(o.value->'costs','[]'::jsonb)) c(value)

    union all

    select c.value->>'key'
    from all_mechanics a
    cross join lateral jsonb_array_elements(coalesce(a.mechanic#>'{payload,methods}','[]'::jsonb)) method(value)
    cross join lateral jsonb_array_elements(coalesce(method.value->'resourceOptions','[]'::jsonb)) ro(value)
    cross join lateral jsonb_array_elements(coalesce(ro.value->'costs','[]'::jsonb)) c(value)

    union all

    select e.value->>'key'
    from all_mechanics a
    cross join lateral jsonb_array_elements(coalesce(a.mechanic->'effects','[]'::jsonb)) e(value)
    where e.value->>'kind'='resource'
  )
  select count(*) into v_bad
  from costs
  where nullif(key,'') is null
     or (
       key not in (select key from resources)
       and key !~ '^spell_slot_[1-9]$'
     );
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_BROKEN_RESOURCE_REFS:%:%',p_campaign_id,v_bad;
  end if;

  -- Choice contract integrity across parent and all supported subclasses.
  with family as (
    select t.id,t.catalog_key,t.choices
    from public.rule_templates t
    where t.id=v_rogue
       or (t.parent_template_id=v_rogue and t.kind='subclass' and t.is_active)
  ),
  choices as (
    select f.catalog_key,c.value choice
    from family f
    cross join lateral jsonb_array_elements(coalesce(f.choices,'[]'::jsonb)) c(value)
    union all
    select f.catalog_key,c.value
    from family f
    join public.rule_template_levels l on l.template_id=f.id
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  )
  select count(*) into v_bad
  from choices c
  where nullif(btrim(coalesce(c.choice->>'key','')),'') is null
     or jsonb_typeof(coalesce(c.choice->'options','[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(c.choice->'options','[]'::jsonb))=0
     or (
       select count(*) from jsonb_array_elements_text(c.choice->'options')
     ) <> (
       select count(distinct value) from jsonb_array_elements_text(c.choice->'options')
     )
     or exists(
       select 1
       from jsonb_object_keys(coalesce(c.choice->'option_mechanics','{}'::jsonb)) k(key)
       where not exists(
         select 1 from jsonb_array_elements_text(c.choice->'options') o(value)
         where o.value=k.key
       )
     )
     or exists(
       select 1
       from jsonb_object_keys(coalesce(c.choice->'option_unlock_level','{}'::jsonb)) k(key)
       where not exists(
         select 1 from jsonb_array_elements_text(c.choice->'options') o(value)
         where o.value=k.key
       )
     )
     or (
       c.choice->'option_provider' is not null
       and c.choice#>>'{option_provider,kind}' not in (
         'skill_proficiencies','weapon_proficiencies','unproficient_skill_or_tool'
       )
     );
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_CHOICE_CONTRACT_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  -- Canonical parent choices.
  select c.value into v_choice
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_rogue and l.level=1
    and c.value->>'key'='rogue_expertise'
  limit 1;
  if v_choice is null
     or v_choice#>>'{option_provider,kind}'<>'skill_proficiencies'
     or (v_choice->'count_by_level') is distinct from '{"1":2,"6":4}'::jsonb
  then
    raise exception 'ROGUE_FINAL_EXPERTISE_CHOICE_INVALID:%',p_campaign_id;
  end if;

  select c.value into v_choice
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_rogue and l.level=1
    and c.value->>'key'='rogue_weapon_mastery'
  limit 1;
  if v_choice is null
     or v_choice->>'refresh'<>'long_rest'
     or v_choice#>>'{option_provider,kind}'<>'weapon_proficiencies'
     or coalesce((v_choice->>'count')::integer,0)<>2
  then
    raise exception 'ROGUE_FINAL_WEAPON_MASTERY_CHOICE_INVALID:%',p_campaign_id;
  end if;

  -- Exact Cunning Strike / Devious Strike contracts.
  for v_expected in
    select * from (values
      ('rogue-cunning-strike-poison',1),
      ('rogue-cunning-strike-trip',1),
      ('rogue-cunning-strike-withdraw',1),
      ('rogue-cunning-strike-combo-poison-trip',2),
      ('rogue-cunning-strike-combo-poison-withdraw',2),
      ('rogue-cunning-strike-combo-trip-withdraw',2),
      ('rogue-devious-strike-daze',2),
      ('rogue-devious-strike-obscure',3),
      ('rogue-devious-strike-knockout',6)
    ) x(mechanic_id,dice_cost)
  loop
    if not exists(
      select 1
      from private.rogue_final_family_mechanics_v1(v_rogue) m
      cross join lateral jsonb_array_elements(coalesce(m.mechanic->'effects','[]'::jsonb)) e(value)
      where m.template_id=v_rogue
        and m.mechanic->>'id'=v_expected.mechanic_id
        and m.mechanic->>'type'='action'
        and e.value->>'kind'='semantic'
        and e.value->>'key'='bonus_damage_dice_sacrifice'
        and coalesce((e.value#>>'{payload,diceCost}')::integer,0)=v_expected.dice_cost
        and coalesce((e.value#>>'{payload,dieSides}')::integer,0)=6
        and e.value#>>'{payload,poolValueKey}'='rogue_sneak_attack_dice'
    ) then
      raise exception 'ROGUE_FINAL_STRIKE_CONTRACT_INVALID:%:%',p_campaign_id,v_expected.mechanic_id;
    end if;
  end loop;

  -- Arcane Trickster shared Wizard catalog / spell runtime.
  select id into v_subclass
  from public.rule_templates
  where campaign_id=p_campaign_id
    and catalog_key='subclass:rogue:arcane-trickster'
    and parent_template_id=v_rogue
    and is_active
  limit 1;

  select c.value into v_cantrips
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_subclass and l.level=3
    and c.value->>'key'='arcane_trickster_cantrips'
  limit 1;

  select c.value into v_prepared
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_subclass and l.level=3
    and c.value->>'key'='arcane_trickster_prepared_spells'
  limit 1;

  if v_cantrips is null
     or v_cantrips->>'replacement_policy'<>'on_level_change'
     or coalesce((v_cantrips->>'replacement_limit')::integer,0)<>1
     or (v_cantrips->'count_by_level') is distinct from '{"3":2,"10":3}'::jsonb
     or jsonb_array_length(v_cantrips->'options')<>29
  then
    raise exception 'ROGUE_FINAL_ARCANE_CANTRIPS_INVALID:%',p_campaign_id;
  end if;

  if v_prepared is null
     or v_prepared->>'replacement_policy'<>'on_level_change'
     or coalesce((v_prepared->>'replacement_limit')::integer,0)<>1
     or (v_prepared->'count_by_level') is distinct from
       '{"3":3,"4":4,"5":4,"6":4,"7":5,"8":6,"9":6,"10":7,"11":8,"12":8,"13":9,"14":10,"15":10,"16":11,"17":11,"18":11,"19":12,"20":13}'::jsonb
     or jsonb_array_length(v_prepared->'options')<>206
  then
    raise exception 'ROGUE_FINAL_ARCANE_PREPARED_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from (
    select value slug,0 expected_level
    from jsonb_array_elements_text(v_cantrips->'options')
    union all
    select value,
      private.rogue_stage5_arcane_spell_unlock_v1(s.spell_level)
    from jsonb_array_elements_text(v_prepared->'options') o(value)
    join public.spell_catalog s on s.slug=o.value
  ) chosen
  join public.spell_catalog s on s.slug=chosen.slug
  where not exists(
    select 1 from public.spell_catalog_classes c
    where c.spell_id=s.id and c.class_key='wizard'
  )
  or s.spell_level>4
  or (chosen.expected_level=0 and s.spell_level<>0);
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_ARCANE_CATALOG_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  if (
    select count(distinct sl.spell_id)
    from public.rule_template_spell_links sl
    where sl.template_id=v_subclass
  )<>236 then
    raise exception 'ROGUE_FINAL_ARCANE_SPELL_LINK_PARITY_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_subclass
      and m.value->>'type'='spell'
      and m.value->>'catalogSlug'='mage-hand'
  ) then
    raise exception 'ROGUE_FINAL_ARCANE_MAGE_HAND_MISSING:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from jsonb_each(coalesce(v_prepared->'option_mechanics','{}'::jsonb)) e(slug,mechanics)
  cross join lateral jsonb_array_elements(e.mechanics) m(value)
  cross join lateral jsonb_array_elements(coalesce(m.value#>'{payload,methods}','[]'::jsonb)) method(value)
  where method.value->>'kind'<>'class_spell'
     or method.value->>'ability'<>'intelligence'
     or jsonb_array_length(coalesce(method.value->'resourceOptions','[]'::jsonb))=0;
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_ARCANE_METHOD_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  -- Soulknife exact fixed PHB 2024 Psionic Energy Dice progression.
  select id into v_subclass
  from public.rule_templates
  where campaign_id=p_campaign_id
    and catalog_key='subclass:rogue:soulknife'
    and parent_template_id=v_rogue
    and is_active
  limit 1;

  for v_expected in
    select * from (values
      (3,4),(5,6),(9,8),(13,10),(17,12)
    ) x(level,dice_max)
  loop
    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_subclass
        and l.level=v_expected.level
        and m.value->>'type'='resource'
        and m.value->>'key'='soulknife_psionic_energy'
        and (m.value->>'max')::integer=v_expected.dice_max
        and m.value->'recoveryRules' @>
          '[{"trigger":"short_rest","restore":"amount","amount":1},{"trigger":"long_rest","restore":"full"}]'::jsonb
    ) then
      raise exception 'ROGUE_FINAL_SOULKNIFE_POOL_INVALID:%:%',p_campaign_id,v_expected.level;
    end if;
  end loop;

  for v_expected in
    select * from (values
      (3,6),(5,8),(11,10),(17,12)
    ) x(level,die_sides)
  loop
    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_subclass
        and l.level=v_expected.level
        and m.value->>'type'='grant'
        and m.value->>'target'='value'
        and m.value->>'key'='soulknife_psionic_die_sides'
        and (m.value#>>'{payload,value}')::integer=v_expected.die_sides
    ) then
      raise exception 'ROGUE_FINAL_SOULKNIFE_DIE_INVALID:%:%',p_campaign_id,v_expected.level;
    end if;
  end loop;

  select count(*) into v_count
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  where l.template_id=v_subclass
    and m.value->>'type'='action'
    and m.value->>'key' in (
      'soulknife_psychic_blade',
      'soulknife_psychic_blade_bonus'
    );
  if v_count<>2 then
    raise exception 'ROGUE_FINAL_SOULKNIFE_PSYCHIC_BLADES_INVALID:%:%',p_campaign_id,v_count;
  end if;

  -- Required shared execution surfaces must exist and not be anonymous APIs.
  if to_regprocedure(
       'public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)'
     ) is null
     or to_regprocedure(
       'public.send_chat_template_roll_v2(uuid,uuid,text,text,text,text,integer,boolean,integer,integer,integer,uuid)'
     ) is null
     or to_regprocedure(
       'public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)'
     ) is null
     or to_regprocedure(
       'public.send_chat_roll_v4(uuid,uuid,text,text,integer,boolean,integer,integer,integer,integer,jsonb)'
     ) is null
     or to_regprocedure(
       'public.commit_character_template_choice_v2(uuid,text,jsonb)'
     ) is null
     or to_regprocedure(
       'public.commit_character_template_rest_choice_v1(uuid,text,jsonb)'
     ) is null
     or to_regprocedure(
       'public.recover_character_resources(uuid,text)'
     ) is null
     or to_regprocedure(
       'public.arcane_trickster_steal_spell_v1(uuid,uuid,boolean)'
     ) is null
  then
    raise exception 'ROGUE_FINAL_REQUIRED_RPC_MISSING:%',p_campaign_id;
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
       'public.recover_character_resources(uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.recover_character_resources(uuid,text)',
       'EXECUTE'
     )
  then
    raise exception 'ROGUE_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID:%',p_campaign_id;
  end if;

  -- Internal Rogue installers/certifier must remain off the anonymous/auth API.
  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and (
      p.proname like 'ensure_rogue_stage%'
      or p.proname='certify_rogue_runtime_final_v1'
    )
    and (
      has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('authenticated',p.oid,'EXECUTE')
    );
  if v_bad<>0 then
    raise exception 'ROGUE_FINAL_INTERNAL_HELPER_PRIVILEGES_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  -- Final activation is deliberately last.
  update public.rule_templates
  set catalog_revision='xphb-2024-rogue-runtime-final-v1',
      rules_meta=(
        coalesce(rules_meta,'{}'::jsonb)
        - 'core_gameplay_runtime_pending_stage3'
        - 'remaining_base_runtime_pending_stage4'
      )||jsonb_build_object(
        'runtime_revision','xphb-2024-rogue-runtime-final-v1',
        'runtime_stage',7,
        'mechanics_status','READY',
        'runtime_status','ready',
        'runtime_certified_at','2026-09-21',
        'runtime_certification_scope','SUPPORTED_ROGUE_RUNTIME_V1',
        'stage7_final_certified',true,
        'reference_runtime_ready',true,
        'reference_only_until_final_certification',false,
        'multiclass_parent_level_certified',true,
        'assignment_reload_level_change_certified',true,
        'resource_cleanup_on_assignment_removal',true,
        'next_stage',null
      ),
      updated_at=now()
  where id=v_rogue;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY',
        'runtime_status','ready',
        'runtime_certified_at','2026-09-21',
        'runtime_certified_parent_revision','xphb-2024-rogue-runtime-final-v1',
        'parent_level_certified',true,
        'reference_runtime_ready',true,
        'reference_only_until_final_certification',false
      ),
      updated_at=now()
  where parent_template_id=v_rogue
    and kind='subclass'
    and is_active
    and catalog_key in (
      'subclass:rogue:thief',
      'subclass:rogue:assassin',
      'subclass:rogue:arcane-trickster',
      'subclass:rogue:soulknife',
      'subclass:rogue:swashbuckler',
      'subclass:rogue:inquisitive',
      'subclass:rogue:mastermind',
      'subclass:rogue:scout',
      'subclass:rogue:phantom'
    );
end;
$function$;

revoke all on function private.certify_rogue_runtime_final_v1(uuid)
from public,anon,authenticated;
grant execute on function private.certify_rogue_runtime_final_v1(uuid)
to service_role;

create or replace function private.ensure_rogue_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.certify_rogue_runtime_final_v1(p_campaign_id);
end;
$function$;

revoke all on function private.ensure_rogue_runtime_final_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_rogue_runtime_final_v1(uuid)
to service_role;

create or replace function private.ensure_rogue_runtime_final_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_rogue_runtime_final_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_rogue_runtime_final_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists r_campaigns_ensure_rogue_runtime_final_v1
on public.campaigns;

create trigger r_campaigns_ensure_rogue_runtime_final_v1
after insert on public.campaigns
for each row execute function private.ensure_rogue_runtime_final_v1_after_campaign();

do $certify_existing$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.certify_rogue_runtime_final_v1(r.id);
  end loop;
end;
$certify_existing$;

commit;
