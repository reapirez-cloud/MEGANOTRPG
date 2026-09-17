import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const stage6Styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spell-stage6.css",
  "utf8",
)
const castingStyles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spell-casting.css",
  "utf8",
)
const fixture = fs.readFileSync(
  "src/e2e/character-spell-panels-stage6-main.tsx",
  "utf8",
)
const browserSpec = fs.readFileSync(
  "e2e/character-spell-panels-stage6.spec.ts",
  "utf8",
)
const visualAssets = fs.readFileSync(
  "src/ui-v1-isolated/characterSheetVisualAssets.ts",
  "utf8",
)

test("spell stage 6 is loaded by the production spell component styling path", () => {
  assert.match(castingStyles, /@import "\.\/character-sheet-spell-stage6\.css";/)
  assert.match(stage6Styles, /\.u1-character-spells\s*\{[\s\S]*overflow-x:\s*clip/)
  assert.match(stage6Styles, /\.u1-character-spells__slots-grid\s*\{[\s\S]*repeat\(9, minmax\(0, 1fr\)\)/)
  assert.match(stage6Styles, /\.u1-character-spells__expanded-grid\s*\{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/)
})

test("spell stage 6 has explicit guardrails for every supported mobile width family", () => {
  assert.match(stage6Styles, /@media \(max-width: 359px\)/)
  assert.match(stage6Styles, /@media \(min-width: 360px\) and \(max-width: 389px\)/)
  assert.match(stage6Styles, /@media \(min-width: 390px\) and \(max-width: 399px\)/)
  assert.match(stage6Styles, /@media \(min-width: 400px\) and \(max-width: 430px\)/)
  assert.match(stage6Styles, /overflow-wrap:\s*anywhere/)
  assert.match(stage6Styles, /\.u1-character-spells__grimoire-list\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/)
})

test("spell stage 6 fixture reproduces the reference hierarchy deterministically", () => {
  assert.match(fixture, /focusLevel=\{1\}/)
  assert.match(fixture, /"1": \{ max: 4, used: 0 \}/)
  assert.match(fixture, /"2": \{ max: 3, used: 0 \}/)
  assert.match(fixture, /"3": \{ max: 3, used: 3 \}/)
  assert.match(fixture, /"4": \{ max: 2, used: 0 \}/)
  assert.match(fixture, /"5": \{ max: 1, used: 0 \}/)
  assert.match(fixture, /Священный огонь/)
  assert.match(fixture, /Шёпот исцеления/)
  assert.match(fixture, /Защита от добра и зла/)
  assert.match(fixture, /Круг защиты от всего неприятного и очень длинного/)
})

test("spell stage 6 browser certification covers widths, long Russian copy, grimoire and every class skin", () => {
  assert.match(browserSpec, /\[320, 360, 390, 430\]/)
  assert.match(browserSpec, /without horizontal drift/)
  assert.match(browserSpec, /390px reference rhythm/)
  assert.match(browserSpec, /one usable column at 320px/)
  assert.match(browserSpec, /pathological Russian spell names/)

  for (const classKey of [
    "fighter",
    "warlock",
    "cleric",
    "druid",
    "bard",
    "paladin",
    "sorcerer",
    "wizard",
    "rogue",
    "monk",
    "barbarian",
    "artificer",
    "ranger",
  ]) {
    assert.match(browserSpec, new RegExp(`"${classKey}"`))
  }
})

test("spell stage 6 keeps authored per-class spell slot sprites", () => {
  assert.match(visualAssets, /CHARACTER_SHEET_AUTHORED_CLASS_KEYS/)
  assert.match(visualAssets, /class-spell-slots\.png/)
  assert.match(visualAssets, /class-resources\.png/)
  assert.match(visualAssets, /characterSheetSpellSlotAsset/)
})
