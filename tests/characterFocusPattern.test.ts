import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const focusShell = fs.readFileSync("src/components/characters/CharacterFocusShell.tsx", "utf8")
const detailSheet = fs.readFileSync("src/components/characters/CharacterDetailSheet.tsx", "utf8")
const sheet = fs.readFileSync("src/components/characters/ResolvedCharacterSheetBase.tsx", "utf8")
const styles = fs.readFileSync("src/character-profile-v5.css", "utf8")

test("v5 has one reusable full-page focus shell instead of local section headers", () => {
  assert.match(focusShell, /data-character-focus="true"/)
  assert.match(focusShell, /character-focus-v5__header/)
  assert.match(focusShell, /character-focus-v5__back/)
  assert.match(focusShell, /character-focus-v5__meta/)
  assert.match(focusShell, /character-focus-v5__action/)
  assert.match(focusShell, /character-focus-v5__body/)
  assert.doesNotMatch(focusShell, /character-engine|supabase|useCharacterSheet|useResolvedCharacterRuntime/)
  assert.doesNotMatch(sheet, /function FocusHeader/)
})

test("every deep Sheet section uses the shared focus shell", () => {
  assert.equal((sheet.match(/<CharacterFocusShell/g) || []).length, 6)
  assert.match(sheet, /section === "resources" && <CharacterFocusShell/)
  assert.match(sheet, /section === "actions" && <CharacterFocusShell/)
  assert.match(sheet, /section === "features" && <CharacterFocusShell/)
  assert.match(sheet, /section === "defenses" && <CharacterFocusShell/)
  assert.match(sheet, /section === "identity" && <CharacterFocusShell/)
  assert.match(sheet, /section === "story" && <CharacterFocusShell/)
  assert.match(sheet, /document\.querySelector\("\.character-focus-v5"\)/)
})

test("v5 has one reusable detail bottom sheet and CE explanations use it", () => {
  assert.match(detailSheet, /role="dialog"/)
  assert.match(detailSheet, /aria-modal="true"/)
  assert.match(detailSheet, /character-detail-v5__value/)
  assert.match(detailSheet, /character-detail-v5__body/)
  assert.match(detailSheet, /onMouseDown=\{onClose\}/)
  assert.doesNotMatch(detailSheet, /character-engine|supabase|explainCharacter/)
  assert.match(sheet, /<CharacterDetailSheet/)
  assert.match(sheet, /explainCharacter\(input, explain\.query\)/)
  assert.match(sheet, /eyebrow="Расчёт Character Engine"/)
  assert.doesNotMatch(sheet, /<div className="bottom-sheet sheet-v3__explain"/)
})

test("focus and detail presentation stays adaptive and token-driven", () => {
  assert.match(styles, /Stage 3 shared Focus\/Detail patterns/)
  assert.match(styles, /\.character-profile-v2 \.character-focus-v5 \{/)
  assert.match(styles, /\.character-profile-v2 \.character-detail-v5 \{/)
  assert.match(styles, /background:[\s\S]*?var\(--character-surface-raised\)/)
  assert.match(styles, /border:[\s\S]*?var\(--character-line\)/)
  assert.match(styles, /@media \(min-width: 600px\)[\s\S]*?\.character-detail-v5/)
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.character-focus-v5__header/)
  assert.match(styles, /\.character-focus-v5__back > strong \{[\s\S]*?display:\s*none;/)
})

test("manager feature creation is promoted into the focus header rather than a detached floating row", () => {
  assert.match(sheet, /action=\{canManage \? <button className="character-focus-v5__primary"/)
  assert.doesNotMatch(sheet, /className="sheet-v4__focus-add"/)
})
