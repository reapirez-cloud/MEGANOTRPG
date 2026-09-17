import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  CHARACTER_SHEET_AUTHORED_CLASS_KEYS,
  CHARACTER_SHEET_SPENT_CROSS_ASSET,
  characterSheetClassResourceAsset,
  characterSheetSpellSlotAsset,
} from "../src/ui-v1-isolated/characterSheetVisualAssets.ts"

const overviewSource = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetOverview.tsx",
  "utf8",
)
const overviewCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-overview.css",
  "utf8",
)
const overviewPanelFixCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-overview-panel-fix.css",
  "utf8",
)
const mainSource = fs.readFileSync(
  "src/ui-v1-isolated/main.tsx",
  "utf8",
)

test("stage 5 keeps authored resource and spell-slot art for every prepared class", () => {
  assert.equal(CHARACTER_SHEET_AUTHORED_CLASS_KEYS.length, 13)

  for (const classKey of CHARACTER_SHEET_AUTHORED_CLASS_KEYS) {
    const resource = characterSheetClassResourceAsset(classKey)
    const spellSlot = characterSheetSpellSlotAsset(classKey)

    assert.equal(
      resource.url,
      classKey === "druid"
        ? "/ui-v1/character-sheet/icons/class-spell-slots.png"
        : "/ui-v1/character-sheet/icons/class-resources.png",
    )
    assert.equal(resource.render, "image")
    assert.equal(
      spellSlot.url,
      classKey === "druid"
        ? "/ui-v1/character-sheet/icons/class-resources.png"
        : "/ui-v1/character-sheet/icons/class-spell-slots.png",
    )
    assert.equal(spellSlot.render, "image")
  }
})

test("stage 5 spent state desaturates the same icon and overlays the authored red cross", () => {
  assert.equal(
    CHARACTER_SHEET_SPENT_CROSS_ASSET,
    "/ui-v1/character-sheet/icons/spent-resource-cross.png",
  )
  assert.match(
    overviewSource,
    /data-state=\{max > 0 && current === 0 \? "spent" : "available"\}/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__resource-icon\[data-state="spent"\][\s\S]*grayscale\(1\)/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__resource-icon\[data-state="spent"\]::after[\s\S]*background-image:\s*var\(--u1-spent-cross\)/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__charge\[data-state="spent"\]::after[\s\S]*background-image:\s*var\(--u1-spent-cross\)/,
  )
})

test("overview correction loads globally after the base character styles", () => {
  assert.match(
    mainSource,
    /import "\.\/character-sheet-overview-panel-fix\.css"/,
  )
})

test("resource panel keeps the class background undimmed and uses the authored PNG as a strict square", () => {
  assert.match(
    overviewPanelFixCss,
    /u1-character-overview__section--resources[\s\S]*background:\s*transparent !important/,
  )
  assert.match(
    overviewPanelFixCss,
    /backdrop-filter:\s*none !important/,
  )
  assert.match(
    overviewPanelFixCss,
    /--u1-resource-icon-square:\s*clamp\(82px, 22vw, 104px\)/,
  )
  assert.match(
    overviewPanelFixCss,
    /u1-character-overview__resource-head\s*\{\s*display:\s*contents/,
  )
  assert.match(
    overviewPanelFixCss,
    /u1-character-overview__resource-icon[\s\S]*grid-row:\s*1 \/ 3/,
  )
  assert.match(
    overviewPanelFixCss,
    /u1-character-overview__resource-icon[\s\S]*aspect-ratio:\s*1 \/ 1/,
  )
  assert.match(
    overviewPanelFixCss,
    /u1-character-overview__resource-icon\[data-has-asset\] > i[\s\S]*width:\s*100%[\s\S]*height:\s*100%/,
  )
})

test("spell slots page horizontally with three visible level rows", () => {
  assert.match(
    overviewPanelFixCss,
    /height:\s*calc\(var\(--slot-row-height\) \* 3\) !important/,
  )
  assert.match(
    overviewPanelFixCss,
    /grid-template-rows:\s*repeat\(3, var\(--slot-row-height\)\) !important/,
  )
  assert.match(
    overviewCss,
    /grid-auto-columns:\s*100%/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__slot-viewport[\s\S]*scroll-snap-type:\s*x mandatory/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__slot-viewport[\s\S]*overscroll-behavior-x:\s*contain/,
  )
  assert.match(
    overviewCss,
    /grid-template-columns:\s*repeat\(4,/,
  )
})
