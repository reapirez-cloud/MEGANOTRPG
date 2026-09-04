-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Compatibility overload used by Monk subclass runtime migrations.

begin;

create or replace function private.monk_subclass_value(
  p_id text,p_source_key text,p_key text,p_label text,p_value integer,p_priority integer default 0
) returns jsonb language sql immutable set search_path='' as $$
  select private.monk_subclass_value(p_id,p_source_key,p_key,p_label,to_jsonb(p_value),p_priority);
$$;

commit;
