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

test("spell stage 4 opens a per-circle grimoire from the expanded spell panel", () => {
  assert.match(spells, /const \[grimoireLevel, setGrimoireLevel\]/)
  assert.match(spells, /const openGrimoire = \(level: number\) =>/)
  assert.match(spells, /Открыть в гримуаре/)
  assert.match(spells, /data-grimoire-level=\{level\}/)
  assert.match(spells, /Гримуар · \{levelTitle\(level\)\}/)
})

test("spell stage 4 restores the spell filters inside the grimoire only", () => {
  assert.match(spells, /preparedOnly/)
  assert.match(spells, /concentrationOnly/)
  assert.match(spells, /ritualOnly/)
  assert.match(spells, /schoolOptions/)
  assert.match(spells, /filteredGrimoireSpells/)
  assert.match(spells, />\s*Подготовлены\s*</)
  assert.match(spells, />\s*Концентрация\s*</)
  assert.match(spells, />\s*Ритуал\s*</)
  assert.match(spells, /<span>Школа<\/span>/)
})

test("spell stage 4 changes preparation through the existing character controller", () => {
  assert.match(spells, /onSetPrepared\?:/)
  assert.match(spells, /mutablePreparationSpellId/)
  assert.match(spells, /await onSetPrepared\(spellId, nextPrepared\)/)
  assert.match(spells, /className="u1-character-spells__prepare-toggle"/)
  assert.match(spells, /legacy\.prepared \? "prepared" : "unprepared"/)
  assert.match(view, /canEditPreparation=\{control\.canControlCharacter\}/)
  assert.match(view, /onSetPrepared=\{control\.setSpellPrepared\}/)
})

test("spell stage 4 keeps the grimoire usable on the mobile two-column sheet", () => {
  assert.match(styles, /\.u1-character-spells__grimoire-list[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.u1-character-spells__grimoire-open[\s\S]*grid-column:\s*1 \/ -1/)
  assert.match(styles, /\.u1-character-spells__grimoire-filters/)
  assert.match(styles, /\.u1-character-spells__prepare-toggle\[data-active\]/)
  assert.match(styles, /@media \(max-width: 359px\)/)
})
