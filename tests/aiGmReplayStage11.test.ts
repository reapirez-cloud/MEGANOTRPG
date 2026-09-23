import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923140000_ai_gm_replay_stage11_v1.sql",
)
const ledgerLinks = read(
  "supabase/migrations/20260923140500_ai_gm_replay_stage11_ledger_links_v1.sql",
)
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const snakeActions = read(
  "src/ui-v1-isolated/chat-room/chatMessageSnakeActions.ts",
)
const chatFeed = read("src/ui-v1-isolated/chat-room/ChatFeed.tsx")
const roadmap = read("docs/AI_GM_ROADMAP.md")
const readinessDebt = read("src/ai/aiGmReadinessDebt.ts")

test("Stage 11 gives one source message a versioned canonical GM branch", () => {
  assert.match(migration, /private\.ai_gm_turn_revisions/)
  assert.match(migration, /revision_no integer not null/)
  assert.match(migration, /replay_mode in \('initial','regenerate','edit_resend'\)/)
  assert.match(migration, /state in \('active','superseded','rolled_back','failed'\)/)
  assert.match(migration, /ai_gm_turn_revisions_one_active_source/)
  assert.match(migration, /unique\(source_message_id,revision_no\)/)
})

test("Stage 11 replaces permanent one-job-per-source idempotency with source plus revision", () => {
  assert.match(migration, /drop index if exists public\.agent_jobs_game_chat_source_unique/)
  assert.match(migration, /agent_jobs_game_chat_source_revision_unique/)
  assert.match(migration, /input->>'turn_revision_id'/)
  assert.match(migration, /turn_revision_no/)
})

test("Stage 11 ledger records reversible and irreversible turn effects", () => {
  assert.match(migration, /private\.ai_gm_turn_effects/)
  assert.match(migration, /'chat_message'/)
  assert.match(migration, /'campaign_event'/)
  assert.match(migration, /'pending_roll_request'/)
  assert.match(migration, /'engine_receipt'/)
  assert.match(migration, /'recovery_receipt'/)
  assert.match(migration, /'runtime_mechanic'/)
  assert.match(migration, /pr\.status in \('pending','cancelled'\)/)
  assert.match(migration, /false,[\s\S]*to_jsonb\(r\)/)
})

test("Stage 11 captures legacy reply_message_id and reply_message_ids", () => {
  assert.match(ledgerLinks, /v_job\.result->>'reply_message_id'/)
  assert.match(ledgerLinks, /jsonb_array_elements_text/)
  assert.match(ledgerLinks, /v_job\.result->'reply_message_ids'/)
})

test("Stage 11 rollback is fail-closed for mechanics and later conversation", () => {
  assert.match(migration, /ai_gm_turn_irreversible_effects/)
  assert.match(migration, /ai_gm_turn_has_later_messages/)
  assert.match(migration, /ai_gm_turn_in_progress/)
  assert.match(migration, /private\.ai_gm_turn_has_later_messages_v1/)
  assert.match(migration, /delete from public\.pending_player_roll_requests/)
  assert.match(migration, /delete from public\.chat_messages/)
})

test("Stage 11 edit/resend owns source edits and restores them on manual undo", () => {
  assert.match(migration, /ai_gm_edit_requires_plain_source_message/)
  assert.match(migration, /source_body_before/)
  assert.match(migration, /source_body_after/)
  assert.match(migration, /set body=v_after,[\s\S]*edited_at=now\(\)/)
  assert.match(migration, /undo_ai_gm_turn_v1/)
  assert.match(
    migration,
    /set body=v_revision\.source_body_before,[\s\S]*edited_at=now\(\)/,
  )
  assert.match(migration, /ai_gm_source_message_use_edit_resend/)
  assert.match(migration, /ai_gm_message_use_stage11_rollback/)
})

test("Stage 11 replay remains service-mediated while control and undo are authenticated", () => {
  assert.match(migration, /reserve_ai_gm_replay_v1/)
  assert.match(migration, /auth\.role\(\)<>'service_role'/)
  assert.match(
    migration,
    /grant execute on function public\.reserve_ai_gm_replay_v1[\s\S]*to service_role/,
  )
  assert.match(
    migration,
    /grant execute on function public\.get_ai_gm_turn_control_v1\(bigint\)[\s\S]*to authenticated,service_role/,
  )
  assert.match(migration, /campaign_manager_required/)
})

test("Stage 11 runtime synchronizes ledger at completed and waiting boundaries", () => {
  assert.match(runtime, /syncStage11TurnLedger/)
  assert.match(runtime, /sync_ai_gm_turn_ledger_v1/)
  assert.match(runtime, /action !== "game_chat_turn" && action !== "game_chat_replay"/)
  assert.match(runtime, /reserve_ai_gm_replay_v1/)
  assert.match(runtime, /replayMode === "regenerate"/)
  assert.match(runtime, /replayMode === "edit_resend"/)
  assert.match(runtime, /await syncStage11TurnLedger\(admin, jobId\)/)
})

test("Stage 11 Snake exposes regenerate, edit-resend and manager undo", () => {
  assert.match(snakeActions, /Новая генерация/)
  assert.match(snakeActions, /Редактировать и отправить заново/)
  assert.match(snakeActions, /Откатить ход ИИ-ГМ/)
  assert.match(snakeActions, /get_ai_gm_turn_control_v1/)
  assert.match(snakeActions, /game_chat_replay/)
  assert.match(snakeActions, /undo_ai_gm_turn_v1/)
  assert.match(snakeActions, /block_reason/)
  assert.match(chatFeed, /SnakeTrigger/)
  assert.match(chatFeed, /createChatMessageSnakeActions/)
})

test("Stage 11 remains IN PROGRESS until irreversible and dependency E2E plus final CI", () => {
  assert.match(
    roadmap,
    /\| 11 \| IN PROGRESS \| Regenerate, edit\/retry and undo ledger \|/,
  )
  assert.match(roadmap, /Stage 11 is IN PROGRESS/)
  assert.match(readinessDebt, /id: "snake-edit-and-resend"/)
  assert.match(readinessDebt, /id: "snake-regenerate-gm-turn"/)
  assert.match(readinessDebt, /id: "gm-turn-replay-rollback"/)
  assert.match(readinessDebt, /id: "undo-last-gm-turn"/)
})
