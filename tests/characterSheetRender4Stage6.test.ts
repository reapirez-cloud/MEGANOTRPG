import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const shellCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-shell.css",
  "utf8",
)
const coreCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-core.css",
  "utf8",
)
const overviewCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-overview.css",
  "utf8",
)
const themeCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-theme.css",
  "utf8",
)
const backgroundsCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-backgrounds.css",
  "utf8",
)
const stage6Spec = fs.readFileSync(
  "e2e/character-sheet-render4-stage6.spec.ts",
  "utf8",
)

const preparedClassKeys = [
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
]

test("render-4 final geometry keeps the approved width-driven hero and three-row rail", () => {
  assert.match(shellCss, /--sheet-hero-height:\s*clamp\(220px,\s*61\.4vw,\s*292px\)/)
  assert.match(shellCss, /--sheet-rail-width:\s*clamp\(118px,\s*31\.5vw,\s*150px\)/)
  assert.match(shellCss, /height:\s*calc\(var\(--sheet-rail-row\) \* 3\)/)
  assert.match(shellCss, /scroll-snap-type:\s*y mandatory/)
  assert.match(shellCss, /touch-action:\s*pan-y/)
})

test("render-4 final core remains a single 50\/50 class-tinted glass surface", () => {
  assert.match(coreCss, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/)
  assert.match(coreCss, /backdrop-filter:\s*blur\(22px\) saturate\(\.76\)/)
  assert.match(coreCss, /u1-character-sheet-core__columns::before/)
  assert.match(coreCss, /u1-character-sheet-core\[data-expanded\]/)
})

test("render-4 final resources and slots preserve authored spent-state and horizontal two-level paging", () => {
  assert.match(
    overviewCss,
    /u1-character-overview__resource-icon\[data-state="spent"\]::after[\s\S]*var\(--u1-spent-cross\)/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__charge\[data-state="spent"\]::after[\s\S]*var\(--u1-spent-cross\)/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__section--resources,[\s\S]*u1-character-overview__section--slots[\s\S]*width:\s*100%/,
  )
  assert.match(
    overviewCss,
    /height:\s*calc\(var\(--slot-row-height\) \* 2\)/,
  )
  assert.match(
    overviewCss,
    /grid-template-rows:\s*repeat\(2, var\(--slot-row-height\)\)/,
  )
  assert.match(
    overviewCss,
    /scroll-snap-type:\s*x mandatory/,
  )
  assert.match(
    overviewCss,
    /grid-template-columns:\s*repeat\(4,/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__slot-viewport[\s\S]*overscroll-behavior-y:\s*auto/,
  )
})

test("all thirteen prepared classes own a palette and built-in background fallback", () => {
  for (const classKey of preparedClassKeys) {
    assert.match(
      themeCss,
      new RegExp('data-class-key="' + classKey + '"'),
    )
    assert.match(
      backgroundsCss,
      new RegExp('data-class-key="' + classKey + '"'),
    )
  }
})

test("stage 6 playwright certification covers target widths, long names, class skins and nested scrolling", () => {
  for (const width of [360, 390, 412]) {
    assert.match(stage6Spec, new RegExp(String(width)))
  }

  assert.match(stage6Spec, /long character name/)
  assert.match(stage6Spec, /preparedClassKeys/)
  assert.match(stage6Spec, /spent icons/)
  assert.match(stage6Spec, /nine spell levels/)
})
