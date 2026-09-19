import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { buildChatCatalogModel } from "../src/chat/catalogModel.ts"
import type { ChatRoom } from "../src/types/chat.ts"

const migrationPath = new URL(
  "../supabase/migrations/20260919092339_chat_catalog_stage5_personal_lifecycle.sql",
  import.meta.url,
)

function personal(overrides: Partial<ChatRoom> = {}): ChatRoom {
  return {
    id: "pc-room",
    slug: "character-pc",
    title: "Герой",
    category: "game",
    room_type: "character",
    position: 10,
    avatar_url: null,
    character_id: "pc-1",
    character_life_state: "alive",
    open_to_campaign: true,
    is_read_only: false,
    room_state: "open",
    campaign_can_write: false,
    location_id: null,
    campaign_day: 1,
    day_period: "day",
    scene_state: "active",
    is_own_character_room: true,
    context_location_id: null,
    context_location_name: null,
    context_campaign_day: 1,
    context_day_period: "day",
    preview: "История началась",
    time: "12:00",
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    closed_at: null,
    character_died_at: null,
    last_message_at: "2026-09-01T12:00:00.000Z",
    last_message_id: 1,
    unread_count: 0,
    ...overrides,
  }
}

test("new living PC history is active", () => {
  const catalog = buildChatCatalogModel([personal()])
  assert.deepEqual(catalog.personalActive.map((room) => room.id), ["pc-room"])
  assert.equal(catalog.completed.length, 0)
})

test("death moves personal history to completed", () => {
  const catalog = buildChatCatalogModel([personal({
    character_life_state: "dead",
    is_read_only: true,
    character_died_at: "2026-09-19T12:00:00.000Z",
  })])
  assert.equal(catalog.personalActive.length, 0)
  assert.deepEqual(catalog.completed.map((room) => room.id), ["pc-room"])
})

test("revival returns history to active despite stale room closure metadata", () => {
  const catalog = buildChatCatalogModel([personal({
    character_life_state: "alive",
    room_state: "closed",
    closed_at: "2026-09-18T12:00:00.000Z",
  })])
  assert.deepEqual(catalog.personalActive.map((room) => room.id), ["pc-room"])
  assert.equal(catalog.completed.length, 0)
})

test("database owns personal-room lifecycle and rejects manual closure", async () => {
  const sql = await readFile(migrationPath, "utf8")
  assert.match(sql, /private\.ensure_character_chat_room/)
  assert.match(sql, /is_read_only = \(v_character\.life_state = 'dead'\)/)
  assert.match(sql, /v_changed_to_dead/)
  assert.match(sql, /v_changed_to_alive/)
  assert.match(sql, /set active_character_id = null/)
  assert.match(sql, /if v_room_type = 'character' then/)
  assert.match(sql, /Personal history state follows character life state/)
  assert.match(sql, /closed_at = null/)
})
