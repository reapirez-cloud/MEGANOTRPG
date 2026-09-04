-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch1.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch1=RUNTIME_COMPAT
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- PostgreSQL does not implicitly cast integer arguments to jsonb during
-- function overload resolution. Batch 1 legitimately uses both formula-json
-- maxima and literal integer maxima, so provide the literal overload before
-- the batch installer is compiled/executed.

begin;

create or replace function private.monk_subclass_resource(
  p_id text,p_source_key text,p_key text,p_label text,p_max integer,p_recharge jsonb,p_priority integer default 0
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','resource','sourceKey',p_source_key,'key',p_key,'label',p_label,
    'max',to_jsonb(p_max),'recharge',p_recharge,'initial','full','grantOperation','REPLACE','priority',p_priority,
    'presentation',jsonb_build_object('tone','amber','icon','◆','display','pips','priority',84)
  );
$$;

commit;
