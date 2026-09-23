import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const contract = fs.readFileSync("src/ui-v1-isolated/characterSheetUiContract.ts", "utf8")
const history = fs.readFileSync("src/ui-v1-isolated/characterSheetHistory.ts", "utf8")
const shell = fs.readFileSync("src/ui-v1-isolated/CharacterSheetShell.tsx", "utf8")
const view = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
const hook = fs.readFileSync("src/ui-v1-isolated/useCharacterQuests.ts", "utf8")
const quests = fs.readFileSync("src/ui-v1-isolated/CharacterSheetQuests.tsx", "utf8")
const styles = fs.readFileSync("src/ui-v1-isolated/character-sheet-quests.css", "utf8")

test("character sheet exposes quests as a persistent internal section", () => {
  assert.match(contract, /"quests"/)
  assert.match(contract, /label: "Квесты"/)
  assert.match(history, /\| "quests"/)
  assert.match(shell, /id === "quests"/)
  assert.match(view, /section === "quests"/)
  assert.match(view, /<CharacterSheetQuests/)
})

test("quest journal lazy-loads the player-safe RPC only when the section opens", () => {
  assert.match(view, /questsDataEnabled/)
  assert.match(view, /if \(section === "quests"\) setQuestsDataEnabled\(true\)/)
  assert.match(hook, /list_character_quests_v1/)
  assert.doesNotMatch(hook, /read_quest_plan_v1/)
  assert.doesNotMatch(hook, /quest_secrets/)
  assert.doesNotMatch(hook, /quest_stage_secrets/)
})

test("player quest UI only renders completed stage history and hides drafts", () => {
  assert.match(quests, /completed_stages/)
  assert.match(quests, /quest\.status !== "draft"/)
  assert.match(quests, /Выполненные этапы появятся здесь по мере прохождения/)
  assert.match(quests, /layer === "gm" && canManage/)
  assert.match(quests, /visible\.map\(\(quest\) => <QuestCard/)
})

test("quest journal has dedicated mobile-safe graphite styling", () => {
  assert.match(styles, /var\(--cv-surface\)/)
  assert.match(styles, /var\(--cv-accent\)/)
  assert.match(styles, /@media \(max-width: 359px\)/)
})
