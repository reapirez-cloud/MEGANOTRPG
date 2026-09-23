import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("AI GM Stage 1 reserves exactly one durable turn per player PC message", () => {
  const migration = read(
    "supabase/migrations/20260923083000_ai_gm_chat_runtime_stage1_v1.sql",
  )

  assert.match(migration, /agent_jobs_game_chat_source_unique/)
  assert.match(migration, /input ->> 'source_chat_message_id'/)
  assert.match(migration, /input ->> 'surface' = 'game_chat_v1'/)
  assert.match(migration, /reserve_ai_gm_chat_turn_v1/)
  assert.match(migration, /v_message\.user_id is distinct from p_user_id/)
  assert.match(migration, /v_character\.assigned_user_id is distinct from p_user_id/)
  assert.match(migration, /v_character\.character_type <> 'pc'/)
  assert.match(migration, /v_room\.category <> 'game'/)
  assert.match(migration, /job_type[\s\S]*'conversation_turn'/)
  assert.match(migration, /exception[\s\S]*when unique_violation/)
})

test("AI GM Stage 1 narrator publication is service-role-only and idempotent", () => {
  const migration = read(
    "supabase/migrations/20260923083000_ai_gm_chat_runtime_stage1_v1.sql",
  )

  assert.match(migration, /publish_ai_gm_message_v1/)
  assert.match(migration, /current_setting\('meganot\.ai_gm_runtime', true\)/)
  assert.match(migration, /set_config\('meganot\.ai_gm_runtime', 'on', true\)/)
  assert.match(migration, /reply_message_id/)
  assert.match(migration, /grant execute[\s\S]*to service_role/i)
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i)
  assert.match(migration, /new\.character_id := null/)
  assert.match(migration, /new\.author_name := 'Рассказчик'/)
})

test("AI GM Stage 1 processes a queued job and writes the answer back to chat", () => {
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )
  const edge = read("supabase/functions/voss-agent/index.ts")
  const context = read("supabase/functions/voss-agent/game-chat-context.ts")

  assert.match(runtime, /action !== "game_chat_turn"/)
  assert.match(runtime, /reserve_ai_gm_chat_turn_v1/)
  assert.match(runtime, /claim_ai_gm_scene_job_v1/)
  assert.match(context, /const CHAT_CONTEXT_LIMIT = 50/)
  assert.match(runtime, /resolveCampaignGmModel/)
  assert.match(runtime, /requestChatCompletion/)
  assert.match(runtime, /publish_ai_gm_message_v1/)
  assert.match(runtime, /status: "completed"/)
  assert.match(runtime, /status: "failed"/)
  assert.match(runtime, /не гарантированным результатом мира/)
  assert.match(edge, /startGameChatTurnRequest/)
  assert.match(edge, /runBackground\(gameChatTurn\.background\)/)
})

test("UI triggers AI GM only after the player's own PC text message was stored", () => {
  const composer = read(
    "src/ui-v1-isolated/chat-room/ChatComposer.tsx",
  )

  assert.match(composer, /action: "game_chat_turn"/)
  assert.match(composer, /sourceChatMessageId/)
  assert.match(composer, /messageId &&/)
  assert.match(composer, /model\.roomType !== "flood"/)
  assert.match(
    composer,
    /selectedCharacterId === model\.viewer\.playerCharacterId/,
  )
  assert.match(composer, /void triggerAiGameMasterTurn/)
})

test("completed Stage 1 runtime debt is removed from the temporary tracker", () => {
  const debt = read("src/ai/aiGmReadinessDebt.ts")
  assert.doesNotMatch(debt, /id: "gm-runtime-in-game-chat"/)
  assert.doesNotMatch(debt, /id: "campaign-gm-model"/)
  assert.doesNotMatch(debt, /id: "ai-button-selector"/)
  assert.doesNotMatch(debt, /id: "gm-turn-replay-rollback"/)
  assert.match(debt, /id: "gm-turn-status-ui"/)
})
