import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const hardening = readFileSync(
  new URL("../supabase/migrations/20260924143055_ai_world_evolution_stage17_bound_proof_and_replay_v3.sql", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("Stage 17 runtime uses only hardened service entrypoints", () => {
  assert.match(runtime, /create_ai_gm_player_roll_request_v4/)
  assert.match(runtime, /record_ai_gm_deterministic_adjudication_v2/)
  assert.doesNotMatch(runtime, /admin\.rpc\(\s*["']create_ai_gm_player_roll_request_v1["']/)
  assert.doesNotMatch(runtime, /admin\.rpc\(\s*["']create_ai_gm_player_roll_request_v3["']/)
  assert.doesNotMatch(runtime, /admin\.rpc\(\s*["']record_ai_gm_deterministic_adjudication_v1["']/)
})

test("Stage 17 world proof is current-scene bound", () => {
  assert.match(hardening, /stage17_validate_bound_world_proof_v1/)
  assert.match(hardening, /stage17_world_evidence_not_bound_to_current_scene/)
  assert.match(hardening, /stage17_location_within_scope_v1/)
  assert.match(hardening, /item_definition/)
  assert.match(runtime, /quest_target_ids: questTargetIds/)
})

test("Stage 17 pending roll replay fails closed on contract changes", () => {
  assert.match(hardening, /stage17_pending_roll_replay_contract_mismatch/)
  assert.match(hardening, /canonical_evidence is distinct from v_validated_evidence/)
  assert.match(hardening, /resolver_decision_key is distinct from v_resolver_key/)
})

test("Stage 17 legacy service bypass is revoked", () => {
  assert.match(hardening, /create_ai_gm_player_roll_request_v1[\s\S]*service_role/)
  assert.match(hardening, /create_ai_gm_player_roll_request_v3[\s\S]*service_role/)
  assert.match(hardening, /record_ai_gm_deterministic_adjudication_v1[\s\S]*service_role/)
})

test("Stage 17 contract status is implemented", () => {
  const start = contract.indexOf("id: 17,")
  const end = contract.indexOf("id: 18,", start)
  assert.ok(start >= 0 && end > start)
  assert.match(contract.slice(start, end), /status: "implemented"/)
})
