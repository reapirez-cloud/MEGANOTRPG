import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { requiredLocationRoles } from "../supabase/functions/voss-agent/location-hierarchy.ts"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const manager = read("supabase/functions/voss-agent/manager-tools.ts")
const migration = read(
  "supabase/migrations/20260925071000_ai_gm_stage26_cascade_world_builder_v1.sql",
)
const pendingMigration = read(
  "supabase/migrations/20260926190000_ai_gm_location_pending_roles_and_deepseek_high_v1.sql",
)
const hierarchy = read("supabase/functions/voss-agent/location-hierarchy.ts")
const provider = read("supabase/functions/voss-agent/provider-gateway.ts")
const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")

test("Stage 26 persists location structure metadata", () => {
  assert.match(migration, /add column if not exists archetype/)
  assert.match(migration, /add column if not exists scale/)
  assert.match(migration, /structure_roles text\[\]/)
  assert.match(migration, /structure_state text/)
  assert.match(migration, /coverage_manifest jsonb/)
  assert.match(context, /sourceLocationChildren/)
  assert.match(context, /source_location_structure/)
})

test("Stage 26 exposes one composite cascade tool to both materializers", () => {
  assert.match(manager, /name: "materialize_location_cascade"/)
  assert.match(manager, /ai_gm_materialize_location_cascade_v1/)
  assert.match(runtime, /WORLD_MATERIALIZER_TOOL_NAMES[\s\S]*"materialize_location_cascade"/)
  assert.match(runtime, /STAGE18_POST_TURN_MANAGER_TOOL_NAMES[\s\S]*"materialize_location_cascade"/)
  assert.match(runtime, /kind === "location"[\s\S]*"materialize_location_cascade"/)
})

test("Stage 26 forbids recursive grandchildren in one cascade", () => {
  assert.match(migration, /cascade_nested_children_forbidden/)
  assert.match(runtime, /Никогда не строй grandchildren/)
  assert.match(runtime, /город → 2–4 опорных района/)
  assert.match(runtime, /children=\[\]/)
  assert.match(runtime, /prepareLocationCascadeInput\(admin, campaignId, toolArgs\)/)
})

test("Stage 26 validates functional coverage instead of trusting prose", () => {
  assert.match(migration, /when 'city' then array\['residential','commerce','governance','security','transit','services'\]/)
  assert.match(migration, /cascade_required_role_missing/)
  assert.match(migration, /omitted_roles/)
  assert.match(migration, /coverage_complete/)
})

test("Stage 26 records unseen structural roles as pending and accepts a tavern exterior", () => {
  assert.deepEqual(requiredLocationRoles("tavern"), ["public_hall", "service", "storage"])
  assert.deepEqual(requiredLocationRoles("road"), [])
  for (const archetype of [
    "city", "town", "village", "port", "tavern", "inn", "temple",
    "castle", "dungeon", "cave", "forest",
  ]) {
    const sqlRoles = pendingMigration.match(
      new RegExp(`when '${archetype}' then array\\[([^\\]]+)\\]`),
    )?.[1].match(/'([^']+)'/g)?.map((role) => role.slice(1, -1))
    assert.deepEqual(requiredLocationRoles(archetype), sqlRoles, archetype)
  }
  assert.match(pendingMigration, /when 'tavern' then array\['public_hall','service','storage'\]/)
  assert.match(pendingMigration, /where not \(role = any\(v_covered_roles\)\)/)
  assert.match(pendingMigration, /'coverage_complete',cardinality\(v_pending_roles\)=0/)
  assert.match(pendingMigration, /'pending_roles',to_jsonb\(v_pending_roles\)/)
  assert.doesNotMatch(pendingMigration, /cascade_required_role_missing/)
  assert.match(hierarchy, /tavern: \["public_hall", "service", "storage"\]/)
  assert.match(manager, /expected_roles: \[\.\.\.requiredRoles\]/)
  assert.match(runtime, /Если герой только увидел вывеску с улицы, передай children=\[\]/)
})

test("DeepSeek 4.1 junior requests high reasoning on initial and fallback routes", () => {
  assert.match(provider, /model_key === "deepseek-v4\.1-flash"\) return "high"/)
  assert.match(runtime, /\["gpt-5\.6-luna", "deepseek-v4\.1-flash"\]\.includes\(model\.model_key\)/)
  assert.match(runtime, /\["gpt-5\.6-luna", "deepseek-v4\.1-flash"\]\.includes\(fallbackModel\.model_key\)/)
})

test("Stage 26 can move a PC in the same canonical cascade transaction", () => {
  assert.match(migration, /move_character_world_v1/)
  assert.match(manager, /move_character_id/)
  assert.match(runtime, /обязательно передавай move_character_id=source_character\.id/)
  assert.match(runtime, /character_world_state/)
})

test("Stage 26 auto-repairs legacy current-location stubs", () => {
  assert.match(runtime, /sourceLocationNeedsCascade/)
  assert.match(runtime, /structure_state/)
  assert.match(runtime, /Stage 26: классифицируй текущую source_location/)
  assert.match(runtime, /function: \{ name: "materialize_location_cascade" \}/)
})

test("Stage 26 also closes the remaining behavior-profile helper permission", () => {
  assert.match(
    migration,
    /grant execute on function private\.ai_gm_behavior_profile_json_v1\(text\)[\s\S]*authenticated/,
  )
})

test("Stage 26 roadmap is recorded", () => {
  assert.match(roadmap, /## Stage 26 — Cascade World Builder/)
  assert.match(roadmap, /\*\*Status: IMPLEMENTED/)
})
