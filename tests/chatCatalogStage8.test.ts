import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pagePath = new URL("../src/pages/Chats.tsx", import.meta.url)
const modelPath = new URL("../src/chat/catalogModel.ts", import.meta.url)
const hookPath = new URL("../src/hooks/useRooms.ts", import.meta.url)
const contextPath = new URL("../src/context/CharacterContext.tsx", import.meta.url)
const stylePath = new URL("../src/chats-v3.css", import.meta.url)
const lifecyclePath = new URL(
  "../supabase/migrations/20260919092339_chat_catalog_stage5_personal_lifecycle.sql",
  import.meta.url,
)
const contractPath = new URL("../docs/CHAT_CATALOG_CONTRACT.md", import.meta.url)

test("stage 8 freezes Player / GM / Owner authority without collapsing owner into a role", async () => {
  const [page, context] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(contextPath, "utf8"),
  ])

  assert.match(page, /data-chat-catalog-stage="8"/)
  assert.match(context, /const isGm = myMember\?\.role === "gm"/)
  assert.match(context, /const isOwner = myMember\?\.is_owner === true/)
  assert.match(context, /const canManage = isGm \|\| isOwner/)
  assert.match(page, /\{canManage && \(/)
})

test("stage 8 keeps the catalog boundary and forbids manual personal-history creation", async () => {
  const page = await readFile(pagePath, "utf8")

  assert.doesNotMatch(page, /onOpenRoom\s*\(/)
  assert.doesNotMatch(page, /createSceneRoom\s*\(/)
  assert.doesNotMatch(page, /Новая история/)
  assert.doesNotMatch(page, /Создать личную историю/)
  assert.match(page, /Экран диалога пока не подключён к новому каталогу/)
  assert.match(page, /Создание события будет подключено отдельным потоком/)
})

test("stage 8 locks current-story and completion ordering semantics", async () => {
  const model = await readFile(modelPath, "utf8")

  assert.match(model, /last_message_at \|\| room\.updated_at \|\| room\.created_at/)
  assert.match(model, /const currentStory = \[\.\.\.personalActive, \.\.\.eventsActive\]/)
  assert.doesNotMatch(model, /currentStory[\s\S]{0,220}flood/)
  assert.match(model, /room\.room_type === "character"[\s\S]{0,180}room\.character_died_at/)
  assert.match(model, /room\.room_type === "scene"[\s\S]{0,180}room\.closed_at/)
})

test("stage 8 locks personal-history lifecycle ownership", async () => {
  const sql = await readFile(lifecyclePath, "utf8")

  assert.match(sql, /v_character\.character_type <> 'pc'/)
  assert.match(sql, /is_read_only = \(v_character\.life_state = 'dead'\)/)
  assert.match(sql, /v_changed_to_dead/)
  assert.match(sql, /v_changed_to_alive/)
  assert.match(sql, /Personal history state follows character life state/)
  assert.match(sql, /closed_at = null/)
})

test("stage 8 locks all catalog Realtime refresh sources", async () => {
  const hook = await readFile(hookPath, "utf8")

  for (const table of [
    "chat_rooms",
    "chat_messages",
    "characters",
    "character_world_state",
    "locations",
    "scene_participants",
  ]) {
    assert.match(hook, new RegExp('table: "' + table + '"'))
  }
})

test("stage 8 keeps the certified mobile and resilience floor", async () => {
  const css = await readFile(stylePath, "utf8")

  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(max-width: 340px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /content-visibility:\s*auto/)
  assert.match(css, /overflow-wrap:\s*anywhere/)
})

test("stage 8 contract records the frozen landing-page ownership boundaries", async () => {
  const contract = await readFile(contractPath, "utf8")

  assert.match(contract, /Status: \*\*FROZEN \/ Stage 8 complete\*\*/)
  assert.match(contract, /canManage = isGm \|\| isOwner/)
  assert.match(contract, /Flood is never eligible/)
  assert.match(contract, /Room visibility is server-owned/)
  assert.match(contract, /Room taps use the shared catalog placeholder/)
  assert.match(contract, /layouts down to 320 px/)
})
