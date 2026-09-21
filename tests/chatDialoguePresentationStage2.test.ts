import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const feedItemPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeedItem.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("chat dialogue stage 2 keeps account side separate from dynamic actor identity", async () => {
  const [feed, item] = await Promise.all([
    readFile(feedPath, "utf8"),
    readFile(feedItemPath, "utf8"),
  ])

  assert.match(feed, /event\.author\.userId === viewerUserId/)
  assert.match(feed, /previous\.author\.characterId === current\.author\.characterId/)
  assert.match(feed, /previous\.author\.name === current\.author\.name/)
  assert.match(item, /src=\{event\.author\.avatarUrl\}/)
  assert.match(item, /data-message-side=\{isOwn \? "own" : "other"\}/)
  assert.match(item, /data-chat-dialogue-stage="2"/)
})

test("chat dialogue stage 2 groups only nearby consecutive messages from the same persona", async () => {
  const feed = await readFile(feedPath, "utf8")

  assert.match(feed, /DIALOGUE_GROUP_WINDOW_MS = 5 \* 60 \* 1000/)
  assert.match(feed, /dialogueGroupPosition\(events, index\)/)
  assert.match(feed, /data-message-group=\{isDialogueEvent\(event\) \? groupPosition : undefined\}/)
  assert.match(feed, /if \(joinsPrevious && joinsNext\) return "middle"/)
  assert.match(feed, /if \(joinsNext\) return "first"/)
})

test("chat dialogue stage 2 removes the repeated player badge but preserves GM identity", async () => {
  const item = await readFile(feedItemPath, "utf8")

  assert.match(item, /showAuthor && gmAuthored/)
  assert.match(item, /gmNarration \? "GM · Рассказчик" : "GM"/)
  assert.doesNotMatch(item, /: "Игрок"/)
  assert.match(item, /u1-chat-line__avatar-spacer/)
})

test("chat dialogue stage 2 renders graphite left and right bubbles with readable type", async () => {
  const css = await readFile(cssPath, "utf8")

  assert.match(css, /Dialogue presentation stage 2/)
  assert.match(css, /\[data-message-side="own"\][\s\S]*grid-template-columns: minmax\(0, 1fr\) 32px/)
  assert.match(css, /\[data-message-side="own"\][\s\S]*justify-self: end/)
  assert.match(css, /max-width: min\(82%, 620px\)/)
  assert.match(css, /font-size: 13px/)
  assert.match(css, /rgba\(18,21,23,\.90\)/)
  assert.match(css, /border-radius: 14px 14px 5px 14px/)
  assert.match(css, /data-feed-entry-side="system"[\s\S]*justify-content: center/)
})
