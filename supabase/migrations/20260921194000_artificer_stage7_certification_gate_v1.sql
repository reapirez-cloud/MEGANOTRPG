-- CLASS_MIGRATION_SCOPE: infrastructure
-- ARTIFICER_STAGE7_GATE: fail-closed-final-certification-v1
--
-- Artificer Stage 7 certification gate.
-- This migration does NOT install Artificer mechanics and does NOT auto-certify
-- existing campaigns. It only installs a private fail-closed certifier that may
-- write READY after Stages 1-6 have installed a complete package.
--
-- Literary/narrator fields are intentionally outside the certification gate:
-- author_description / author_comment may remain blank until the user supplies
-- the translation and literary layer later.

begin;

create or replace function private.artificer_final_family_mechanics_v1(p_artificer uuid)
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
  where t.id=p_artificer
     or (
       t.parent_template_id=p_artificer
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

revoke all on function private.artificer_final_family_mechanics_v1(uuid)
from public,anon,authenticated;
grant execute on function private.artificer_final_family_mechanics_v1(uuid)
to service_role;

create or replace function private.certify_artificer_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_artificer uuid;
  v_count integer;
  v_bad integer;
  v_levels integer[];
begin
  select id into v_artificer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:artificer'
    and is_active
    and is_builtin
  order by updated_at desc
  limit 1;

  if v_artificer is null then
    raise exception 'ARTIFICER_FINAL_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  select count(*) into v_count
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:artificer'
    and is_active
    and is_builtin;
  if v_count<>1 then
    raise exception 'ARTIFICER_FINAL_ACTIVE_CLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  select count(*),array_agg(level order by level)
  into v_count,v_levels
  from public.rule_template_levels
  where template_id=v_artificer;

  if v_count<>20
     or v_levels is distinct from array[
       1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20
     ]::integer[]
  then
    raise exception 'ARTIFICER_FINAL_LEVEL_ROWS_INVALID:%:%:%',p_campaign_id,v_count,v_levels;
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    where t.id=v_artificer
      and coalesce((t.rules_meta->>'base_runtime_certified')::boolean,false)
      and coalesce((t.rules_meta->>'stage5_subclasses_wave1_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'stage6_subclasses_wave2_runtime')::boolean,false)
      and coalesce((t.rules_meta->>'supported_subclass_count')::integer,0)=5
      and coalesce((t.rules_meta->>'runtime_stage')::integer,0)=6
  ) then
    raise exception 'ARTIFICER_FINAL_STAGE_STACK_INCOMPLETE:%',p_campaign_id;
  end if;

  select count(*) into v_count
  from public.rule_templates s
  where s.campaign_id=p_campaign_id
    and s.kind='subclass'
    and s.parent_template_id=v_artificer
    and s.is_active
    and s.unlock_level=3
    and s.catalog_key in (
      'subclass:artificer:alchemist',
      'subclass:artificer:armorer',
      'subclass:artificer:artillerist',
      'subclass:artificer:battle-smith',
      'subclass:artificer:cartographer'
    );
  if v_count<>5 then
    raise exception 'ARTIFICER_FINAL_SUPPORTED_SUBCLASS_COUNT:%:%',p_campaign_id,v_count;
  end if;

  select count(*) into v_bad
  from public.rule_templates s
  where s.campaign_id=p_campaign_id
    and s.kind='subclass'
    and s.is_active
    and (s.catalog_key like 'subclass:artificer:%' or s.slug like 'artificer-%')
    and (
      s.parent_template_id is distinct from v_artificer
      or s.catalog_key not in (
        'subclass:artificer:alchemist',
        'subclass:artificer:armorer',
        'subclass:artificer:artillerist',
        'subclass:artificer:battle-smith',
        'subclass:artificer:cartographer'
      )
    );
  if v_bad<>0 then
    raise exception 'ARTIFICER_FINAL_ORPHAN_OR_UNSUPPORTED_SUBCLASS:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from (
    select catalog_key,count(*) n
    from public.rule_templates
    where campaign_id=p_campaign_id
      and is_active
      and (
        catalog_key='class:artificer'
        or catalog_key like 'subclass:artificer:%'
      )
    group by catalog_key
    having count(*)<>1
  ) duplicates;
  if v_bad<>0 then
    raise exception 'ARTIFICER_FINAL_DUPLICATE_ACTIVE_CATALOG_KEYS:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from (
    select template_id,mechanic->>'id' mechanic_id,count(*) n
    from private.artificer_final_family_mechanics_v1(v_artificer)
    where nullif(mechanic->>'id','') is not null
    group by template_id,mechanic->>'id'
    having count(*)>1
  ) duplicates;
  if v_bad<>0 then
    raise exception 'ARTIFICER_FINAL_DUPLICATE_MECHANIC_IDS:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_bad
  from private.artificer_final_family_mechanics_v1(v_artificer) a
  where a.mechanic->>'type'='action'
    and (
      nullif(a.mechanic->>'sourceKey','') is null
      or not exists(
        select 1
        from private.artificer_final_family_mechanics_v1(v_artificer) f
        where f.template_id=a.template_id
          and f.mechanic->>'type'='grant'
          and f.mechanic->>'target'='feature'
          and f.mechanic->>'sourceKey'=a.mechanic->>'sourceKey'
      )
    );
  if v_bad<>0 then
    raise exception 'ARTIFICER_FINAL_ACTION_FEATURE_REF_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  with all_mechanics as (
    select * from private.artificer_final_family_mechanics_v1(v_artificer)
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
    raise exception 'ARTIFICER_FINAL_BROKEN_RESOURCE_REFS:%:%',p_campaign_id,v_bad;
  end if;

  with family as (
    select t.id,t.catalog_key,t.choices
    from public.rule_templates t
    where t.id=v_artificer
       or (t.parent_template_id=v_artificer and t.kind='subclass' and t.is_active)
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
     or (
       c.choice->'options' is not null
       and jsonb_typeof(c.choice->'options')<>'array'
     )
     or exists(
       select 1
       from jsonb_object_keys(coalesce(c.choice->'option_mechanics','{}'::jsonb)) k(key)
       where c.choice->'options' is not null
         and not exists(
           select 1 from jsonb_array_elements_text(c.choice->'options') o(value)
           where o.value=k.key
         )
     );
  if v_bad<>0 then
    raise exception 'ARTIFICER_FINAL_CHOICE_CONTRACT_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  select count(*) into v_count
  from public.spell_catalog_classes c
  where lower(c.class_key)='artificer';
  if v_count=0 then
    raise exception 'ARTIFICER_FINAL_SPELL_CATALOG_EMPTY:%',p_campaign_id;
  end if;

  if to_regprocedure(
       'public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)'
     ) is null
     or to_regprocedure(
       'public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)'
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
  then
    raise exception 'ARTIFICER_FINAL_REQUIRED_RPC_MISSING:%',p_campaign_id;
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
    raise exception 'ARTIFICER_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID:%',p_campaign_id;
  end if;

  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname in (
      'artificer_final_family_mechanics_v1',
      'certify_artificer_runtime_final_v1',
      'ensure_artificer_runtime_final_v1'
    )
    and (
      has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('authenticated',p.oid,'EXECUTE')
    );
  if v_bad<>0 then
    raise exception 'ARTIFICER_FINAL_INTERNAL_HELPER_PRIVILEGES_INVALID:%:%',p_campaign_id,v_bad;
  end if;

  -- Final activation is deliberately last. Literary fields are untouched.
  update public.rule_templates
  set catalog_revision='eberron-2025-artificer-runtime-final-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_revision','eberron-2025-artificer-runtime-final-v1',
        'runtime_stage',7,
        'mechanics_status','READY',
        'runtime_status','ready',
        'runtime_certified_at','2026-09-21',
        'runtime_certification_scope','SUPPORTED_ARTIFICER_RUNTIME_V1',
        'stage7_final_certified',true,
        'reference_runtime_ready',true,
        'reference_only_until_final_certification',false,
        'literary_layer_required_for_runtime',false,
        'next_stage',null
      ),
      updated_at=now()
  where id=v_artificer;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY',
        'runtime_status','ready',
        'runtime_certified_at','2026-09-21',
        'runtime_certified_parent_revision','eberron-2025-artificer-runtime-final-v1',
        'parent_level_certified',true,
        'reference_runtime_ready',true,
        'reference_only_until_final_certification',false,
        'literary_layer_required_for_runtime',false
      ),
      updated_at=now()
  where parent_template_id=v_artificer
    and kind='subclass'
    and is_active
    and catalog_key in (
      'subclass:artificer:alchemist',
      'subclass:artificer:armorer',
      'subclass:artificer:artillerist',
      'subclass:artificer:battle-smith',
      'subclass:artificer:cartographer'
    );
end;
$function$;

revoke all on function private.certify_artificer_runtime_final_v1(uuid)
from public,anon,authenticated;
grant execute on function private.certify_artificer_runtime_final_v1(uuid)
to service_role;

create or replace function private.ensure_artificer_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.certify_artificer_runtime_final_v1(p_campaign_id);
end;
$function$;

revoke all on function private.ensure_artificer_runtime_final_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_artificer_runtime_final_v1(uuid)
to service_role;

commit;
