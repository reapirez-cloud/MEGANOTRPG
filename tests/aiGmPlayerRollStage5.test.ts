import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 5 stores durable roll requests and keeps hidden DC off player-readable tables", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /create table if not exists public\.ai_gm_roll_requests/)
  assert.match(sql, /gm_job_id uuid not null/)
  assert.match(sql, /character_id uuid not null/)
  assert.match(sql, /roll_type text not null/)
  assert.match(sql, /dc integer/)
  assert.match(sql, /dc_visibility text not null/)
  assert.match(sql, /status text not null default 'pending'/)
  assert.match(sql, /revoke all on table public\.ai_gm_roll_requests[\s\S]*from public, anon, authenticated/)
  assert.doesNotMatch(sql, /grant select on table public\.ai_gm_roll_requests[\s\S]*to authenticated/)
})

test("Stage 5 resolves roll modifier from canonical character runtime instead of model input", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /ai_gm_character_roll_modifier_v1/)
  assert.match(sql, /from public\.character_sheets/)
  assert.match(sql, /skill_proficiencies/)
  assert.match(sql, /saving_throw_proficiencies/)
  assert.match(sql, /proficiency_bonus/)
  assert.match(sql, /character_engine_runtime_sheet/)
  assert.doesNotMatch(sql, /p_modifier integer/)
})

test("Stage 5 request publication hard-pauses the same GM job", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /create_ai_gm_roll_request_v1/)
  assert.match(sql, /event_kind,[\s\S]*'roll_request'/)
  assert.match(sql, /status = 'waiting_for_user'/)
  assert.match(sql, /'pending_roll_request_id'/)
  assert.match(sql, /chat_player_actor_for_room/)
  assert.match(sql, /ai_gm_roll_target_not_in_source_scene/)
})

test("Stage 5 hidden DC is omitted from player-visible request payload", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  const createStart = sql.indexOf(
    "create or replace function public.create_ai_gm_roll_request_v1",
  )
  const resolveStart = sql.indexOf(
    "create or replace function public.resolve_ai_gm_roll_request_v1",
  )
  assert.ok(createStart >= 0 && resolveStart > createStart)
  const createBody = sql.slice(createStart, resolveStart)

  assert.match(createBody, /if v_request\.dc_visibility = 'public' and v_request\.dc is not null then/)
  assert.match(createBody, /jsonb_build_object\('dc', v_request\.dc\)/)
  assert.doesNotMatch(
    createBody,
    /jsonb_build_object\([\s\S]{0,120}'dc', v_request\.dc[\s\S]{0,120}'dcVisibility'/,
  )
})

test("Stage 5 resolves exactly one roll and queues the same GM job for continuation", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /select \* into v_request[\s\S]*for update/)
  assert.match(sql, /if v_request\.status = 'resolved' then/)
  assert.match(sql, /send_chat_roll_v4/)
  assert.match(sql, /status = 'resolved'/)
  assert.match(sql, /status = 'queued'/)
  assert.match(sql, /'continuation_kind', 'player_roll'/)
  assert.match(sql, /'continuation_chat_message_id', v_message_id/)
  assert.match(sql, /reserve_ai_gm_roll_resume_v1/)
})

test("Stage 5 runtime exposes request_player_roll and stops after creating it", () => {
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(runtime, /\| "request_player_roll"/)
  assert.match(runtime, /modifier НЕ указывай и не вычисляй/)
  assert.match(runtime, /create_ai_gm_roll_request_v1/)
  assert.match(runtime, /if \(reaction\.mode === "request_player_roll"\)/)
  assert.match(runtime, /return\n    }/)
  assert.match(runtime, /resume_game_chat_roll/)
  assert.match(runtime, /reserve_ai_gm_roll_resume_v1/)
})

test("Stage 5 continuation uses the roll result message as the context tail", () => {
  const context = read(
    "supabase/functions/voss-agent/game-chat-context.ts",
  )
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(context, /continuation_chat_message_id/)
  assert.match(runtime, /continuation_kind === "player_roll"/)
  assert.match(runtime, /claimed\.result\.roll_result/)
  assert.match(runtime, /priorModelId/)
})

test("Stage 5 renders an interactive request card and retries resume without a second roll", () => {
  const card = read(
    "src/ui-v1-isolated/chat-room/ChatRollRequestCard.tsx",
  )
  const client = read(
    "src/ui-v1-isolated/chat-room/aiGmRollRequest.ts",
  )
  const eventModel = read(
    "src/ui-v1-isolated/chat-room/chatEventModel.ts",
  )

  assert.match(card, /Бросить d20/)
  assert.match(card, /Продолжить ведущего/)
  assert.match(card, /targetUserId/)
  assert.match(client, /resolve_ai_gm_roll_request_v1/)
  assert.match(client, /resume_game_chat_roll/)
  assert.match(eventModel, /roll_request/)
})
