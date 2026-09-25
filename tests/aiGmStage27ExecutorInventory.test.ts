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

test("Stage 27 inventory commits are Cheburashka-idempotent", () => {
  assert.match(migration, /ai_gm_commit_inventory_delta_v1/)
  assert.match(migration, /md5\(v_semantic_key\)::uuid/)
  assert.match(migration, /p_source_message_id/)
  assert.match(migration, /create_inventory_item_v3/)
  assert.match(migration, /update_inventory_item_v3/)
  assert.match(migration, /remove_inventory_item_v1/)
})

test("Stage 27 canonicalizes D&D currency into bulk stacks", () => {
  assert.match(migration, /'gp' then v_name:='Золотая монета'/)
  assert.match(migration, /'stack_mode','bulk_stack'/)
  assert.match(migration, /i\.stack_mode='bulk_stack'/)
  assert.match(runtime, /currency_key cp\|sp\|ep\|gp\|pp/)
})

test("Stage 27 Executor closes the Stage 26 post-turn cascade gap", () => {
  assert.match(migration, /v_operation='materialize_location_cascade'/)
  assert.match(migration, /ai_gm_materialize_location_cascade_v1/)
  assert.match(runtime, /materialize_location_cascade/)
})

test("Stage 27 is recorded in the master roadmap", () => {
  assert.match(roadmap, /## Stage 27 — Deterministic Executor \+ Inventory Commit/)
  assert.match(roadmap, /\*\*Status: IMPLEMENTED/)
})
