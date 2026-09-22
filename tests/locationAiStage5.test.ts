import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const managerTools = fs.readFileSync(
  "supabase/functions/voss-agent/manager-tools.ts",
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
const migration = fs.readFileSync(
  "supabase/migrations/20260922215214_location_ai_api_stage5_v1.sql",
  "utf8",
)

test("stage 5 exposes live location control tools to Freddy", () => {
  for (const name of [
    "move_character_world",
    "set_world_discovery",
    "set_npc_habitat",
    "upsert_location_transition",
    "delete_location_transition",
  ]) {
    assert.match(managerTools, new RegExp(`name: "${name}"`))
  }
})

test("world movement uses canonical DB API and preserves resolver triggers", () => {
  assert.match(managerTools, /move_character_world_v1/)
  assert.match(migration, /create or replace function public\.move_character_world_v1/i)
  assert.match(migration, /set_character_world_position/i)
  assert.match(agentIndex, /move_character_world автоматически открывает целевую локацию/)
})

test("world discovery validates canonical entity boundaries", () => {
  assert.match(migration, /manage_world_discovery_v1/i)
  assert.match(migration, /Location must belong to the character campaign/)
  assert.match(migration, /NPC must belong to the character campaign/)
  assert.match(migration, /Transition must belong to the character campaign/)
  assert.match(migration, /Target must be a published world NPC/)
  assert.match(managerTools, /p_source: "ai_gm"/)
})

test("location transitions are directional canonical entities", () => {
  assert.match(migration, /upsert_location_transition_v1/i)
  assert.match(migration, /delete_location_transition_v1/i)
  assert.match(migration, /Transition source and target must differ/)
  assert.match(migration, /'directional',true/)
  assert.match(agentIndex, /Переходы локаций направленные/)
})

test("read_location returns live world context beyond prose", () => {
  for (const token of [
    "currentOccupants",
    "npcHabitats",
    "worldStorages",
    "discovery",
    "character_location_discoveries",
    "character_location_link_discoveries",
    "location_npc_habitats",
    "character_world_state",
  ]) {
    assert.match(readTools, new RegExp(token))
  }
})

test("habitat and current position remain separate concepts", () => {
  assert.match(managerTools, /Habitat means where the NPC can normally be encountered/)
  assert.match(agentIndex, /set_npc_habitat означает обычное место/)
  assert.match(agentIndex, /Это не текущая позиция NPC/)
})

test("quest placeholders are not replaced by discovery", () => {
  assert.match(agentIndex, /set_world_discovery меняет знание персонажа/)
  assert.match(agentIndex, /не создаёт сущность/)
  assert.match(agentIndex, /quest placeholder/)
})

test("legacy set_world_discovery is hardened through the canonical API", () => {
  assert.match(migration, /create or replace function public\.set_world_discovery/i)
  assert.match(migration, /manage_world_discovery_v1/)
})
