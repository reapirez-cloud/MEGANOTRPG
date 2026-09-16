import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const shellSource = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetShell.tsx",
  "utf8",
)
const shellCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-shell.css",
  "utf8",
)

test("character sheet owns a fixed viewport backdrop instead of a scrolling root background", () => {
  assert.match(shellSource, /u1-character-sheet__fixed-backdrop/)
  assert.match(
    shellCss,
    /u1-character-sheet__fixed-backdrop[\s\S]*position:\s*fixed/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet[\s\S]*background:\s*none !important/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__fixed-backdrop[\s\S]*background-size:[\s\S]*cover/,
  )
})

test("hero portrait is deliberately narrower than the hero and fades into darkness", () => {
  assert.match(
    shellCss,
    /u1-character-sheet__portrait-media[\s\S]*left:\s*9%[\s\S]*width:\s*52%/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__portrait-media[\s\S]*border-radius:/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__portrait-media[\s\S]*mask-image:[\s\S]*radial-gradient/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__portrait-shade[\s\S]*rgba\(0,0,0,\.98\)/,
  )
})
