import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { buildChatCatalogModel } from "../src/chat/catalogModel.ts"
import type { ChatRoom } from "../src/types/chat.ts"

const hookPath = new URL("../src/hooks/useRooms.ts", import.meta.url)
const migrationPath = new URL("../supabase/migrations/20260919090019_chat_catalog_stage2_read_model.sql", import.meta.url)

function room(overrides: Partial<ChatRoom>): ChatRoom {
  return {
    id: "room-default",
    slug: "room-default",
    title: "Комната",
    category: "game",
    room_type: "scene",
    position: 10,
    avatar_url: null,
    character_id: null,
    character_life_state: null,
    open_to_campaign: true,
    is_read_only: false,
    room_state: "open",
    campaign_can_write: false,
    location_id: null,
    campaign_day: 1,
    day_period: "day",
    scene_state: "active",
    is_own_character_room: false,
    preview: "",
    time: "",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    closed_at: null,
    character_died_at: null,
    last_message_at: null,
    last_message_id: null,
    unread_count: 0,
    ...overrides,
  }
}

test("catalog selects the most recently active gameplay room and never flood", () => {
  const catalog = buildChatCatalogModel([
    room({
      id: "flood",
      slug: "flood",
      room_type: "flood",
      category: "flood",
      last_message_at: "2026-09-20T00:00:00.000Z",
    }),
    room({
      id: "personal",
      slug: "personal",
      room_type: "character",
      character_id: "pc-1",
      character_life_state: "alive",
      last_message_at: "2026-09-18T00:00:00.000Z",
    }),
    room({
      id: "event",
      slug: "event",
      last_message_at: "2026-09-19T00:00:00.000Z",
    }),
  ])

  assert.equal(catalog.currentStory?.id, "event")
  assert.equal(catalog.flood?.id, "flood")
  assert.deepEqual(catalog.personalActive.map((item) => item.id), ["personal"])
  assert.deepEqual(catalog.eventsActive.map((item) => item.id), ["event"])
})

test("active catalog ordering falls back to room timestamps when no message exists", () => {
  const catalog = buildChatCatalogModel([
    room({
      id: "older",
      slug: "older",
      updated_at: "2026-09-10T00:00:00.000Z",
    }),
    room({
      id: "newer",
      slug: "newer",
      updated_at: "2026-09-12T00:00:00.000Z",
    }),
  ])

  assert.deepEqual(catalog.eventsActive.map((item) => item.id), ["newer", "older"])
  assert.equal(catalog.currentStory?.id, "newer")
})

test("completed catalog uses death time for characters and close time for events", () => {
  const catalog = buildChatCatalogModel([
    room({
      id: "dead-character",
      slug: "dead-character",
      room_type: "character",
      character_id: "pc-dead",
      character_life_state: "dead",
      character_died_at: "2026-09-18T00:00:00.000Z",
      closed_at: "2026-09-01T00:00:00.000Z",
    }),
    room({
      id: "closed-event",
      slug: "closed-event",
      room_state: "closed",
      scene_state: "closed",
      closed_at: "2026-09-19T00:00:00.000Z",
    }),
  ])

  assert.deepEqual(catalog.completed.map((item) => item.id), [
    "closed-event",
    "dead-character",
  ])
})

test("room hook preserves raw timestamps and returns the catalog read-model", async () => {
  const source = await readFile(hookPath, "utf8")

  assert.match(source, /last_message_at: room\.last_message_at \|\| null/)
  assert.match(source, /created_at: room\.created_at/)
  assert.match(source, /closed_at: room\.closed_at \|\| null/)
  assert.match(source, /character_died_at: room\.character_died_at \|\| null/)
  assert.match(source, /const catalog = useMemo\(\(\) => buildChatCatalogModel\(rooms\), \[rooms\]\)/)
  assert.match(source, /rooms, catalog, campaignId/)
})

test("stage 2 migration exposes lifecycle timestamps and publishes catalog lifecycle tables", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(sql, /created_at timestamptz/)
  assert.match(sql, /updated_at timestamptz/)
  assert.match(sql, /closed_at timestamptz/)
  assert.match(sql, /character_died_at timestamptz/)
  assert.match(sql, /last_message_at timestamptz/)
  assert.match(sql, /alter publication supabase_realtime add table public\.chat_rooms/)
  assert.match(sql, /alter publication supabase_realtime add table public\.characters/)
})
