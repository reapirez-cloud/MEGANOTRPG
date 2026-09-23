import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923204623_ai_world_evolution_stage9_daily_candidate_resolver_v1.sql", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 9 contract is certified", () => {
  const stage9 = contract.slice(
    contract.indexOf('id: 9,'),
    contract.indexOf('id: 10,'),
  )
  assert.match(stage9, /status: "certified"/)
})

test("stage 9 selection is independent and resolver-owned", () => {
  assert.match(migration, /background:day:%s:select:npc:%s/)
  assert.match(migration, /background:day:%s:select:location:%s/)
  assert.match(migration, /p_sides=>100/)
  assert.match(migration, /p_decision_kind=>'background\\.selection'/)
  assert.match(migration, /matched_outcome_key/)
  assert.doesNotMatch(migration, /round\\s*\\([^)]*0\\.30/i)
})

test("stage 9 only admits whole active entities", () => {
  assert.match(migration, /np\\.background_simulation_scope='entity'/)
  assert.match(migration, /l\\.background_simulation_scope='entity'/)
  assert.match(migration, /l\\.lifecycle_state='active'/)
  assert.match(migration, /ai_background_entity_is_protected_v1/)
})

test("stage 9 persists selected ids and severity rolls before the worker", () => {
  assert.match(migration, /selected_npc_ids/)
  assert.match(migration, /selected_location_ids/)
  assert.match(migration, /background:day:%s:severity:world/)
  assert.match(migration, /background:day:%s:severity:npc:%s/)
  assert.match(migration, /background:day:%s:severity:location:%s/)
  assert.doesNotMatch(migration, /rejected_npc_ids|rejected_location_ids/)
})

test("stage 9 RPC is service-role-only and AI-world-only", () => {
  assert.match(migration, /auth\\.role\\(\\) <> 'service_role'/)
  assert.match(migration, /private\\.is_ai_world_campaign_v1\\(p_campaign_id\\)/)
  assert.match(migration, /revoke all on function public\\.resolve_ai_background_daily_candidates_v1/)
  assert.match(
    migration,
    /grant execute on function public\\.resolve_ai_background_daily_candidates_v1[\\s\\S]*to service_role/,
  )
})
