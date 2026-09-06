import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260906150000_cleric_production_reconciliation.sql",
  "utf8",
)

test("late Cleric reconciliation restores the production-missing runtime pieces", () => {
  for (const token of [
    "divine-order:protector",
    "divine-order:thaumaturge",
    "cleric-thaumaturge-cantrip",
    "nature-domain-skill",
    "nature-domain-cantrip",
    "cleric-nature-heavy-runtime",
    "forge_blessing_of_the_forge",
    "trickery_blessing_of_the_trickster",
    "twilight_vigilant_blessing",
  ]) assert.ok(migration.includes(token), `missing ${token}`)

  assert.match(migration, /v_domains<>14/)
  assert.match(migration, /unlock_level<>3/)
  assert.doesNotMatch(migration, /update\s+public\.character_template_assignments/i)
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function\s+public\.recover_character_resources/i)
})

test("Divine Spark no longer exposes a permanently static 1d8 action contract", () => {
  assert.ok(migration.includes("diceByClericLevel"))
  assert.ok(migration.includes("'2','1d8','7','2d8','13','3d8','18','4d8'"))
  assert.ok(migration.includes("halfDamageOnSave"))
  assert.ok(migration.includes("damageTypes"))
  assert.ok(migration.includes("tag#>>'{}'<>'formula:1d8+wisdom'"))
})

test("reconciliation stays Cleric-local instead of replacing shared engine functions", () => {
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:cleric/)
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/clericFinalReconciliation\.test\.ts/)
  assert.ok(migration.includes("sync_rule_template_spell_links"))
  assert.doesNotMatch(migration, /alter\s+table/i)
})
