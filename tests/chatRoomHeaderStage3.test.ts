import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("stage 3 moves the fixed game header into one dedicated component", async () => {
  const [room, header] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(headerPath, "utf8"),
  ])

  assert.match(room, /import ChatRoomHeader from "\.\/ChatRoomHeader"/)
  assert.match(room, /data-chat-room-header-stage="3"/)
  assert.match(room, /<ChatRoomHeader[\s\S]*model=\{model\}[\s\S]*showQuickActions=\{hasCharacterIdentity\}/)
  assert.doesNotMatch(room, /function CharacterHeader|function QuickActions|function HpBlock/)
  assert.match(header, /function SceneContext/)
  assert.match(header, /function QuickActions/)
  assert.match(header, /function HpBlock/)
})

test("stage 3 separates actor identity from time and location instead of nesting a hero card", async () => {
  const [header, css] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(header, /className="u1-room-character"/)
  assert.match(header, /<SceneContext model=\{model\} \/>/)
  assert.match(header, /aria-label="Контекст сцены"/)
  assert.match(header, /data-context="time"/)
  assert.match(header, /data-context="location"/)
  assert.match(css, /data-chat-room-header-stage="3"[\s\S]*\.u1-room-character \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/)
  assert.match(css, /grid-template-columns: 50px minmax\(0, 1fr\)/)
  assert.match(css, /\.u1-room-character__portrait \{[\s\S]*width: 50px;[\s\S]*height: 50px;/)
})

test("stage 3 keeps direct quick actions compact and attack conditional", async () => {
  const [header, css] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  for (const label of ["Инвентарь", "Классовые умения", "Заклинания", "Атака"]) {
    assert.match(header, new RegExp(label))
  }

  assert.match(header, /hasEquippedWeapon[\s\S]*id: "attack"/)
  assert.match(header, /data-action-count=\{actions\.length\}/)
  assert.match(header, /CHAT_ACTION_REQUEST_EVENT/)
  assert.match(header, /data-action-mode=\{action\.mode\}/)
  assert.match(css, /data-chat-room-header-stage="3"[\s\S]*\.u1-room-quick-action \{[\s\S]*min-height: 36px;/)
  assert.match(css, /u1-room-quick-actions\[data-action-count="3"\]/)
})

test("stage 3 keeps narrow and short viewport variants compact", async () => {
  const css = await readFile(cssPath, "utf8")

  assert.match(css, /@media \(max-width: 360px\)/)
  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(max-height: 560px\) and \(orientation: landscape\)/)
  assert.match(css, /data-chat-room-header-stage="3"/)
})
