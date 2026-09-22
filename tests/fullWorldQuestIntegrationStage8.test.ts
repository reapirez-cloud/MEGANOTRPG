import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const stage1 = fs.readFileSync(
  "supabase/migrations/20260922210614_character_biography_stage1_v1.sql",
  "utf8",
)
const stage2 = fs.readFileSync(
  "supabase/migrations/20260922211142_npc_engine_stage2_v1.sql",
  "utf8",
)
const stage4 = fs.readFileSync(
  "supabase/migrations/20260922213719_character_biography_stage4_factions_v1.sql",
  "utf8",
)
const stage4Realtime = fs.readFileSync(
  "supabase/migrations/20260922214338_character_biography_stage4_realtime_revision_v1.sql",
  "utf8",
)
const stage5 = fs.readFileSync(
  "supabase/migrations/20260922215214_location_ai_api_stage5_v1.sql",
  "utf8",
)
const stage6 = fs.readFileSync(
  "supabase/migrations/20260922215945_quest_world_bridge_stage6_v1.sql",
  "utf8",
)
const stage6Fix = fs.readFileSync(
  "supabase/migrations/20260922220435_quest_world_bridge_stage6_item_source_fix_v1.sql",
  "utf8",
)
const stage7 = fs.readFileSync(
  "supabase/migrations/20260922221255_location_secrets_stage7_v1.sql",
  "utf8",
)
const managerTools = fs.readFileSync(
  "supabase/functions/voss-agent/manager-tools.ts",
  "utf8",
)
const questTools = fs.readFileSync(
  "supabase/functions/voss-agent/quest-tools.ts",
  "utf8",
)
const readTools = fs.readFileSync(
  "supabase/functions/voss-agent/read-tools.ts",
  "utf8",
)
const agentIndex = fs.readFileSync(
  "supabase/functions/voss-agent/index.ts",
  "utf8",
)

test("final world model contains relationships property factions locations and secrets", () => {
  assert.match(stage1, /create table public\.character_relationships/i)
  assert.match(stage1, /create table public\.character_assets/i)
  assert.match(stage2, /create table public\.npc_profiles/i)
  assert.match(stage4, /create table public\.factions/i)
  assert.match(stage4, /create table public\.character_faction_reputations/i)
  assert.match(stage7, /create table public\.location_secrets/i)
})

test("player-safe biography is the read boundary for hidden character state", () => {
  assert.match(stage1, /read_character_biography_v1/i)
  assert.match(stage1, /read_character_biography_manager_v1/i)
  assert.match(stage1, /gm_note/)
  assert.match(stage4, /faction_reputations/)
  assert.match(stage4, /player_visible/)
  assert.match(stage4Realtime, /character_biography_revisions/)
})

test("NPCs participate in canonical world position habitat discovery and relationships", () => {
  assert.match(stage2, /create_world_npc_v1/i)
  assert.match(stage2, /location_npc_habitats/)
  assert.match(stage2, /character_npc_discoveries/)
  assert.match(stage2, /character_relationships/)
  assert.match(managerTools, /name: "create_world_npc"/)
  assert.match(managerTools, /name: "update_world_npc"/)
})

test("location AI API uses canonical discovery movement and directional transitions", () => {
  assert.match(stage5, /manage_world_discovery_v1/i)
  assert.match(stage5, /move_character_world_v1/i)
  assert.match(stage5, /upsert_location_transition_v1/i)
  assert.match(stage5, /delete_location_transition_v1/i)
  assert.match(agentIndex, /Переходы локаций направленные/)
})

test("quest placeholders materialize atomically into canonical world entities", () => {
  assert.match(stage6, /materialize_quest_target_v1/i)
  assert.match(stage6, /for update/i)
  assert.match(stage6, /create_world_npc_v1/i)
  assert.match(stage6, /insert into public\.locations/i)
  assert.match(stage6, /create_reference_definition_v2/i)
  assert.match(stage6, /private\.resolve_quest_v1\(p_quest_id\)/)
  assert.match(stage6Fix, /'custom'/)
  assert.match(stage6Fix, /'quest_target:' \|\| v_target\.id::text/)
  assert.match(questTools, /name: "materialize_quest_target"/)
})

test("location secrets are manager-only durable state with history", () => {
  assert.match(stage7, /create table public\.location_secret_revisions/i)
  assert.match(stage7, /private\.can_manage_location\(location_id\)/)
  assert.match(stage7, /status in \('active','resolved','retired'\)/)
  assert.match(stage7, /record_location_secret_revision_v1/)
  assert.doesNotMatch(stage7, /alter publication supabase_realtime/i)
  assert.match(readTools, /context\.canManage \? \{ locationSecrets \} : \{\}/)
})

test("Freddy keeps quest secrets and persistent location secrets separate", () => {
  assert.match(agentIndex, /Quest Engine является каноническим состоянием квестов/)
  assert.match(agentIndex, /постоянная скрытая часть канонического мира/)
  assert.match(agentIndex, /не держи только в заметке квеста/)
  assert.match(agentIndex, /не публикует этот текст игроку автоматически/)
})

test("final manager tool surface contains every cross-system mutation used by the flow", () => {
  for (const toolName of [
    "create_world_npc",
    "update_world_npc",
    "upsert_faction",
    "set_faction_membership",
    "set_character_faction_reputation",
    "move_character_world",
    "set_world_discovery",
    "set_npc_habitat",
    "upsert_location_transition",
    "delete_location_transition",
    "upsert_location_secret",
    "set_location_secret_state",
  ]) {
    assert.match(managerTools, new RegExp(`name: "${toolName}"`))
  }
  assert.match(questTools, /name: "materialize_quest_target"/)
})

test("hidden location secret tables never become player realtime payloads", () => {
  assert.doesNotMatch(stage7, /supabase_realtime/)
  assert.match(stage4Realtime, /character_biography_revisions/)
})
