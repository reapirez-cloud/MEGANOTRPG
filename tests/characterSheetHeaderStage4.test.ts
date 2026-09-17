import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const authoredClasses = [
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

test("stage 4 keeps every authored class portrait frame available", () => {
  for (const classKey of authoredClasses) {
    assert.equal(
      fs.existsSync(`public/ui-v1/character-sheet/portrait-frames/${classKey}.png`),
      true,
      `missing portrait frame for ${classKey}`,
    )
  }
})

test("stage 4 asset CSS loads after the geometry lock", () => {
  const entry = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
  const stage1 = entry.indexOf('import "./character-sheet-header-stage1.css"')
  const stage4 = entry.indexOf('import "./character-sheet-header-stage4.css"')

  assert.ok(stage1 >= 0)
  assert.ok(stage4 > stage1)
})

test("stage 4 keeps frame and avatar inside the left layout track", () => {
  const css = fs.readFileSync(
    "src/ui-v1-isolated/character-sheet-header-stage4.css",
    "utf8",
  )

  assert.match(css, /--sheet-header-portrait-center:\s*20%/)
  assert.match(css, /--sheet-header-frame-aspect:\s*941\s*\/\s*1672/)
  assert.match(
    css,
    /portrait-frame-stack[\s\S]*aspect-ratio:\s*var\(--sheet-header-frame-aspect\)/,
  )
  assert.match(
    css,
    /portrait-frame-stack \.u1-character-sheet__portrait-media[\s\S]*--sheet-header-frame-inset-x/,
  )
  assert.match(css, /u1-character-sheet__portrait-frame[\s\S]*object-fit:\s*contain/)
  assert.match(css, /u1-character-sheet__identity[\s\S]*z-index:\s*4/)
  assert.match(css, /u1-character-sheet__rail[\s\S]*z-index:\s*6/)
})
