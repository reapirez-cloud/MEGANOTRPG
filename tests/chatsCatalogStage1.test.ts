import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pagePath = new URL("../src/pages/Chats.tsx", import.meta.url)

test("chat catalog stage 1 is one landing page with the approved hierarchy", async () => {
  const source = await readFile(pagePath, "utf8")

  for (const label of [
    "Текущая история",
    "Флуд",
    "Личные истории",
    "События",
    "Завершённые",
  ]) {
    assert.match(source, new RegExp(label))
  }

  assert.match(source, /data-chat-catalog-stage="1"/)
  assert.match(source, /const currentStory = activeEvents\[0\] \?\? activePersonal\[0\] \?\? null/)
  assert.match(
    source,
    /\(room\.room_type === "character" \|\| room\.room_type === "scene"\)[\s\S]*roomClosed\(room\)/,
  )
})

test("stage 1 removes legacy directory navigation and cannot enter ChatRoom", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.doesNotMatch(source, /type ChatSection/)
  assert.doesNotMatch(source, /setSection\(/)
  assert.doesNotMatch(source, /onOpenRoom\s*\(/)
  assert.doesNotMatch(source, /Новая история/)
  assert.doesNotMatch(source, /Создать личную историю/)
  assert.doesNotMatch(source, />Сцены</)
})
