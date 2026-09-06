-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericFinalReconciliation.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- The historical Cleric chain ended up with two identities for several finite
-- resources: the actual CE resource key and an older semantic/action key. The
-- parser intentionally prefers canonical resourceCosts over legacy resourceKey,
-- so those stale canonical keys made otherwise-correct buttons unspendable.
-- Keep one ledger identity everywhere instead of adding compatibility aliases.
do $$
declare
  r record;
  v_template uuid;
  v_updated integer;
begin
  for r in select * from (values
    ('subclass:cleric:grave-domain',6,'cleric-sentinel-at-death-s-door-l6-1-action-1','grave_sentinel'),
    ('subclass:cleric:knowledge-domain',17,'cleric-divine-foreknowledge-l17-1-action-1','knowledge_foreknowledge'),
    ('subclass:cleric:order-domain',6,'cleric-embodiment-of-the-law-l6-1-action-1','order_embodiment_law'),
    ('subclass:cleric:twilight-domain',6,'cleric-steps-of-night-l6-1-action-1','twilight_steps_of_night')
  ) x(catalog_key,level_no,mechanic_id,resource_key)
  loop
    select id into v_template
    from public.rule_templates
    where catalog_key=r.catalog_key and is_active
    order by version desc,updated_at desc
    limit 1;
    if v_template is null then
      raise exception 'Cleric resource identity closure: missing template %',r.catalog_key;
    end if;

    update public.rule_template_levels l
    set mechanics=coalesce((
      select jsonb_agg(
        case when m->>'id'=r.mechanic_id then
          m || jsonb_build_object(
            'resourceKey',r.resource_key,
            'resourceCost',1,
            'resourceCosts',jsonb_build_array(jsonb_build_object('key',r.resource_key,'amount',1))
          )
        else m end
        order by ord
      )
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
    ),'[]'::jsonb)
    where l.template_id=v_template and l.level=r.level_no
      and exists(
        select 1 from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) q
        where q->>'id'=r.mechanic_id
      );
    get diagnostics v_updated = row_count;
    if v_updated<>1 then
      raise exception 'Cleric resource identity closure: missing action % at % level %',r.mechanic_id,r.catalog_key,r.level_no;
    end if;
  end loop;
end $$;

-- Foreknowledge's slot-powered recharge action was restoring the old semantic
-- key instead of the CE counter it is paired with.
do $$
declare v_template uuid; v_updated integer;
begin
  select id into v_template
  from public.rule_templates
  where catalog_key='subclass:cleric:knowledge-domain' and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null then raise exception 'Cleric resource identity closure: Knowledge Domain missing'; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(
      case when m->>'id'='cleric-knowledge-foreknowledge-recharge' then
        m || jsonb_build_object(
          'effects',jsonb_build_array(jsonb_build_object(
            'kind','resource','key','knowledge_foreknowledge','operation','RESTORE','amount',1
          ))
        )
      else m end
      order by ord
    )
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=17
    and exists(
      select 1 from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) q
      where q->>'id'='cleric-knowledge-foreknowledge-recharge'
    );
  get diagnostics v_updated = row_count;
  if v_updated<>1 then raise exception 'Cleric resource identity closure: Foreknowledge recharge action missing'; end if;
end $$;

-- Remove the dead Grave-domain counter left behind before the canonical
-- soul_guardian package was installed. It had no consumer and duplicated the
-- same feature under a second resource identity.
update public.rule_template_levels l
set mechanics=coalesce((
  select jsonb_agg(m order by ord)
  from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
  where not (
    m->>'type'='resource'
    and (m->>'id'='cleric-grave-keeper-resource' or m->>'key'='grave_keeper_of_souls')
  )
),'[]'::jsonb)
where l.template_id in (
  select id from public.rule_templates
  where is_active and catalog_key='subclass:cleric:grave-domain'
);

-- Structured feature metadata is also part of the runtime contract. Point every
-- finite-resource feature at the same key the CE ledger actually owns.
do $$
declare
  r record;
  v_template uuid;
  v_updated integer;
begin
  for r in select * from (values
    ('subclass:cleric:grave-domain',6,'cleric-grave-domain-sentinel-at-death-s-door-l6-1-feature','grave_sentinel'),
    ('subclass:cleric:knowledge-domain',17,'cleric-knowledge-domain-divine-foreknowledge-l17-1-feature','knowledge_foreknowledge'),
    ('subclass:cleric:light-domain',6,'cleric-light-domain-improved-warding-flare-l6-1-feature','light_warding_flare'),
    ('subclass:cleric:order-domain',6,'cleric-order-domain-embodiment-of-the-law-l6-1-feature','order_embodiment_law'),
    ('subclass:cleric:peace-domain',1,'cleric-peace-domain-peace-domain-l1-1-feature','peace_emboldening_bond'),
    ('subclass:cleric:tempest-domain',1,'cleric-tempest-domain-tempest-domain-l1-1-feature','tempest_wrath_of_storm'),
    ('subclass:cleric:twilight-domain',6,'cleric-twilight-domain-steps-of-night-l6-1-feature','twilight_steps_of_night')
  ) x(catalog_key,level_no,mechanic_id,resource_key)
  loop
    select id into v_template
    from public.rule_templates
    where catalog_key=r.catalog_key and is_active
    order by version desc,updated_at desc limit 1;
    if v_template is null then raise exception 'Cleric resource identity closure: missing template %',r.catalog_key; end if;

    update public.rule_template_levels l
    set mechanics=coalesce((
      select jsonb_agg(
        case when m->>'id'=r.mechanic_id then
          jsonb_set(m,'{payload,mechanic,persistentCounter}',to_jsonb(r.resource_key),true)
        else m end
        order by ord
      )
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
    ),'[]'::jsonb)
    where l.template_id=v_template and l.level=r.level_no
      and exists(
        select 1 from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) q
        where q->>'id'=r.mechanic_id
      );
    get diagnostics v_updated = row_count;
    if v_updated<>1 then
      raise exception 'Cleric resource identity closure: missing feature % at % level %',r.mechanic_id,r.catalog_key,r.level_no;
    end if;
  end loop;
end $$;

-- Light Domain level 3 has a compound list: Channel Divinity was already right,
-- only Warding Flare still used the retired alias.
do $$
declare v_template uuid; v_updated integer;
begin
  select id into v_template
  from public.rule_templates
  where catalog_key='subclass:cleric:light-domain' and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null then raise exception 'Cleric resource identity closure: Light Domain missing'; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(
      case when m->>'id'='cleric-light-domain-light-domain-l3-1-feature' then
        jsonb_set(
          m,
          '{payload,mechanic,persistentCounters}',
          jsonb_build_array('channel_divinity','light_warding_flare'),
          true
        )
      else m end
      order by ord
    )
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=3
    and exists(
      select 1 from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) q
      where q->>'id'='cleric-light-domain-light-domain-l3-1-feature'
    );
  get diagnostics v_updated = row_count;
  if v_updated<>1 then raise exception 'Cleric resource identity closure: Light Domain level-3 compound feature missing'; end if;
end $$;

-- Rebuild spell links if the helper exists. This migration does not alter spell
-- identity, but keeping the standard Cleric reconciliation seam makes it safe on
-- databases that installed the historical package in a different order.
do $$
declare r record;
begin
  if to_regprocedure('private.sync_rule_template_spell_links(uuid)') is not null then
    for r in select id from public.rule_templates
      where is_active and (catalog_key='class:cleric' or catalog_key like 'subclass:cleric:%')
    loop
      execute 'select private.sync_rule_template_spell_links($1)' using r.id;
    end loop;
  end if;
end $$;

-- Hard closure gates. These intentionally scan both legacy and canonical action
-- cost surfaces because a future migration must not reintroduce split identities.
do $$
declare v_bad integer; v_domains integer; v_unlock integer;
begin
  select count(*),count(*) filter(where unlock_level=3)
  into v_domains,v_unlock
  from public.rule_templates
  where is_active and kind='subclass' and catalog_key like 'subclass:cleric:%';
  if v_domains<>14 or v_unlock<>14 then
    raise exception 'Cleric resource identity closure expected 14 domains unlocked at 3, got % domains / % level-3',v_domains,v_unlock;
  end if;

  with all_mechanics as (
    select t.catalog_key,m
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    union all
    select t.catalog_key,m
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
  ), resources as (
    select distinct m->>'key' key from all_mechanics where m->>'type'='resource'
  ), refs as (
    select m->>'id' mechanic_id,m->>'resourceKey' resource_key
    from all_mechanics where m->>'type'='action' and nullif(m->>'resourceKey','') is not null
    union all
    select m->>'id',c->>'key'
    from all_mechanics
    cross join lateral jsonb_array_elements(coalesce(m->'resourceCosts','[]'::jsonb)) c
    where m->>'type'='action'
    union all
    select m->>'id',c->>'key'
    from all_mechanics
    cross join lateral jsonb_array_elements(coalesce(m->'costOptions','[]'::jsonb)) o
    cross join lateral jsonb_array_elements(coalesce(o->'costs','[]'::jsonb)) c
    where m->>'type'='action'
  )
  select count(*) into v_bad
  from refs r
  where nullif(r.resource_key,'') is null
     or not exists(select 1 from resources k where k.key=r.resource_key);
  if v_bad>0 then raise exception 'Cleric resource identity closure: % action resource cost reference(s) target missing resources',v_bad; end if;

  with all_mechanics as (
    select m
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    union all
    select m
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
  ), resources as (
    select distinct m->>'key' key from all_mechanics where m->>'type'='resource'
  ), refs as (
    select m->>'id' mechanic_id,e->>'key' resource_key
    from all_mechanics
    cross join lateral jsonb_array_elements(coalesce(m->'effects','[]'::jsonb)) e
    where m->>'type'='action' and e->>'kind'='resource'
  )
  select count(*) into v_bad
  from refs r
  where nullif(r.resource_key,'') is null
     or not exists(select 1 from resources k where k.key=r.resource_key);
  if v_bad>0 then raise exception 'Cleric resource identity closure: % action resource effect(s) target missing resources',v_bad; end if;

  with all_mechanics as (
    select m
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    union all
    select m
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
  ), resources as (
    select distinct m->>'key' key from all_mechanics where m->>'type'='resource'
  ), counters as (
    select m->>'id' mechanic_id,m#>>'{payload,mechanic,persistentCounter}' resource_key
    from all_mechanics
    where m->>'type'='grant' and m->>'target'='feature'
      and nullif(m#>>'{payload,mechanic,persistentCounter}','') is not null
    union all
    select m->>'id',c.value
    from all_mechanics
    cross join lateral jsonb_array_elements_text(coalesce(m#>'{payload,mechanic,persistentCounters}','[]'::jsonb)) c(value)
    where m->>'type'='grant' and m->>'target'='feature'
  )
  select count(*) into v_bad
  from counters c
  where not exists(select 1 from resources k where k.key=c.resource_key);
  if v_bad>0 then raise exception 'Cleric resource identity closure: % structured counter reference(s) target missing resources',v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where t.is_active and t.catalog_key='subclass:cleric:grave-domain'
    and m->>'type'='resource'
    and (m->>'id'='cleric-grave-keeper-resource' or m->>'key'='grave_keeper_of_souls');
  if v_bad>0 then raise exception 'Cleric resource identity closure: legacy Grave Keeper resource survived'; end if;

  select count(distinct m->>'id') into v_bad
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where t.is_active and t.catalog_key='subclass:cleric:grave-domain'
    and (
      (m->>'type'='resource' and m->>'key'='soul_guardian')
      or m->>'id' in ('cleric-grave-soul-guardian-trigger','cleric-grave-soul-guardian-recharge')
    );
  if v_bad<>3 then raise exception 'Cleric resource identity closure: canonical Keeper of Souls package is incomplete'; end if;
end $$;

commit;
