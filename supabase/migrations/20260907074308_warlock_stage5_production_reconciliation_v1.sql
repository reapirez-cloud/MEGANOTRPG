-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:warlock
-- CLASS_PACKAGE_TEST: tests/warlockStage5ProductionReconciliation.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Stage 5 production reconciliation. Existing deployments may already have the
-- PHB 2024 patron installer from the earlier live migration while the canonical
-- repository package is versioned later. Re-run that installer when present,
-- then assert the runtime invariants that must hold in production. On a clean
-- migration chain before the canonical Stage 5 installer exists, this migration
-- intentionally becomes a no-op; the canonical installer runs later.

begin;

do $reconcile$
declare
  v_campaign record;
begin
  if to_regprocedure('private.install_warlock_phb2024_subclasses_v1(uuid)') is not null then
    for v_campaign in select id from public.campaigns loop
      execute 'select private.install_warlock_phb2024_subclasses_v1($1)' using v_campaign.id;
    end loop;
  end if;
end
$reconcile$;

do $verify$
declare
  v_campaign record;
  v_parent_id uuid;
  v_count integer;
  v_exact integer;
  v_cast_level integer;
begin
  if to_regprocedure('private.install_warlock_phb2024_subclasses_v1(uuid)') is null then
    return;
  end if;

  for v_campaign in select id from public.campaigns loop
    select id into v_parent_id
    from public.rule_templates
    where campaign_id = v_campaign.id
      and catalog_key = 'class:warlock'
      and kind = 'class'
      and is_active = true
    order by version desc, updated_at desc
    limit 1;

    if v_parent_id is null then
      raise exception 'WARLOCK_STAGE5_PARENT_MISSING:%', v_campaign.id;
    end if;

    select count(*),
           count(*) filter (where catalog_key in (
             'subclass:warlock:archfey',
             'subclass:warlock:celestial',
             'subclass:warlock:fiend',
             'subclass:warlock:great-old-one'
           ))
      into v_count, v_exact
    from public.rule_templates
    where parent_template_id = v_parent_id
      and kind = 'subclass'
      and is_builtin = true
      and is_active = true;

    if v_count <> 4 or v_exact <> 4 then
      raise exception 'WARLOCK_STAGE5_PATRON_SET_INVALID:campaign=%:count=%:exact=%', v_campaign.id, v_count, v_exact;
    end if;

    if not exists (
      select 1
      from public.rule_templates rt
      join public.rule_template_levels l on l.template_id = rt.id and l.level = 10
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
      where rt.parent_template_id = v_parent_id
        and rt.catalog_key = 'subclass:warlock:archfey'
        and rt.is_active = true
        and m.value->>'key' = 'warlock_archfey_beguiling_defenses_restore_by_pact_slot'
    ) then
      raise exception 'WARLOCK_STAGE5_ARCHFEY_BEGUILING_RUNTIME_MISSING:%', v_campaign.id;
    end if;

    if not exists (
      select 1
      from public.rule_templates rt
      join public.rule_template_levels l on l.template_id = rt.id and l.level = 3
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
      where rt.parent_template_id = v_parent_id
        and rt.catalog_key = 'subclass:warlock:celestial'
        and rt.is_active = true
        and m.value->>'key' = 'warlock_celestial_healing_light_5d6'
    ) then
      raise exception 'WARLOCK_STAGE5_CELESTIAL_HEALING_LIGHT_RUNTIME_MISSING:%', v_campaign.id;
    end if;

    if not exists (
      select 1
      from public.rule_templates rt
      join public.rule_template_levels l on l.template_id = rt.id and l.level = 14
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
      where rt.parent_template_id = v_parent_id
        and rt.catalog_key = 'subclass:warlock:fiend'
        and rt.is_active = true
        and m.value->>'key' = 'warlock_fiend_hurl_through_hell_restore_by_pact_slot'
    ) then
      raise exception 'WARLOCK_STAGE5_FIEND_HURL_RUNTIME_MISSING:%', v_campaign.id;
    end if;

    if not exists (
      select 1
      from public.rule_templates rt
      join public.rule_template_levels l on l.template_id = rt.id and l.level = 6
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
      where rt.parent_template_id = v_parent_id
        and rt.catalog_key = 'subclass:warlock:great-old-one'
        and rt.is_active = true
        and m.value->>'key' = 'warlock_goo_clairvoyant_combatant_restore_by_pact_slot'
    ) then
      raise exception 'WARLOCK_STAGE5_GOO_CLAIRVOYANT_RUNTIME_MISSING:%', v_campaign.id;
    end if;

    select (ro.value->>'castLevel')::integer into v_cast_level
    from public.rule_templates rt
    join public.rule_template_levels l on l.template_id = rt.id and l.level = 5
    cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
    cross join lateral jsonb_array_elements(coalesce(m.value->'payload'->'methods', '[]'::jsonb)) meth(value)
    cross join lateral jsonb_array_elements(coalesce(meth.value->'resourceOptions', '[]'::jsonb)) ro(value)
    where rt.parent_template_id = v_parent_id
      and rt.catalog_key = 'subclass:warlock:fiend'
      and rt.is_active = true
      and m.value->>'key' = 'spell:fireball'
    limit 1;

    if v_cast_level is distinct from 3 then
      raise exception 'WARLOCK_STAGE5_PATRON_CAST_LEVEL_INVALID:campaign=%:level=5:actual=%', v_campaign.id, v_cast_level;
    end if;

    select (ro.value->>'castLevel')::integer into v_cast_level
    from public.rule_templates rt
    join public.rule_template_levels l on l.template_id = rt.id and l.level = 9
    cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
    cross join lateral jsonb_array_elements(coalesce(m.value->'payload'->'methods', '[]'::jsonb)) meth(value)
    cross join lateral jsonb_array_elements(coalesce(meth.value->'resourceOptions', '[]'::jsonb)) ro(value)
    where rt.parent_template_id = v_parent_id
      and rt.catalog_key = 'subclass:warlock:fiend'
      and rt.is_active = true
      and m.value->>'key' = 'spell:fireball'
    limit 1;

    if v_cast_level is distinct from 5 then
      raise exception 'WARLOCK_STAGE5_PATRON_CAST_LEVEL_INVALID:campaign=%:level=9:actual=%', v_campaign.id, v_cast_level;
    end if;
  end loop;
end
$verify$;

commit;