import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpells.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spells.css",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)

test("stage 2 reproduces the reference spell-panel anatomy", () => {
  assert.match(spells, /ЯЧЕЙКИ ЗАКЛИНАНИЙ/)
  assert.match(spells, /Array\.from\(\{ length: 9 \}/)
  assert.match(spells, /Заговоры/)
  assert.match(spells, /Всегда доступны/)
  assert.match(spells, /Открыть в гримуаре/)
  assert.match(spells, /preview = allSpells\.slice\(0, 3\)/)
  assert.match(spells, /setExpandedLevel/)
  assert.match(spells, /aria-expanded=\{expanded\}/)
})

test("stage 3 makes slot focus and the grimoire panel real interactions", () => {
  assert.match(spells, /const openCircle = \(level: number\)/)
  assert.match(spells, /scrollIntoView\(\{ behavior: "smooth", block: "start"/)
  assert.match(spells, /setGrimoireLevel\(level\)/)
  assert.match(spells, /data-grimoire-level=\{level\}/)
  assert.match(spells, /Подготовлены/)
  assert.match(spells, /Концентрация/)
  assert.match(spells, /Ритуал/)
  assert.match(spells, /Под эти фильтры ничего не попало\./)
  assert.match(styles, /u1-character-spells__grimoire-panel/)
  assert.match(styles, /u1-character-spells__grimoire-filters/)
  assert.match(styles, /u1-character-spells__grimoire-list/)
})

test("stage 4 renders the Warlock Pact Magic pool at its real CE slot level", () => {
  assert.match(spells, /function pactSlotLevel\(contract: ResolvedCharacterContract\)/)
  assert.match(spells, /warlock_pact_slots/)
  assert.match(spells, /warlock_pact_slot_level/)
  assert.match(spells, /const slotForSpellLevel = \(level: number\)/)
  assert.match(spells, /Магия договора/)
  assert.match(spells, /data-pact=\{pactAtThisLevel \|\| undefined\}/)
  assert.match(styles, /u1-character-spells__slot\[data-pact\]/)
})

test("stages 5–7 preserve the panel in empty states and expose spent-slot status accessibly", () => {
  assert.match(spells, /data-exhausted=\{exhausted \|\| undefined\}/)
  assert.match(spells, /aria-controls=\{`u1-character-spells-circle-\$\{level\}`\}/)
  assert.match(spells, /aria-controls=\{`u1-character-spells-content-\$\{level\}`\}/)
  assert.match(spells, /Гримуар пока пуст/)
  assert.match(spells, /Character Engine выдаст персонажу доступ/)
  assert.match(styles, /u1-character-spells__slot\[data-exhausted\]/)
  assert.match(styles, /spent-resource-cross\.png/)
  assert.match(styles, /u1-character-spells__empty-book/)
})

test("stage 2 keeps the visual layout class-themed and mobile dense", () => {
  assert.match(styles, /grid-template-columns:\s*repeat\(9, minmax\(0, 1fr\)\)/)
  assert.match(styles, /u1-character-spells__expanded-grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /var\(--cv-panel-glass/)
  assert.match(styles, /var\(--cv-spell-accent/)
  assert.match(styles, /var\(--cv-accent-line/)
  assert.doesNotMatch(styles, /#(?:d4af37|ffd700|c9a227)/i)
})

test("production spell page receives character identity and class skin", () => {
  assert.match(view, /<CharacterSheetSpells[\s\S]*characterClass=\{character\.characterClass\}/)
  assert.match(view, /characterLevel=\{character\.level\}/)
  assert.match(view, /classKey=\{classKey\}/)
  assert.match(spells, /characterSheetSpellSlotAsset\(classKey\)/)
})

test("stage 2 uses authored icon atlases and a maintained icon library", () => {
  assert.match(spells, /\/ui-v1\/character-sheet\/icons\/spell-slots\.png/)
  assert.match(spells, /@phosphor-icons\/react/)
  assert.match(spells, /<CaretRight/)
  assert.match(spells, /<LockKey/)
  assert.match(spells, /<Plus/)
})
