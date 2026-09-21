import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const catalogPath = new URL("../src/ui-v1-isolated/ChatCatalog.tsx", import.meta.url)
const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const hookPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("stage 1 mounts a new isolated chat-room route", async () => {
  const [app, catalog] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(catalogPath, "utf8"),
  ])

  assert.match(app, /type: "chat-room"; roomId: string/)
  assert.match(app, /path\.startsWith\("chats\/"\)/)
  assert.match(app, /<ChatRoomScreen roomId=\{route\.roomId\}/)
  assert.match(app, /route\.type !== "chat-room" && <Dock/)
  assert.match(catalog, /import \{ pushAppHash \} from "\.\/navigationGestures"/)
  assert.match(catalog, /pushAppHash\("chats\/" \+ encodeURIComponent\(room\.id\)\)/)
  assert.doesNotMatch(catalog, /window\.location\.hash\s*=/)
})

test("stage 1 header uses real character hp, world time and location", async () => {
  const hook = await readFile(hookPath, "utf8")

  assert.match(hook, /get_campaign_chat_rooms/)
  assert.match(hook, /get_chat_room_viewer_context_v1/)
  assert.match(hook, /from\("character_sheets"\)/)
  assert.match(hook, /current_hp, max_hp, temp_hp/)
  assert.match(hook, /from\("character_world_state"\)/)
  assert.match(hook, /from\("locations"\)/)
  assert.doesNotMatch(hook, /chat_messages/)
})

test("stage 1 contains only the room foundation and character header", async () => {
  const [room, header, css] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(headerPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(room, /data-chat-room-stage="8"/)
  assert.match(room, /<ChatRoomHeader/)
  assert.match(header, /Время суток/)
  assert.match(header, /Локация/)
  assert.match(header, /<HpBlock/)
  assert.doesNotMatch(room + header, /ChatDrawer|attachment/)
  assert.doesNotMatch(room + header, /components\/chat|chat-runtime|pages\/ChatRoom/)
  assert.match(css, /#101214/)
  assert.match(css, /#0a0c0e/)
  assert.doesNotMatch(css, /#7c3aed|#8d66d0|#c4b5fd|#d4af37/i)
})
