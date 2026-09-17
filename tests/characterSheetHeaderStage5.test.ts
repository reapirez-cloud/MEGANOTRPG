import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const main = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const stage1 = fs.readFileSync("src/ui-v1-isolated/character-sheet-header-stage1.css", "utf8")
const stage2 = fs.readFileSync("src/ui-v1-isolated/character-sheet-header-stage2.css", "utf8")
const stage3 = fs.readFileSync("src/ui-v1-isolated/character-sheet-header-stage3.css", "utf8")
const stage4 = fs.readFileSync("src/ui-v1-isolated/character-sheet-header-stage4.css", "utf8")
const stage5 = fs.readFileSync("src/ui-v1-isolated/character-sheet-header-stage5.css", "utf8")
const navigation = fs.readFileSync("src/ui-v1-isolated/characterSheetUiContract.ts", "utf8")

test("character header stage 5 is loaded after stage 4", () => {
  const stage4Import = main.indexOf('import "./character-sheet-header-stage4.css"')
  const stage5Import = main.indexOf('import "./character-sheet-header-stage5.css"')

  assert.ok(stage4Import >= 0)
  assert.ok(stage5Import > stage4Import)
})

test("header keeps the approved 40/30/30 geometry and fixed 941:1672 frame", () => {
  assert.match(stage1, /--sheet-header-portrait-track:\s*40%/)
  assert.match(stage1, /--sheet-header-identity-track:\s*30%/)
  assert.match(stage1, /--sheet-header-nav-track:\s*30%/)
  assert.match(stage4, /--sheet-header-frame-aspect:\s*941\s*\/\s*1672/)
})

test("mobile QA guardrails cover target widths and hostile identity content", () => {
  assert.match(stage5, /min-width:\s*360px/)
  assert.match(stage5, /max-width:\s*412px/)
  assert.match(stage2, /-webkit-line-clamp:\s*2/)
  assert.match(stage5, /overflow-wrap:\s*anywhere/)
  assert.match(stage5, /identity-detail\[data-empty\]/)
  assert.match(stage5, /not\(\[data-has-portrait\]\)/)
})

test("navigation remains six ordered rows and the longest label is never ellipsized", () => {
  const labels = [
    'label: "Персонаж"',
    'label: "Умения"',
    'label: "Заклинания"',
    'label: "Владения"',
    'label: "Биография"',
    'label: "Инвентарь"',
  ]

  let cursor = -1
  for (const label of labels) {
    const next = navigation.indexOf(label)
    assert.ok(next > cursor, `${label} must preserve canonical order`)
    cursor = next
  }

  assert.match(stage3, /scroll-snap-type:\s*y mandatory/)
  assert.match(stage5, /text-overflow:\s*clip/)
  assert.match(stage5, /white-space:\s*nowrap/)
})

test("Telegram motion fallback remains explicit", () => {
  assert.match(stage5, /prefers-reduced-motion:\s*reduce/)
  assert.match(stage5, /scroll-behavior:\s*auto/)
})
