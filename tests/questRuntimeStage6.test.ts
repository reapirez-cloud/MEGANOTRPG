import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const runtimeMigration = fs.readFileSync(
  "supabase/migrations/20260922204501_quest_engine_stage6_runtime_sync_v1.sql",
  "utf8",
)
const lifecycleMigration = fs.readFileSync(
  "supabase/migrations/20260922204740_quest_engine_stage6_stage_lifecycle_v1.sql",
  "utf8",
)
const playerHook = fs.readFileSync(
  "src/ui-v1-isolated/useCharacterQuests.ts",
  "utf8",
)
const managerHook = fs.readFileSync(
  "src/ui-v1-isolated/useQuestManager.ts",
  "utf8",
)
const questTools = fs.readFileSync(
  "supabase/functions/voss-agent/quest-tools.ts",
  "utf8",
)
const agentIndex = fs.readFileSync(
  "supabase/functions/voss-agent/index.ts",
  "utf8",
)

test("player quest journal refreshes through player-safe campaign events", () => {
  assert.match(runtimeMigration, /alter publication supabase_realtime add table public\.campaign_events/)
  assert.match(runtimeMigration, /quest_emit_player_view_change_v1/)
  assert.match(runtimeMigration, /'quest\.activated'/)
  assert.match(runtimeMigration, /'quest\.updated'/)
  assert.match(runtimeMigration, /'quest\.status_changed'/)
  assert.match(runtimeMigration, /'player_safe', true/)

  assert.match(playerHook, /table: "campaign_events"/)
  assert.match(playerHook, /filter: "source_kind=eq\.quest_engine"/)
  assert.match(playerHook, /participant_character_ids/)
  assert.match(playerHook, /visible_character_ids/)
  assert.match(playerHook, /visibilitychange/)
})

test("player hook still never reads hidden quest tables directly", () => {
  assert.match(playerHook, /list_character_quests_v1/)
  assert.doesNotMatch(playerHook, /from\("quests"\)/)
  assert.doesNotMatch(playerHook, /from\("quest_stages"\)/)
  assert.doesNotMatch(playerHook, /quest_secrets|quest_stage_secrets|quest_condition_states/)
})

test("AI GM gets compact active quest context without write capability", () => {
  assert.match(runtimeMigration, /read_active_quest_context_v1/)
  assert.match(runtimeMigration, /can_manage_quest_campaign/)
  assert.match(runtimeMigration, /q\.status = 'active'/)
  assert.match(runtimeMigration, /qs\.status = 'active'/)
  assert.match(runtimeMigration, /recent_completed_stages/)
  assert.match(questTools, /name: "read_active_quest_context"/)
  assert.match(questTools, /VOSS_QUEST_CONTEXT_TOOLS/)
  assert.match(agentIndex, /\.\.\.VOSS_QUEST_CONTEXT_TOOLS/)
})

test("player authority never receives hidden active quest context tool", () => {
  assert.match(
    agentIndex,
    /const baseTools = authority === "player"[\s\S]*\? \[\.\.\.scopedReadTools, \.\.\.scopedMemoryReadTools\][\s\S]*: \[[\s\S]*VOSS_QUEST_CONTEXT_TOOLS/,
  )
  assert.match(questTools, /authority === "gm" \|\| context\.authority === "admin"/)
})

test("AI GM live-play prompt uses compact context and preserves resolver authority", () => {
  assert.match(agentIndex, /read_active_quest_context до скрытого квестового решения/)
  assert.match(agentIndex, /Не тащи полный read_quest_plan на каждый игровой ход/)
  assert.match(agentIndex, /автоматическое условие, не решай его сам/)
  assert.match(agentIndex, /custom_narrative/)
})

test("manual GM stage status uses lifecycle-safe RPC", () => {
  assert.match(lifecycleMigration, /set_quest_stage_status_v1/)
  assert.match(lifecycleMigration, /quest\.stage_completed/)
  assert.match(lifecycleMigration, /status = 'active'/)
  assert.match(lifecycleMigration, /quest_emit_completed_event_v1/)
  assert.match(managerHook, /set_quest_stage_status_v1/)
  assert.doesNotMatch(
    managerHook,
    /from\("quest_stages"\)[\s\S]{0,240}completed_at/,
  )
})

test("player-safe invalidation payload contains only public quest identity/status", () => {
  assert.match(
    runtimeMigration,
    /jsonb_build_object\([\s\S]{0,220}'quest_id'[\s\S]{0,220}'title'[\s\S]{0,220}'status'/,
  )
})
