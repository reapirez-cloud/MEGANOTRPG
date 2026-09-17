import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpells.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spells.css",
  "utf8",
)

test("spell stage 2 replaces the flat list with cantrip and circle panels", () => {
  assert.match(spells, /CHARACTER_SHEET_SPELL_GROUP_ORDER\.map/)
  assert.match(spells, /level === 0 \? "Заговоры" : `\$\{level\} круг`/)
  assert.match(spells, /className="u1-character-spells__circle"/)
  assert.match(spells, /data-expanded=\{expanded \|\| undefined\}/)
  assert.match(spells, /setExpandedLevel\(level\)/)
})

test("spell stage 2 keeps three-spell previews and +N overflow", () => {
  assert.match(spells, /allSpells\.slice\(0, 3\)/)
  assert.match(spells, /allSpells\.length - preview\.length/)
  assert.match(spells, /u1-character-spells__preview-row/)
  assert.match(spells, /u1-character-spells__more/)
  assert.match(spells, /\+\{remaining\}/)
})

test("spell stage 2 expands one circle into a two-column spell grid", () => {
  assert.match(spells, /expandedLevel === level/)
  assert.match(spells, /className="u1-character-spells__expanded-grid"/)
  assert.match(styles, /\.u1-character-spells__expanded-grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.u1-character-spells__circle\[data-expanded\][\s\S]*transform:\s*rotate\(90deg\)/)
})

test("spell stage 2 keeps CE slot counts in every circle header", () => {
  assert.match(spells, /slotForSpellLevel/)
  assert.match(spells, /slotCount\(slotPresentation\.resource\)/)
  assert.match(spells, /Магия договора/)
  assert.match(spells, /\$\{slot\.current\}\/\$\{slot\.max\} ячеек/)
})
