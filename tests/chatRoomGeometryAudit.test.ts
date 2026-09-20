import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomCssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)
const actionCssPath = new URL("../src/ui-v1-isolated/chat-room/chat-action-panel.css", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)

test("chat geometry audit locks square controls and bounded icons", async () => {
  const [roomCss, actionCss] = await Promise.all([
    readFile(roomCssPath, "utf8"),
    readFile(actionCssPath, "utf8"),
  ])

  assert.match(roomCss, /Final geometry audit/)
  assert.match(roomCss, /\.u1-chat-composer__speaker-trigger,[\s\S]*aspect-ratio: 1;/)
  assert.match(roomCss, /\.u1-room-context__icon \{[\s\S]*aspect-ratio: 1;/)
  assert.match(roomCss, /\.u1-room-game-card__icon \{[\s\S]*aspect-ratio: 1;/)
  assert.match(roomCss, /\.u1-chat-line__avatar \{[\s\S]*aspect-ratio: 1;/)

  assert.match(actionCss, /Geometry\/readability audit/)
  assert.match(actionCss, /\.u1-chat-action-list__icon \{[\s\S]*aspect-ratio: 1;/)
  assert.match(actionCss, /\.u1-chat-roll__dice button \{[\s\S]*aspect-ratio: 1;/)
  assert.match(actionCss, /\.u1-chat-action-head > button \{[\s\S]*aspect-ratio: 1;/)
})

test("chat geometry audit keeps text readable and prevents horizontal leakage", async () => {
  const [roomCss, actionCss] = await Promise.all([
    readFile(roomCssPath, "utf8"),
    readFile(actionCssPath, "utf8"),
  ])

  assert.match(roomCss, /\.u1-chat-line__body \{[\s\S]*font-size: 12px;/)
  assert.match(roomCss, /\.u1-chat-composer__field textarea \{[\s\S]*font-size: 12px;/)
  assert.match(roomCss, /\.u1-room-feed \{[\s\S]*overflow-x: hidden;/)
  assert.match(roomCss, /grid-template-columns: repeat\(auto-fit, minmax\(72px, 1fr\)\)/)

  assert.match(actionCss, /\.u1-chat-action-body \{[\s\S]*overflow-x: hidden;/)
  assert.match(actionCss, /\.u1-chat-action-list > button \{[\s\S]*overflow: hidden;/)
  assert.match(actionCss, /\.u1-chat-action-resources > span \{[\s\S]*max-width: min\(220px, 82vw\);/)
})

test("time and location keep visible labels on narrow phones", async () => {
  const [header, roomCss] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(roomCssPath, "utf8"),
  ])

  assert.match(header, /<span>Время суток<\/span>/)
  assert.match(header, /<span>Локация<\/span>/)
  assert.match(
    roomCss,
    /@media \(max-width: 360px\)[\s\S]*\.u1-room-context__copy > span \{[\s\S]*display: block;/,
  )
})
