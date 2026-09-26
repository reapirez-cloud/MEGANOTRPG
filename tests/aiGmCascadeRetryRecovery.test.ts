import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260926122506_ai_gm_cascade_retry_recovery_v1.sql",
)
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")

test("Stage 26 accepts semantic inn structure role aliases", () => {
  assert.match(migration, /common_room[\s\S]*public_hall/)
  assert.match(migration, /tap[\s\S]*service/)
  assert.match(migration, /tap[\s\S]*storage/)
  assert.match(migration, /lodging[\s\S]*guest_area/)
  assert.match(migration, /ai_gm_normalize_location_structure_roles_v1/)
})

test("Stage 18 keeps deterministic executor errors for Junior retries", () => {
  assert.match(migration, /source_intent_id/)
  assert.match(migration, /stage18_intent_attempts_exhausted/)
  assert.match(runtime, /previous_attempt_error/)
  assert.match(runtime, /ОБЯЗАТЕЛЬНО исправь аргументы/)
})

test("Stage 18 stale 3-of-3 work terminalizes instead of locking the room forever", () => {
  assert.match(migration, /recover_stale_ai_gm_post_turn_room_v1/)
  assert.match(migration, /lease_expires_at<now\(\)/)
  assert.match(migration, /post_turn_state','failed'/)
  assert.match(
    migration,
    /perform private\.recover_stale_ai_gm_post_turn_room_v1\(p_room_id\)/,
  )
})
