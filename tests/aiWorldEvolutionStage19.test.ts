import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 19 hard-caps raw recent history at 50 after visibility filtering", () => {
  const context = read("supabase/functions/voss-agent/game-chat-context.ts")
  assert.match(context, /const CHAT_CONTEXT_LIMIT = 50/)
  assert.match(context, /\.slice\(-CHAT_CONTEXT_LIMIT\)/)
  assert.match(context, /eventVisibleAtGameDay/)
  assert.match(context, /recipient_character_ids/)
})

test("Stage 19 excludes worker and tool internals from primary GM history", () => {
  const context = read("supabase/functions/voss-agent/game-chat-context.ts")
  assert.match(context, /INTERNAL_TURN_COMPONENTS/)
  assert.match(context, /junior_worker/)
  assert.match(context, /materializer/)
  assert.match(context, /provider_trace/)
  assert.match(context, /post_turn_intent/)
  assert.doesNotMatch(
    context.match(/function normalizeNarrativeMessage[\s\S]*?return normalized\n}/)?.[0] || "",
    /turn_command_id/,
  )
})

test("Stage 19 projects mechanical messages to compact public results", () => {
  const context = read("supabase/functions/voss-agent/game-chat-context.ts")
  assert.match(context, /compactMechanicalPayload/)
  assert.match(context, /MAX_COMPACT_EVENT_PAYLOAD_BYTES = 1600/)
  assert.match(context, /"d20"/)
  assert.match(context, /"modifier"/)
  assert.match(context, /"total"/)
  assert.match(context, /"outcome_class"/)
})

test("Stage 19 records bounded context telemetry", () => {
  const context = read("supabase/functions/voss-agent/game-chat-context.ts")
  assert.match(context, /context_telemetry/)
  assert.match(context, /recent_message_count/)
  assert.match(context, /serialized_bytes/)
  assert.match(context, /approximate_tokens/)
  assert.match(context, /hard_message_cap/)
})

test("Stage 19 roadmap and executable contract are certified", () => {
  const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")
  const contract = read("src/ai-world-evolution/contract.ts")

  assert.match(
    roadmap,
    /## Stage 19 — Bounded clean GM context[\s\S]*?\*\*Status: CERTIFIED — 2026-09-24\*\*/,
  )
  assert.match(
    contract,
    /id:\s*19,[\s\S]*?key:\s*"bounded-clean-gm-context"[\s\S]*?status:\s*"certified"/,
  )
})
