import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const merger = readFileSync(
  new URL("../supabase/migrations/20260923214728_ai_world_evolution_stage12_compact_state_merger_v1.sql", import.meta.url),
  "utf8",
)
const enforcement = readFileSync(
  new URL("../supabase/migrations/20260923215028_ai_world_evolution_stage12_snapshot_enforcement_v1.sql", import.meta.url),
  "utf8",
)
const worker = readFileSync(
  new URL("../supabase/functions/voss-agent/background-world.ts", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 12 contract is certified", () => {
  const stage12 = contract.slice(
    contract.indexOf('id: 12,'),
    contract.indexOf('id: 13,'),
  )
  assert.match(stage12, /status: "certified"/)
})

test("every lasting background event is forced through replacement snapshots", () => {
  assert.match(enforcement, /ai_background_event_snapshot_payload_required/)
  assert.match(enforcement, /merge_ai_background_event_snapshot_v1\(new\.id\)/)
  assert.match(worker, /snapshot_mode: "replace"/)
  assert.match(worker, /snapshot_summary/)
})

test("snapshot chain preserves immutable provenance", () => {
  assert.match(merger, /previous_snapshot_id/)
  assert.match(merger, /source_event_id/)
  assert.match(merger, /ai_background_snapshots_source_event_unique_idx/)
  assert.match(merger, /'merge_mode','replace'/)
  assert.match(merger, /'source_event_day',v_event\.effective_game_day/)
})

test("active prompt uses latest snapshot instead of event diary", () => {
  assert.match(
    merger,
    /when exists\([\s\S]*ai_background_entity_snapshots[\s\S]*then '\[\]'::jsonb/,
  )
  assert.match(merger, /order by s\.through_game_day desc,s\.version desc/)
  assert.match(worker, /ПОЛНЫЙ компактный replacement current-state/)
  assert.match(worker, /ПОЛНЫЙ краткий актуальный итог состояния/)
})

test("snapshot state rejects embedded historical diaries", () => {
  assert.match(merger, /ai_background_snapshot_history_key_forbidden/)
  assert.match(merger, /'history','event_history','daily_history','timeline','events','event_log'/)
  assert.match(worker, /background_worker_snapshot_history_key_forbidden/)
})

test("merger rejects future overwrite and keeps state bounded", () => {
  assert.match(merger, /ai_background_snapshot_future_version_conflict/)
  assert.match(merger, /ai_background_snapshot_state_budget_exceeded/)
  assert.match(merger, />24000/)
})
