import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const presentationPath = new URL("../src/ui-v1-isolated/chat-room/chatGameEventPresentation.ts", import.meta.url)
const cardPath = new URL("../src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx", import.meta.url)
const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const feedItemPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeedItem.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)
const typesPath = new URL("../src/types/chat.ts", import.meta.url)

test("stage 4 turns every game event into one dedicated card component", async () => {
  const [card, feed, feedItem] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(feedPath, "utf8"),
    readFile(feedItemPath, "utf8"),
  ])

  assert.match(card, /export default function ChatGameEventCard/)
  assert.match(card, /presentGameEvent\(event\)/)
  assert.match(feed, /<ChatFeedItem/)
  assert.match(feedItem, /<ChatGameEventCard event=\{event\}/)
  assert.doesNotMatch(feed, /function GameEvent|function DialogueMessage/)
})

test("stage 4 roll cards expose dice, modifier and total without judging outcome", async () => {
  const presentation = await readFile(presentationPath, "utf8")

  assert.match(presentation, /function rollPresentation/)
  assert.match(presentation, /label: "Кубик"/)
  assert.match(presentation, /"Кости"/)
  assert.match(presentation, /label: "Модификатор"/)
  assert.match(presentation, /label: "Итого"/)
  assert.match(presentation, /effect\.rolls/)
  assert.doesNotMatch(presentation, /Успех|Провал|success|failure|critical/i)
})

test("stage 4 spell cards expose spell metadata and actual resource cost", async () => {
  const presentation = await readFile(presentationPath, "utf8")
  const card = await readFile(cardPath, "utf8")

  assert.match(presentation, /function spellPresentation/)
  assert.match(presentation, /detail\.split\("·"\)/)
  assert.match(presentation, /resourceCosts/)
  assert.match(presentation, /amount: numberValue/)
  assert.match(card, /"−" \+ resource\.amount/)
  assert.match(card, /resource\.current/)
  assert.match(card, /resource\.max/)
})

test("stage 4 supports attack, item and class ability without changing feed architecture", async () => {
  const [presentation, types] = await Promise.all([
    readFile(presentationPath, "utf8"),
    readFile(typesPath, "utf8"),
  ])

  assert.match(presentation, /function attackPresentation/)
  assert.match(presentation, /function itemPresentation/)
  assert.match(presentation, /function abilityPresentation/)
  assert.match(presentation, /Магическое действие/)
  assert.match(presentation, /Бонусное действие/)
  assert.match(presentation, /Реакция/)
  assert.match(types, /"attack"/)
  assert.match(types, /"item"/)
  assert.match(types, /"class_ability"/)
})

test("stage 4 keeps game cards graphite and avoids outcome colors", async () => {
  const card = await readFile(cardPath, "utf8")
  assert.doesNotMatch(card, /success|failure|critical|green|red/i)
})


test("reference stage 4 makes dialogue the default lightweight feed surface", async () => {
  const [feed, feedItem, css] = await Promise.all([
    readFile(feedPath, "utf8"),
    readFile(feedItemPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(feed, /data-chat-feed-stage="4"/)
  assert.match(feed, /data-feed-entry-type=\{event\.type\}/)
  assert.match(feedItem, /className="u1-chat-line"/)
  assert.match(feedItem, /data-message-kind=\{gmNarration \? "narration" : "dialogue"\}/)
  assert.match(feedItem, /className="u1-chat-line__media"/)
  assert.match(css, /Reference rebuild — feed stage 4/)
  assert.match(css, /\.u1-chat-line \{[\s\S]*grid-template-columns: 30px minmax\(0, 1fr\)/)
  assert.match(css, /\.u1-chat-line__content \{[\s\S]*max-width: min\(92%, 630px\)/)
})

test("reference stage 4 removes the oversized full-height event icon rail", async () => {
  const [card, css] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(card, /<header className="u1-room-game-card__header">/)
  assert.match(card, /u1-room-game-card__icon/)
  assert.match(card, /u1-room-game-card__eyebrow/)
  assert.match(css, /data-chat-feed-stage="4"[\s\S]*\.u1-room-game-card \{[\s\S]*display: block;/)
  assert.match(css, /\.u1-room-game-card__icon \{[\s\S]*width: 18px;[\s\S]*height: 18px;[\s\S]*border: 0;/)
  assert.match(css, /\.u1-room-game-card__stats > div \{[\s\S]*min-height: 34px;/)
})

test("reference stage 4 preserves scroll ownership and history anchoring", async () => {
  const feed = await readFile(feedPath, "utf8")

  assert.match(feed, /pendingRestoreRef/)
  assert.match(feed, /heightDelta = feed\.scrollHeight - restore\.scrollHeight/)
  assert.match(feed, /pinnedToBottomRef/)
  assert.match(feed, /BOTTOM_THRESHOLD/)
  assert.match(feed, /LOAD_OLDER_THRESHOLD/)
  assert.match(feed, /unseenCount/)
})
