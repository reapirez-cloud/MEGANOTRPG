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
const fixture = fs.readFileSync(
  "src/e2e/character-spell-panels-stage6-main.tsx",
  "utf8",
)
const baseStyles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spells.css",
  "utf8",
)
const mobileStyles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spell-stage6.css",
  "utf8",
)

test("stage 4 renders deterministic class and character level in the slots header", () => {
  assert.match(spells, /classKey\?: string/)
  assert.match(spells, /const displayClassKey = classKey\?\.trim\(\) \|\| sheetClassKey/)
  assert.match(spells, /data-class-level/)
  assert.match(spells, /classLabels\[displayClassKey\] \|\| "Заклинатель"/)
  assert.match(spells, /Ур\. \{contract\.level\}/)
  assert.match(view, /classKey=\{classKey\}/)
  assert.match(fixture, /classKey=\{classKey\}/)
})

test("stage 4 locks reference circle anatomy and Russian spell-count grammar", () => {
  assert.match(spells, /function spellCountLabel\(count: number\)/)
  assert.match(spells, /11 && mod100 <= 14/)
  assert.match(spells, /allSpells\.slice\(0, 3\)/)
  assert.match(spells, /\+\{remaining\}/)
  assert.match(spells, /spellCountLabel\(allSpells\.length\)/)
  assert.match(baseStyles, /\.u1-character-spells__preview-row[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(baseStyles, /\.u1-character-spells__expanded-grid[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/)
})

test("stage 4 circle header toggles between collapsed preview and expanded grid", () => {
  assert.match(spells, /if \(expanded\) \{[\s\S]*setExpandedLevel\(null\)/)
  assert.match(spells, /openCircle\(level\)/)
  assert.match(spells, /aria-expanded=\{expanded\}/)
  assert.match(spells, /initialSpellCircleLevel\(contract, focusLevel\)/)
})

test("stage 4 keeps class-level header visible on the narrowest supported sheet", () => {
  assert.match(mobileStyles, /@media \(max-width: 359px\)[\s\S]*grid-template-columns:\s*auto minmax\(8px, 1fr\) auto/)
  assert.match(mobileStyles, /u1-character-spells__slots-head > small[\s\S]*display:\s*block/)
  assert.match(baseStyles, /u1-character-spells__slots-head > small[\s\S]*text-align:\s*right/)
})
