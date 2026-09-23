import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923212309_ai_world_evolution_stage11_narrative_resolver_v1.sql", import.meta.url),
  "utf8",
)
const tool = readFileSync(
  new URL("../supabase/functions/voss-agent/random-decision.ts", import.meta.url),
  "utf8",
)
const flash = readFileSync(
  new URL("../supabase/functions/voss-agent/background-world.ts", import.meta.url),
  "utf8",
)
const primary = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 11 contract is certified", () => {
  const stage11 = contract.slice(
    contract.indexOf('id: 11,'),
    contract.indexOf('id: 12,'),
  )
  assert.match(stage11, /status: "certified"/)
})

test("random decision tool commits bands before asking for a roll", () => {
  const commitCall = tool.indexOf('context.admin.rpc("commit_random_decision_v1"')
  const resolveCall = tool.indexOf('"resolve_committed_random_decision_v1"')
  assert.ok(commitCall >= 0)
  assert.ok(resolveCall > commitCall)
  assert.match(tool, /The first transaction durably commits the question and all outcome bands/)
  assert.match(tool, /Only after it succeeds may the second transaction generate\/return a roll/)
})

test("decision commit fingerprints question and complete outcome mapping", () => {
  assert.match(migration, /'question',v_question/)
  assert.match(migration, /'bands',v_bands/)
  assert.match(migration, /request_fingerprint/)
  assert.match(migration, /random_decision_key_conflict/)
  assert.match(migration, /normalize_world_random_bands_v1\(100,p_bands\)/)
  assert.match(migration, /random_decision_band_semantics_invalid/)
})

test("resolved narrative branches are World Resolver receipts with no reroll", () => {
  assert.match(migration, /public\.resolve_world_random_v1/)
  assert.match(migration, /p_decision_kind=>'narrative\.branch'/)
  assert.match(migration, /resolver_receipt_id is not null/)
  assert.match(migration, /'receipt',v_receipt,'replayed',true/)
})

test("Flash only resolves narrative uncertainty for Stage 9 selected targets", () => {
  assert.match(flash, /RESOLVE_RANDOM_DECISION_TOOL/)
  assert.match(flash, /surface: "background_flash"/)
  assert.match(flash, /name !== "resolve_random_decision"/)
  assert.match(migration, /v_target_uuid=any\(v_run\.selected_npc_ids\)/)
  assert.match(migration, /v_target_uuid=any\(v_run\.selected_location_ids\)/)
  assert.match(flash, /Никогда не используй resolve_random_decision для supplied daily roll/)
})

test("primary AI GM uses the same resolver tool and a real conversation job", () => {
  assert.match(primary, /RESOLVE_RANDOM_DECISION_TOOL/)
  assert.match(primary, /name === "resolve_random_decision"/)
  assert.match(primary, /surface: "primary_gm"/)
  assert.match(migration, /j\.agent_key='voss'/)
  assert.match(migration, /j\.job_type='conversation_turn'/)
})

test("deterministic and already-resolved mechanics are excluded by both prompts", () => {
  assert.match(
    primary,
    /Если исход уже механически\/канонически определён, resolve_random_decision запрещён/,
  )
  assert.match(
    primary,
    /Не используй resolve_random_decision как косметический бросок/,
  )
  assert.match(
    flash,
    /deterministic rule, уже существующего факта/,
  )
})

test("Stage 11 public RPCs are explicitly service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.commit_random_decision_v1[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.commit_random_decision_v1[\s\S]*to service_role/,
  )
  assert.match(
    migration,
    /revoke all on function public\.resolve_committed_random_decision_v1\(uuid\)[\s\S]*from public, anon, authenticated/,
  )
})
