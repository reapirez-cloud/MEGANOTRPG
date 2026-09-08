import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migrationPath = "supabase/migrations/20260908150000_sorcerer_catalog_stage1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

const sourcePath = "src/data/classes/sorcererReferenceDraft.ts"
const source = fs.readFileSync(sourcePath, "utf8")

test("sorcerer stage 1 keeps presentation source separate from executable mechanics", () => {
  assert.ok(source.includes("Mechanics/details intentionally remain empty"))
  assert.ok(migration.includes("'presentation_source','src/data/classes/sorcererReferenceDraft.ts'"))
  assert.ok(migration.includes("'mechanics_status','STAGE1_FOUNDATION'"))
  assert.ok(migration.includes("'resource_runtime_included',false"))
  assert.ok(migration.includes("'metamagic_runtime_included',false"))
})

test("sorcerer core proficiencies match the 2024 class foundation", () => {
  assert.ok(migration.includes("'class:sorcerer:hit-die'"))
  assert.ok(migration.includes("'hitDie',6"))
  assert.ok(migration.includes("'savingThrow:constitution'"))
  assert.ok(migration.includes("'savingThrow:charisma'"))
  assert.ok(migration.includes("'weapon:simple'"))
  assert.ok(!migration.includes("'armor:light'"))
  assert.ok(!migration.includes("'weapon:martial'"))
})

test("sorcerer class skill choice uses the shared choice contract", () => {
  assert.ok(migration.includes("'key','sorcerer-skills'"))
  assert.ok(migration.includes("'count',2"))
  for (const skill of ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"]) {
    assert.ok(migration.includes(`'skill:${skill}'`), skill)
  }
})

test("stage 1 records the structural 1-20 sorcerer feature progression", () => {
  for (const feature of [
    "spellcasting",
    "innate-sorcery",
    "font-of-magic",
    "metamagic",
    "sorcerer-subclass",
    "sorcerous-restoration",
    "sorcery-incarnate",
    "arcane-apotheosis",
  ]) {
    assert.ok(migration.includes(`\"key\":\"${feature}\"`), feature)
  }
  assert.ok(migration.includes("for v_level in 1..20 loop"))
  assert.ok(migration.includes("on conflict(template_id,level) do update"))
})

test("sorcery resources are declared but not activated in stage 1", () => {
  assert.ok(migration.includes("'resource_contracts',jsonb_build_object("))
  assert.ok(migration.includes("'sorcery_points',jsonb_build_object("))
  assert.ok(migration.includes("'max',jsonb_build_object('kind','reference','key','source.level')"))
  assert.ok(migration.includes("'recharge',jsonb_build_array('long_rest')"))
  assert.ok(migration.includes("'resources_actions_choices_active',false"))
  assert.doesNotMatch(migration, /'type','resource'[\s\S]*sorcery_points/)
})

test("catalog foundation is campaign-safe and installs for future campaigns", () => {
  assert.ok(migration.includes("private.ensure_sorcerer_catalog_stage1_v1(p_campaign_id uuid)"))
  assert.ok(migration.includes("catalog_key='class:sorcerer'"))
  assert.ok(migration.includes("'sorcerer-core'"))
  assert.ok(migration.includes("after insert on public.campaigns"))
  assert.ok(migration.includes("perform private.ensure_sorcerer_catalog_stage1_v1(new.id)"))
})
