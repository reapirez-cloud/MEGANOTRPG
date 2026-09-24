import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 5 stores durable roll requests with hidden DC server-side only", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /create table if not exists public\.pending_player_roll_requests/)
  assert.match(sql, /request_type in \('skill','ability','save','attack','custom'\)/)
  assert.match(sql, /dc_visibility in \('public','hidden'\)/)
  assert.match(sql, /status in \('pending','resolving','resolved','cancelled'\)/)
  assert.match(sql, /pending_player_roll_requests_one_pending_job/)
  assert.match(sql, /revoke all on table public\.pending_player_roll_requests[\s\S]*from public, anon, authenticated/)
  assert.doesNotMatch(sql, /grant select on table public\.pending_player_roll_requests to authenticated/)
})

test("Stage 5 derives modifiers on the server and ignores model-supplied modifier numbers", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(sql, /resolve_player_roll_modifier_v1/)
  assert.match(sql, /skill_ability_v1/)
  assert.match(sql, /skill_proficiencies/)
  assert.match(sql, /saving_throw_proficiencies/)
  assert.match(sql, /spell_attack_bonus/)
  assert.match(sql, /proficiency_bonus/)
  assert.doesNotMatch(runtime, /p_modifier/)
  assert.match(runtime, /НЕ указывай request_type\/ability_key\/skill_key\/attack_kind\/modifier/)
})

test("Stage 5 hidden DC never enters the player-facing request payload", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /v_public_dc := case when v_visibility='public' then p_dc else null end/)
  assert.match(sql, /'dc',v_public_dc/)
  assert.doesNotMatch(
    sql.slice(
      sql.indexOf("insert into public.chat_messages"),
      sql.indexOf("update public.pending_player_roll_requests", sql.indexOf("insert into public.chat_messages")),
    ),
    /'dc',p_dc/,
  )
})

test("Stage 5 GM runtime has a real request_player_roll branch and stops after reservation", () => {
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(runtime, /\| "request_player_roll"/)
  const stage17 = read(
    "supabase/migrations/20260924071000_ai_world_evolution_stage17_logic_rolls_v1.sql",
  )
  assert.match(runtime, /create_ai_gm_player_roll_request_v2/)
  assert.match(stage17, /public\.create_ai_gm_player_roll_request_v1\(/)
  assert.match(runtime, /if \(reaction\.mode === "request_player_roll"/)
  assert.match(
    runtime,
    /await syncStage11TurnLedger\(admin, jobId\)[\s\S]*return[\s\S]*await setRuntimePhase\(admin, claimed, "applying"\)/,
  )
  assert.match(runtime, /body: ""/)
})

test("Stage 5 reservation changes the same GM job to waiting_for_user", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /status='waiting_for_user'/)
  assert.match(sql, /pending_roll_request_id/)
  assert.match(sql, /roll_request_sequence/)
  assert.match(sql, /where id=p_job_id/)
})

test("Stage 5 resolving a request rolls once and queues the same GM job for resume", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(sql, /resolve_player_roll_request_v1/)
  assert.match(sql, /for update/)
  assert.match(sql, /if v_request\.status='resolved' and v_request\.roll_message_id is not null/)
  assert.match(sql, /send_chat_roll_v4/)
  assert.match(sql, /set status='resolved'/)
  assert.match(sql, /set status='queued'/)
  assert.match(sql, /resume_chat_message_id/)
  assert.match(sql, /dispatch_ai_gm_roll_resume_v1/)
})

test("Stage 5 resume worker claims the original conversation job rather than creating a second turn", () => {
  const runner = read(
    "supabase/functions/gm-roll-resume/index.ts",
  )
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(runner, /runGameChatTurn/)
  assert.match(runner, /\.eq\("id", jobId\)/)
  assert.match(runner, /status !== "queued"/)
  assert.doesNotMatch(runner, /reserve_ai_gm_chat_turn_v1/)
  assert.match(runtime, /export async function runGameChatTurn/)
  assert.match(runtime, /claim_ai_gm_scene_job_v1/)
})

test("Stage 5 resumed GM context ends at the canonical roll message and includes the resolved result", () => {
  const context = read(
    "supabase/functions/voss-agent/game-chat-context.ts",
  )
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(context, /nullableNumber\(jobInput\.resume_chat_message_id\)/)
  assert.match(runtime, /SERVER-RESOLVED ROLL RESULT/)
  assert.match(runtime, /claimed\.result\.last_roll_result/)
  assert.match(runtime, /Не проси повторить тот же бросок/)
})

test("Stage 5 renders an interactive roll-request card in the canonical chat feed", () => {
  const model = read(
    "src/ui-v1-isolated/chat-room/chatEventModel.ts",
  )
  const feed = read(
    "src/ui-v1-isolated/chat-room/ChatFeedItem.tsx",
  )
  const card = read(
    "src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx",
  )

  assert.match(model, /"roll_request"/)
  assert.match(model, /explicit === "player_roll_request"/)
  assert.match(feed, /event\.type === "roll_request"/)
  assert.match(card, /resolve_player_roll_request_v1/)
  assert.match(card, /Бросить d20/)
  assert.match(card, /dcVisibility === "public"/)
  assert.match(card, /СЛ/)
})

test("Stage 5 internal create/resume dispatch surfaces are service-only while player resolve is authenticated", () => {
  const sql = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(
    sql,
    /revoke all on function public\.create_ai_gm_player_roll_request_v1[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    sql,
    /grant execute on function public\.create_ai_gm_player_roll_request_v1[\s\S]*to service_role/,
  )
  assert.match(
    sql,
    /revoke all on function public\.verify_ai_gm_roll_resume_dispatch_v1\(text\)[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    sql,
    /revoke all on function public\.resolve_player_roll_request_v1\(uuid\)[\s\S]*from public, anon/,
  )
  assert.match(
    sql,
    /grant execute on function public\.resolve_player_roll_request_v1\(uuid\)[\s\S]*to authenticated/,
  )
})


test("Stage 5 stays READY after the roadmap closes", () => {
  const roadmap = read("docs/AI_GM_ROADMAP.md")

  assert.match(roadmap, /\| 5 \| READY \|/)
  assert.match(roadmap, /\| 12 \| READY \|/)
})


test("Stage 5 hidden-DC table has an explicit deny-read RLS policy", () => {
  const sql = read(
    "supabase/migrations/20260923103500_ai_gm_player_roll_stage5_advisor_v1.sql",
  )

  assert.match(sql, /create policy pending_player_roll_requests_no_direct_reads/)
  assert.match(sql, /for select/)
  assert.match(sql, /to authenticated/)
  assert.match(sql, /using \(false\)/)
})
