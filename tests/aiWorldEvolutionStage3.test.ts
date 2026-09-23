import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923173005_ai_world_evolution_stage3_entity_classification_v1.sql", import.meta.url),
  "utf8",
)
const manager = readFileSync(
  new URL("../supabase/functions/voss-agent/manager-tools.ts", import.meta.url),
  "utf8",
)
const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const context = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-context.ts", import.meta.url),
  "utf8",
)

test("AI world evolution Stage 3 is certified with persisted safe classifications", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 3)
  assert.ok(stage)
  assert.equal(stage.status, "certified")
  assert.match(
    migration,
    /locations[\s\S]*background_simulation_scope[\s\S]*entity[\s\S]*detail[\s\S]*disabled/,
  )
  assert.match(
    migration,
    /npc_profiles[\s\S]*background_simulation_scope[\s\S]*entity[\s\S]*disabled/,
  )
  assert.match(migration, /default 'disabled'/)
})

test("whole nested locations are classified explicitly rather than by hierarchy depth", () => {
  assert.match(manager, /background_simulation_scope/)
  assert.match(manager, /enum: \["entity", "detail", "disabled"\]/)
  assert.match(runtime, /трактир внутри города может быть entity/)
  assert.match(runtime, /комната\/туалет\/коридор/)
  assert.doesNotMatch(runtime, /parent_location_id.{0,80}(?:eligible|eligibility|simulate)/i)
})

test("world materializer requires classification for every new location", () => {
  assert.match(runtime, /world_materializer_location_background_scope_required/)
  assert.match(runtime, /name === "create_location"/)
  assert.match(runtime, /name === "batch_location_changes"/)
  assert.match(runtime, /operation\.op === "create"/)
})

test("named persistent NPCs carry explicit background eligibility", () => {
  assert.match(manager, /enum: \["entity", "disabled"\]/)
  assert.match(migration, /v_background_scope/)
  assert.match(
    migration,
    /NPC background_simulation_scope must be entity or disabled/,
  )
  assert.match(context, /inventory_data,background_simulation_scope/)
})

test("unnamed scene extras cannot be materialized as permanent NPC cards", () => {
  assert.match(runtime, /looksLikeTemporarySceneActorLabel/)
  assert.match(runtime, /world_materializer_unnamed_scene_actor_rejected/)
  assert.match(runtime, /Бандит 1/)
  assert.match(runtime, /не вызывай create_world_npc/)
})

test("world materializer must classify new persistent NPCs deliberately", () => {
  assert.match(runtime, /world_materializer_npc_background_scope_required/)
  assert.match(runtime, /args\.background_simulation_scope !== "entity"/)
  assert.match(runtime, /Именованный гоблин не становится disabled/)
})

test("canonical context exposes persisted classifications to later AI turns", () => {
  assert.match(
    context,
    /visibility_mode,background_simulation_scope,lifecycle_state/,
  )
  assert.match(
    context,
    /inventory_data,background_simulation_scope/,
  )
})
