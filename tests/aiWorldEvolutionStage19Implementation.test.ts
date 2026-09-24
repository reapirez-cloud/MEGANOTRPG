import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260924152250_ai_world_evolution_stage19_bounded_chat_context_v1.sql", import.meta.url),
  "utf8",
)
const context = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-context.ts", import.meta.url),
  "utf8",
)
const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, "expected source block")
  return source.slice(from, to)
}

test("Stage 19 eligibility is applied before newest-50 limit", () => {
  const eligible = block(migration, "with eligible as (", "select\n    coalesce(")
  const whereIndex = eligible.indexOf("where m.room_id=p_room_id")
  const audienceIndex = eligible.indexOf("m.audience_scope<>'direct_pc'")
  const visibilityIndex = eligible.indexOf("e.visibility='campaign'")
  const dayIndex = eligible.indexOf("p_current_day is null")
  const locationIndex = eligible.indexOf("p_source_location_id is null")
  const limitIndex = eligible.lastIndexOf("limit v_limit")
  assert.ok(whereIndex >= 0)
  assert.ok(audienceIndex > whereIndex)
  assert.ok(visibilityIndex > audienceIndex)
  assert.ok(dayIndex > visibilityIndex)
  assert.ok(locationIndex > dayIndex)
  assert.ok(limitIndex > locationIndex)
})

test("Stage 19 context loader no longer fetches raw chat then filters", () => {
  assert.match(context, /read_ai_gm_recent_chat_context_v1/)
  assert.doesNotMatch(context, /\.from\("chat_messages"\)/)
  assert.match(context, /projectStage19RecentMessages/)
  assert.match(context, /MAX_RECENT_MESSAGE_JSON_BYTES = 48_000/)
  assert.match(context, /MAX_PROMPT_CONTEXT_JSON_BYTES = 160_000/)
})

test("Stage 19 primary GM prompt excludes internal runtime payloads", () => {
  const prompt = block(
    context,
    "export function stage2ContextForPrompt",
    "export function stage19ContextTelemetry",
  )
  for (const forbidden of [
    "event_payload",
    "turn_command_id",
    "turn_component",
    "runtime_facts",
    "inventory_data",
  ]) {
    assert.equal(prompt.includes(forbidden), false, forbidden)
  }
})

test("Stage 19 mechanical history is compact rather than raw payload", () => {
  const projection = block(
    context,
    "function compactMechanicalEvent",
    "function compactNpcRuntime",
  )
  assert.match(projection, /d20/)
  assert.match(projection, /modifier/)
  assert.match(projection, /total/)
  assert.match(projection, /outcome/)
  assert.match(projection, /public_dc/)
  assert.match(projection, /dcVisibility === "public"/)
})

test("Stage 19 relationship relevance is filtered before the DB limit", () => {
  const loader = block(
    context,
    "export async function buildGameChatContextV2",
    "export function stage2ContextForPrompt",
  )
  const relationshipIndex = loader.indexOf('.from("character_relationships")')
  const relevanceIndex = loader.indexOf(".or(", relationshipIndex)
  const limitIndex = loader.indexOf(".limit(80)", relevanceIndex)
  assert.ok(relationshipIndex >= 0)
  assert.ok(relevanceIndex > relationshipIndex)
  assert.ok(limitIndex > relevanceIndex)
})

test("Stage 19 emits bounded context telemetry into turn results", () => {
  assert.match(context, /stage19_context_json_bytes/)
  assert.match(context, /stage19_estimated_context_tokens/)
  assert.match(runtime, /stage19ContextTelemetry/)
  assert.doesNotMatch(runtime, /context_message_count: context\.recentMessages\.length/)
})

test("Stage 19 contract status is implemented", () => {
  const start = contract.indexOf("id: 19,")
  const end = contract.indexOf("id: 20,", start)
  assert.ok(start >= 0 && end > start)
  assert.match(contract.slice(start, end), /status: "implemented"/)
})
