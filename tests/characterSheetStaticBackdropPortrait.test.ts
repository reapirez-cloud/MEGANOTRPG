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

test("portrait and identity underline share one geometry and only the portrait owns the darkness", () => {
  assert.match(
    shellCss,
    /--hero-portrait-left:\s*10%/,
  )
  assert.match(
    shellCss,
    /--hero-portrait-width:\s*44%/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__portrait-media[\s\S]*left:\s*var\(--hero-portrait-left\)[\s\S]*width:\s*var\(--hero-portrait-width\)/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__identity[\s\S]*left:\s*var\(--hero-portrait-left\)[\s\S]*width:\s*var\(--hero-portrait-width\)/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__portrait-media::before[\s\S]*rgba\(0,0,0,\.98\)/,
  )
  assert.match(
    shellCss,
    /u1-character-sheet__portrait-shade,[\s\S]*u1-character-sheet__masthead::after[\s\S]*background:\s*none !important/,
  )
})
