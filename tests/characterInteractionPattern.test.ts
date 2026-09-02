import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const sheetBridge = fs.readFileSync("src/components/characters/ResolvedCharacterSheet.tsx", "utf8")
const sectionState = fs.readFileSync("src/components/characters/CharacterSectionState.tsx", "utf8")
const detailSheet = fs.readFileSync("src/components/characters/CharacterDetailSheet.tsx", "utf8")
const actionSheet = fs.readFileSync("src/components/common/ContextActionSheet.tsx", "utf8")
const dialogSurface = fs.readFileSync("src/hooks/useDialogSurface.ts", "utf8")
const styles = fs.readFileSync("src/components/characters/CharacterInteraction.css", "utf8")

test("stage 4 makes Back descend one navigation level at a time", () => {
  assert.match(profile, /function handleProfileBack\(\)/)
  assert.match(profile, /if \(sheetFocused\)[\s\S]*?setSheetFocusResetKey/)
  assert.match(profile, /if \(tab !== "sheet"\)[\s\S]*?openTab\("sheet"\)/)
  assert.match(profile, /onClick=\{handleProfileBack\}/)
  assert.match(sheetBridge, /focusResetKey/)
  assert.match(sheetBridge, /<ResolvedCharacterSheetBase key=\{focusResetKey\}/)
})

test("focused or non-sheet character surfaces collapse the large identity hero", () => {
  assert.match(profile, /const profileIsDeep = tab !== "sheet" \|\| sheetFocused/)
  assert.match(profile, /profile-v3__hero--compact/)
  assert.match(styles, /\.profile-v3__hero--compact \{/)
  assert.match(styles, /\.profile-v3__hero--compact \.profile-v3__bio[\s\S]*?display:\s*none/)
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.profile-v3__hero--compact/)
})

test("loading empty error and stale feedback use one presentation primitive", () => {
  assert.match(sectionState, /type StateKind = "loading" \| "empty" \| "error" \| "stale"/)
  assert.match(sectionState, /role=\{kind === "error" \? "alert" : "status"\}/)
  assert.ok((profile.match(/<CharacterSectionState/g) || []).length >= 7)
  assert.doesNotMatch(profile, /data\.loading && <div className="center-state"/)
  assert.match(styles, /\.character-section-state-v5--error/)
  assert.match(styles, /\.character-section-state-v5--stale/)
})

test("detail and action bottom sheets share predictable dismissal behavior", () => {
  assert.match(detailSheet, /useDialogSurface<HTMLElement>\(onClose\)/)
  assert.match(actionSheet, /useDialogSurface<HTMLDivElement>\(onClose/)
  assert.match(dialogSurface, /event\.key === "Escape"/)
  assert.match(detailSheet, /onMouseDown=\{onClose\}/)
  assert.match(actionSheet, /onMouseDown=\{onClose\}/)
  assert.match(detailSheet, /aria-modal="true"/)
  assert.match(actionSheet, /aria-modal="true"/)
})

test("tap opens art detail while long press stays reserved for actions", () => {
  assert.match(profile, /onClick=\{\(\) => setSelectedArt\(art\)\}[\s\S]*?bindArtLongPress/)
  assert.match(profile, /selectedArt && <CharacterDetailSheet/)
  assert.match(profile, /artMenu && <ContextActionSheet/)
  assert.doesNotMatch(profile, /Долгое нажатие открывает действия/)
})

test("stage 4 remains presentation-only and does not create gameplay state", () => {
  assert.doesNotMatch(sectionState, /character-engine|supabase|GENA|Oracle|resource_states/i)
  assert.doesNotMatch(detailSheet, /character-engine|supabase|GENA|Oracle|resource_states/i)
  assert.doesNotMatch(dialogSurface, /character-engine|supabase|GENA|Oracle|resource_states/i)
  assert.doesNotMatch(styles, /hp\s*=|spell_slot|resource_state/i)
  assert.match(profile, /useResolvedCharacterRuntime\(character\)/)
  assert.match(profile, /resolved\.contract/)
})
