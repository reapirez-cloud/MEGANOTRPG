import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 3 counts every canonical chat message and reserves one 45-message window", () => {
  const migration = read(
    "supabase/migrations/20260923092000_ai_gm_world_maintenance_stage3_v1.sql",
  )

  assert.match(migration, /world_maintenance/)
  assert.match(migration, /offset 44/)
  assert.match(migration, /message_count', 45/)
  assert.match(migration, /reserve_ai_gm_room_maintenance_on_message_v1/)
  assert.match(migration, /after insert on public\.chat_messages/)
  assert.match(migration, /agent_jobs_world_maintenance_window_unique/)
  assert.match(migration, /range_end_message_id/)
  assert.doesNotMatch(migration, /delete from public\.chat_messages/i)
})

test("Stage 3 advances watermark only in atomic completion", () => {
  const migration = read(
    "supabase/migrations/20260923092000_ai_gm_world_maintenance_stage3_v1.sql",
  )

  assert.match(migration, /ai_gm_room_maintenance_state/)
  assert.match(migration, /watermark_message_id/)
  assert.match(migration, /world_maintenance_watermark_conflict/)
  assert.match(migration, /complete_ai_gm_room_maintenance_v1/)
  assert.match(migration, /windows_completed = windows_completed \+ 1/)
  assert.match(migration, /private\.reserve_ai_gm_room_maintenance_v1\(v_room_id\)/)
})

test("Stage 3 uses a fixed cheap structured worker, not the selected GM model", () => {
  const worker = read("supabase/functions/voss-agent/world-maintenance.ts")

  assert.match(worker, /WORKER_MODEL_KEY = "deepseek-v4\.1-flash"/)
  assert.match(worker, /\.eq\("model_key", WORKER_MODEL_KEY\)/)
  assert.match(worker, /Ты НЕ ведущий/)
  assert.match(worker, /вернуть только структурированный JSON/)
  assert.match(worker, /temperature: 0\.15/)
  assert.doesNotMatch(worker, /selected_model_id/)
})

test("Stage 3 reads 50-message context and current domain snapshots", () => {
  const worker = read("supabase/functions/voss-agent/world-maintenance.ts")

  assert.match(worker, /\.limit\(50\)/)
  assert.match(worker, /last_50_chat_messages/)
  assert.match(worker, /campaign_events_for_last_50_messages/)
  assert.match(worker, /from\("character_world_state"\)/)
  assert.match(worker, /from\("character_relationships"\)/)
  assert.match(worker, /from\("faction_memberships"\)/)
  assert.match(worker, /from\("character_faction_reputations"\)/)
  assert.match(worker, /from\("quest_conditions"\)/)
  assert.match(worker, /from\("quest_condition_states"\)/)
})

test("Stage 3 never promotes a bare PC claim into canonical owner action", () => {
  const worker = read("supabase/functions/voss-agent/world-maintenance.ts")

  assert.match(worker, /Player message сам по себе НЕ доказывает/)
  assert.match(worker, /canonicalEvidenceIds/)
  assert.match(worker, /character\?\.character_type === "npc"/)
  assert.match(worker, /if \(text\(message\.event_kind, 80\)\) return true/)
  assert.match(worker, /if \(!message\.character_id\) return true/)
  assert.match(worker, /actionConfidence < 0\.9/)
  assert.match(worker, /worker_action_rejected_by_evidence_guard/)
})

test("Stage 3 applies durable changes only through whitelisted domain owners", () => {
  const worker = read("supabase/functions/voss-agent/world-maintenance.ts")

  for (const tool of [
    "move_character_world",
    "set_world_discovery",
    "update_world_npc",
    "set_faction_membership",
    "set_character_faction_reputation",
    "set_character_life_state",
    "resolve_quest_condition",
    "run_quest_resolver",
  ]) {
    assert.match(worker, new RegExp('"' + tool + '"'))
  }

  assert.match(worker, /executeVossManagerTool/)
  assert.match(worker, /executeVossQuestTool/)
  assert.match(worker, /OWNER_TOOL_WHITELIST/)
  assert.match(worker, /sanitizeOwnerArgs/)
})

test("Stage 3 memory writes are retry-safe and provenance-linked", () => {
  const migration = read(
    "supabase/migrations/20260923092000_ai_gm_world_maintenance_stage3_v1.sql",
  )
  const worker = read("supabase/functions/voss-agent/world-maintenance.ts")

  assert.match(migration, /maintenance_job_id/)
  assert.match(migration, /maintenance_fact_index/)
  assert.match(migration, /campaign_memory_summaries_maintenance_job_unique/)
  assert.match(migration, /campaign_memory_facts_maintenance_job_fact_unique/)
  assert.match(worker, /maintenance_job_id: jobId/)
  assert.match(worker, /maintenance_fact_index: factIndex/)
  assert.match(worker, /source_event_ids: eventIds/)
  assert.match(worker, /kind: "world_maintenance_v1"/)
  assert.match(worker, /range_start_message_id/)
  assert.match(worker, /range_end_message_id/)
})

test("AI GM runtime drains a queued maintenance job after each turn", () => {
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(runtime, /runPendingWorldMaintenanceForRoom/)
  assert.match(runtime, /finally \{/)
  assert.match(runtime, /campaignId,[\s\S]*roomId/)
})

test("roadmap stage counter is persistent and points to Stage 3", () => {
  const roadmap = read("docs/AI_GM_ROADMAP.md")

  assert.match(roadmap, /\| 1 \| READY \|/)
  assert.match(roadmap, /\| 2 \| READY \|/)
  assert.match(roadmap, /\| 3 \| IN PROGRESS \|/)
  assert.match(roadmap, /Next stage after READY: 4/)
})
