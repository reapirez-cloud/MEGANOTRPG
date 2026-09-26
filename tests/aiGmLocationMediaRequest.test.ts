import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260925180500_ai_gm_location_media_character_chat_and_explicit_request_v2.sql",
)
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const imageTools = read("supabase/functions/voss-agent/image-tools.ts")
const lowArtOverride = read(
  "supabase/migrations/20260926124807_ai_gm_low_art_grok46_high_v1.sql",
)

test("location media publishes into the player character room", () => {
  assert.match(migration, /r\.room_type='character'/)
  assert.match(migration, /r\.character_id=p_source_character_id/)
  assert.match(migration, /p_source_room_id/)
  assert.match(migration, /attachment_kind/)
  assert.match(migration, /'image'/)
})

test("location media publication is event-aware rather than once-per-room forever", () => {
  assert.match(migration, /publication_key text/)
  assert.match(
    migration,
    /primary key\(asset_id,room_id,publication_key\)/,
  )
  assert.match(
    migration,
    /on conflict\(asset_id,room_id,publication_key\)/,
  )
  assert.match(migration, /location_entry:/)
})

test("entering a location reuses old art or queues new art", () => {
  assert.match(migration, /request_ai_gm_location_media_v2/)
  assert.match(migration, /'location_entry'/)
  assert.match(migration, /publish_existing_ai_gm_target_media_v2/)
  assert.match(migration, /queue_ai_gm_media_target_v2/)
})

test("explicit environment requests bridge game chat to the media pipeline", () => {
  assert.match(runtime, /isExplicitEnvironmentMediaRequest/)
  assert.match(runtime, /где\\s\+\(\?:вообще/)
  assert.match(runtime, /осмотреться/)
  assert.match(runtime, /request_ai_gm_location_media_v2/)
  assert.match(runtime, /explicit_environment_request:/)
  assert.match(migration, /grant execute on function public\.request_ai_gm_location_media_v2/)
  assert.match(migration, /to service_role/)
})

test("automatic location art is hard-clamped to low 50k while testing", () => {
  assert.match(migration, /v_purpose:='master_art'/)
  assert.match(lowArtOverride, /force_ai_gm_media_low_budget_v1/)
  assert.match(lowArtOverride, /ai_gm_media_stage9_v1/)
  assert.match(lowArtOverride, /50000/)
  assert.match(imageTools, /ai_gm_stage9_forced_low_50k/)
  assert.match(imageTools, /autoLifecycle[\s\S]*quality: "low" as const/)
  assert.doesNotMatch(imageTools, /ai_gm_location_max_150k/)
})

test("automatic NPC portraits use the same economical lifecycle clamp", () => {
  assert.match(
    imageTools,
    /autoLifecycle[\s\S]*quality: "low" as const/,
  )
})
