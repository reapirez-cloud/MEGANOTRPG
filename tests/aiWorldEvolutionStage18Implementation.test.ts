import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260924145628_ai_world_evolution_stage18_clean_rebuild_v3.sql", import.meta.url),
  "utf8",
)
const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const statusUi = readFileSync(
  new URL("../src/ui-v1-isolated/chat-room/AiGmTurnStatus.tsx", import.meta.url),
  "utf8",
)
const composer = readFileSync(
  new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("Stage 18 clean rebuild deletes the rejected implementation first", () => {
  assert.match(migration, /drop function if exists public\.finalize_ai_gm_turn_v18/)
  assert.match(migration, /drop function if exists public\.claim_ai_gm_post_turn_commit_v1/)
  assert.match(migration, /drop function if exists private\.enforce_ai_gm_player_turn_gate_v2/)
  assert.match(migration, /drop table if exists public\.ai_gm_post_turn_intent_receipts cascade/)
  assert.match(migration, /drop table if exists public\.ai_gm_post_turn_commits cascade/)
})

test("Stage 18 requested roll bypass and free-form gate are server owned", () => {
  assert.match(migration, /meganot\.ai_gm_requested_roll/)
  assert.match(migration, /ai_gm_post_turn_locked/)
  assert.match(migration, /ai_gm_roll_wait_in_progress/)
  assert.match(migration, /enforce_ai_gm_player_turn_gate_v3/)
})

test("Stage 18 uses atomic canonical mutation receipts", () => {
  assert.match(migration, /execute_ai_gm_post_turn_mutation_v3/)
  assert.match(migration, /stage18_intent_completion_race/)
  assert.match(migration, /state='completed'/)
  assert.match(runtime, /execute_ai_gm_post_turn_mutation_v3/)
  assert.doesNotMatch(runtime, /executeStage18PostTurnTool/)
  assert.doesNotMatch(runtime, /complete_ai_gm_post_turn_intent_v1/)
})

test("Stage 18 completed commit cannot be failed by downstream wake", () => {
  assert.match(runtime, /The commit is terminal now/)
  assert.match(runtime, /Never mutate an already completed Stage 18 commit here/)
  assert.match(migration, /if v_commit\.state='completed' then return to_jsonb\(v_commit\); end if;/)
})

test("Stage 18 runtime has no rejected v1-v2 post-turn RPCs", () => {
  assert.doesNotMatch(runtime, /finalize_ai_gm_turn_v18/)
  assert.doesNotMatch(runtime, /claim_ai_gm_post_turn_commit_v1/)
  assert.doesNotMatch(runtime, /claim_ai_gm_post_turn_intent_v1/)
  assert.doesNotMatch(runtime, /fail_ai_gm_post_turn_commit_v1/)
  assert.match(runtime, /finalize_ai_gm_turn_v3/)
  assert.match(runtime, /claim_ai_gm_post_turn_commit_v3/)
})

test("Stage 18 UI surfaces junior work and blocks player composer", () => {
  assert.match(statusUi, /get_ai_gm_room_status_v3/)
  assert.match(statusUi, /game_chat_post_turn_resume/)
  assert.match(statusUi, /retry_ai_gm_post_turn_commit_v3/)
  assert.match(composer, /AI_GM_TURN_STATUS_EVENT/)
  assert.match(composer, /aiGmTurnBlocked/)
  assert.match(composer, /presentation\.canCompose[\s\S]*aiGmTurnBlocked/)
})

test("Stage 18 contract status is implemented", () => {
  const start = contract.indexOf("id: 18,")
  const end = contract.indexOf("id: 19,", start)
  assert.ok(start >= 0 && end > start)
  assert.match(contract.slice(start, end), /status: "implemented"/)
})
