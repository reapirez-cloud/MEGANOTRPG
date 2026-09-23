import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923175755_ai_world_evolution_stage5_scene_actors_v1.sql", import.meta.url),
  "utf8",
)

test("AI world evolution Stage 5 is certified with ephemeral actor storage", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 5)
  assert.ok(stage)
  assert.equal(stage.status, "certified")
  assert.match(migration, /create table public\.ai_scene_actors/)
  assert.match(migration, /create table public\.ai_scene_actor_resources/)
  assert.match(migration, /source_bestiary_slug/)
  assert.match(migration, /sheet_snapshot jsonb/)
  assert.match(migration, /mechanics_snapshot jsonb/)
})

test("scene actors are independent runtime UUIDs rather than temporary characters", () => {
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/)
  assert.match(migration, /runtime_ordinal integer not null/)
  assert.match(migration, /current_hp integer not null/)
  assert.match(migration, /conditions jsonb/)
  assert.match(migration, /effects jsonb/)
  assert.doesNotMatch(migration, /insert into public\.characters/)
  assert.doesNotMatch(migration, /delete from public\.characters/)
})

test("spawn uses the shared bestiary compiler and room-owned temporal state", () => {
  assert.match(
    migration,
    /v_compiled := private\.compile_bestiary_runtime_v1\(v_slug\)/,
  )
  assert.match(migration, /v_room\.location_id/)
  assert.match(migration, /v_room\.campaign_day/)
  assert.match(migration, /v_room\.day_period/)
  assert.match(migration, /coalesce\(v_compiled->'mechanics'/)
  assert.match(migration, /jsonb_array_elements\(v_resources\)/)
})

test("multi-instance spawn is retry-safe and keeps ordinal separate from identity", () => {
  assert.match(
    migration,
    /unique \(campaign_id, room_id, spawn_key, runtime_ordinal\)/,
  )
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /ai_scene_actor_spawn_key_conflict/)
  assert.match(migration, /ai_scene_actor_label_must_not_embed_ordinal/)
  assert.match(migration, /for v_ordinal in 1\.\.p_count loop/)
})

test("actor-local HP effects and resources mutate with optimistic concurrency", () => {
  assert.match(migration, /set_ai_scene_actor_runtime_v1/)
  assert.match(migration, /p_expected_revision bigint/)
  assert.match(migration, /ai_scene_actor_revision_conflict/)
  assert.match(migration, /where actor_id=v_actor\.id and state_key=v_key/)
  assert.match(migration, /current <= max_snapshot/)
})

test("Stage 5 exposes spawn list and archive boundaries without direct client writes", () => {
  assert.match(migration, /spawn_ai_scene_actors_v1/)
  assert.match(migration, /list_ai_scene_actors_v1/)
  assert.match(migration, /archive_ai_scene_actor_v1/)
  assert.match(migration, /runtime_state='archived'/)
  assert.match(
    migration,
    /revoke all on table public\.ai_scene_actors from public, anon, authenticated, service_role/,
  )
  assert.match(
    migration,
    /grant select on table public\.ai_scene_actors to service_role/,
  )
  assert.match(
    migration,
    /grant execute on function public\.spawn_ai_scene_actors_v1[\s\S]*to service_role/,
  )
})

test("scene actor storage is AI-world-only", () => {
  assert.match(migration, /private\.is_ai_world_campaign_v1/)
  assert.match(migration, /ai_scene_actor_ai_world_only/)
  assert.match(migration, /ai_scene_actors_ai_world_guard/)
  assert.match(migration, /ai_scene_actor_resources_ai_world_guard/)
})
