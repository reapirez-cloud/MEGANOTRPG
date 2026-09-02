import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const detail = fs.readFileSync("src/components/characters/CharacterDetailSheet.tsx", "utf8")
const styles = fs.readFileSync("src/components/characters/CharacterEditors.css", "utf8")
const sheetEditor = fs.readFileSync("src/components/characters/CharacterSheetEditor.tsx", "utf8")
const resourcesEditor = fs.readFileSync("src/components/characters/CharacterResourcesEditor.tsx", "utf8")
const spellEditor = fs.readFileSync("src/components/characters/SpellEditor.tsx", "utf8")
const featureEditor = fs.readFileSync("src/components/characters/FeatureEditor.tsx", "utf8")
const inventoryEditor = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")

test("stage 7 loads one scoped v5 editor presentation layer", () => {
  assert.match(detail, /import "\.\/CharacterEditors\.css"/)
  assert.match(styles, /Character Profile v5 — Stage 7 editor migration/)
  assert.match(styles, /\.character-profile-v2 :is\(/)
  assert.match(styles, /--character-surface-overlay/)
  assert.match(styles, /--character-text-primary/)
  assert.match(styles, /--character-accent/)
})

test("all character-profile editor families share the same sheet hierarchy", () => {
  for (const selector of ["compact-editor-sheet", "dnd-sheet-editor", "character-resource-editor", "v2-editor-sheet.creation-wizard"]) {
    assert.ok(styles.includes(selector), `missing Stage 7 editor family ${selector}`)
  }
  assert.match(styles, /character-editor-head, \.v2-sheet-head\.creation-wizard__head/)
  assert.match(styles, /position:\s*sticky/)
  assert.match(styles, /safe-area-inset-bottom/)
})

test("editor controls are mobile-sized, focus-visible and adaptive", () => {
  assert.match(styles, /min-height:\s*44px/)
  assert.match(styles, /:focus-visible/)
  assert.match(styles, /@media \(max-width: 430px\)/)
  assert.match(styles, /@media \(max-width: 340px\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test("profile keeps every existing editor entry point and its permission boundary", () => {
  assert.match(profile, /editor\?\.type === "avatar" && canEditAvatar/)
  assert.match(profile, /editor\?\.type === "sheet" && sheet && canManage/)
  assert.match(profile, /editor\?\.type === "resources" && sheet && canManage/)
  assert.match(profile, /editor\?\.type === "inventory" && canManage/)
  assert.match(profile, /editor\?\.type === "spell" && canManage/)
  assert.match(profile, /editor\?\.type === "spell-option" && canManage/)
  assert.match(profile, /editor\?\.type === "feature" && canManage/)
})

test("stage 7 preserves specialized editor workflows instead of replacing their behavior", () => {
  assert.match(sheetEditor, /const result = await onSave\(draft\)/)
  assert.match(resourcesEditor, /const result = await onSave\(/)
  assert.match(spellEditor, /const result = await onSave\(/)
  assert.match(featureEditor, /type Step = 1 \| 2 \| 3/)
  assert.match(featureEditor, /<MechanicsBuilder value=\{mechanics\} onChange=\{setMechanics\}/)
  assert.match(inventoryEditor, /type WizardStep = 1 \| 2 \| 3 \| 4/)
  assert.match(inventoryEditor, /<MechanicsBuilder/)
})

test("editor migration stays presentation-only and does not become a mechanics or persistence owner", () => {
  assert.doesNotMatch(styles, /supabase|character-engine|GENA|Oracle|Cheburashka|Shapoklyak|resource_states/i)
  assert.doesNotMatch(detail, /supabase|character-engine|GENA|Oracle|Cheburashka|Shapoklyak|resource_states/i)
  assert.match(profile, /onSave=\{data\.updateSheet\}/)
  assert.match(profile, /data\.updateInventoryItem/)
  assert.match(profile, /data\.updateSpell/)
  assert.match(profile, /data\.updateFeature/)
})
