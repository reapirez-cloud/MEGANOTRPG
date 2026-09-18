import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpellsStage1.tsx",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)

test("spell sheet prefers the authored full-resolution class override", () => {
  assert.match(
    spells,
    /classReferenceArtSlot\(displayClassKey, "spell_slot"\)/,
  )
  assert.match(
    spells,
    /if \(override\?\.url\) return mediaIconStyle\(override\)/,
  )
  assert.match(
    spells,
    /"--u1-spell-slot-icon-size": "contain"/,
  )
})

test("character view passes reference media to the spell sheet", () => {
  assert.match(
    view,
    /<CharacterSheetSpells[\s\S]*mediaController=\{referenceMedia\}/,
  )
})
