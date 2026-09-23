import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923210458_ai_world_evolution_stage10_flash_background_worker_v1.sql", import.meta.url),
  "utf8",
)
const worker = readFileSync(
  new URL("../supabase/functions/voss-agent/background-world.ts", import.meta.url),
  "utf8",
)
const provider = readFileSync(
  new URL("../supabase/functions/voss-agent/provider-gateway.ts", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 10 contract is certified", () => {
  const stage10 = contract.slice(
    contract.indexOf('id: 10,'),
    contract.indexOf('id: 11,'),
  )
  assert.match(stage10, /status: "certified"/)
})

test("stage 10 uses exactly one fixed Flash batch call", () => {
  assert.match(worker, /WORKER_MODEL_KEY = "deepseek-v4\.1-flash"/)
  assert.equal((worker.match(/await requestChatCompletion\(/g) || []).length, 1)
  assert.match(worker, /retryCount: 0/)
  assert.match(worker, /responseFormat: \{ type: "json_object" \}/)
  assert.doesNotMatch(worker, /tools:/)
})

test("stage 10 worker cannot read rejected candidates or chat history", () => {
  assert.doesNotMatch(worker, /ai_background_candidates/)
  assert.doesNotMatch(worker, /chat_messages|last_50/i)
  assert.match(migration, /selected_npc_ids/)
  assert.match(migration, /selected_location_ids/)
  assert.doesNotMatch(migration, /from public\.ai_background_candidates/i)
})

test("stage 10 has a bounded context budget and narrow continuity", () => {
  assert.match(migration, /worker_input_bytes/)
  assert.match(migration, />180000/)
  assert.match(migration, /current_snapshot/)
  assert.match(migration, /recent_events/)
  assert.match(migration, /quest_constraints/)
})

test("stage 10 rejects roll substitution and unselected entities twice", () => {
  assert.match(worker, /background_worker_supplied_roll_violation/)
  assert.match(worker, /background_worker_rejected_or_unknown_entity/)
  assert.match(migration, /ai_background_worker_supplied_roll_violation/)
  assert.match(migration, /ai_background_worker_rejected_or_unknown_npc/)
  assert.match(migration, /ai_background_worker_rejected_or_unknown_location/)
})

test("stage 10 permits neutral no-op but requires non-neutral persistence", () => {
  assert.match(worker, /severityKey !== "neutral" && row\.lasting_change !== true/)
  assert.match(migration, /matched_outcome_key<>'neutral' and v_lasting is not true/)
  assert.match(worker, /lasting_change=false/)
})

test("provider gateway can request native JSON-object responses", () => {
  assert.match(provider, /responseFormat\?: \{ type: "json_object" \}/)
  assert.match(provider, /response_format: input\.responseFormat/)
})
