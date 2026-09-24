import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = () =>
  read("supabase/migrations/20260924111500_ai_world_evolution_stage18_post_turn_commit_v2.sql")
const runtime = () =>
  read("supabase/functions/voss-agent/game-chat-runtime.ts")
const statusUi = () =>
  read("src/ui-v1-isolated/chat-room/AiGmTurnStatus.tsx")
const composer = () =>
  read("src/ui-v1-isolated/chat-room/ChatComposer.tsx")

test("Stage 18 deletes the audited-bad v1 gate instead of isolating it", () => {
  const sql = migration()

  assert.match(sql, /drop trigger if exists ai_gm_post_turn_gate/)
  assert.match(sql, /drop function if exists private\.ai_gm_post_turn_gate_trigger/)
  assert.match(sql, /drop function if exists public\.create_ai_gm_post_turn_commit_v1/)
  assert.match(sql, /drop function if exists public\.get_ai_gm_room_status_v1/)
  assert.match(sql, /drop table if exists public\.ai_gm_turn_commit_gates cascade/)
  assert.doesNotMatch(runtime(), /create_ai_gm_post_turn_commit_v1/)
  assert.doesNotMatch(statusUi(), /get_ai_gm_room_status_v1/)
})

test("Stage 18 uses a dedicated durable queue rather than an unsupported agent_jobs job type", () => {
  const sql = migration()

  assert.match(sql, /create table public\.ai_gm_post_turn_commits/)
  assert.match(sql, /create table public\.ai_gm_post_turn_intent_receipts/)
  assert.doesNotMatch(sql, /insert into public\.agent_jobs[\s\S]{0,1000}ai_gm_post_turn_commit/)
  assert.match(sql, /state in \('queued','running','completed','failed'\)/)
  assert.match(sql, /lease_expires_at/)
  assert.match(sql, /max_attempts integer not null default 3/)
})

test("Stage 18 atomically publishes visible output and creates the gate in one finalizer", () => {
  const sql = migration()
  const start = sql.indexOf("create or replace function public.finalize_ai_gm_turn_v18")
  const end = sql.indexOf("create or replace function public.claim_ai_gm_post_turn_commit_v1", start)
  assert.ok(start >= 0 && end > start)
  const block = sql.slice(start, end)

  const publish = block.indexOf("public.publish_ai_gm_turn_message_v1")
  const createCommit = block.indexOf("insert into public.ai_gm_post_turn_commits")
  const finishParent = block.indexOf("update public.agent_jobs")
  assert.ok(publish >= 0)
  assert.ok(createCommit > publish)
  assert.ok(finishParent > createCommit)
  assert.match(block, /post_turn_state/)
  assert.match(block, /stage18_finalized/)
})

test("Stage 18 freezes each post-turn intent and gives it its own idempotency receipt", () => {
  const sql = migration()

  assert.match(sql, /unique\(commit_id,intent_index\)/)
  assert.match(sql, /unique\(commit_id,intent_key\)/)
  assert.match(sql, /intent_fingerprint text not null/)
  assert.match(sql, /stage18_intent_contract_is_immutable/)
  assert.match(sql, /jsonb_array_length\(v_intents\)/)
  assert.match(sql, /v_intent_count > 16/)
})

test("Stage 18 server gate blocks free-form turns while queued running or failed", () => {
  const sql = migration()

  assert.match(sql, /enforce_ai_gm_player_turn_gate_v2/)
  assert.match(sql, /state in \('queued','running','failed'\)/)
  assert.match(sql, /raise exception 'ai_gm_post_turn_locked'/)
  assert.match(sql, /current_setting\('meganot\.ai_gm_runtime', true\) = 'on'/)
  assert.match(sql, /status='waiting_for_user'/)
  assert.match(sql, /ai_gm_roll_wait_in_progress/)
})

test("Stage 18 worker is hard-pinned to Flash and cannot inherit the broad world materializer prompt", () => {
  const code = runtime()

  assert.match(code, /POST_TURN_WORKER_MODEL_KEY = "deepseek-v4\.1-flash"/)
  assert.match(code, /resolvePostTurnWorkerModel/)
  assert.match(code, /stage18_post_turn_worker_model_unavailable/)
  assert.match(code, /STAGE18_POST_TURN_WORKER_SYSTEM/)
  assert.doesNotMatch(code, /STAGE18_POST_TURN_WORKER_SYSTEM\s*\+\s*["']\\n/)
  assert.match(code, /calls\.length !== 1/)
  assert.match(code, /stage18_post_turn_requires_exactly_one_mutation/)
})

test("Stage 18 retries are recoverable and preserve completed intent receipts", () => {
  const sql = migration()

  assert.match(sql, /claim_ai_gm_post_turn_commit_v1/)
  assert.match(sql, /state='running'[\s\S]*attempts=attempts\+1/)
  assert.match(sql, /state in \('running','failed'\) and v_next_state='queued'[\s\S]*then 'pending'/)
  assert.match(sql, /when v_commit\.attempts < v_commit\.max_attempts then 'queued'/)
  assert.match(sql, /retry_ai_gm_post_turn_commit_v1/)
  assert.match(sql, /state=case when state='completed' then 'completed' else 'pending' end/)
  assert.match(sql, /attempts=case when state='completed' then attempts else 0 end/)
})

test("Stage 18 hardens replay of create-style intents against duplicate entities", () => {
  const code = runtime()

  assert.match(code, /reconcileStage18Create/)
  assert.match(code, /stage18_existing_location_ambiguous/)
  assert.match(code, /stage18_existing_npc_ambiguous/)
  assert.match(code, /"stage18:" \+ commitId \+ ":" \+ intentKey/)
  assert.match(code, /toolName === "create_quest_plan"/)
  assert.match(code, /toolName === "remember_campaign_fact"/)
  assert.match(code, /toolName === "upsert_location_secret"/)
})

test("Stage 18 routes every narrative final through the same atomic finalizer", () => {
  const code = runtime()
  const matches = code.match(/finalizeStage18VisibleAnswer\(\{/g) || []

  assert.ok(matches.length >= 2)
  assert.match(code, /async function publishDialogueSequence[\s\S]*finalizeStage18VisibleAnswer/)
  assert.doesNotMatch(code, /publish_ai_gm_npc_message_v2/)
  assert.doesNotMatch(code, /publish_ai_gm_message_v1/)
})

test("Stage 18 post-turn failure cannot retroactively fail a published parent turn", () => {
  const code = runtime()

  assert.match(code, /The visible answer and Stage 18 gate are already committed atomically/)
  assert.match(code, /Never rewrite a published parent turn as failed here/)
  assert.match(code, /postTurnCommit\.state !== "completed"/)
  assert.match(code, /game_chat_post_turn_resume/)
})

test("Stage 18 UI blocks only sending while allowing the player to prepare text", () => {
  const ui = composer()

  assert.match(ui, /get_ai_gm_room_status_v2/)
  assert.match(ui, /freeFormTurnLocked/)
  assert.match(ui, /if \(!canCompose \|\| sending \|\| freeFormTurnLocked\) return/)
  assert.match(ui, /sending \|\|\s*freeFormTurnLocked/)
  assert.doesNotMatch(ui, /disabled=\{!canCompose \|\| sending \|\| freeFormTurnLocked\}/)
  assert.match(ui, /Младший шуршит… Текст можно подготовить/)
})

test("Stage 18 status UI wakes stale work and exposes manager recovery", () => {
  const ui = statusUi()
  const sql = migration()

  assert.match(ui, /get_ai_gm_room_status_v2/)
  assert.match(ui, /game_chat_post_turn_resume/)
  assert.match(ui, /wake_required/)
  assert.match(ui, /retry_ai_gm_post_turn_commit_v1/)
  assert.match(ui, /Повторить синхронизацию/)
  assert.match(sql, /'wake_required'/)
  assert.match(sql, /'can_recover'/)
  assert.match(sql, /private\.can_manage_campaign/)
})
