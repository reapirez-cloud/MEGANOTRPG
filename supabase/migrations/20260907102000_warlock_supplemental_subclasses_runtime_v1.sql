-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:warlock
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/warlockSupplementalSubclassesRuntime.test.ts
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

-- Stage 2 production-safe bootstrap.
-- The original migration payload is pinned to an immutable commit and hash-checked.
-- PostgreSQL exposed one extra closing parenthesis in the Hexblade Curse action that
-- static SQL balance tests did not catch. Patch exactly that token before execution.

do $outer$
declare
  r extensions.http_response;
  s text;
  u varchar := 'https://raw.githubusercontent.com/reapirez-cloud/MEGANOTRPG/158bf90364f7d0ce156c1bbacdeed74f5ef7d1bb/supabase/migrations/20260907102000_warlock_supplemental_subclasses_runtime_v1.sql';
begin
  r := extensions.http_get(u);

  if r.status <> 200 then
    raise exception 'WARLOCK_STAGE2_FETCH_FAILED:%', r.status;
  end if;

  if length(r.content) <> 25868
     or md5(r.content) <> 'd9cc2c0a95ca7586b797b3e8d0e4f2e2' then
    raise exception 'WARLOCK_STAGE2_RUNTIME_HASH_MISMATCH';
  end if;

  s := replace(
    r.content,
    $old$'gm_death_gate',true)))), '["warlock","subclass","hexblade"]'::jsonb)$old$,
    $new$'gm_death_gate',true))), '["warlock","subclass","hexblade"]'::jsonb)$new$
  );

  if s = r.content then
    raise exception 'WARLOCK_STAGE2_RUNTIME_PATCH_NOT_APPLIED';
  end if;

  execute s;
end;
$outer$;
