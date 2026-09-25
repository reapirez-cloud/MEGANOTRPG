import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const migration = read(
  "supabase/migrations/20260925100000_ai_gm_stage27_executor_inventory_v1.sql",
)
const registry = read(
  "supabase/migrations/20260925103000_ai_gm_stage27_item_registry_v2.sql",
)
const retryBatchMigration = read(
  "supabase/migrations/20260925153500_ai_gm_executor_retry_and_inventory_batch_v1.sql",
)
const stackFixMigration = read(
  "supabase/migrations/20260925154500_ai_gm_inventory_stack_quantity_commands_fix_v1.sql",
)
const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")

test("Stage 27 introduces a typed deterministic Executor queue", () => {
  assert.match(migration, /'canonical_mutation'/)
  assert.match(migration, /'ai_world_executor'/)
  assert.match(migration, /enqueue_ai_world_executor_job_v1/)
  assert.match(migration, /execute_ai_world_executor_job_v1/)
  assert.match(runtime, /enqueue_ai_world_executor_job_v1/)
  assert.match(runtime, /execute_ai_world_executor_job_v1/)
  assert.match(runtime, /ПЛАНИРОВЩИК, а не исполнитель/)
})

test("Stage 27 makes inventory a first-class blocking post-turn intent", () => {
  assert.match(runtime, /"inventory"/)
  assert.match(runtime, /commit_inventory_delta/)
  assert.match(migration, /kind in \('location','npc','quest','memory','canonical_state','binding','inventory'\)/)
  assert.match(migration, /v_intent\.kind='inventory'/)
})

test("Stage 27 projects canonical inventory UUIDs to Junior", () => {
  assert.match(context, /inventoryItems: JsonRecord\[\]/)
  assert.match(context, /canonical_inventory_for_present_characters/)
  assert.match(context, /stack_mode/)
  assert.match(context, /version/)
})

test("Stage 27 inventory commits are source-message idempotent", () => {
  assert.match(registry, /ai_gm_inventory_delta_receipts_v1/)
  assert.match(registry, /md5\(v_semantic_key\)::uuid/)
  assert.match(registry, /p_source_message_id/)
  assert.match(registry, /'replayed',true/)
  assert.match(registry, /create_inventory_item_v3/)
  assert.match(registry, /update_inventory_item_v3/)
  assert.match(registry, /remove_inventory_item_v1/)
})

test("Stage 27 resolves definitions before touching Cheburashka", () => {
  assert.match(registry, /ai_item_definition_registry_v1/)
  assert.match(registry, /ai_gm_resolve_item_definition_v1/)
  assert.match(registry, /resolution_source/)
  assert.match(registry, /public\.ai_gm_resolve_item_definition_v1\([\s\S]*v_item/)
  assert.match(registry, /definition_id.*definition_revision/s)
  assert.match(registry, /public\.create_inventory_item_v3/)
  assert.match(runtime, /Item Registry ОБЯЗАН сначала искать/)
})

test("Stage 27 catalog prevents definition spam", () => {
  assert.match(registry, /semantic_key/)
  assert.match(registry, /normalized_name/)
  assert.match(registry, /aliases text\[\]/)
  assert.match(registry, /tags text\[\]/)
  assert.match(registry, /ai-item-' \|\| md5\(v_semantic_key\)/)
  assert.match(registry, /registry_canonical/)
  assert.match(runtime, /unique_identity/)
  assert.match(runtime, /identity_key/)
})

test("Stage 27 reuses canonical D&D currency definitions", () => {
  assert.match(registry, /r\.data->>'denomination'/)
  assert.match(registry, /d\.scope='system'/)
  assert.match(registry, /v_currency_key<>'+'/)
  assert.match(registry, /currency-electrum-coin/)
  assert.match(registry, /currency-platinum-coin/)
  assert.match(runtime, /currency_key cp\|sp\|ep\|gp\|pp/)
})

test("Stage 27 keeps physical packing separate from inventory row stack mode", () => {
  assert.match(registry, /packing_mode'='bulk_stack'/)
  assert.match(registry, /then 'stack'/)
  assert.match(runtime, /packing_mode=bulk_stack/)
})

test("Stage 27 Executor closes the Stage 26 post-turn cascade gap", () => {
  assert.match(migration, /v_operation='materialize_location_cascade'/)
  assert.match(migration, /ai_gm_materialize_location_cascade_v1/)
  assert.match(runtime, /materialize_location_cascade/)
})

test("Stage 27 is recorded in the master roadmap", () => {
  assert.match(roadmap, /## Stage 27 — Deterministic Executor \+ Inventory Commit/)
  assert.match(
    roadmap,
    /## Stage 27 — Deterministic Executor \+ Inventory Commit[\s\S]*\*\*Status: READY/,
  )
})

test("Stage 27 retries use a fresh executor slot per intent lease", () => {
  assert.match(retryBatchMigration, /source_intent_lease_token/)
  assert.match(retryBatchMigration, /agent_jobs_executor_source_intent_lease_uidx/)
  assert.doesNotMatch(retryBatchMigration, /agent_jobs_executor_source_intent_uidx ON/)
})

test("Stage 27 can atomically settle purchases and trades", () => {
  assert.match(runtime, /"batch"/)
  assert.match(runtime, /consume currency \+ grant item/)
  assert.match(runtime, /Сервер выполнит все deltas атомарно/)
  assert.match(retryBatchMigration, /v_action='batch'/)
  assert.match(retryBatchMigration, /jsonb_array_length\(v_args->'deltas'\)>16/)
  assert.match(retryBatchMigration, /inventory_executor_batch_character_mismatch/)
  assert.match(retryBatchMigration, /public\.ai_gm_commit_inventory_delta_v1\([\s\S]*v_batch_delta/)
})

test("Stage 27 changes stack quantities without re-authoring item definitions", () => {
  assert.match(stackFixMigration, /to_jsonb\(v_existing\)[\s\S]*'quantity'/)
  assert.match(stackFixMigration, /public\.update_inventory_item_v2/)
  assert.doesNotMatch(stackFixMigration, /public\.update_inventory_item_v3/)
})
