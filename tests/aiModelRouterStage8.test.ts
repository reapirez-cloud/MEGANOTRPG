import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 8 introduces task-aware model routing", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(router, /type VossTaskKey/)
  assert.match(router, /"general"/)
  assert.match(router, /"reference_read"/)
  assert.match(router, /"memory_read"/)
  assert.match(router, /"memory_write"/)
  assert.match(router, /"workshop"/)
  assert.match(router, /"draft_edit"/)
  assert.match(router, /classifyVossTask/)
  assert.match(router, /resolveVossModel/)
})

test("player requests are hard-locked to the base model", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(router, /if \(!input\.canManage\)/)
  assert.match(router, /routeMode: "base_lock"/)
  assert.match(router, /model: base/)
  assert.match(router, /Player requests are permanently locked to the base model/)
})

test("read-heavy auto routing prefers cheaper faster compatible models", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(router, /taskKey === "reference_read" \|\| taskKey === "memory_read"/)
  assert.match(router, /left\.cost_tier - right\.cost_tier/)
  assert.match(router, /left\.latency_tier - right\.latency_tier/)
  assert.match(router, /supports_tools/)
})

test("complex content routing preserves GM primary model and safe fallback", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(router, /TASKS_PREFERRING_JSON/)
  assert.match(router, /"workshop"/)
  assert.match(router, /"draft_edit"/)
  assert.match(router, /routeMode: "primary"/)
  assert.match(router, /routeMode: "fallback"/)
  assert.match(router, /reasoning_tier/)
  assert.match(router, /supports_json/)
})

test("router classification handles Russian task phrases without ASCII word boundaries", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(router, /запомни/)
  assert.match(router, /что\\s\+\(\?:было\|произошло\|случилось\)/)
  assert.match(router, /создай/)
  assert.match(router, /черновик/)
  assert.doesNotMatch(router, /\\b\(запомни/)
})

test("Stage 8 route policies and audit log are RLS protected", () => {
  const migration = read(
    "supabase/migrations/20260914173524_ai_model_router_stage8.sql",
  )

  assert.match(migration, /create table public\.ai_agent_model_routes/)
  assert.match(migration, /create table public\.ai_model_route_runs/)
  assert.match(migration, /private\.is_campaign_manager/)
  assert.match(migration, /ai_model_route_runs_read_own_or_manager/)
  assert.match(migration, /grant select on public\.ai_model_route_runs to authenticated/)
  assert.doesNotMatch(
    migration,
    /grant insert on public\.ai_model_route_runs to authenticated/i,
  )
})

test("model registry records reasoning and latency tiers", () => {
  const migration = read(
    "supabase/migrations/20260914173524_ai_model_router_stage8.sql",
  )

  assert.match(migration, /reasoning_tier/)
  assert.match(migration, /latency_tier/)
  assert.match(migration, /between 1 and 5/)
})

test("Voss gateway records and returns the actual route decision", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /resolveVossModel/)
  assert.match(edge, /recordVossRouteRun/)
  assert.match(edge, /task_key: routeDecision\.taskKey/)
  assert.match(edge, /routing:/)
  assert.match(edge, /routeDecision\.routeMode/)
  assert.match(edge, /routeDecision\.degraded/)
})

test("Voss UI distinguishes the primary model from the routed model", () => {
  const provider = read("src/ai/AIProvider.tsx")
  const dock = read("src/ai/VossDock.tsx")

  assert.match(provider, /lastRoute/)
  assert.match(provider, /reasoning_tier/)
  assert.match(provider, /latency_tier/)
  assert.match(dock, /Основная модель/)
  assert.match(dock, /ROUTER ·/)
  assert.match(dock, /routedModel/)
})

test("fixed task routes survive model deletion and fall back safely", () => {
  const base = read(
    "supabase/migrations/20260914173524_ai_model_router_stage8.sql",
  )
  const hardening = read(
    "supabase/migrations/20260914174043_ai_model_router_fixed_fallback_stage8.sql",
  )
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(base, /on delete set null/)
  assert.match(hardening, /drop constraint if exists ai_agent_model_routes_check/)
  assert.match(router, /Configured fixed model is unavailable or lacks required capabilities/)
  assert.match(router, /routeMode: "fallback"/)
})
