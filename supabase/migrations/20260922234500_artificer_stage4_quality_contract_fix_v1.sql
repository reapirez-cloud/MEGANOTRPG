-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:artificer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/artificerRuntimeStage4Base.test.ts
-- CLASS_WORK_STATUS: artificer:stage4_quality_contract_fix=COMPLETE,artificer:mechanics=IN_PROGRESS_STAGE4_COMPLETE
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Forward reconciliation for the already-applied Stage-4 package. current_hp is
-- authoritative character state, so Soul of Artifice must use the ordinary
-- engine-evaluated condition instead of a fake GM-enforcement marker.

begin;

do $fix_artificer_stage4_quality_contract$
declare
  v_template_id uuid;
  v_level_id uuid;
  v_mechanics jsonb;
begin
  for v_template_id in
    select t.id
    from public.rule_templates t
    where t.kind='class'
      and t.catalog_key='class:artificer'
      and t.is_active
  loop
    select l.id,l.mechanics
    into v_level_id,v_mechanics
    from public.rule_template_levels l
    where l.template_id=v_template_id
      and l.level=20
    limit 1;

    if v_level_id is null then
      continue;
    end if;

    select coalesce(jsonb_agg(
      case
        when mechanic.value->>'id'='artificer-soul-of-artifice-cheat-death-action'
        then jsonb_set(
          mechanic.value,
          '{requirements}',
          coalesce((
            select jsonb_agg(requirement.value - 'enforcement' order by requirement.ord)
            from jsonb_array_elements(coalesce(mechanic.value->'requirements','[]'::jsonb))
              with ordinality requirement(value,ord)
          ),'[]'::jsonb),
          true
        )
        else mechanic.value
      end
      order by mechanic.ord
    ),'[]'::jsonb)
    into v_mechanics
    from jsonb_array_elements(coalesce(v_mechanics,'[]'::jsonb))
      with ordinality mechanic(value,ord);

    update public.rule_template_levels
    set mechanics=v_mechanics
    where id=v_level_id;
  end loop;
end
$fix_artificer_stage4_quality_contract$;

commit;
