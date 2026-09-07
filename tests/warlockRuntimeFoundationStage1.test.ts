import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migrationPath = "supabase/migrations/20260907005756_warlock_runtime_foundation_stage1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

test("choice runtime accepts short_or_long_rest without opening an unrestricted replacement path", () => {
  assert.ok(migration.includes("v_refresh not in ('', 'long_rest', 'short_or_long_rest')"))
  assert.ok(
    migration.includes(
      "v_refresh in ('long_rest', 'short_or_long_rest') and private.is_character_preparation_open(v_character.id)",
    ),
  )
  assert.ok(!migration.includes("v_refresh = 'short_or_long_rest';"))
})

test("resource actions resolve CE numeric expressions instead of requiring literal JSON numbers", () => {
  assert.ok(
    migration.includes(
      "private.evaluate_character_template_numeric_expression(p_character_id,v_effect->'amount')",
    ),
  )
  assert.ok(migration.includes("Resource effect amount must resolve to a non-negative integer"))
  assert.ok(!migration.includes("Resource effect amount must be numeric"))
})

test("SQL numeric evaluator mirrors the Character Engine formula grammar", () => {
  for (const kind of ["literal", "reference", "add", "subtract", "multiply", "clamp"]) {
    assert.ok(migration.includes(`v_kind = '${kind}'`), kind)
  }
  assert.ok(migration.includes("v_kind in ('min', 'max')"))
  assert.ok(migration.includes("v_key like 'values.%'"))
  assert.ok(
    migration.includes(
      "private.character_runtime_value_snapshot(p_character_id, substr(v_key, 8))",
    ),
  )
  assert.ok(migration.includes("core.proficiencyBonus"))
  assert.ok(migration.includes("^abilities\\.[a-z_]+\\.(score|modifier)$"))
  assert.ok(migration.includes("resources.%.current"))
  assert.ok(migration.includes("resources.%.max"))
})

test("runtime value references preserve grant priority, suppression and replace semantics", () => {
  assert.ok(migration.includes("create or replace function private.character_runtime_value_snapshot"))
  assert.ok(migration.includes("order by priority"))
  assert.ok(migration.includes("v_operation = 'SUPPRESS'"))
  assert.ok(migration.includes("v_operation = 'REPLACE'"))
  assert.ok(migration.includes("v_operation not in ('GRANT', 'REPLACE')"))
  assert.ok(migration.includes("public.character_source_suppressions"))
})

test("stage 1 runtime foundation stays class-generic", () => {
  const helperStart = migration.indexOf("create or replace function private.character_runtime_value_snapshot")
  const actionStart = migration.indexOf("create or replace function public.use_character_template_resource_action")
  assert.ok(helperStart >= 0)
  assert.ok(actionStart > helperStart)
  const runtimeFoundation = migration.slice(helperStart)
  assert.ok(!runtimeFoundation.includes("warlock_magical_cunning_restore"))
  assert.doesNotMatch(runtimeFoundation, /if\s+.*warlock/i)
})
