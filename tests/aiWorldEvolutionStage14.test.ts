import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260924054219_ai_world_evolution_stage14_canonical_materialization_v1.sql", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 14 contract is certified", () => {
  const stage14 = contract.slice(
    contract.indexOf('id: 14,'),
    contract.indexOf('id: 15,'),
  )
  assert.match(stage14, /status: "certified"/)
})

test("materialization uses the minimum active-player game day", () => {
  assert.match(migration, /select min\(coalesce\(ws\.campaign_day,1\)\)/)
  assert.match(migration, /cm\.active_character_id/)
  assert.match(migration, /status='blocked_temporal'/)
})

test("background event captures owner baseline before later materialization", () => {
  assert.match(migration, /materialization_guard/)
  assert.match(migration, /expected_before/)
  assert.match(migration, /desired_after/)
  assert.match(migration, /previous_snapshot_id/)
})

test("newer canonical state blocks old background writes", () => {
  assert.match(migration, /status='blocked_conflict'/)
  assert.match(migration, /v_current_value is distinct from v_expected_value/)
  assert.match(migration, /v_current_value is distinct from v_desired_value/)
})

test("materialization is idempotent and ordered", () => {
  assert.match(migration, /event_id uuid primary key/)
  assert.match(migration, /v_receipt\.applied_at is not null/)
  assert.match(migration, /status='blocked_predecessor'/)
  assert.match(migration, /order by e\.effective_game_day,e\.created_at,e\.id/)
})

test("owner bridge supports NPC death movement and location lifecycle", () => {
  assert.match(migration, /update public\.characters/)
  assert.match(migration, /life_state=v_desired->>'life_state'/)
  assert.match(migration, /insert into public\.character_world_state/)
  assert.match(migration, /location_id=excluded\.location_id/)
  assert.match(migration, /update public\.locations/)
  assert.match(migration, /lifecycle_state=v_desired->>'lifecycle_state'/)
})

test("quest and explicit protections block materialization", () => {
  assert.match(migration, /ai_background_entity_is_protected_v1/)
  assert.match(migration, /q\.status='active'/)
  assert.match(migration, /status='blocked_protection'/)
})

test("safe player time advancement automatically retries blocked events", () => {
  assert.match(migration, /character_world_state_stage14_materialize/)
  assert.match(migration, /new\.campaign_day>old\.campaign_day/)
  assert.match(migration, /materialize_safe_ai_background_events_v1\(new\.campaign_id,128\)/)
})

test("Stage 14 public RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.materialize_safe_ai_background_events_v1\(uuid,integer\)[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.materialize_safe_ai_background_events_v1\(uuid,integer\)[\s\S]*to service_role/,
  )
})
