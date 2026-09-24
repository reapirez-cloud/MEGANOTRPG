import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260924061250_ai_world_evolution_stage16_scene_actor_retention_v1.sql", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 16 contract is certified", () => {
  const stage16 = contract.slice(
    contract.indexOf('id: 16,'),
    contract.indexOf('id: 17,'),
  )
  assert.match(stage16, /status: "certified"/)
})

test("only archived actors can be compacted", () => {
  assert.match(migration, /v_actor\.runtime_state<>'archived'/)
  assert.match(migration, /runtime_state='archived'/)
  assert.match(migration, /retention_state='full'/)
})

test("retention waits for the lagging-player safe day", () => {
  assert.match(
    migration,
    /ai_background_safe_materialization_day_v1\(p_campaign_id\)/,
  )
  assert.match(migration, /v_cutoff_day:=greatest\(0,v_safe_day-p_keep_game_days\)/)
  assert.match(migration, /a\.campaign_day<=v_cutoff_day/)
})

test("heavy runtime is summarized before pruning", () => {
  assert.match(migration, /'sheet_digest'/)
  assert.match(migration, /'mechanics_digest'/)
  assert.match(migration, /'resources',v_resources/)
  assert.match(migration, /'command_receipt_count',v_command_count/)
  assert.match(migration, /'damage_receipt_count',v_damage_count/)
  assert.match(migration, /delete from public\.ai_scene_actor_resources/)
  assert.match(migration, /mechanics_snapshot='\[\]'::jsonb/)
  assert.match(migration, /sheet_snapshot=jsonb_build_object/)
})

test("encounter receipts and lightweight provenance are preserved", () => {
  const compactStart = migration.indexOf(
    "create or replace function private.compact_ai_scene_actor_v1",
  )
  const compactEnd = migration.indexOf(
    "create or replace function private.compact_ai_scene_actor_retention_v1",
  )
  const body = migration.slice(compactStart, compactEnd)

  assert.doesNotMatch(body, /delete from public\.ai_scene_actor_command_receipts/)
  assert.doesNotMatch(body, /delete from public\.ai_scene_actor_damage_receipts/)
  assert.match(body, /'source_bestiary_slug'/)
  assert.match(body, /'source_digest'/)
  assert.match(body, /'spawn_key'/)
  assert.match(body, /'room_id'/)
})

test("promoted actors require Stage 15 handoff before compaction", () => {
  assert.match(migration, /v_actor\.promoted_character_id is not null/)
  assert.match(migration, /s\.provenance->>'stage'='15'/)
  assert.match(migration, /s\.provenance->>'source_actor_id'=v_actor\.id::text/)
  assert.match(migration, /promoted_handoff_snapshot_missing/)
})

test("compaction is idempotent and automatic on safe time advancement", () => {
  assert.match(migration, /v_actor\.retention_state='compacted'/)
  assert.match(migration, /'replayed',true/)
  assert.match(migration, /ai_background_materialize_after_world_time_v1/)
  assert.match(
    migration,
    /compact_ai_scene_actor_retention_v1\([\s\S]*new\.campaign_id,14,128/,
  )
})

test("retention RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.compact_ai_scene_actor_retention_v1\(uuid,integer,integer\)[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.compact_ai_scene_actor_retention_v1\(uuid,integer,integer\)[\s\S]*to service_role/,
  )
})
