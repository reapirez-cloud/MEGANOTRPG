import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sheetBase = fs.readFileSync("src/components/characters/ResolvedCharacterSheetBase.tsx", "utf8")
const sheetBridge = fs.readFileSync("src/components/characters/ResolvedCharacterSheet.tsx", "utf8")
const classPanel = fs.readFileSync("src/components/characters/CharacterClassPanel.tsx", "utf8")
const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const stylesV5 = fs.readFileSync("src/character-profile-v5.css", "utf8")
const app = fs.readFileSync("src/App.tsx", "utf8")
const suppressions = fs.readFileSync("src/hooks/useCharacterSourceSuppressions.ts", "utf8")
const templateRegistry = fs.readFileSync("src/hooks/useCharacterTemplateRegistry.ts", "utf8")

test("character sheet v5 opens with health, core stats, abilities, then a quiet section directory", () => {
  const combat = sheetBase.indexOf('className="sheet-v3__combat sheet-v5__combat"')
  const abilities = sheetBase.indexOf('className="sheet-v3__section sheet-v3__abilities sheet-v5__abilities"')
  const directory = sheetBase.indexOf('className="sheet-v5__directory"')
  assert.ok(combat >= 0)
  assert.ok(abilities > combat)
  assert.ok(directory > abilities)
  assert.match(sheetBase, /sheet-v5__health-track/)
  assert.match(sheetBase, /sheet-v5__core-grid/)
  assert.match(sheetBase, /sheet-v5__ability-position/)
  assert.match(sheetBase, /<h3>Разделы<\/h3>/)
  assert.doesNotMatch(sheetBase, /sheet-v4__/)
  assert.doesNotMatch(sheetBase, /Листай между характеристиками/)
  assert.doesNotMatch(sheetBase, /Никакой длинной ленты одинаковых панелей/)
  assert.match(sheetBase, /Способности класса/)
  assert.match(sheetBase, /Способности подкласса/)
  assert.match(sheetBase, /Фиты и особенности/)
  assert.match(sheetBase, /Защиты и владения/)
})

test("v5 health presentation is derived from the resolved CE contract instead of storing a second value", () => {
  assert.match(sheetBase, /contract\.combat\.currentHp\s*\/\s*contract\.combat\.maxHp\.value/)
  assert.match(sheetBase, /Math\.min\(100, Math\.max\(0,/)
  assert.doesNotMatch(sheetBase, /useCharacterSheet/)
  assert.doesNotMatch(sheetBase, /supabase/)
  assert.match(stylesV5, /\.sheet-v5__health-track/)
  assert.match(stylesV5, /background:\s*var\(--character-health\)/)
})

test("secondary sheet content is focused instead of one permanent stack", () => {
  assert.match(sheetBase, /type SheetSection = "overview" \| "resources" \| "actions" \| "features" \| "defenses" \| "identity" \| "story"/)
  assert.match(sheetBase, /section === "resources"/)
  assert.match(sheetBase, /section === "actions"/)
  assert.match(sheetBase, /section === "features"/)
  assert.match(sheetBase, /section === "defenses"/)
  assert.match(sheetBase, /section === "story"/)
  assert.match(sheetBase, /CharacterFocusShell/)
  assert.doesNotMatch(sheetBase, /function FocusHeader/)
})

test("class and subclass directory entries open runtime mechanics instead of creating another rules source", () => {
  assert.match(sheetBridge, /Способности подкласса/)
  assert.match(sheetBridge, /meganotrpg\.character-class-focus/)
  assert.match(sheetBridge, /\.profile-v3__class/)
  assert.match(classPanel, /aria-label="Разделы класса"/)
  assert.match(classPanel, /CharacterClassPanelBase/)
  assert.match(classPanel, /Подкласс/)
  assert.doesNotMatch(classPanel, /character-class-focus__switch/)
  assert.match(profile, /<CharacterClassPanel/)
})

test("class tab subscribers cannot collide with the character runtime suppression owner", () => {
  assert.match(suppressions, /character-suppressions-\$\{characterId\}-\$\{subscriberIdRef\.current\}/)
  assert.doesNotMatch(suppressions, /clearCharacterSourceSuppressions/)
  assert.match(templateRegistry, /clearCharacterSourceSuppressions\(characterId\)/)
})

test("v5 hero exposes class identity and an explicit Reference entry without duplicating profile controls", () => {
  assert.equal((profile.match(/className="profile-v3__class"/g) || []).length, 1)
  assert.equal((profile.match(/className="profile-v3__reference"/g) || []).length, 1)
  assert.match(profile, /<strong>Справочник<\/strong>/)
  assert.match(stylesV5, /\.character-profile-v2 \.profile-v3__class \{[\s\S]*?display:\s*flex;/)
  assert.match(stylesV5, /\.character-profile-v2 \.profile-v3__reference > span:last-child \{[\s\S]*?display:\s*grid;/)
})

test("v3 compatibility foundation loads before the one canonical v5 migration layer", () => {
  const v3 = app.indexOf('import "./character-profile-v3.css"')
  const v5 = app.indexOf('import "./character-profile-v5.css"')
  const modules = app.indexOf('import "./character-sheet-modules.css"')
  assert.ok(v3 >= 0)
  assert.ok(modules > v3)
  assert.ok(v5 > modules)
  assert.equal((app.match(/character-profile-v5\.css/g) || []).length, 1)
  assert.doesNotMatch(app, /character-profile-v4\.css/)
  assert.match(stylesV5, /character-profile-v3\.css remains a compatibility foundation/)
  assert.doesNotMatch(stylesV5, /sheet-v4__/)
})

test("mobile ability and core-stat layouts stay adaptive without the retired v4 cascade", () => {
  assert.match(stylesV5, /\.sheet-v5__abilities \.sheet-v3__ability-score/)
  assert.match(stylesV5, /\.sheet-v5__abilities \.sheet-v3__skill-column/)
  assert.match(stylesV5, /min-height:\s*0/)
  assert.match(stylesV5, /height:\s*auto/)
  assert.match(stylesV5, /@media \(max-width: 430px\)[\s\S]*?\.sheet-v5__core-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/)
  assert.match(stylesV5, /@media \(max-width: 340px\)[\s\S]*?\.sheet-v5__core-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(stylesV5, /min-height:\s*144px/)
})
