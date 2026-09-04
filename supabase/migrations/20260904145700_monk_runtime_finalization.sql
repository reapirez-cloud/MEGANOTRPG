-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch3.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Final readiness closure. This migration intentionally follows all Monk
-- subclass batches so READY can never be advertised by the catalog bootstrap
-- before the complete runtime package exists.

begin;

update public.rule_templates
set
  rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
    'mechanics_status','READY',
    'subclasses_included',true,
    'subclass_runtime_included',true,
    'subclass_supported_count',12,
    'wotc_subclass_supported_count',10,
    'additional_subclass_supported_count',2,
    'subclass_mechanics_status','READY',
    'subclass_runtime_revision','monk-subclasses-batch3-runtime-v1',
    'runtime_closure_revision','monk-runtime-finalization-v1'
  ),
  updated_at=now()
where kind='class'
  and catalog_key='class:monk'
  and is_builtin is true
  and is_active is true;

commit;
