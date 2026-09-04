-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch3.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch3=RUNTIME_PRECISION
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Normalize named-value references to the canonical Value Engine context key.

begin;

update public.rule_template_levels rtl
set mechanics = replace(
  rtl.mechanics::text,
  'values.value:martial_arts_die_sides:default',
  'values.martial_arts_die_sides'
)::jsonb
from public.rule_templates rt
where rt.id = rtl.template_id
  and rt.kind = 'subclass'
  and rt.catalog_key in ('subclass:monk:sun-soul','subclass:monk:living-weapon')
  and rtl.mechanics::text like '%values.value:martial_arts_die_sides:default%';

commit;
