import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Freddy long turns are durable jobs with a one-million-token task budget", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")
  const migration = read(
    "supabase/migrations/20260920090000_freddy_conversation_turn_jobs.sql",
  )

  assert.match(migration, /'conversation_turn'/)
  assert.match(edge, /job_type: "conversation_turn"/)
  assert.match(edge, /token_budget: 1000000/)
  assert.match(edge, /const chunkSoftLimitMs = 70000/)
  assert.match(edge, /action === "continue_freddy_turn"/)
  assert.match(edge, /freddy_turn_continuation_failed/)
  assert.match(edge, /providerUsageTokens/)
  assert.match(edge, /persistTurnProgress/)
})

test("Freddy checkpoints tool results and does not persist continuation as a new user message", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /normalizeToolLedger/)
  assert.match(edge, /compactToolLedger/)
  assert.match(edge, /Уже выполненные вызовы инструментов/)
  assert.match(edge, /if \(continuationJobId\)[\s\S]*storedUserMessageId/)
  assert.match(edge, /if \(continuationJobId\)[\s\S]*persistedUserMessage = \{ id: storedUserMessageId \}/)
})

test("Freddy can batch related location authoring instead of mutating one room at a time", () => {
  const manager = read("supabase/functions/voss-agent/manager-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(manager, /name: "batch_location_changes"/)
  assert.match(manager, /maxItems: 24/)
  assert.match(manager, /parent_ref/)
  assert.match(manager, /location_ref/)
  assert.match(manager, /batchLocationChanges/)
  assert.match(manager, /Object\.fromEntries\(refs\)/)
  assert.match(edge, /предпочитай batch_location_changes/)
})

test("Freddy treats fill-out tavern phrasing as manager mutation intent", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /заполни\|заполнить/)
  assert.match(edge, /дополни\|дополнить/)
  assert.match(edge, /проработай\|проработать/)
  assert.match(edge, /таверн\|комнат\|помещен/)
})


test("Freddy recovers DeepSeek textual tool calls instead of saving them as answers", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /function recoverTextToolCalls/)
  assert.match(edge, /allowedToolNames/)
  assert.match(edge, /"text-tool-" \+ round/)
  assert.match(edge, /const recoveredTextCalls = nativeToolCalls\.length/)
  assert.match(edge, /toolCalls = nativeToolCalls\.length/)
  assert.match(edge, /timeoutMs: isFreddyTurn \? 65_000 : 45_000/)
})
