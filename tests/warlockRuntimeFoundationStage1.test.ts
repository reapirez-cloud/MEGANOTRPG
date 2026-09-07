import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migrationPath = "supabase/migrations/20260907005756_warlock_runtime_foundation_stage1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

test("choice runtime accepts short_or_long_rest without opening an unrestricted replacement path", () => {
  assert.match(
    migration,
    /v_refresh not in \('\', 'long_rest', 'short_or_long_rest'\)/,
  )
  assert.match(
    migration,
    /v_refresh in \('long_rest', 'short_or_long_rest'\) and private\.is_character_preparation_open\(v_character\.id\)/,
  )
  assert.doesNotMatch(
    migration,
    /v_refresh = 'short_or_long_rest'\s*;/,
  )
})

test("resource actions resolve CE numeric expressions instead of requiring literal JSON numbers", () => {
  assert.match(
    migration,
    /private\.evaluate_character_template_numeric_expression\(p_character_id,v_effect->'amount'\)/,
  )
  assert.match(
    migration,
    /Resource effect amount must resolve to a non-negative integer/,
  )
  assert.doesNotMatch(
    migration,
    /Resource effect amount must be numeric/,
  )
})

test("SQL numeric evaluator mirrors the Character Engine formula grammar", () => {
  for (const kind of ["literal", "reference", "add", "subtract", "multiply", "min", "max", "clamp"]) {
    assert.match(migration, new RegExp(`v_kind = '${kind}'|v_kind in \\('min', 'max'\\)`), kind)
  }
  assert.match(migration, /v_key like 'values\.%'/)
  assert.match(migration, /private\.character_runtime_value_snapshot\(p_character_id, substr\(v_key, 8\)\)/)
  assert.match(migration, /core\.proficiencyBonus/)
  assert.match(migration, /abilities\\\.\[a-z_\]\+\\\.\(score\|modifier\)/)
  assert.match(migration, /resources\.%\.current/)
  assert.match(migration, /resources\.%\.max/)
})

test("runtime value references preserve grant priority, suppression and replace semantics", () => {
  assert.match(migration, /create or replace function private\.character_runtime_value_snapshot/)
  assert.match(migration, /order by priority/)
  assert.match(migration, /v_operation = 'SUPPRESS'/)
  assert.match(migration, /v_operation = 'REPLACE'/)
  assert.match(migration, /v_operation not in \('GRANT', 'REPLACE'\)/)
  assert.match(migration, /public\.character_source_suppressions/)
})

test("stage 1 runtime foundation stays class-generic", () => {
  const helperStart = migration.indexOf("create or replace function private.character_runtime_value_snapshot")
  const actionStart = migration.indexOf("create or replace function public.use_character_template_resource_action")
  assert.ok(helperStart >= 0)
  assert.ok(actionStart > helperStart)
  const runtimeFoundation = migration.slice(helperStart)
  assert.doesNotMatch(runtimeFoundation, /warlock_magical_cunning_restore/)
  assert.doesNotMatch(runtimeFoundation, /if\s+.*warlock/i)
})
