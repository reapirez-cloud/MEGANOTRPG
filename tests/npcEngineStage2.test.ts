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
  "supabase/migrations/20260922211142_npc_engine_stage2_v1.sql",
  "utf8",
)

test("world NPC tools expose atomic create and update operations", () => {
  assert.match(managerTools, /name: "create_world_npc"/)
  assert.match(managerTools, /name: "update_world_npc"/)
  assert.match(managerTools, /create_world_npc_v1/)
  assert.match(managerTools, /update_world_npc_v1/)
})

test("NPC tools are available through character write capability", () => {
  assert.match(
    agentIndex,
    /managerCharacterToolNames[\s\S]*"create_world_npc"[\s\S]*"update_world_npc"/,
  )
  assert.match(
    agentIndex,
    /grantedCapabilities\.has\("characters\.write"\)[\s\S]*managerCharacterToolNames/,
  )
})

test("canonical world NPC creation is one database transaction surface", () => {
  assert.match(migration, /create or replace function public\.create_world_npc_v1/i)
  assert.match(migration, /insert into public\.characters/i)
  assert.match(migration, /update public\.character_sheets/i)
  assert.match(migration, /insert into public\.npc_profiles/i)
  assert.match(migration, /character_world_state/i)
  assert.match(migration, /location_npc_habitats/i)
  assert.match(migration, /character_relationships/i)
  assert.match(migration, /character_npc_discoveries/i)
})

test("NPC profile adds world identity without duplicating the D&D sheet", () => {
  assert.match(migration, /create table public\.npc_profiles/i)
  assert.match(migration, /challenge_rating numeric/)
  assert.match(migration, /occupation text/)
  assert.match(migration, /appearance text/)
  assert.match(migration, /demeanor text/)
  assert.match(migration, /motivation text/)
  assert.doesNotMatch(migration, /npc_profiles[\s\S]{0,800}strength integer/)
})

test("GM read_character receives NPC profile, habitats and relationships", () => {
  assert.match(readTools, /from\("npc_profiles"\)/)
  assert.match(readTools, /from\("location_npc_habitats"\)/)
  assert.match(readTools, /from\("character_relationships"\)/)
  assert.match(readTools, /npcProfile/)
  assert.match(readTools, /npcHabitats/)
  assert.match(readTools, /npcRelationships/)
})

test("AI instructions preserve quest placeholders until the NPC actually enters play", () => {
  assert.match(agentIndex, /Не создавай заранее NPC, предмет или локацию/)
  assert.match(agentIndex, /Для NPC, который уже реально вошёл в игру/)
  assert.match(agentIndex, /create_world_npc/)
  assert.match(agentIndex, /update_world_npc/)
})

test("NPC profile stays manager-only at table level", () => {
  assert.match(migration, /alter table public\.npc_profiles enable row level security/i)
  assert.match(migration, /npc_profiles_manager_read/)
  assert.match(migration, /private\.can_manage_character\(character_id\)/)
  assert.match(migration, /gm_notes text/)
})
