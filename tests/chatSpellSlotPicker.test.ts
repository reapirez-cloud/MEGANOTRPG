import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sheet = fs.readFileSync("src/components/chat/ChatActionSheet.tsx", "utf8")
const styles = fs.readFileSync("src/components/chat/ChatActionSheet.css", "utf8")

test("chat magic opens with spell slot selection instead of the spell list", () => {
  assert.match(sheet, /Выбери ячейку/)
  assert.match(sheet, /setSpellChannel\(resource\.stateKey\)/)
  assert.match(sheet, /spellCastForSlot/)
  assert.match(sheet, /item\.castLevel === level/)
  assert.match(sheet, /cost\.stateKey === stateKey/)
  assert.match(sheet, /Этой ячейкой нечего читать/)
})

test("depleted chat spell slots are grey and disabled", () => {
  assert.match(sheet, /depleted = current <= 0/)
  assert.match(sheet, /disabled=\{busy \|\| depleted\}/)
  assert.match(styles, /action-spell-slot\.is-depleted/)
  assert.match(styles, /filter:grayscale\(1\)/)
})

test("selected spell slot is preferred for the actual cast", () => {
  assert.match(sheet, /preferSpellCast/)
  assert.match(sheet, /resourceOptions: selectedOption/)
  assert.match(sheet, /accesses: \[preferredAccess/)
})

test("dice content scrolls below fixed action tabs without overlap", () => {
  assert.match(styles, /action-v3-tabs\{position:relative;z-index:3/)
  assert.match(styles, /action-v2-body\{position:relative;z-index:1;flex:1 1 auto;min-height:0/)
  assert.match(styles, /chat-action-flow__handle,\.action-v2-head,\.action-v3-tabs\{flex:0 0 auto\}/)
})
