import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const index = fs.readFileSync("index.html", "utf8")
const view = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
const shell = fs.readFileSync("src/ui-v1-isolated/CharacterSheetShell.tsx", "utf8")
const shellStyles = fs.readFileSync("src/ui-v1-isolated/character-sheet-shell.css", "utf8")
const core = fs.readFileSync("src/ui-v1-isolated/CharacterSheetCore.tsx", "utf8")
const overview = fs.readFileSync("src/ui-v1-isolated/CharacterSheetOverview.tsx", "utf8")
const spells = fs.readFileSync("src/ui-v1-isolated/CharacterSheetSpells.tsx", "utf8")
const history = fs.readFileSync("src/ui-v1-isolated/characterSheetHistory.ts", "utf8")
const contract = fs.readFileSync("src/ui-v1-isolated/characterSheetUiContract.ts", "utf8")
const control = fs.readFileSync("src/ui-v1-isolated/useUiV1CharacterControl.ts", "utf8")
const mediaActions = fs.readFileSync("src/ui-v1-isolated/characterSnakeActions.ts", "utf8")

test("production entry renders the isolated CharacterView rather than the legacy profile", () => {
  assert.match(index, /src\/ui-v1-isolated\/main\.tsx/)
  assert.match(view, /useResolvedCharacterRuntime\(control\.runtimeEntity\)/)
  assert.match(view, /classKey=\{classKey\}/)
  assert.doesNotMatch(view, /character-view\.css/)
})

test("production character sheet follows the persistent shell and standalone inventory contract", () => {
  assert.match(view, /<CharacterSheetShell/)
  assert.match(view, /<CharacterSheetCore/)
  assert.match(view, /<CharacterSheetOverview/)
  assert.match(view, /<CharacterSheetFeatures/)
  assert.match(view, /<CharacterSheetSpells/)
  assert.match(view, /<CharacterInventoryInterface/)
  assert.match(shell, /u1-character-sheet__masthead/)
  assert.match(shell, /CHARACTER_SHEET_NAVIGATION\.map/)
  assert.match(shellStyles, /grid-template-columns:\s*minmax\(0,\s*42fr\) minmax\(0,\s*58fr\)/)
  assert.match(shellStyles, /overflow-y:\s*auto/)
  assert.match(core, /expandedAbility/)
  assert.match(overview, /u1-character-overview__slot-viewport/)
  assert.match(contract, /status: "placeholder"/)
  assert.match(contract, /neverRenderInsideSheetContent: true/)
  assert.match(history, /focusedItemId: string \| null/)
})

test("Snake owns logical character sheet interactions instead of ad-hoc menus", () => {
  assert.match(view, /type: "inventory-item"/)
  assert.match(view, /type: "character-spell"/)
  assert.match(view, /type: "character-feature"/)
  assert.match(view, /type: "character-resource"/)
  assert.match(overview, /id: "inspect-resource"/)
  assert.match(overview, /id: "inspect-spell-slots"/)
  assert.match(view, /createCharacterSnakeActions/)
  assert.match(mediaActions, /id: "sheet-hero"[\s\S]*aspectRatio: 16 \/ 9/)
})

test("UI 1.0 reads canonical resources while spell preparation stays outside the profile", () => {
  assert.match(control, /\.select\("state_key,label,current,max_snapshot,recharge"\)/)
  assert.doesNotMatch(control, /resource_key,current_value,max_value/)
  assert.match(control, /cheburashka\.execute\(\{[\s\S]*kind: "inventory\.set_equipped"/)
  assert.doesNotMatch(spells, /setSpellPrepared|gena_commit_character_spell_preparation_v1/)
})
