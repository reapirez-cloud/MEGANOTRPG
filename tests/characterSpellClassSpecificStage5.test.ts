import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpellsStage1.tsx",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spells.css",
  "utf8",
)
const warlockRuntime = fs.readFileSync(
  "tests/warlockPactMagicSelectionRuntime.test.ts",
  "utf8",
)
const wizardPreparation = fs.readFileSync(
  "tests/wizardPreparationContract.test.ts",
  "utf8",
)

test("stage 5 derives spell-management behavior from class runtime metadata", () => {
  assert.match(view, /spell_preparation_refresh/)
  assert.match(view, /spell_selection_mode/)
  assert.match(view, /spell_progression/)
  assert.match(view, /classSpellProfile=\{classSpellProfile\}/)
  assert.match(spells, /profile\?\.preparationRefresh === "long_rest"/)
  assert.match(spells, /profile\?\.progression === "pact_magic"/)
  assert.match(spells, /profile\?\.selectionMode === "persistent_on_level_change"/)
})

test("stage 5 prevents long-rest and Wizard preparation from bypassing chat authority", () => {
  assert.match(spells, /grimoireMode === "direct"/)
  assert.match(spells, /preparationManagedByRest/)
  assert.match(spells, /подготовка меняется после долгого отдыха через чат/)
  assert.match(spells, /Книга заклинаний · подготовка меняется после долгого отдыха через чат/)
  assert.match(wizardPreparation, /Wizard preparation contains a spell that is not written in a held spellbook|spellbook/i)
})

test("stage 5 keeps Pact Magic separate from ordinary spell-slot semantics", () => {
  assert.match(spells, /warlock_pact_slots/)
  assert.match(spells, /warlock_pact_slot_level/)
  assert.match(spells, /Магия договора/)
  assert.match(warlockRuntime, /method\.resourceOptions\[0\]\?\.castLevel/)
  assert.match(warlockRuntime, /pactCost\.key, "warlock_pact_slots"/)
  assert.match(warlockRuntime, /startsWith\("spell_slot_"\)/)
})

test("stage 5 keeps fixed spell selections and always-prepared access non-editable", () => {
  assert.match(spells, /return "Выбрано при развитии"/)
  assert.match(spells, /view\.preparation === "always_prepared"/)
  assert.match(spells, /className="u1-character-spells__prepare-fixed"/)
  assert.match(styles, /data-management-mode="pact_magic"/)
  assert.match(styles, /data-management-mode="level_choice"/)
})

test("stage 5 grimoire filters use only the schools present in the open circle", () => {
  assert.match(spells, /const schoolOptions = \[\.\.\.new Set\([\s\S]*allSpells\.map/)
  assert.match(spells, /resetGrimoireFilters\(\)[\s\S]*setExpandedLevel\(level\)[\s\S]*setGrimoireLevel\(level\)/)
})
