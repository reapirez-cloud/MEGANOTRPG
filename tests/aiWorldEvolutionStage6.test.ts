import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923182328_ai_world_evolution_stage6_scene_actor_combat_v1.sql", import.meta.url),
  "utf8",
)
const playerRoll = readFileSync(
  new URL("../supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql", import.meta.url),
  "utf8",
)
const fkIndexes = readFileSync(
  new URL("../supabase/migrations/20260923182711_ai_world_evolution_stage6_scene_actor_fk_indexes_v1.sql", import.meta.url),
  "utf8",
)

test("AI world evolution Stage 6 is certified", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 6)
  assert.ok(stage)
  assert.equal(stage.status, "certified")
})

test("one actor reference dispatches canonical NPCs and ephemeral scene actors", () => {
  assert.match(migration, /normalize_ai_combat_actor_ref_v1/)
  assert.match(migration, /v_kind='npc'/)
  assert.match(migration, /v_kind='scene_actor'/)
  assert.match(migration, /execute_ai_gm_npc_action_turn_v1/)
  assert.match(migration, /execute_ai_gm_scene_actor_action_turn_v1/)
  assert.match(migration, /execute_ai_gm_npc_roll_v2/)
  assert.match(migration, /execute_ai_gm_scene_actor_roll_v1/)
})

test("scene actor actions read server-owned compiled mechanics and accept no numeric mechanic parameters", () => {
  assert.match(
    migration,
    /jsonb_array_elements\(coalesce\(v_actor\.mechanics_snapshot,'\[\]'::jsonb\)\)/,
  )
  assert.match(migration, /value->>'stable_key'=v_key/)
  assert.match(migration, /scene_actor_mechanic_not_found/)
  assert.match(migration, /ai_scene_actor_roll_dice_v1/)
  assert.doesNotMatch(
    migration,
    /execute_ai_gm_scene_actor_action_turn_v1\([^)]*(attack_bonus|damage_dice|save_dc|resource_cost)/i,
  )
})

test("scene actor resources are consumed on the actor-local ledger", () => {
  assert.match(migration, /from public\.ai_scene_actor_resources/)
  assert.match(migration, /where actor_id=v_actor\.id and state_key=v_resource->>'key'/)
  assert.match(migration, /set current=current-1/)
  assert.match(migration, /scene_actor_resource_exhausted/)
})

test("scene actor save actions reuse the existing player hard-wait and resume pipeline", () => {
  assert.match(migration, /create_ai_gm_player_roll_request_v1/)
  assert.match(migration, /'waiting_for_user',true/)
  assert.match(migration, /last_scene_actor_action/)
  assert.match(playerRoll, /status='waiting_for_user'/)
  assert.match(playerRoll, /resolve_player_roll_request_v1/)
  assert.match(playerRoll, /set status='queued'/)
  assert.match(playerRoll, /dispatch_ai_gm_roll_resume_v1/)
})

test("damage is derived from a server roll receipt rather than a model-supplied amount", () => {
  assert.match(migration, /apply_ai_scene_actor_damage_from_roll_v1/)
  assert.match(migration, /event_payload#>>'\{effect,total\}'|event_payload#>>'\{effect,total\}'/)
  assert.match(migration, /ai_scene_actor_damage_receipts/)
  assert.match(migration, /life_state=case when v_hp=0 then 'dead'/)
  assert.doesNotMatch(
    migration,
    /apply_ai_scene_actor_damage_from_roll_v1\([^)]*p_damage/i,
  )
})

test("flee and remove are revision-checked actor-local transitions", () => {
  assert.match(migration, /v_transition not in \('flee','remove'\)/)
  assert.match(migration, /scene_actor_revision_conflict/)
  assert.match(migration, /set life_state='fled'/)
  assert.match(migration, /set runtime_state='archived'/)
})

test("command receipts make resource spending and rolls retry-safe", () => {
  assert.match(migration, /ai_scene_actor_command_receipts/)
  assert.match(migration, /command_id uuid primary key/)
  assert.match(migration, /input_fingerprint/)
  assert.match(migration, /scene_actor_command_conflict/)
})

test("Stage 6 combat surfaces are service-only", () => {
  assert.match(
    migration,
    /revoke all on function public\.execute_ai_gm_actor_action_turn_v1[\s\S]*from public,anon,authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.execute_ai_gm_actor_action_turn_v1[\s\S]*to service_role/,
  )
})


test("Stage 6 receipt composite foreign keys have covering indexes in FK order", () => {
  assert.match(
    fkIndexes,
    /ai_scene_actor_command_receipts\(actor_id,campaign_id\)/,
  )
  assert.match(
    fkIndexes,
    /ai_scene_actor_damage_receipts\(actor_id,campaign_id\)/,
  )
})
