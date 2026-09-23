import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923123000_ai_gm_recovery_stage8_v1.sql",
)
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const roadmap = read("docs/AI_GM_ROADMAP.md")

test("Stage 8 uses canonical owner recovery boundaries", () => {
  assert.match(migration, /grant_character_short_rest\(v_target_id\)/)
  assert.match(migration, /grant_character_long_rest\(v_target_id\)/)
  assert.match(migration, /recover_character_resources\(v_target_id,'dawn'\)/)
  assert.doesNotMatch(
    migration,
    /update public\.character_resource_states[\s\S]*set current=/,
  )
})

test("Stage 8 recovery is service-only, same-location and idempotent", () => {
  assert.match(migration, /private\.ai_gm_recovery_receipts/)
  assert.match(migration, /job_id uuid primary key references public\.agent_jobs/)
  assert.doesNotMatch(migration, /insert into public\.engine_command_receipts/)
  assert.match(migration, /ai_gm_recovery_target_not_present/)
  assert.match(migration, /chat_messages_ai_gm_recovery_turn_unique/)
  assert.match(
    migration,
    /revoke all on function public\.execute_ai_gm_recovery_v1\(uuid,text,uuid\[\]\)/,
  )
  assert.match(
    migration,
    /grant execute on function public\.execute_ai_gm_recovery_v1\(uuid,text,uuid\[\]\)[\s\S]*to service_role/,
  )
})

test("Stage 8 dawn is canonical per location and campaign day", () => {
  assert.match(migration, /private\.ai_gm_dawn_receipts/)
  assert.match(migration, /primary key\(campaign_id,location_id,campaign_day\)/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /'ai-gm-dawn:'/)
  assert.match(
    migration,
    /when v_current_period='dawn' then v_current_day[\s\S]*else v_current_day\+1/,
  )
  assert.match(migration, /v_effective_day,[\s\S]*'dawn'/)
  assert.match(migration, /public\.set_scene_position/)
  assert.match(migration, /public\.set_character_world_position/)
})

test("Stage 8 publishes a durable recovery event in game chat", () => {
  assert.match(migration, /'ai_gm_recovery',0/)
  assert.match(migration, /'systemEvent','recovery'/)
  assert.match(migration, /'recoveryTrigger',v_trigger/)
  assert.match(migration, /'runtimeStage',8/)
  assert.match(migration, /character_id,author_name,body/)
})

test("Stage 8 model can request short rest, long rest and dawn", () => {
  assert.match(runtime, /\| "recovery"/)
  assert.match(runtime, /"short_rest" \| "long_rest" \| "dawn"/)
  assert.match(runtime, /execute_ai_gm_recovery_v1/)
  assert.match(runtime, /p_target_character_ids:/)
  assert.match(runtime, /target_character_ids/)
  assert.match(runtime, /presentCharacterIds/)
  assert.match(runtime, /invalid_recovery_request_rejected/)
})

test("Stage 8 continues the same GM turn from refreshed canonical state", () => {
  assert.match(runtime, /SERVER-APPLIED RECOVERY RESULT/)
  assert.match(runtime, /ПОСЛЕ RECOVERY/)
  assert.match(runtime, /resume_chat_message_id: contextCursor/)
  assert.match(runtime, /buildGameChatContextV2/)
  assert.match(runtime, /duplicate_recovery_in_same_gm_turn_blocked/)
  assert.match(runtime, /recovery_result: recoveryResult/)
  assert.match(runtime, /runtime_stage: (?:8|9|10|11|12)/)
})

test("Stage 8 context exposes recovered resources and item charges", () => {
  assert.match(context, /resourceStates: JsonRecord\[\]/)
  assert.match(context, /inventoryChargeItems: JsonRecord\[\]/)
  assert.match(context, /from\("character_resource_states"\)/)
  assert.match(context, /from\("character_inventory_items"\)/)
  assert.match(context, /canonical_resource_states_for_present_characters/)
  assert.match(context, /charged_inventory_items_for_present_characters/)
})

test("Stage 8 preserves Stage 7 multi-message output-count contract", () => {
  const start = runtime.indexOf("async function publishDialogueSequence")
  const end = runtime.indexOf("export async function runGameChatTurn", start)
  assert.ok(start >= 0 && end > start)
  const helper = runtime.slice(start, end)
  assert.match(helper, /completed_outputs: 1/)
  assert.doesNotMatch(helper, /completed_outputs: messageIds\.length/)
})

test("Stage 8 is certified READY and its readiness debt is removed", () => {
  assert.match(
    roadmap,
    /\| 8 \| READY \| Short rest, long rest, dawn and game-time recovery \|/,
  )
  assert.match(roadmap, /\| 8 \| READY \|/)
  assert.match(roadmap, /READY stages: 1–(?:8|9|10|11|12)/)
})


test("Stage 8 recovery receipt cannot collide with Stage 6 gameplay receipts", () => {
  assert.match(migration, /insert into private\.ai_gm_recovery_receipts/)
  assert.doesNotMatch(migration, /engine,'ai_gm'/)
  assert.doesNotMatch(migration, /command_kind,'ai_gm\.recovery'/)
  assert.match(runtime, /execute_ai_gm_recovery_v1/)
  assert.match(runtime, /execute_ai_gm_npc_action_turn_v1/)
})
