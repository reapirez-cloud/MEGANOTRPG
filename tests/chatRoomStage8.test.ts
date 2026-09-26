import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const shellPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const eventsPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomEvents.ts", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const hostPath = new URL("../src/ui-v1-isolated/chat-room/ChatActionHost.tsx", import.meta.url)
const panelPath = new URL("../src/ui-v1-isolated/chat-room/ChatActionPanel.tsx", import.meta.url)
const modifierPath = new URL("../src/ui-v1-isolated/chat-room/ChatSpellModifierPanel.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)
const viewportPath = new URL("../src/ui-v1-isolated/chat-room/useChatVisualViewport.ts", import.meta.url)
const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const mainPath = new URL("../src/ui-v1-isolated/main.tsx", import.meta.url)
const indexPath = new URL("../index.html", import.meta.url)

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

test("stage 8 keeps actor context visible but all game actions behind plus", async () => {
  const [header, composer] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(composerPath, "utf8"),
  ])

  assert.match(header, /Время суток/)
  assert.match(header, /Локация/)
  assert.doesNotMatch(header, /QuickActions|Инвентарь|Классовые умения|Заклинания/)
  assert.match(composer, /className="u1-chat-composer__plus"/)
  assert.match(composer, /label: "Инвентарь"/)
  assert.match(composer, /label: "Способности"/)
  assert.match(composer, /label: "Заклинания"/)
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
  assert.match(css, /focus-visible/)
})

test("stage 8 keeps the composer above Android and Telegram keyboards", async () => {
  const [room, css, viewport] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(cssPath, "utf8"),
    readFile(viewportPath, "utf8"),
  ])

  assert.match(room, /data-keyboard-open=/)
  assert.match(room, /useChatVisualViewport/)
  assert.match(viewport, /viewport\?\.height/)
  assert.match(viewport, /viewport\?\.offsetTop/)
  assert.match(viewport, /viewportHeight/)
  assert.match(viewport, /viewportStableHeight/)
  assert.match(viewport, /viewportChanged/)
  assert.match(viewport, /virtualKeyboard/)
  assert.match(viewport, /Math\.max\(\s*160,/)
  assert.doesNotMatch(viewport, /Math\.max\(280,/)
  assert.match(viewport, /focusin/)
  assert.match(viewport, /focusout/)
  assert.match(css, /Mobile composer keyboard fix/)
  assert.match(
    css,
    /data-keyboard-open[\s\S]*\.u1-chat-composer \{[\s\S]*padding-bottom: 9px;/,
  )
  assert.match(
    css,
    /\.u1-chat-composer \{[\s\S]*calc\(16px \+ var\(--u1-safe-bottom/,
  )
})

test("stage 8 keeps legacy visual chat panels outside the active room graph", async () => {
  const [room, header, feed, composer, host, panel, modifier] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(headerPath, "utf8"),
    readFile(feedPath, "utf8"),
    readFile(composerPath, "utf8"),
    readFile(hostPath, "utf8"),
    readFile(panelPath, "utf8"),
    readFile(modifierPath, "utf8"),
  ])

  const activeRoom = room + header + feed + composer + host + panel + modifier
  assert.doesNotMatch(
    activeRoom,
    /ChatActionSheet|ChatSpellModifierSheet|ChatContextSheet|ChatActorPicker|ChatRoomSettings|PreparedChatRoom|pages\/ChatRoom/,
  )
  assert.match(activeRoom, /ChatActionPanel/)
  assert.match(activeRoom, /u1-chat-action-panel/)
})
