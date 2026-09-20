import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const eventsPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomEvents.ts", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const viewportPath = new URL("../src/ui-v1-isolated/chat-room/useChatVisualViewport.ts", import.meta.url)
const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room-stage1.css", import.meta.url)

test("stage 6 follows new messages only when appropriate", async () => {
  const feed = await readFile(feedPath, "utf8")

  assert.match(feed, /BOTTOM_THRESHOLD = 96/)
  assert.match(feed, /pinnedToBottomRef/)
  assert.match(feed, /forceFollowNextRef/)
  assert.match(feed, /unseenCount/)
  assert.match(feed, /Новые сообщения/)
  assert.match(feed, /CHAT_MESSAGE_SENT_EVENT/)
  assert.match(feed, /scrollToBottom\("smooth"\)/)
})

test("stage 6 loads older history without losing visual position", async () => {
  const [feed, events] = await Promise.all([
    readFile(feedPath, "utf8"),
    readFile(eventsPath, "utf8"),
  ])

  assert.match(events, /\.lt\("id", oldestId\)/)
  assert.match(events, /loadOlder/)
  assert.match(events, /mergeEvents/)
  assert.match(feed, /pendingRestoreRef/)
  assert.match(feed, /heightDelta/)
  assert.match(feed, /restore\.scrollTop \+ Math\.max\(0, heightDelta\)/)
  assert.match(feed, /LOAD_OLDER_THRESHOLD = 72/)
})

test("stage 6 keeps realtime refresh separate from initial loading", async () => {
  const events = await readFile(eventsPath, "utf8")

  assert.match(events, /refreshing/)
  assert.match(events, /refreshLatest/)
  assert.match(
    events,
    /const refreshLatest[\s\S]*setEvents\(\(current\) => mergeEvents\(current, normalized\)\)/,
  )
})

test("stage 6 composer signals own sends and keeps focus", async () => {
  const composer = await readFile(composerPath, "utf8")

  assert.match(composer, /CHAT_MESSAGE_SENT_EVENT/)
  assert.match(composer, /textareaRef\.current\.focus\(\)/)
  assert.match(composer, /aria-busy=\{sending\}/)
  assert.match(composer, /u1-chat-composer__sending-dot/)
})

test("stage 6 tracks mobile visual viewport for the keyboard", async () => {
  const [viewport, room] = await Promise.all([
    readFile(viewportPath, "utf8"),
    readFile(roomPath, "utf8"),
  ])

  assert.match(viewport, /window\.visualViewport/)
  assert.match(viewport, /addEventListener\("resize"/)
  assert.match(viewport, /addEventListener\("scroll"/)
  assert.match(room, /useChatVisualViewportHeight/)
  assert.match(room, /--u1-chat-viewport-height/)
  assert.match(room, /data-chat-room-stage="6"/)
})

test("stage 6 uses a shared motion layer and respects reduced motion", async () => {
  const css = await readFile(cssPath, "utf8")

  assert.match(css, /--u1-chat-motion-fast/)
  assert.match(css, /--u1-chat-motion-enter/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /u1-room-feed__new/)
  assert.match(css, /u1-chat-composer__sending-dot/)
})
