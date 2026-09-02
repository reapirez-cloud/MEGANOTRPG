import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const app = fs.readFileSync("src/App.tsx", "utf8")
const sheet = fs.readFileSync("src/components/characters/ResolvedCharacterSheetBase.tsx", "utf8")
const styles = fs.readFileSync("src/character-profile-v5.css", "utf8")

test("stage 8 retires the v4 stylesheet and all active v4 sheet hooks", () => {
  assert.equal(fs.existsSync("src/character-profile-v4.css"), false)
  assert.doesNotMatch(app, /character-profile-v4\.css/)
  assert.doesNotMatch(sheet, /character-profile-v4\.css|sheet-v4__/)
  assert.doesNotMatch(styles, /sheet-v4__/)
})

test("v5 is the only active migration layer over the explicit v3 compatibility foundation", () => {
  const v3 = app.indexOf('import "./character-profile-v3.css"')
  const v5 = app.indexOf('import "./character-profile-v5.css"')
  assert.ok(v3 >= 0)
  assert.ok(v5 > v3)
  assert.equal((app.match(/character-profile-v5\.css/g) || []).length, 1)
  assert.match(styles, /character-profile-v3\.css remains a compatibility foundation/)
  assert.match(styles, /Stage 8: final visual polish and removal of the retired v4 cascade/)
})

test("sheet directory and focus structures are self-contained in v5", () => {
  assert.match(sheet, /className="sheet-v5__directory"/)
  assert.match(sheet, /className="sheet-v5__directory-list"/)
  assert.match(sheet, /className="sheet-v5__directory-icon"/)
  assert.match(sheet, /className="character-focus-v5__empty"/)
  assert.match(sheet, /className="character-focus-v5__identity"/)
  assert.match(styles, /\.sheet-v5__directory-list > button \{/)
  assert.match(styles, /\.sheet-v5__directory-icon \{/)
  assert.match(styles, /\.character-focus-v5__identity > div \{/)
  assert.match(styles, /\.character-focus-v5__empty \{/)
})

test("stage 8 keeps phone hierarchy readable and preserves minimum interaction targets", () => {
  assert.match(styles, /\.profile-v3__class \{[\s\S]*?min-height:\s*44px/)
  assert.match(styles, /\.sheet-v5 \.sheet-v3__admin button \{[\s\S]*?min-height:\s*44px/)
  assert.match(styles, /\.character-focus-v5__back \{[\s\S]*?min-height:\s*44px/)
  assert.match(styles, /\.character-detail-v5__header > button \{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px/)
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width: 340px\)[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
})

test("the consolidation remains presentation-only", () => {
  assert.doesNotMatch(styles, /supabase|GENA|Oracle|Shapoklyak|Cheburashka|resource_states/i)
  assert.doesNotMatch(sheet, /useCharacterSheet|supabase|resource_states/i)
  assert.match(sheet, /contract: ResolvedCharacterContract/)
  assert.match(sheet, /explainCharacter\(input, explain\.query\)/)
})
