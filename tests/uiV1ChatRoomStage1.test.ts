import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const roomPath = new URL("../src/ui-v1-isolated/UiV1ChatRoom.tsx", import.meta.url)
const dataPath = new URL("../src/ui-v1-isolated/useUiV1ChatRoom.ts", import.meta.url)
const stylePath = new URL("../src/ui-v1-isolated/chat-room.css", import.meta.url)
const catalogPath = new URL("../src/ui-v1-isolated/ChatCatalog.tsx", import.meta.url)
const actionsPath = new URL("../src/ui-v1-isolated/chatSnakeActions.ts", import.meta.url)

test("ui v1 chat cards open a real isolated room route", async () => {
  const [app, catalog, actions] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(catalogPath, "utf8"),
    readFile(actionsPath, "utf8"),
  ])
  assert.match(app, /type: "chat"; roomId: string/)
  assert.match(app, /path\.startsWith\("chats\/"\)/)
  assert.match(app, /<UiV1ChatRoom roomId=\{route\.roomId\}/)
  assert.match(catalog, /onOpenRoom\(room\.id\)/)
  assert.match(actions, /openRoom\(\)/)
  assert.doesNotMatch(actions, /Внутренний игровой диалог подключается отдельным этапом/)
})

test("stage 1 room shell is isolated from legacy chat UI", async () => {
  const [app, room, data] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(roomPath, "utf8"),
    readFile(dataPath, "utf8"),
  ])
  assert.match(app, /import UiV1ChatRoom from "\.\/UiV1ChatRoom"/)
  assert.match(room, /data-chat-room-stage="5"/)
  assert.doesNotMatch(app + room + data, /pages\/ChatRoom|CharacterContext|game-story-v2|chat-v11|ChatActionSheet/)
  assert.match(data, /from\("chat_messages"\)/)
  assert.match(data, /table: "chat_messages"/)
  assert.match(data, /table: "chat_rooms"/)
})

test("stage 1 shell keeps the composer compact and graphite", async () => {
  const [room, css] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(stylePath, "utf8"),
  ])
  assert.match(room, /u1-room-composer__plus/)
  assert.match(room, /u1-room-header__context/)
  assert.match(css, /var\(--u1-canvas\)/)
  assert.match(css, /var\(--u1-surface-1\)/)
  assert.match(css, /grid-template-columns:\s*36px 36px 36px minmax\(0, 1fr\) 40px/)
  assert.doesNotMatch(css, /#6d28d9|#8d66d0|#7c3aed|#c4b5fd/i)
})

test("chat room route uses the full stage without the global dock", async () => {
  const app = await readFile(appPath, "utf8")
  assert.match(app, /route\.type !== "chat" && <Dock/)
  assert.match(app, /activeRoot[\s\S]*route\.type === "chat"[\s\S]*return "chats"/)
})
