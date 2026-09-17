import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const overviewFix = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-overview-panel-fix.css",
  "utf8",
)
const headerStage5 = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-header-stage5.css",
  "utf8",
)
const visualAssets = fs.readFileSync(
  "src/ui-v1-isolated/characterSheetVisualAssets.ts",
  "utf8",
)

test("resource hero icon is a strict square instead of a stretched rail", () => {
  assert.match(
    overviewFix,
    /--u1-resource-icon-square:\s*clamp\(82px, 22vw, 104px\)/,
  )
  assert.match(
    overviewFix,
    /u1-character-overview__resource-icon[\s\S]*width:\s*var\(--u1-resource-icon-square\)[\s\S]*height:\s*var\(--u1-resource-icon-square\)[\s\S]*aspect-ratio:\s*1 \/ 1/,
  )
  assert.doesNotMatch(
    overviewFix,
    /u1-character-overview__resource-icon[\s\S]{0,260}align-self:\s*stretch/,
  )
})

test("spell slots keep three right-hand rows beside a large 1:1 class icon", () => {
  assert.match(
    overviewFix,
    /--u1-slot-hero-square:\s*clamp\(82px, 22vw, 104px\)/,
  )
  assert.match(
    overviewFix,
    /height:\s*calc\(var\(--slot-row-height\) \* 3\) !important/,
  )
  assert.match(
    overviewFix,
    /grid-template-rows:\s*repeat\(3, var\(--slot-row-height\)\) !important/,
  )
  assert.match(
    overviewFix,
    /nth-child\(3n \+ 1\)[\s\S]*charge:first-child::before[\s\S]*width:\s*var\(--u1-slot-hero-square\)[\s\S]*height:\s*var\(--u1-slot-hero-square\)[\s\S]*aspect-ratio:\s*1 \/ 1/,
  )
  assert.match(
    overviewFix,
    /background-image:\s*var\(--u1-sheet-icon\)/,
  )
})

test("large icons use the authored class atlases rather than fallback thumbnails", () => {
  assert.match(
    visualAssets,
    /CLASS_RESOURCE_ATLAS\s*=\s*"\/ui-v1\/character-sheet\/icons\/class-resources\.png"/,
  )
  assert.match(
    visualAssets,
    /CLASS_SPELL_SLOT_ATLAS\s*=\s*"\/ui-v1\/character-sheet\/icons\/class-spell-slots\.png"/,
  )
})

test("hero removes rectangular identity and navigation shadow layers", () => {
  assert.match(
    headerStage5,
    /u1-character-sheet__identity[\s\S]*background:\s*transparent !important[\s\S]*box-shadow:\s*none !important/,
  )
  assert.match(
    headerStage5,
    /u1-character-sheet__portrait-shade,[\s\S]*u1-character-sheet__hero-haze[\s\S]*background:\s*none !important/,
  )
  assert.match(
    headerStage5,
    /u1-character-sheet__masthead::after,[\s\S]*u1-character-sheet__rail::before,[\s\S]*u1-character-sheet__rail::after,[\s\S]*u1-character-sheet__rail-row::after[\s\S]*display:\s*none !important/,
  )
})
