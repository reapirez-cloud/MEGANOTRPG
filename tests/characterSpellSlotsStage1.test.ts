import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpellsStage1.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spells.css",
  "utf8",
)

test("spell stage 1 renders nine CE-backed slot levels", () => {
  assert.match(spells, /Array\.from\(\{ length: 9 \}/)
  assert.match(spells, /\^spell_slot_\(\[1-9\]\)\$/)
  assert.match(spells, /warlock_pact_slots/)
  assert.match(spells, /resource\.max\.value/)
  assert.match(spells, /resource\.current/)
})

test("spell stage 1 keeps class art, locked levels and mobile grid contract", () => {
  assert.match(spells, /characterSheetSpellSlotAsset/)
  assert.match(spells, /data-locked=\{locked \|\| undefined\}/)
  assert.match(spells, /disabled=\{locked\}/)
  assert.match(styles, /grid-template-columns:\s*repeat\(9, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.u1-character-spells__slot-lock/)
  assert.match(styles, /var\(--cv-spell-accent\)/)
})
