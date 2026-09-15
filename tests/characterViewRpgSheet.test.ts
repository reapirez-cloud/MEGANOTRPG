import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const index = fs.readFileSync("index.html", "utf8")
const view = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
const styles = fs.readFileSync("src/ui-v1-isolated/character-view.css", "utf8")
const control = fs.readFileSync("src/ui-v1-isolated/useUiV1CharacterControl.ts", "utf8")
const mediaActions = fs.readFileSync("src/ui-v1-isolated/characterSnakeActions.ts", "utf8")

test("production entry renders the UI 1.0 CharacterView rather than the legacy profile", () => {
  assert.match(index, /src\/ui-v1-isolated\/main\.tsx/)
  assert.match(view, /useResolvedCharacterRuntime\(control\.runtimeEntity\)/)
  assert.match(view, /data-class-key=\{classInfo\.key\}/)
})

test("production character sheet follows the approved continuous RPG hierarchy", () => {
  assert.match(view, /className="u1-character-view__hero"/)
  assert.match(view, /className="u1-character-view__inventory-line"/)
  assert.match(view, /className="u1-character-view__identity"/)
  assert.match(view, /className="u1-character-view__core"/)
  assert.match(view, /className="u1-character-view__ability-matrix"/)
  assert.match(view, /setExpandedAbility/)
  assert.match(view, /className="u1-character-view__resources"/)
  assert.match(view, /className="u1-character-view__slot-viewport"/)
  assert.match(styles, /aspect-ratio:\s*16\s*\/\s*9/)
  assert.match(styles, /grid-template-columns:\s*minmax\(0,1fr\) minmax\(0,1fr\)/)
  assert.match(styles, /max-height:\s*214px;[\s\S]*overflow-y:\s*auto/)
  assert.match(styles, /grid-template-columns:\s*repeat\(4,13px\)/)
})

test("Snake owns logical character sheet interactions instead of ad-hoc menus", () => {
  assert.match(view, /type: "inventory-item"/)
  assert.match(view, /type: "spell"/)
  assert.match(view, /type: "feature"/)
  assert.match(view, /type: "character-resource"/)
  assert.match(view, /type: "spell-slot"/)
  assert.match(view, /id: "inspect"[\s\S]*kind: "detail"/)
  assert.match(view, /createCharacterSnakeActions/)
  assert.match(mediaActions, /id: "sheet-hero"[\s\S]*aspectRatio: 16 \/ 9/)
})

test("UI 1.0 reads canonical resource-state columns and keeps player-owned actions on owner engines", () => {
  assert.match(control, /\.select\("state_key,label,current,max_snapshot,recharge"\)/)
  assert.doesNotMatch(control, /resource_key,current_value,max_value/)
  assert.match(control, /cheburashka\.execute\(\{[\s\S]*kind: "inventory\.set_equipped"/)
  assert.match(control, /shapoklyak\.execute\(\{[\s\S]*kind: "entity\.set_spell_prepared"/)
})
