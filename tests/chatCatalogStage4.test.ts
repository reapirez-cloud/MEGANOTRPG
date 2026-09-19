import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  formatRoomCompletion,
  roomContextParts,
  roomStatus,
} from "../src/chat/catalogPresentation.ts"
import type { ChatRoom } from "../src/types/chat.ts"

const pagePath = new URL("../src/pages/Chats.tsx", import.meta.url)
const hookPath = new URL("../src/hooks/useRooms.ts", import.meta.url)
const migrationPath = new URL("../supabase/migrations/20260919091521_chat_catalog_stage4_real_context.sql", import.meta.url)

function room(overrides: Partial<ChatRoom>): ChatRoom {
  return {
    id: "room",
    slug: "room",
    title: "Комната",
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
    campaign_day: 1,
    day_period: "day",
    scene_state: "active",
    is_own_character_room: false,
    context_location_id: null,
    context_location_name: null,
    context_campaign_day: null,
    context_day_period: null,
    preview: "Последнее сообщение",
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

test("stage 4 context renders only real resolved world state", () => {
  const withContext = room({
    context_location_id: "loc-1",
    context_location_name: "Старый порт",
    context_campaign_day: 12,
    context_day_period: "evening",
  })
  assert.deepEqual(roomContextParts(withContext), ["Старый порт", "День 12", "вечер"])

  const withoutLocation = room({
    context_location_id: null,
    context_location_name: null,
    context_campaign_day: 12,
    context_day_period: "evening",
  })
  assert.deepEqual(roomContextParts(withoutLocation), ["День 12", "вечер"])
})

test("stage 4 availability labels reflect actual room access state", () => {
  assert.deepEqual(roomStatus(room({ campaign_can_write: true })), {
    label: "Открыто кампании",
    tone: "live",
  })
  assert.deepEqual(roomStatus(room({ campaign_can_write: false })), {
    label: "Кампания читает",
    tone: "limited",
  })
  assert.deepEqual(roomStatus(room({ open_to_campaign: false, campaign_can_write: false })), {
    label: "По участникам",
    tone: "neutral",
  })
  assert.deepEqual(roomStatus(room({ room_state: "gm_only" })), {
    label: "Только ГМ пишет",
    tone: "limited",
  })
})

test("stage 4 completion dates use death for personal stories and close for events", () => {
  const dead = room({
    room_type: "character",
    character_life_state: "dead",
    character_died_at: "2026-09-17T12:00:00.000Z",
    closed_at: "2026-09-01T12:00:00.000Z",
  })
  const closed = room({
    room_state: "closed",
    scene_state: "closed",
    closed_at: "2026-09-18T12:00:00.000Z",
  })

  assert.match(formatRoomCompletion(dead), /^Завершено /)
  assert.match(formatRoomCompletion(dead), /17/)
  assert.match(formatRoomCompletion(closed), /^Завершено /)
  assert.match(formatRoomCompletion(closed), /18/)
})

test("stage 4 page uses factual preview/context/status across every catalog surface", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /data-chat-catalog-stage="7"/)
  assert.match(source, /roomStatus\(hero\)/)
  assert.match(source, /roomContextParts\(room\)/)
  assert.match(source, /formatRoomCompletion\(room\)/)
  assert.match(source, /chat-catalog__personal-preview/)
  assert.match(source, /room\.preview \|\| "Пока без сообщений"/)
  assert.doesNotMatch(source, /Глава\s+\d|Эпизод\s+[IVX\d]/)
})

test("stage 4 RPC resolves character/scene world context without leaking hidden location names", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(sql, /left join public\.character_world_state cws/)
  assert.match(sql, /when r\.room_type = 'character' then cws\.location_id else r\.location_id/)
  assert.match(sql, /private\.can_view_location\(ctx\.location_id, auth\.uid\(\)\)/)
  assert.match(sql, /context_location_name text/)
  assert.match(sql, /context_campaign_day integer/)
  assert.match(sql, /context_day_period text/)
})

test("stage 4 realtime refreshes when world position or visible location data changes", async () => {
  const source = await readFile(hookPath, "utf8")
  const sql = await readFile(migrationPath, "utf8")

  assert.match(source, /table: "character_world_state"/)
  assert.match(source, /table: "locations"/)
  assert.match(sql, /alter publication supabase_realtime add table public\.character_world_state/)
  assert.match(sql, /alter publication supabase_realtime add table public\.locations/)
})
