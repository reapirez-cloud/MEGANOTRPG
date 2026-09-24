import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 18 publishes before durable post-turn commit", () => {
  const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
  const migration = read("supabase/migrations/20260924080000_ai_world_evolution_stage18_post_turn_commit_v1.sql")

  const publishIndex = runtime.indexOf("publish_ai_gm_message_v1")
  const enqueueIndex = runtime.indexOf("create_ai_gm_post_turn_commit_v1")
  assert.ok(publishIndex >= 0)
  assert.ok(enqueueIndex > publishIndex)
  assert.match(runtime, /post_turn_intents/)
  assert.match(runtime, /POST-TURN COMMIT/)
  assert.match(runtime, /allowSourceBootstrap: false/)
  assert.match(migration, /ai_gm_turn_commit_gates/)
  assert.match(migration, /create_ai_gm_post_turn_commit_v1/)
})

test("Stage 18 has a server-side gate, not merely a disabled button", () => {
  const migration = read("supabase/migrations/20260924080000_ai_world_evolution_stage18_post_turn_commit_v1.sql")
  const composer = read("src/ui-v1-isolated/chat-room/ChatComposer.tsx")
  const status = read("src/ui-v1-isolated/chat-room/AiGmTurnStatus.tsx")

  assert.match(migration, /before insert on public\.chat_messages/)
  assert.match(migration, /ai_gm_post_turn_commit_in_progress/)
  assert.match(migration, /ai_gm_roll_wait_in_progress/)
  assert.match(migration, /state in \('pending','running','failed'\)/)
  assert.match(composer, /turnGateLocked/)
  assert.match(composer, /post_turn_commit/)
  assert.match(status, /Младший шуршит/)
})

test("Stage 18 keeps roll-wait distinct from post-turn commit", () => {
  const migration = read("supabase/migrations/20260924080000_ai_world_evolution_stage18_post_turn_commit_v1.sql")
  const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
  assert.match(migration, /waiting_for_user/)
  assert.match(runtime, /request_player_roll/)
  assert.match(runtime, /create_ai_gm_post_turn_commit_v1/)
})

test("Stage 18 worker is bounded and retried", () => {
  const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
  assert.match(runtime, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/)
  assert.match(runtime, /stage18_post_turn_commit_failed/)
  assert.match(runtime, /state: "failed"/)
  assert.match(runtime, /commit_receipt/)
})
