import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const stage6Styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spell-stage6.css",
  "utf8",
)
const baseStyles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spells.css",
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

test("spell stage 6 is the final compact production styling layer", () => {
  const component = fs.readFileSync(
    "src/ui-v1-isolated/CharacterSheetSpellsStage1.tsx",
    "utf8",
  )
  assert.match(component, /import "\.\/character-sheet-spell-stage6\.css"/)
  assert.match(stage6Styles, /Stage 6 · final reference lock/)
  assert.match(stage6Styles, /overflow-x:\s*clip/)
  assert.match(stage6Styles, /repeat\(9, minmax\(0, 1fr\)\)/)
  assert.match(stage6Styles, /repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(stage6Styles, /u1-character-spells__cast-primary|u1-character-spells__cast-options/)
})

test("stage 6 matches the compact reference anatomy instead of adding an extra grimoire row", () => {
  assert.match(baseStyles, /\.u1-character-spells__grimoire-open\s*\{[\s\S]*grid-column:\s*auto/)
  assert.match(baseStyles, /\.u1-character-spells__grimoire-book::after/)
  assert.match(stage6Styles, /\.u1-character-spells__circle-head\s*\{[\s\S]*min-height:\s*clamp\(34px, 9\.7vw, 42px\)/)
  assert.match(stage6Styles, /\.u1-character-spells__spell-card,[\s\S]*\.u1-character-spells__grimoire-open[\s\S]*min-height:\s*clamp\(32px, 9\.4vw, 38px\)/)
  assert.match(stage6Styles, /\.u1-character-spells__preview-row\s*\{[\s\S]*min-height:\s*clamp\(29px, 8\.4vw, 35px\)/)
})

test("stage 6 preserves authored class atlas tiles at full square size", () => {
  assert.match(visualAssets, /CHARACTER_SHEET_AUTHORED_CLASS_KEYS/)
  assert.match(visualAssets, /class-spell-slots\.png/)
  assert.match(visualAssets, /class-resources\.png/)
  assert.match(visualAssets, /characterSheetSpellSlotAsset/)
  assert.match(stage6Styles, /\.u1-character-spells__class-icon\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%[\s\S]*aspect-ratio:\s*1 \/ 1/)
  assert.match(stage6Styles, /background-size:\s*var\(--u1-spell-slot-icon-size, contain\)/)
})

test("spell stage 6 has explicit guardrails for every supported phone width family", () => {
  assert.match(stage6Styles, /@media \(max-width: 359px\)/)
  assert.match(stage6Styles, /@media \(min-width: 360px\) and \(max-width: 389px\)/)
  assert.match(stage6Styles, /@media \(min-width: 390px\) and \(max-width: 399px\)/)
  assert.match(stage6Styles, /@media \(min-width: 400px\) and \(max-width: 430px\)/)
  assert.match(stage6Styles, /overflow-wrap:\s*anywhere/)
  assert.match(stage6Styles, /\.u1-character-spells__grimoire-list[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/)
})

test("spell stage 6 fixture reproduces the approved render hierarchy deterministically", () => {
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

test("browser certification freezes geometry, hierarchy, slot states and every class skin", () => {
  assert.match(browserSpec, /\[320, 360, 390, 430\]/)
  assert.match(browserSpec, /final 390px reference geometry/)
  assert.match(browserSpec, /reference hierarchy exactly/)
  assert.match(browserSpec, /full-size square class slot art/)
  assert.match(browserSpec, /unique authored spell skin for all classes/)

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
