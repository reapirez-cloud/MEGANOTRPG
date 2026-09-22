import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const playerHook = fs.readFileSync("src/ui-v1-isolated/useCharacterQuests.ts", "utf8")
const managerHook = fs.readFileSync("src/ui-v1-isolated/useQuestManager.ts", "utf8")
const questUi = fs.readFileSync("src/ui-v1-isolated/CharacterSheetQuests.tsx", "utf8")
const view = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
const styles = fs.readFileSync("src/ui-v1-isolated/character-sheet-quests.css", "utf8")

test("GM quest layer is gated by character-sheet manager authority", () => {
  assert.match(questUi, /canManage \? \(/)
  assert.match(questUi, /canManage && layer === "gm"/)
  assert.match(view, /canManage=\{control\.canManage\}/)
  assert.match(questUi, /Слой ГМ/)
})

test("player quest hook remains isolated from all manager secrets", () => {
  assert.match(playerHook, /list_character_quests_v1/)
  assert.doesNotMatch(playerHook, /read_quest_plan_v1/)
  assert.doesNotMatch(playerHook, /quest_secrets|quest_stage_secrets|quest_targets|quest_conditions/)
})

test("GM layer reads the full plan through manager-only RPC and writes canonical quest tables", () => {
  assert.match(managerHook, /read_quest_plan_v1/)
  assert.match(managerHook, /from\("quest_secrets"\)/)
  assert.match(managerHook, /from\("quest_stage_secrets"\)/)
  assert.match(managerHook, /from\("quest_targets"\)/)
  assert.match(managerHook, /from\("quest_conditions"\)/)
  assert.match(managerHook, /from\("quest_condition_groups"\)/)
})

test("GM quest entities are controlled by Snake long-press actions", () => {
  assert.match(questUi, /type: "quest"/)
  assert.match(questUi, /type: "quest-stage"/)
  assert.match(questUi, /type: "quest-target"/)
  assert.match(questUi, /type: "quest-condition"/)
  assert.match(questUi, /<SnakeTrigger/)
  assert.match(questUi, /Скрытые заметки/)
  assert.match(questUi, /Скрытый план этапа/)
})

test("placeholder targets bind through campaign entity pickers rather than manual UUID fields", () => {
  assert.match(questUi, /targetCandidates\(target, catalog\)/)
  assert.match(questUi, /Привязать к миру/)
  assert.match(questUi, /Вернуть в placeholder/)
  assert.match(view, /workshop\.locations/)
  assert.match(view, /candidate\.characterType === "npc"/)
  assert.match(view, /definition\.kind === "item"/)
  assert.doesNotMatch(questUi, /Введите UUID|UUID цели/)
})

test("GM quest plan has responsive dedicated styling", () => {
  assert.match(styles, /u1-character-quests__gm-layout/)
  assert.match(styles, /u1-character-quests__gm-stage/)
  assert.match(styles, /u1-character-quests__gm-target/)
  assert.match(styles, /@media \(max-width: 520px\)/)
})
