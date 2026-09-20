import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const shellPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const eventsPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomEvents.ts", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)
const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const mainPath = new URL("../src/ui-v1-isolated/main.tsx", import.meta.url)
const indexPath = new URL("../index.html", import.meta.url)
const presentationPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomPresentation.ts", import.meta.url)

test("stage 8 is the final isolated room runtime", async () => {
  const [room, app, main, index] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(mainPath, "utf8"),
    readFile(indexPath, "utf8"),
  ])

  assert.match(room, /data-chat-room-stage="8"/)
  assert.match(room, /import "\.\/chat-room\.css"/)
  assert.match(app, /import ChatRoomScreen from "\.\/chat-room\/ChatRoomScreen"/)
  assert.match(index, /\/src\/ui-v1-isolated\/main\.tsx/)
  assert.doesNotMatch(app + main, /pages\/ChatRoom|PreparedChatRoom|chat-v11|chat-release-fixes|chat-preview-v4/)
})

test("stage 8 hides character actions when the room cannot be written", async () => {
  const [room, presentation] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(presentationPath, "utf8"),
  ])

  assert.match(presentation, /showQuickActions: model\.canWrite && hasCharacter/)
  assert.match(presentation, /canCompose/)
  assert.match(room, /data-observer=\{presentation\.identityKind === "observer" \|\| undefined\}/)
  assert.match(room, /data-read-only=\{model\.readOnly \|\| undefined\}/)
})

test("stage 8 rejects a stale GM actor before rendering it", async () => {
  const shell = await readFile(shellPath, "utf8")

  assert.match(shell, /from\("chat_actor_bindings"\)/)
  assert.match(shell, /\.eq\("character_type", "npc"\)/)
  assert.match(shell, /\.eq\("life_state", "alive"\)/)
})

test("stage 8 marks only actually reached latest messages as read", async () => {
  const [events, feed] = await Promise.all([
    readFile(eventsPath, "utf8"),
    readFile(feedPath, "utf8"),
  ])

  assert.match(events, /rpc\("mark_chat_read"/)
  assert.match(feed, /markLatestRead/)
  assert.match(feed, /pinnedToBottomRef/)
  assert.match(feed, /lastMarkedReadRef/)
  assert.match(feed, /if \(pinned\)/)
})

test("stage 8 closes the GM identity menu on outside tap and Escape", async () => {
  const composer = await readFile(composerPath, "utf8")

  assert.match(composer, /document\.addEventListener\("pointerdown"/)
  assert.match(composer, /event\.key !== "Escape"/)
  assert.match(composer, /speakerTriggerRef\.current\?\.focus\(\)/)
})

test("stage 8 protects narrow and short screens without clipping core labels", async () => {
  const css = await readFile(cssPath, "utf8")

  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(max-height: 560px\) and \(orientation: landscape\)/)
  assert.match(css, /overflow-wrap: anywhere/)
  assert.match(css, /-webkit-line-clamp: 2/)
  assert.match(css, /u1-room-quick-action > span:last-child/)
  assert.match(css, /u1-room-game-card__title > strong/)
  assert.match(css, /focus-visible/)
})

test("stage 8 keeps old chat panels outside the active room", async () => {
  const [room, feed, composer] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(feedPath, "utf8"),
    readFile(composerPath, "utf8"),
  ])

  const activeRoom = room + feed + composer
  assert.doesNotMatch(
    activeRoom,
    /ChatActionSheet|ChatContextSheet|ChatActorPicker|ChatRoomSettings|PreparedChatRoom|pages\/ChatRoom|components\/chat/,
  )
})
