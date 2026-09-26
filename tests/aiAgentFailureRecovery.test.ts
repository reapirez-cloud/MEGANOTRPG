import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { normalizeInventoryToolArgs } from "../supabase/functions/voss-agent/inventory-tool-args.ts"
import { parseProviderCompletion } from "../supabase/functions/voss-agent/provider-response.ts"

test("inventory worker normalizes a model-stringified atomic batch", () => {
  const batch = normalizeInventoryToolArgs({
    action: "batch",
    character_id: "character-1",
    deltas: JSON.stringify([
      { action: "consume", item_id: "coin-1", quantity: 1 },
      { action: "grant", item: { canonical_name: "Газета" } },
    ]),
  })
  assert.equal(batch.error, null)
  assert.equal(Array.isArray(batch.args.deltas), true)
  assert.equal((batch.args.deltas as unknown[]).length, 2)
  assert.equal(normalizeInventoryToolArgs({ action: "batch", character_id: "character-1", deltas: "[not json" }).error,
    "inventory_batch_deltas_must_be_array")
})

test("inventory worker rejects invalid and empty batches before execution", () => {
  for (const deltas of ["[]", "{}", [], [{ action: "batch" }]]) {
    assert.notEqual(normalizeInventoryToolArgs({ action: "batch", character_id: "character-1", deltas }).error, null)
  }
})

test("gateway rebuilds a completed streamed tool call", () => {
  const raw = [
    'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"search_entities","arguments":"{\\"q\\":"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"inn\\"}"}}]},"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
  ].join("\n\n")
  const parsed = parseProviderCompletion(raw)
  const choice = (parsed.choices as Array<{message: {tool_calls: Array<{function: {name: string;arguments: string}}>}}>)[0]
  assert.equal(choice.message.tool_calls[0].function.name, "search_entities")
  assert.deepEqual(JSON.parse(choice.message.tool_calls[0].function.arguments), { q: "inn" })
})

test("gateway refuses a truncated stream instead of executing a partial tool call", () => {
  assert.throws(() => parseProviderCompletion('data: {"choices":[{"delta":{"content":"partial"}}]}'),
    /provider_stream_incomplete/)
  assert.equal((parseProviderCompletion('{"choices":[{"message":{"content":"ok"}}]}').choices as unknown[]).length, 1)
})

test("GM context reads complete inventory and exposes real bag and hand capacity", () => {
  const context = readFileSync("supabase/functions/voss-agent/game-chat-context.ts", "utf8")
  assert.match(context, /inventoryItemsResult,\s*inventoryChargesResult,\s*inventoryRoomResult/)
  assert.match(context, /inventoryItems: rows\(inventoryItemsResult\.data\)/)
  assert.match(context, /source_inventory_room: context\.inventoryRoom/)
  assert.match(context, /source_inventory_room: payload\.source_inventory_room/)
})

test("full inventory is a resolved atomic refusal, not a failed GM synchronization", () => {
  const migration = readFileSync("supabase/migrations/20260926093000_inventory_capacity_outcome_v1.sql", "utf8")
  assert.match(migration, /begin\s+v_result := public\.ai_gm_commit_inventory_delta_v1\(/)
  assert.match(migration, /exception when sqlstate '22023' then\s+if sqlerrm not like 'inventory_no_free_slot:%' then raise; end if;/)
  assert.match(migration, /'accepted',false,'outcome','no_space'/)
  assert.match(migration, /'canonical_state_changed',false,'resolved_item_ids','\[\]'::jsonb/)
  assert.match(migration, /set state='completed',lease_token=null,lease_expires_at=null,[\s\S]*tool_result=v_result/)
})
