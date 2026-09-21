import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const framePath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomFrame.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("reference rebuild stage 1 mounts one viewport frame around the isolated runtime", async () => {
  const [room, frame] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(framePath, "utf8"),
  ])

  assert.match(room, /data-chat-room-stage="8"/)
  assert.match(room, /data-chat-room-layout-stage="1"/)
  assert.match(room, /import ChatRoomFrame from "\.\/ChatRoomFrame"/)
  assert.match(room, /<ChatRoomFrame>[\s\S]*<ChatFeed roomId=\{roomId\} viewerUserId=\{model\.viewer\.userId\} \/>[\s\S]*<ChatComposer model=\{model\} \/>[\s\S]*<\/ChatRoomFrame>/)
  assert.match(frame, /className="u1-room-frame"/)
  assert.match(frame, /data-chat-frame="reference-layout"/)
})

test("reference rebuild stage 1 gives the feed the remaining viewport", async () => {
  const [room, css] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(room, /u1-room-frame__head/)
  assert.match(room, /u1-room-frame__feed/)
  assert.match(room, /u1-room-frame__controls/)
  assert.match(css, /\.u1-room-frame \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.match(css, /\.u1-room-frame__feed \{[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;/)
  assert.match(css, /\.u1-room-frame__controls \{[\s\S]*z-index: 3;/)
})

test("reference rebuild stage 1 keeps the actor and scene context compact", async () => {
  const css = await readFile(cssPath, "utf8")

  assert.match(css, /data-chat-room-layout-stage="1"[\s\S]*\.u1-room-character/)
  assert.match(css, /grid-template-columns: 56px minmax\(0, 1fr\)/)
  assert.match(css, /\.u1-room-character__portrait \{[\s\S]*width: 56px;[\s\S]*min-height: 64px;/)
  assert.match(css, /\.u1-room-context/)
  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(max-height: 560px\) and \(orientation: landscape\)/)
})
