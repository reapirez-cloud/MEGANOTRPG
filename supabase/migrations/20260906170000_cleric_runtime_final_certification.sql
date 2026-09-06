-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericFinalReconciliation.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Greater Divine Intervention has one exceptional execution branch: choosing
-- Wish replaces the normal one-rest recovery with 2d4 Long Rests. The current
-- authoritative template-action runtime owns the Divine Intervention resource,
-- but it does not own which spell the GM/player selected inside Divine
-- Intervention nor the resulting 2d4 roll as a durable server fact. Per the
-- project's GM adjudication boundary, keep that special cooldown exact and
-- explicit instead of inventing a class-only fake counter.
update public.rule_template_levels l
set mechanics=coalesce((
  select jsonb_agg(
    case when m->>'id'='cleric-greater-divine-intervention-feature-l20' then
      jsonb_set(
        m,
        '{payload,mechanic}',
        coalesce(m#>'{payload,mechanic}','{}'::jsonb) || jsonb_build_object(
          'cooldownEnforcement','gm_adjudicated',
          'cooldownReason','wish_selection_and_2d4_result_are_not_authoritative_runtime_state'
        ),
        true
      )
    else m end
    order by ord
  )
  from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
),'[]'::jsonb)
where l.template_id in (
  select id from public.rule_templates where is_active and catalog_key='class:cleric'
) and l.level=20;

-- Final production certification. These gates intentionally validate the live
-- template graph rather than trusting migration history: Cleric had historical
-- dev/production drift even when old source migrations looked correct.
do $$
declare
  v_class uuid;
  v_domains integer;
  v_unlock integer;
  v_bad integer;
  v_prepared_keys integer;
begin
  select id into v_class
  from public.rule_templates
  where is_active and catalog_key='class:cleric'
  order by version desc,updated_at desc limit 1;
  if v_class is null then raise exception 'Cleric closure: active class template missing'; end if;

  select count(*),count(*) filter(where unlock_level=3)
  into v_domains,v_unlock
  from public.rule_templates
  where is_active and kind='subclass' and catalog_key like 'subclass:cleric:%';
  if v_domains<>14 or v_unlock<>14 then
    raise exception 'Cleric closure: expected 14 domains unlocked at level 3, got % / %',v_domains,v_unlock;
  end if;

  -- Daily preparation is a real generic server flow, not prose-only metadata.
  select count(*) into v_prepared_keys
  from jsonb_object_keys(coalesce((select rules_meta->'sheet_profile'->'prepared_spells_by_level' from public.rule_templates where id=v_class),'{}'::jsonb));
  if v_prepared_keys<>20
    or coalesce((select (rules_meta->'sheet_profile'->'prepared_spells_by_level'->>'1')::integer from public.rule_templates where id=v_class),-1)<>4
    or coalesce((select (rules_meta->'sheet_profile'->'prepared_spells_by_level'->>'20')::integer from public.rule_templates where id=v_class),-1)<>22
    or coalesce((select rules_meta->>'spell_preparation_refresh' from public.rule_templates where id=v_class),'')<>'long_rest'
  then raise exception 'Cleric closure: prepared-spell progression/refresh contract is incomplete'; end if;

  -- Channel Divinity must be one shared replacing ledger: 2 at level 2, 3 at 6,
  -- 4 at 18, +1 per Short Rest and full on Long Rest.
  with cd as (
    select l.level,m
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where l.template_id=v_class and m->>'type'='resource' and m->>'key'='channel_divinity'
  )
  select count(*) filter(where
      (level=2 and (m->>'max')::integer=2)
      or (level=6 and (m->>'max')::integer=3)
      or (level=18 and (m->>'max')::integer=4)
    ) into v_bad
  from cd
  where m->>'grantOperation'='REPLACE'
    and exists(select 1 from jsonb_array_elements(coalesce(m->'recoveryRules','[]'::jsonb)) r where r->>'trigger'='short_rest' and r->>'restore'='amount' and (r->>'amount')::integer=1)
    and exists(select 1 from jsonb_array_elements(coalesce(m->'recoveryRules','[]'::jsonb)) r where r->>'trigger'='long_rest' and r->>'restore'='full');
  if v_bad<>3 then raise exception 'Cleric closure: Channel Divinity progression/recovery is not canonical'; end if;

  -- Exact Divine Spark scaling must be structured, not left as stale 1d8 prose/tag.
  select count(*) into v_bad
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where l.template_id=v_class and m->>'id'='cleric-divine-spark'
    and m#>>'{effects,0,kind}'='semantic'
    and m#>>'{effects,0,payload,diceByClericLevel,2}'='1d8'
    and m#>>'{effects,0,payload,diceByClericLevel,7}'='2d8'
    and m#>>'{effects,0,payload,diceByClericLevel,13}'='3d8'
    and m#>>'{effects,0,payload,diceByClericLevel,18}'='4d8';
  if v_bad<>1 then raise exception 'Cleric closure: Divine Spark structured scaling is incomplete'; end if;

  -- Every persistent choice option must remain renderable/resolvable. A choice
  -- without a label or an option_mechanics map key is a selected-but-inert bug.
  with choices as (
    select t.catalog_key,0 level,c
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    union all
    select t.catalog_key,l.level,c
    from public.rule_templates t join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
  )
  select count(*) into v_bad
  from choices q
  cross join lateral jsonb_array_elements_text(coalesce(q.c->'options','[]'::jsonb)) o(value)
  where not (coalesce(q.c->'option_labels','{}'::jsonb) ? o.value)
     or (q.c ? 'option_mechanics' and not (coalesce(q.c->'option_mechanics','{}'::jsonb) ? o.value));
  if v_bad>0 then raise exception 'Cleric closure: % choice option(s) have incomplete labels/mechanics maps',v_bad; end if;

  -- All domain spell accesses are always prepared, use the canonical class_spell
  -- method and Wisdom, and each domain has its complete 1st-5th spell package.
  with domain_spells as (
    select t.catalog_key,l.level,m
    from public.rule_templates t join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and t.catalog_key like 'subclass:cleric:%' and m->>'type'='spell'
  ), summary as (
    select catalog_key,count(*) total,
      count(*) filter(where m#>>'{payload,preparation,mode}'='always_prepared') prepared,
      count(*) filter(where jsonb_array_length(coalesce(m#>'{payload,methods}','[]'::jsonb))=0) no_methods,
      count(*) filter(where exists(select 1 from jsonb_array_elements(coalesce(m#>'{payload,methods}','[]'::jsonb)) md where md->>'kind'<>'class_spell')) wrong_kind,
      count(*) filter(where exists(select 1 from jsonb_array_elements(coalesce(m#>'{payload,methods}','[]'::jsonb)) md where coalesce(md->>'ability','')<>'wisdom')) wrong_ability
    from domain_spells group by catalog_key
  )
  select count(*) into v_bad
  from public.rule_templates t
  left join summary s on s.catalog_key=t.catalog_key
  where t.is_active and t.catalog_key like 'subclass:cleric:%'
    and (coalesce(s.total,0)<10 or s.prepared<>s.total or s.no_methods>0 or s.wrong_kind>0 or s.wrong_ability>0);
  if v_bad>0 then raise exception 'Cleric closure: % domain spell package(s) are incomplete',v_bad; end if;

  -- One unified resource identity contract across legacy/canonical action costs,
  -- cost options, resource effects, and structured persistentCounter metadata.
  with all_mechanics as (
    select m
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    union all
    select m
    from public.rule_templates t join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
  ), resources as (
    select distinct m->>'key' key from all_mechanics where m->>'type'='resource'
  ), refs as (
    select m->>'resourceKey' key from all_mechanics where m->>'type'='action' and nullif(m->>'resourceKey','') is not null
    union all
    select c->>'key' from all_mechanics cross join lateral jsonb_array_elements(coalesce(m->'resourceCosts','[]'::jsonb)) c where m->>'type'='action'
    union all
    select c->>'key' from all_mechanics cross join lateral jsonb_array_elements(coalesce(m->'costOptions','[]'::jsonb)) o cross join lateral jsonb_array_elements(coalesce(o->'costs','[]'::jsonb)) c where m->>'type'='action'
    union all
    select e->>'key' from all_mechanics cross join lateral jsonb_array_elements(coalesce(m->'effects','[]'::jsonb)) e where m->>'type'='action' and e->>'kind'='resource'
    union all
    select m#>>'{payload,mechanic,persistentCounter}' from all_mechanics where m->>'type'='grant' and m->>'target'='feature' and nullif(m#>>'{payload,mechanic,persistentCounter}','') is not null
    union all
    select c.value from all_mechanics cross join lateral jsonb_array_elements_text(coalesce(m#>'{payload,mechanic,persistentCounters}','[]'::jsonb)) c(value) where m->>'type'='grant' and m->>'target'='feature'
  )
  select count(*) into v_bad from refs r where nullif(r.key,'') is null or not exists(select 1 from resources k where k.key=r.key);
  if v_bad>0 then raise exception 'Cleric closure: % runtime resource reference(s) target missing ledgers',v_bad; end if;

  -- No malformed/duplicate action identity and no placeholder exact-rule cards.
  with all_mechanics as (
    select t.catalog_key,m
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    union all
    select t.catalog_key,m
    from public.rule_templates t join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
  )
  select count(*) into v_bad from (
    select catalog_key,m->>'id' id,count(*) n
    from all_mechanics where m->>'type'='action'
    group by catalog_key,m->>'id' having count(*)>1
  ) d;
  if v_bad>0 then raise exception 'Cleric closure: duplicate action identities remain'; end if;

  with all_mechanics as (
    select m from public.rule_templates t cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    union all
    select m from public.rule_templates t join public.rule_template_levels l on l.template_id=t.id cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
  )
  select count(*) into v_bad
  from all_mechanics
  where (m->>'type'='action' and (nullif(m->>'id','') is null or nullif(m->>'key','') is null or nullif(m->>'economy','') is null))
     or (m->>'type'='grant' and m->>'target'='feature' and (
       coalesce(m#>>'{payload,description}','')=''
       or lower(coalesce(m#>>'{payload,description}','')) ~ (('to'||'do')||'|'||('t'||'bd')||'|'||('fix'||'me')||'|placeholder|перевода способности пока нет')
     ))
     or position('"subclass_spell"' in m::text)>0;
  if v_bad>0 then raise exception 'Cleric closure: % malformed/placeholder/legacy mechanics remain',v_bad; end if;

  -- Greater DI's exceptional Wish cooldown is exact but intentionally GM-owned;
  -- the ordinary 1/LR Divine Intervention resource remains CE-owned.
  select count(*) into v_bad
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where l.template_id=v_class and l.level=20
    and m->>'id'='cleric-greater-divine-intervention-feature-l20'
    and m#>>'{payload,mechanic,specialCooldown,whenSpell}'='wish'
    and m#>>'{payload,mechanic,specialCooldown,longRestsDice}'='2d4'
    and m#>>'{payload,mechanic,cooldownEnforcement}'='gm_adjudicated';
  if v_bad<>1 then raise exception 'Cleric closure: Greater Divine Intervention cooldown boundary is not explicit'; end if;
end $$;

-- Only after every live-state gate succeeds is the package certified READY.
update public.rule_templates
set rules_meta=jsonb_set(
      jsonb_set(
        coalesce(rules_meta,'{}'::jsonb),
        '{class_work_status,mechanics}',
        '"READY"'::jsonb,
        true
      ),
      '{mechanics_closure}',
      jsonb_build_object(
        'status','READY',
        'revision','cleric-runtime-certified@2026-09-06',
        'deployedAudit','2026-09-06',
        'domainCount',14,
        'greaterDivineInterventionCooldown','gm_adjudicated_exact_rule'
      ),
      true
    ),
    updated_at=now()
where is_active and catalog_key='class:cleric';

update public.rule_templates
set rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
      'mechanics_status','READY',
      'runtime_certified_at','2026-09-06',
      'parent_unlock_contract','cleric_level_3'
    ),
    updated_at=now()
where is_active and kind='subclass' and catalog_key like 'subclass:cleric:%';

commit;
