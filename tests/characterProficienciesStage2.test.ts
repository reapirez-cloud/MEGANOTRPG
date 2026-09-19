import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const panel = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetProficiencies.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-proficiencies.css",
  "utf8",
)

test("proficiencies stage 2 mounts the real renderer instead of the placeholder", () => {
  assert.match(
    view,
    /import CharacterSheetProficiencies from "\.\/CharacterSheetProficiencies"/,
  )
  assert.match(
    view,
    /buildCharacterProficienciesReadModel/,
  )
  assert.match(
    view,
    /section === "proficiencies"[\s\S]*<CharacterSheetProficiencies/,
  )
})

test("proficiencies stage 2 consumes CE plus legacy through the frozen read-model", () => {
  assert.match(
    view,
    /contract: snapshot\.contract,[\s\S]*legacy: control\.sheet/,
  )
  assert.match(panel, /model\.groups\.map/)
  assert.match(panel, /group\.rows\.map/)
})

test("proficiencies stage 2 freezes reference panel anatomy", () => {
  assert.match(panel, /u1-character-proficiencies__icon/)
  assert.match(panel, /u1-character-proficiencies__identity/)
  assert.match(panel, /u1-character-proficiencies__tail/)
  assert.match(panel, /u1-character-proficiencies__tags/)
  assert.match(panel, /data-expanded=\{expanded \? "true" : "false"\}/)
  assert.match(panel, /groupCounter/)
})

test("proficiencies stage 2 keeps shared MegANOT glass and mobile geometry", () => {
  assert.match(styles, /background:\s*var\(--cv-panel-glass\)/)
  assert.match(styles, /backdrop-filter:\s*var\(--cv-panel-filter\)/)
  assert.match(
    styles,
    /grid-template-columns:[\s\S]*clamp\(48px, 13\.4vw, 62px\)[\s\S]*minmax\(0, 1fr\)[\s\S]*auto/,
  )
  assert.match(styles, /flex-wrap:\s*wrap/)
  assert.match(styles, /@media \(max-width: 359px\)/)
})

test("stage 2 panel anatomy remains intact after later behaviour stages", () => {
  assert.match(panel, /u1-character-proficiencies__panel/)
  assert.match(panel, /u1-character-proficiencies__head/)
  assert.match(panel, /u1-character-proficiencies__body/)
})
