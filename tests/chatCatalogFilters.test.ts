import assert from "node:assert/strict"
import test from "node:test"

import {
  chatCatalogSectionVisible,
  filterChatCatalogRooms,
  matchesChatCatalogSearch,
} from "../src/chat/catalogFilters.ts"
import type { ChatRoom } from "../src/types/chat.ts"

function room(overrides: Partial<ChatRoom> = {}): ChatRoom {
  return {
    id: "room",
    slug: "room",
    title: "Старый порт",
    category: "game",
    room_type: "scene",
    position: 1,
    avatar_url: null,
    character_id: null,
    character_life_state: null,
    open_to_campaign: true,
    is_read_only: false,
    room_state: "open",
    campaign_can_write: true,
    location_id: null,
    campaign_day: 4,
    day_period: "evening",
    scene_state: "active",
    is_own_character_room: false,
    context_location_id: "loc",
    context_location_name: "Казематы",
    context_campaign_day: 4,
    context_day_period: "evening",
    preview: "Вильям: Идём вниз",
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

test("catalog search is case-insensitive and covers title, preview, visible location and extra metadata", () => {
  const sample = room()

  assert.equal(matchesChatCatalogSearch(sample, "СТАРЫЙ"), true)
  assert.equal(matchesChatCatalogSearch(sample, "вильям"), true)
  assert.equal(matchesChatCatalogSearch(sample, "казематы"), true)
  assert.equal(matchesChatCatalogSearch(sample, "паладин", "Паладин · 5 ур."), true)
  assert.equal(matchesChatCatalogSearch(sample, "друид"), false)
})

test("section filters hide unrelated catalog groups", () => {
  assert.equal(chatCatalogSectionVisible("personal", "personal"), true)
  assert.equal(chatCatalogSectionVisible("personal", "events"), false)
  assert.equal(chatCatalogSectionVisible("events", "events"), true)
  assert.equal(chatCatalogSectionVisible("completed", "completed"), true)
  assert.equal(chatCatalogSectionVisible("unread", "flood"), true)
})

test("unread filter keeps only rooms with unread messages", () => {
  const rooms = [
    room({ id: "read", unread_count: 0 }),
    room({ id: "unread", unread_count: 3 }),
  ]

  const result = filterChatCatalogRooms({
    rooms,
    query: "",
    filter: "unread",
    section: "events",
  })

  assert.deepEqual(result.map((item) => item.id), ["unread"])
})
