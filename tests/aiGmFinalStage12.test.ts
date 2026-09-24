import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923150000_ai_gm_final_stage12_v1.sql",
)
const dialogueMigration = read(
  "supabase/migrations/20260923150600_ai_gm_final_stage12_player_dialogue_v1.sql",
)
const hardeningMigration = read(
  "supabase/migrations/20260923151500_ai_gm_final_stage12_hardening_v1.sql",
)
const audienceRlsMigration = read(
  "supabase/migrations/20260923152000_ai_gm_final_stage12_audience_rls_v1.sql",
)
const statusMigration = read(
  "supabase/migrations/20260923152400_ai_gm_final_stage12_status_queue_label_v1.sql",
)
const advisorIndexMigration = read(
  "supabase/migrations/20260923152500_ai_gm_final_stage12_advisor_indexes_v1.sql",
)
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const temporalOverlay = read("supabase/functions/voss-agent/temporal-overlay.ts")
const maintenance = read("supabase/functions/voss-agent/world-maintenance.ts")
const composer = read("src/ui-v1-isolated/chat-room/ChatComposer.tsx")
const turnQueue = read("src/ui-v1-isolated/chat-room/playerTurnQueue.ts")
const feedHook = read("src/ui-v1-isolated/chat-room/useChatRoomEvents.ts")
const statusUi = read("src/ui-v1-isolated/chat-room/AiGmTurnStatus.tsx")
const roadmap = read("docs/AI_GM_ROADMAP.md")

test("Stage 12 keeps exactly the latest 50 AI context messages from the persistent chat", () => {
  assert.match(context, /const CHAT_CONTEXT_LIMIT = 50/)
  assert.match(
    context,
    /from\("chat_messages"\)[\s\S]*\.eq\("room_id", roomId\)[\s\S]*\.limit\(CHAT_CONTEXT_LIMIT\)/,
  )
  assert.match(
    context,
    /latest 50[\s\S]*THIS CHAT[\s\S]*not the latest 50 from the current location/,
  )
  assert.doesNotMatch(context, /sceneEventsResult/)
  assert.doesNotMatch(
    context,
    /from\("campaign_events"\)[\s\S]{0,500}\.eq\("location_id", sourceLocationId\)/,
  )
})

test("Stage 12 player UI pages old chat history instead of loading the whole room", () => {
  assert.match(feedHook, /const MESSAGE_LIMIT = 150/)
  assert.match(feedHook, /\.order\("id", \{ ascending: false \}\)/)
  assert.match(feedHook, /\.limit\(MESSAGE_LIMIT\)/)
  assert.match(feedHook, /\.lt\("id", oldestId\)/)
  assert.match(feedHook, /setHasMore\(rawMessages\.length === MESSAGE_LIMIT\)/)
})

test("Stage 12 serializes only explicit shared chat scenes", () => {
  const queueFix = read(
    "supabase/migrations/20260923150100_ai_gm_final_stage12_shared_scene_queue_fix_v1.sql",
  )
  assert.match(queueFix, /public\.scene_participants/)
  assert.match(queueFix, /v_participant_count<2/)
  assert.match(queueFix, /v_scene_key := 'room:'\|\|v_room_id::text/)
  assert.match(queueFix, /same physical location/i)
  assert.match(migration, /claim_ai_gm_scene_job_v1/)
  assert.match(
    migration,
    /earlier\.input->>'scene_key'=v_scene_key[\s\S]*earlier\.status in \('queued','running','waiting_for_user'\)/,
  )
  assert.match(runtime, /claim_ai_gm_scene_job_v1/)
  assert.match(runtime, /next_ai_gm_scene_job_v1/)
  assert.match(runtime, /free-play игроков параллельный/)
  assert.match(runtime, /Одинаковая location_id сама по себе НЕ создаёт очередь/)
})

test("Stage 12 direct PC dialogue is explicit, location-validated and persisted", () => {
  assert.match(migration, /audience_scope text not null default 'scene'/)
  assert.match(migration, /recipient_character_ids uuid\[\]/)
  assert.match(migration, /direct_pc_recipient_not_present/)
  assert.match(dialogueMigration, /save_player_turn_draft_v2/)
  assert.match(turnQueue, /save_player_turn_draft_v2/)
  assert.match(turnQueue, /p_recipient_character_ids: recipientCharacterIds/)
  assert.match(composer, /aria-label="Адресаты реплики"/)
  assert.match(composer, /recipientCharacterIds\.includes/)
})

test("Stage 12 enforces direct PC audience in chat RLS", () => {
  assert.match(audienceRlsMigration, /can_read_chat_message_stage12_v1/)
  assert.match(audienceRlsMigration, /p_message_user_id=p_user_id/)
  assert.match(
    audienceRlsMigration,
    /c\.id=any\(coalesce\(p_recipient_character_ids,'\{\}'::uuid\[\]\)\)/,
  )
  assert.match(
    audienceRlsMigration,
    /drop policy if exists chat_messages_scoped_read/,
  )
})

test("Stage 12 never lets AI speak or decide for a direct-dialogue PC", () => {
  assert.match(runtime, /source_audience\.scope=direct_pc/)
  assert.match(runtime, /direct_pc_freeform_gm_reply_blocked/)
  assert.match(runtime, /direct_pc_multi_output_blocked/)
  assert.match(runtime, /direct_pc_npc_not_physically_present/)
  assert.match(runtime, /mode: "none"/)
  assert.match(runtime, /mode: "environment"/)
  assert.match(runtime, /mode: "npc_interjection"/)
})

test("Stage 12 NPC text inventory stays lightweight until explicit materialization", () => {
  assert.match(migration, /inventory_text text not null default ''/)
  assert.match(migration, /inventory_data jsonb not null default '\[\]'::jsonb/)
  assert.match(migration, /set_npc_text_inventory_v1/)
  assert.match(maintenance, /"set_npc_text_inventory"/)
  assert.match(context, /inventory_text,inventory_data/)
  assert.match(hardeningMigration, /materialize_npc_text_inventory_item_v1/)
  assert.match(hardeningMigration, /physical_item_id/)
  assert.match(hardeningMigration, /already_materialized/)
})

test("Stage 12 memory keeps game-time provenance and ages facts by campaign day", () => {
  assert.match(context, /game_age_days/)
  assert.match(context, /withGameAge/)
  assert.match(temporalOverlay, /campaign_day: time\.campaignDay/)
  assert.match(temporalOverlay, /day_period: time\.dayPeriod/)
  assert.match(maintenance, /range_start_message_id/)
  assert.match(maintenance, /range_end_message_id/)
  assert.match(maintenance, /source_event_ids/)
  assert.match(maintenance, /campaign_day: snapshot\.room\.campaign_day/)
  assert.match(maintenance, /day_period: snapshot\.room\.day_period/)
})

test("Stage 12 world-maintenance firewall rejects player wishes as canonical results", () => {
  assert.match(
    maintenance,
    /Player message сам по себе НЕ доказывает/,
  )
  assert.match(maintenance, /evidenceIsCanonical/)
  assert.match(maintenance, /worker_action_rejected_by_evidence_guard/)
  assert.match(runtime, /не гарантированным результатом мира/)
  assert.match(runtime, /я нахожу золото/)
})

test("Stage 12 exposes durable GM turn status in chat", () => {
  assert.match(migration, /get_ai_gm_room_status_v1/)
  assert.match(migration, /waiting_for_roll/)
  assert.match(migration, /generating_art/)
  assert.match(runtime, /runtime_phase: phase/)
  assert.match(runtime, /setRuntimePhase/)
  assert.match(statusUi, /get_ai_gm_room_status_v1/)
  assert.match(statusUi, /window\.setInterval/)
  assert.match(statusUi, /role="status"/)
  assert.match(statusMigration, /ИИ-ГМ ждёт очередь общей сцены/)
  assert.match(statusMigration, /ИИ-ГМ запускается/)
  assert.match(statusMigration, /v_scene_key is not null/)
})

test("Stage 12 closes remaining AI GM foreign-key advisor gaps", () => {
  assert.match(advisorIndexMigration, /ai_gm_dawn_receipts_location_idx/)
  assert.match(advisorIndexMigration, /ai_gm_dawn_receipts_message_idx/)
  assert.match(advisorIndexMigration, /ai_gm_room_maintenance_state_dispatch_job_idx/)
})

test("Stage 12 is certified READY and the temporary debt tracker is gone", () => {
  assert.match(
    roadmap,
    /\| 12 \| READY \| Final READY audit, concurrency, RLS, long-campaign certification \|/,
  )
  assert.match(
    roadmap,
    /Stage 12 is READY\. READY stages: 1–12\. AI GM roadmap complete\./,
  )
  assert.equal(
    existsSync(
      new URL("../src/ai/aiGmReadinessDebt.ts", import.meta.url),
    ),
    false,
  )
})
