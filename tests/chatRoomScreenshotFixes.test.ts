import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeedItem.tsx", import.meta.url)
const cardPath = new URL("../src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("chat header splits actor from stacked time and location", async () => {
  const [header, css] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(header, /<span>Время суток<\/span>/)
  assert.match(header, /<span>Локация<\/span>/)
  assert.match(css, /grid-template-areas: "actor context"/)
  assert.match(css, /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/)
})

test("character header opens the actual character route", async () => {
  const header = await readFile(headerPath, "utf8")
  assert.match(header, /u1-room-character--interactive/)
  assert.match(header, /import \{ pushAppHash \} from "\.\.\/navigationGestures"/)
  assert.match(header, /pushAppHash\(/)
  assert.match(header, /"workspace\/character\/" \+ encodeURIComponent\(character\.id\)/)
})

test("feed makes GM and player authors explicit", async () => {
  const [feed, css] = await Promise.all([
    readFile(feedPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(feed, /data-author-role=/)
  assert.match(feed, /GM · Рассказчик/)
  assert.match(feed, /: "Игрок"/)
  assert.match(css, /data-author-role="gm"/)
})

test("spell and ability cards open database-backed details", async () => {
  const card = await readFile(cardPath, "utf8")

  assert.match(card, /spell_catalog/)
  assert.match(card, /character_template_assignments/)
  assert.match(card, /rule_template_levels/)
  assert.match(card, /Нажмите для описания/)
  assert.match(card, /u1-room-game-detail/)
})

test("speaker artwork fills its button", async () => {
  const css = await readFile(cssPath, "utf8")

  assert.match(
    css,
    /speaker-trigger > \.u1-chat-composer__speaker-avatar\[data-compact\][\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*width: 100%;[\s\S]*height: 100%;/,
  )
})
