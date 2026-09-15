import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const sheet = fs.readFileSync("src/components/characters/ResolvedCharacterSheetOpus.tsx", "utf8")
const styles = fs.readFileSync("src/character-profile-opus.css", "utf8")

test("main character sheet is image-led and inventory begins directly under the 16:9 art", () => {
  assert.match(profile, /className="opus-hero opus-hero--sheet"/)
  assert.match(profile, /className="opus-hero__bio-rail"/)
  assert.match(profile, /className="opus-hero__diary"/)
  assert.match(profile, /className="opus-inventory-line"/)
  assert.ok(profile.indexOf('className="opus-inventory-line"') < profile.indexOf("<ResolvedCharacterSheetOpus"))
  assert.match(styles, /\.opus-hero__portrait-wrapper\s*\{[\s\S]*?aspect-ratio:\s*16\s*\/\s*9/)
})

test("main sheet hides the old permanent tab rail but preserves deep sections", () => {
  assert.match(profile, /\{tab !== "sheet" && \(\s*<nav className="opus-tabs">/)
  assert.match(profile, /openTab\("inventory"\)/)
  assert.match(profile, /openTab\("diary"\)/)
  assert.match(profile, /openTab\("arts"\)/)
  assert.match(profile, /onOpenClass=\{\(\) => openTab\("class"\)\}/)
})

test("core information is a 50/50 quick-stat and expandable ability matrix", () => {
  assert.match(sheet, /className="opus-core-grid"/)
  assert.match(sheet, /className="opus-core-grid__quick"/)
  assert.match(sheet, /className="opus-core-grid__abilities"/)
  assert.match(sheet, /const visibleAbilities = expandedAbility/)
  assert.match(sheet, /setExpandedAbility/)
  assert.match(sheet, /"skills\." \+ skillKey \+ "\.bonus"/)
  assert.match(styles, /\.opus-core-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/)
})

test("class resources and spell slots are compact canonical runtime projections", () => {
  assert.match(sheet, /const resourcePresentation:/)
  assert.match(sheet, /const uniqueResources = contract\.resources\.filter/)
  assert.match(sheet, /stateKey\.match\(\/\^spell_slot_\(\\d\+\)\$\/\)/)
  assert.match(sheet, /className="opus-resource-line__icon"/)
  assert.match(sheet, /className="opus-spell-slots__viewport"/)
  assert.match(sheet, /className="opus-spell-slot-row__pips"/)
  assert.match(styles, /\.opus-spell-slots__viewport\s*\{[\s\S]*?max-height:\s*304px;[\s\S]*?overflow-y:\s*auto/)
  assert.match(styles, /\.opus-spell-slot-row__pips\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, 14px\)/)
})

test("the redesign stays presentation-only and uses the shared CE contract", () => {
  assert.match(sheet, /contract: ResolvedCharacterContract/)
  assert.match(sheet, /explainCharacter\(input, explain\.query\)/)
  assert.doesNotMatch(sheet, /useCharacterSheet|supabase|character_resource_states/)
  assert.match(profile, /contract=\{resolved\.contract\}/)
  assert.match(profile, /spellcastingAbility=\{resolved\.spellcastingAbility\}/)
  assert.match(profile, /data-class-key=\{classId \|\| "default"\}/)
})
