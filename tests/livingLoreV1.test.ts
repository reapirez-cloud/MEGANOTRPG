import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync("supabase/migrations/20260925190039_living_lore_v1.sql", "utf8")
const hardening = readFileSync("supabase/migrations/20260925192000_living_lore_hardening_v2.sql", "utf8")
const runtime = readFileSync("supabase/functions/voss-agent/game-chat-runtime.ts", "utf8")
const background = readFileSync("supabase/functions/voss-agent/background-world.ts", "utf8")
const uiData = readFileSync("src/ui-v1-isolated/useUiV1SectionData.ts", "utf8")
const uiScreen = readFileSync("src/ui-v1-isolated/SectionScreens.tsx", "utf8")

test("Living Lore persists readable projections with campaign-safe RLS", () => {
  assert.match(migration, /create table if not exists public\.world_lore_entries/)
  assert.match(migration, /world_lore_entries_member_read/)
  assert.match(migration, /sync_world_lore_from_memory_fact_v1/)
  assert.match(migration, /sync_world_lore_from_background_event_v1/)
  assert.match(migration, /public_lore/)
  assert.match(hardening, /world_lore_entries_location_id_idx/)
  assert.match(hardening, /delete_world_lore_from_memory_fact_v1/)
  assert.match(hardening, /delete_world_lore_from_background_event_v1/)
})

test("primary GM, junior and background worker all understand Living Lore", () => {
  assert.match(runtime, /LIVING LORE: если финальный ответ дал персонажу/)
  assert.match(runtime, /structured_value\.lore\.entries/)
  assert.match(runtime, /Несколько независимых газетных заголовков/)
  assert.match(background, /LIVING LORE: если lasting event/)
  assert.match(background, /effect_payload\.public_lore/)
  assert.match(background, /скрытые мотивы, тайные планы/)
})

test("active UI v1 reads and renders living lore alongside authored articles", () => {
  assert.match(uiData, /from\("world_lore_entries"\)/)
  assert.match(uiData, /from\("world_articles"\)/)
  assert.match(uiData, /setLore\(\[\.\.\.livingLore, \.\.\.authoredLore\]\)/)
  assert.match(uiScreen, /u1-living-lore__timeline/)
  assert.match(uiScreen, /Мир может продолжать развиваться и без участия персонажа/)
  assert.match(uiScreen, /Новости/)
  assert.match(uiScreen, /Слухи/)
})
