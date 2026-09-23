import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923194814_ai_world_evolution_stage8_scene_actor_promotion_v1.sql", import.meta.url),
  "utf8",
)
const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)

test("AI world evolution Stage 8 is certified", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 8)
  assert.ok(stage)
  assert.equal(stage.status, "certified")
})

test("promotion has one idempotent actor to canonical NPC mapping", () => {
  assert.match(migration, /promoted_character_id uuid references public\.characters/)
  assert.match(migration, /unique index ai_scene_actors_promoted_character_uidx/)
  assert.match(migration, /select \* into v_actor[\s\S]*for update/)
  assert.match(migration, /if v_actor\.promoted_character_id is not null/)
  assert.match(migration, /'replayed',true/)
  assert.match(migration, /scene_actor_promotion_name_conflict/)
})

test("promotion preserves HP conditions effects location and game time", () => {
  assert.match(migration, /max_hp=v_actor\.max_hp/)
  assert.match(migration, /current_hp=v_actor\.current_hp/)
  assert.match(migration, /'sceneActorConditions',v_actor\.conditions/)
  assert.match(migration, /'sceneActorEffects',v_actor\.effects/)
  assert.match(
    migration,
    /v_actor\.location_id,[\s\S]*v_actor\.campaign_day,v_actor\.day_period/,
  )
})

test("promotion preserves actor-local resources instead of restoring full uses", () => {
  assert.match(migration, /from public\.ai_scene_actor_resources/)
  assert.match(migration, /'npc_runtime_'\|\|v_resource\.state_key/)
  assert.match(migration, /v_resource\.current/)
  assert.match(migration, /v_resource\.max_snapshot/)
})

test("promotion preserves the exact compiled actor snapshot and bestiary provenance", () => {
  assert.match(migration, /v_actor\.mechanics_snapshot/)
  assert.match(migration, /bestiary_runtime_mechanic_for_npc_v1/)
  assert.match(migration, /'source_digest',v_actor\.source_digest/)
  assert.match(migration, /'snapshot_preserved',true/)
  assert.match(migration, /meganot\.scene_actor_promotion/)
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.promote_ai_scene_actor_to_npc_v1"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.execute_ai_gm_actor_action_turn_v1"),
    ),
    /compile_bestiary_runtime_v1\(/,
  )
})

test("promotion writes discovery state for PCs that learned the identity", () => {
  assert.match(migration, /p_discover_for_character_ids uuid\[\]/)
  assert.match(migration, /character_npc_discoveries/)
  assert.match(migration, /source_message_id/)
  assert.match(migration, /scene_actor_promotion_discovery_character_invalid/)
})

test("promoted actor stops acting independently and stale refs redirect to NPC", () => {
  assert.match(migration, /runtime_state='archived'/)
  assert.match(migration, /archive_reason='promoted'/)
  assert.match(migration, /resolve_ai_combat_actor_ref_v2/)
  assert.match(migration, /'redirected',true/)
  assert.match(migration, /'npc-runtime-'\|\|/)
})

test("primary GM has a narrow promotion tool for real identity reveals", () => {
  assert.match(runtime, /name: "promote_scene_actor"/)
  assert.match(runtime, /настоящее личное имя/)
  assert.match(runtime, /Гоблин 3\/7 HP говорит 'Я Ург'/)
  assert.match(runtime, /promote_ai_scene_actor_to_npc_v1/)
  assert.match(runtime, /scene_actor_promotion_requires_real_personal_name/)
  assert.match(runtime, /scene_actor_promotion_discovery_scope_invalid/)
})

test("promotion discovery recipients are constrained to colocated PCs", () => {
  assert.match(runtime, /eligibleDiscoveryIds = new Set/)
  assert.match(runtime, /player\.location_id/)
  assert.match(runtime, /context\.sourceLocation\?\.id/)
  assert.match(runtime, /discoverIds\.some\(\(id\) => !eligibleDiscoveryIds\.has\(id\)\)/)
})

test("world materializer remains the wrong path for promoting an existing scene actor", () => {
  assert.match(runtime, /Не вызывай create_world_npc для этого случая/)
  assert.match(runtime, /world_materializer_unnamed_scene_actor_rejected/)
})
