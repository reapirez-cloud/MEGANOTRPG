import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const modelPath = new URL("../src/ui-v1-isolated/chat-room/chatEventModel.ts", import.meta.url)
const hookPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomEvents.ts", import.meta.url)
const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)

test("stage 3 has one normalized ChatEvent model for all feed rows", async () => {
  const model = await readFile(modelPath, "utf8")

  for (const type of [
    "message",
    "gm_message",
    "roll",
    "spell",
    "attack",
    "item",
    "class_ability",
    "media",
    "system",
  ]) {
    assert.match(model, new RegExp(`"${type}"`))
  }

  assert.match(model, /export function normalizeChatEvent/)
  assert.match(model, /Legacy "action" rows in MEGANOT are class\/character mechanics/)
  assert.doesNotMatch(model, /success|failure|успех|провал/i)
})

test("stage 3 reads actual room history and listens only to that room", async () => {
  const hook = await readFile(hookPath, "utf8")

  assert.match(hook, /from\("chat_messages"\)/)
  assert.match(hook, /\.eq\("room_id", roomId\)/)
  assert.match(hook, /\.order\("id", \{ ascending: false \}\)/)
  assert.match(hook, /MESSAGE_LIMIT = 150/)
  assert.match(hook, /table: "chat_messages"/)
  assert.match(hook, /filter: `room_id=eq\.\$\{roomId\}`/)
  assert.match(hook, /from\("campaign_members"\)/)
})

test("stage 3 renderer does not invent GM outcomes", async () => {
  const feed = await readFile(feedPath, "utf8")

  assert.match(feed, /ChatGameEventCard/)
  assert.match(feed, /function SystemEvent/)
  assert.match(feed, /function MessageEvent/)
  assert.match(feed, /function EventRow/)
  assert.doesNotMatch(feed, /Успех|Провал|Срабатывает|success|failure/)
})

test("stage 3 replaces the feed placeholder without adding composer or panels", async () => {
  const room = await readFile(roomPath, "utf8")

  assert.match(room, /data-chat-room-stage="3"/)
  assert.match(room, /<ChatFeed roomId=\{roomId\}/)
  assert.doesNotMatch(room, /Лента сообщений будет подключена/)
  assert.doesNotMatch(room, /composer|attachment|ChatDrawer|ActionLauncher/)
})
