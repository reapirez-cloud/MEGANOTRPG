import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const feedItemPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeedItem.tsx", import.meta.url)
const eventModelPath = new URL("../src/ui-v1-isolated/chat-room/chatEventModel.ts", import.meta.url)

test("chat ownership stage 1 derives side from the sending account", async () => {
  const [room, feed, feedItem] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(feedPath, "utf8"),
    readFile(feedItemPath, "utf8"),
  ])

  assert.match(
    room,
    /<ChatFeed roomId=\{roomId\} viewerUserId=\{model\.viewer\.userId\} \/>/,
  )
  assert.match(feed, /event\.author\.userId === viewerUserId/)
  assert.match(feed, /event\.type === "system" \? "system" : isOwn \? "own" : "other"/)
  assert.match(feed, /data-feed-entry-side=\{side\}/)
  assert.match(feedItem, /data-message-side=\{isOwn \? "own" : "other"\}/)
})

test("chat ownership stage 1 keeps GM speaker identity dynamic and independent", async () => {
  const [feedItem, eventModel] = await Promise.all([
    readFile(feedItemPath, "utf8"),
    readFile(eventModelPath, "utf8"),
  ])

  assert.match(feedItem, /src=\{event\.author\.avatarUrl\}/)
  assert.match(feedItem, /<strong>\{event\.author\.name\}<\/strong>/)
  assert.match(eventModel, /characterId: message\.character_id/)
  assert.match(eventModel, /avatarUrl: message\.author_avatar_url/)
  assert.match(eventModel, /message\.author_name\.trim\(\)/)
  assert.doesNotMatch(feedItem, /viewerUserId/)
})
