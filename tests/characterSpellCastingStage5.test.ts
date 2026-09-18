import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpellsStage1.tsx",
  "utf8",
)
const castingStyles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spell-casting.css",
  "utf8",
)
const classResourceRuntime = fs.readFileSync(
  "src/lib/classResourceRuntime.ts",
  "utf8",
)
const resourceRuntime = fs.readFileSync(
  "src/lib/resourceRuntime.ts",
  "utf8",
)
const resourceMigration = fs.readFileSync(
  "supabase/migrations/20260828184500_druid_resource_runtime_finalization.sql",
  "utf8",
)
const entityStorage = fs.readFileSync(
  "src/entity-engine/supabase.ts",
  "utf8",
)

test("spell stage 5 uses resolved CE casting methods instead of rebuilding spell-slot rules", () => {
  assert.match(spells, /ResolvedSpellResourceOption/)
  assert.match(spells, /view\.spell\.accesses/)
  assert.match(spells, /access\.methods/)
  assert.match(spells, /method\.resourceOptions/)
  assert.match(spells, /method\.available && option\.available/)
  assert.match(spells, /option\.castLevel/)
})

test("spell stage 5 spends the selected CE resource option through the persistent runtime", () => {
  assert.match(spells, /spendResolvedClassSpellOption/)
  assert.match(spells, /await spendResolvedClassSpellOption\(/)
  assert.match(classResourceRuntime, /resourceCostInputs\(contract, option\.costs\)/)
  assert.match(classResourceRuntime, /spend_character_resources/)
  assert.match(resourceMigration, /Public cost-only path for sheet spell casting/)
  assert.match(resourceMigration, /for update;/)
  assert.match(resourceMigration, /current=current-v_amount/)
  assert.match(resourceMigration, /private\.can_operate_character_resources/)
})

test("spell stage 5 supports free casting, Pact Magic and CE availability gates", () => {
  assert.match(spells, /if \(!method\.resourceOptions\.length\)/)
  assert.match(spells, /option: null/)
  assert.match(spells, /warlock_pact_slots/)
  assert.match(spells, /Не подготовлено/)
  assert.match(spells, /Нет доступного ресурса/)
  assert.match(spells, /availableChoices\.length === 1/)
  assert.match(spells, /Выбрать расход/)
})

test("spell stage 5 keeps spell slots on the same ledger restored by rest runtime", () => {
  assert.match(resourceRuntime, /including spell slots/)
  assert.match(entityStorage, /grant_character_long_rest/)
  assert.match(entityStorage, /grant_character_short_rest/)
  assert.match(entityStorage, /recover_character_resources/)
})

test("spell stage 5 exposes mobile casting controls without replacing stage 4 grimoire", () => {
  assert.match(castingStyles, /\.u1-character-spells__cast-primary/)
  assert.match(castingStyles, /\.u1-character-spells__cast-options/)
  assert.match(castingStyles, /\[data-pact\]/)
  assert.match(castingStyles, /@media \(max-width: 359px\)/)
  assert.match(spells, /className="u1-character-spells__grimoire-panel"/)
  assert.match(spells, /className="u1-character-spells__prepare-toggle"/)
})
