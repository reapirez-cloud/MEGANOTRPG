import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migrationPath = "supabase/migrations/20260907071947_warlock_stage4_arcanum_replacement_group_v2.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

const publicWrapperStart = migration.indexOf("create or replace function public.commit_character_template_choice_v2")
const publicWrapperEnd = migration.indexOf("revoke all on function public.commit_character_template_choice_v2", publicWrapperStart)
const publicWrapper = migration.slice(publicWrapperStart, publicWrapperEnd)

test("Mystic Arcanum uses one shared replacement budget across levels 6 through 9", () => {
  for (const key of [
    "warlock_mystic_arcanum_6",
    "warlock_mystic_arcanum_7",
    "warlock_mystic_arcanum_8",
    "warlock_mystic_arcanum_9",
  ]) {
    assert.match(migration, new RegExp(key))
  }
  assert.match(migration, /'replacement_group', 'warlock_mystic_arcanum'/)
  assert.match(migration, /'replacement_group_limit', 1/)
  assert.match(migration, /WARLOCK_STAGE4_ARCANUM_REPLACEMENT_GROUP_INVALID/)
})

test("Choice Runtime tracks group consumption atomically per current source level", () => {
  assert.match(publicWrapper, /where id = p_assignment_id\s+for update;/)
  assert.match(publicWrapper, /replacement_groups/)
  assert.match(publicWrapper, /v_group_source_level = v_source_level/)
  assert.match(publicWrapper, /v_group_used \+ v_removed > v_replacement_group_limit/)
  assert.match(publicWrapper, /CHOICE_REPLACEMENT_GROUP_LIMIT_EXCEEDED/)
})

test("initially selecting a newly unlocked Arcanum does not consume the replacement budget", () => {
  assert.match(publicWrapper, /jsonb_array_length\(v_before\) > 0/)
  assert.match(publicWrapper, /v_replacement_group is not null and v_removed > 0/)
})

test("shared replacement groups are generic Choice Runtime infrastructure", () => {
  assert.ok(publicWrapperStart >= 0)
  assert.ok(publicWrapperEnd > publicWrapperStart)
  assert.doesNotMatch(publicWrapper, /warlock/i)
  assert.match(publicWrapper, /replacement_group/)
  assert.match(publicWrapper, /replacement_group_limit/)
})

test("Stage 4 precision migration preserves the strict class integration contract", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:warlock/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/warlockHighLevelStage4Closure\.test\.ts/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
})
