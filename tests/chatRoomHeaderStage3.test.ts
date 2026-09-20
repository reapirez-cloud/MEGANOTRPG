import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("stage 3 keeps one compact actor header followed by scene context", async () => {
  const [room, header] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(headerPath, "utf8"),
  ])

  assert.match(room, /import ChatRoomHeader from "\.\/ChatRoomHeader"/)
  assert.match(room, /data-chat-room-header-stage="3"/)
  assert.match(room, /<ChatRoomHeader model=\{model\} \/>/)
  assert.match(header, /function HpBlock/)
  assert.match(header, /function SceneContext/)
  assert.match(header, /className="u1-room-character"/)
  assert.match(header, /<SceneContext model=\{model\} \/>/)
})

test("stage 3 shows time of day and location directly under the actor without campaign day", async () => {
  const header = await readFile(headerPath, "utf8")

  assert.match(header, /<span>Время суток<\/span>/)
  assert.match(header, /<strong>\{dayPeriod\}<\/strong>/)
  assert.match(header, /<span>Локация<\/span>/)
  assert.match(header, /<strong title=\{location\}>\{location\}<\/strong>/)
  assert.doesNotMatch(header, /День \{model\.context\.campaignDay\}/)
  assert.doesNotMatch(header, /campaignDay/)
})

test("stage 3 removes direct inventory, ability, spell and attack buttons from the header", async () => {
  const [header, composer] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(composerPath, "utf8"),
  ])

  assert.doesNotMatch(header, /QuickActions|QuickActionIcon|CHAT_ACTION_REQUEST_EVENT/)
  for (const label of ["Инвентарь", "Способности", "Заклинания", "Атака"]) {
    assert.doesNotMatch(header, new RegExp(label))
    assert.match(composer, new RegExp(label))
  }
  assert.match(composer, /className="u1-chat-composer__plus"/)
  assert.match(composer, /ACTION_MENU_ITEMS/)
})

test("stage 3 keeps narrow and short viewport variants compact", async () => {
  const css = await readFile(cssPath, "utf8")

  assert.match(css, /@media \(max-width: 360px\)/)
  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(max-height: 560px\) and \(orientation: landscape\)/)
  assert.match(css, /data-chat-room-header-stage="3"/)
})
