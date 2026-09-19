import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pagePath = new URL("../src/pages/Chats.tsx", import.meta.url)

test("chat catalog stage 1 remains one landing page with the approved hierarchy", async () => {
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

  assert.match(source, /data-chat-catalog-stage="8"/)
  assert.match(source, /const catalog = rooms\.catalog/)
  assert.match(source, /catalog\.currentStory/)
  assert.match(source, /catalog\.completed/)
})

test("catalog keeps the stage 1 no-ChatRoom boundary", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.doesNotMatch(source, /type ChatSection/)
  assert.doesNotMatch(source, /setSection\(/)
  assert.doesNotMatch(source, /onOpenRoom\s*\(/)
  assert.doesNotMatch(source, /Новая история/)
  assert.doesNotMatch(source, /Создать личную историю/)
  assert.doesNotMatch(source, />Сцены</)
})
