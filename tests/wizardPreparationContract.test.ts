import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260904190000_wizard_long_rest_preparation_contract.sql",
  "utf8",
)
const preparationModel = fs.readFileSync("src/lib/characterPreparation.ts", "utf8")
const chatPreparation = fs.readFileSync("src/hooks/useChatPreparation.ts", "utf8")

test("Wizard exposes a long-rest spell preparation task with the 2024 prepared-spell table", () => {
  assert.match(migration, /spell_preparation_refresh/)
  assert.match(migration, /prepared_spells_by_level/)
  assert.match(migration, /\"20\":25/)
  assert.match(preparationModel, /meta\.spell_preparation_refresh/)
  assert.match(preparationModel, /prepared_spells_by_level/)
})

test("Wizard preparation keeps always-prepared Mastery and Signature outside the ordinary quota", () => {
  assert.match(chatPreparation, /!spell\.wizard_spell_mastery/)
  assert.match(chatPreparation, /!spell\.wizard_signature_spell/)
  assert.match(migration, /Always-prepared Wizard spells do not occupy the normal preparation quota/)
  assert.match(migration, /when s\.wizard_spell_mastery or s\.wizard_signature_spell then true/)
})

test("server enforces the exact Wizard ordinary-preparation count", () => {
  assert.match(migration, /cardinality\(v_ids\)<>v_required/)
  assert.match(migration, /Wizard must prepare exactly % ordinary spells at level %/)
  assert.match(migration, /character_has_wizard|max_spell_level|wizard_spellbook_entries/)
})
