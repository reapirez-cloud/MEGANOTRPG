import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sheet = fs.readFileSync("src/components/characters/ResolvedCharacterSheet.tsx", "utf8")
const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const styles = fs.readFileSync("src/character-profile-v4.css", "utf8")

test("character sheet opens with essentials then abilities then a section directory", () => {
  const combat = sheet.indexOf('className="sheet-v3__combat sheet-v4__combat"')
  const abilities = sheet.indexOf('className="sheet-v3__section sheet-v3__abilities sheet-v4__abilities"')
  const directory = sheet.indexOf('className="sheet-v4__directory"')
  assert.ok(combat >= 0)
  assert.ok(abilities > combat)
  assert.ok(directory > abilities)
  assert.match(sheet, /Разделы листа/)
  assert.match(sheet, /Способности класса/)
  assert.match(sheet, /Способности подкласса/)
  assert.match(sheet, /Фиты и особенности/)
  assert.match(sheet, /Защиты и владения/)
})

test("secondary sheet content is focused instead of one permanent stack", () => {
  assert.match(sheet, /type SheetSection = "overview" \| "resources" \| "actions" \| "features" \| "defenses" \| "identity" \| "story"/)
  assert.match(sheet, /section === "resources"/)
  assert.match(sheet, /section === "actions"/)
  assert.match(sheet, /section === "features"/)
  assert.match(sheet, /section === "defenses"/)
  assert.match(sheet, /section === "story"/)
  assert.match(sheet, /FocusHeader/)
})

test("profile hero no longer visually duplicates the class beside the portrait", () => {
  assert.match(profile, /profile-v3__class/)
  assert.match(styles, /\.character-profile-v2 \.profile-v3__class \{\s*display: none;/)
  assert.match(styles, /\.profile-v3__hero/)
})

test("mobile ability panels use stable aligned heights", () => {
  assert.match(styles, /\.sheet-v4__abilities \.sheet-v3__ability-score/)
  assert.match(styles, /\.sheet-v4__abilities \.sheet-v3__skill-column/)
  assert.match(styles, /min-height: 144px/)
  assert.match(styles, /align-content: center/)
})
