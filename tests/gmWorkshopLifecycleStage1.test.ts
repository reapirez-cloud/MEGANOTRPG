import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260920063208_gm_workshop_lifecycle_invariants_stage1.sql",
  "utf8",
)
const entityTypes = fs.readFileSync("src/entity-engine/types.ts", "utf8")
const entityStorage = fs.readFileSync("src/entity-engine/supabase.ts", "utf8")
const oracle = fs.readFileSync("src/oracle-engine/engine.ts", "utf8")
const workshopData = fs.readFileSync("src/ui-v1-isolated/useGMWorkshopData.ts", "utf8")
const workshopActions = fs.readFileSync("src/ui-v1-isolated/gmWorkshopSnakeActions.ts", "utf8")

test("stage 1 makes active character a database invariant", () => {
  assert.match(migration, /validate_campaign_member_active_character_v1/)
  assert.match(migration, /life_state = 'alive'/)
  assert.match(migration, /publication_state = 'campaign'/)
  assert.match(migration, /character_type = 'pc'/)
  assert.match(migration, /clear_invalid_character_activity_v1/)
  assert.match(migration, /active_character_id = null/)
})

test("stage 1 makes draft and NPC assignment rules database invariants", () => {
  assert.match(migration, /characters_draft_lifecycle_check/)
  assert.match(migration, /characters_npc_unassigned_check/)
  assert.match(migration, /Draft character must be private and unassigned/)
  assert.match(migration, /Assigned user is not a member of this campaign/)
})

test("PC and NPC conversion is one explicit atomic owner command", () => {
  assert.match(migration, /convert_campaign_character_type_v1/)
  assert.match(migration, /delete from public\.location_npc_habitats/)
  assert.match(migration, /delete from public\.character_npc_discoveries/)
  assert.match(migration, /Use convert_campaign_character_type_v1 to change character type/)
  assert.match(entityTypes, /kind: "entity\.convert_type"/)
  assert.match(entityStorage, /convert_campaign_character_type_v1/)
  assert.match(oracle, /kind: "entity\.convert_type"/)
  assert.match(workshopData, /convertCharacterType/)
  assert.match(workshopActions, /id: "convert-character-type"/)
  assert.doesNotMatch(workshopActions, /id: "characterType"/)
})

test("member removal releases assigned characters inside the canonical RPC", () => {
  assert.match(migration, /remove_campaign_member_v1/)
  assert.match(
    migration,
    /update public\.characters[\s\S]*assigned_user_id = null[\s\S]*delete from public\.campaign_members/,
  )
})
