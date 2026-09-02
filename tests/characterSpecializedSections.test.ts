import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const classPanel = fs.readFileSync("src/components/characters/CharacterClassPanel.tsx", "utf8")
const spellbook = fs.readFileSync("src/components/characters/CharacterSpellbook.tsx", "utf8")
const inventory = fs.readFileSync("src/components/characters/CharacterInventory.tsx", "utf8")
const sectionHeader = fs.readFileSync("src/components/characters/CharacterSectionHeader.tsx", "utf8")
const styles = fs.readFileSync("src/components/characters/CharacterSpecialized.css", "utf8")

test("stage 5 gives specialized character sections one shared top-level header language", () => {
  assert.match(sectionHeader, /character-section-header-v5/)
  assert.match(classPanel, /<CharacterSectionHeader/)
  assert.match(spellbook, /<CharacterSectionHeader/)
  assert.match(inventory, /<CharacterSectionHeader/)
  assert.match(styles, /\.character-section-header-v5 \{/)
})

test("Class is a directory into focused class subclass and Wizard book surfaces", () => {
  assert.match(classPanel, /aria-label="Разделы класса"/)
  assert.match(classPanel, /onClick=\{\(\) => choose\("class"\)\}/)
  assert.match(classPanel, /onClick=\{\(\) => choose\("subclass"\)\}/)
  assert.match(classPanel, /onClick=\{\(\) => choose\("spellbook"\)\}/)
  assert.ok((classPanel.match(/<CharacterFocusShell/g) || []).length >= 3)
  assert.doesNotMatch(classPanel, /<nav className="character-class-focus__switch"/)
  assert.match(classPanel, /const FOCUS_KEY = "meganotrpg\.character-class-focus"/)
})

test("Magic keeps resolved casting math and slots while adopting shared detail and state presentation", () => {
  assert.match(spellbook, /contract\.spellcasting\.byAbility/)
  assert.match(spellbook, /<SpellSlotMeter[\s\S]*?resources=\{contract\.resources\}/)
  assert.match(spellbook, /<CharacterDetailSheet eyebrow=\{levelName\(selectedSpell\.spell_level\)\}/)
  assert.match(spellbook, /<CharacterSectionState/)
  assert.doesNotMatch(spellbook, /sheet-backdrop--spell/)
})

test("Inventory uses Focus for drill-down and shared Detail for a concrete item", () => {
  assert.match(inventory, /isDeep \? \([\s\S]*?<CharacterFocusShell/)
  assert.match(inventory, /<CharacterDetailSheet eyebrow=\{categoryLabel\(item\.category\)\}/)
  assert.match(inventory, /onClick=\{\(\) => setDetail\(item\)\}/)
  assert.match(inventory, /bindLongPress\(item\)/)
  assert.doesNotMatch(inventory, /className="bottom-sheet inventory-rpg-detail"/)
})

test("profile Back wiring includes Class and Inventory internal focus before leaving their top-level tab", () => {
  assert.match(profile, /function handleProfileBack\(\)[\s\S]*?if \(sheetFocused\)[\s\S]*?setSheetFocusResetKey/)
  assert.match(profile, /<CharacterClassPanel[\s\S]*?focusResetKey=\{sheetFocusResetKey\}[\s\S]*?onFocusChange=\{setSheetFocused\}/)
  assert.match(profile, /<CharacterInventory[\s\S]*?focusResetKey=\{sheetFocusResetKey\}[\s\S]*?onFocusChange=\{setSheetFocused\}/)
})

test("stage 5 presentation does not become a second character mechanics owner", () => {
  assert.doesNotMatch(sectionHeader, /character-engine|supabase|GENA|Oracle|resource_states/i)
  assert.doesNotMatch(styles, /supabase|GENA|Oracle|resource_states/i)
  assert.match(classPanel, /contract: ResolvedCharacterContract/)
  assert.match(spellbook, /contract: ResolvedCharacterContract/)
  assert.match(inventory, /onSetEquipped/)
  assert.doesNotMatch(inventory, /from ["'].*supabase|\.from\(/i)
})
