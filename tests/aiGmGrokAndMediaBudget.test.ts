import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")
const imageTools = read("supabase/functions/voss-agent/image-tools.ts")
const migration = read(
  "supabase/migrations/20260926125502_ai_gm_grok_high_media_low_50k_v1.sql",
)

test("Grok 4.6 defaults to ordinary high reasoning", () => {
  assert.match(gateway, /model\.model_key === "grok-4\.6"\) return "high"/)
  assert.doesNotMatch(gateway, /model\.model_key === "grok-4\.6"\) return "medium"/)
})

test("AI-GM lifecycle art is clamped in both worker and database", () => {
  assert.match(imageTools, /ai_gm_stage9_forced_low_50k/)
  assert.match(imageTools, /autoLifecycle[\s\S]*quality: "low" as const/)
  assert.match(imageTools, /autoLifecycle[\s\S]*\? 50000/)
  assert.match(migration, /force_ai_gm_media_low_budget_v1/)
  assert.match(migration, /'\{generation_tier\}'/)
  assert.match(migration, /to_jsonb\('low'::text\)/)
  assert.match(migration, /'\{target_token_budget\}'/)
  assert.match(migration, /to_jsonb\(50000\)/)
})

test("Grok registry keeps the requested 500k vision/tool capabilities", () => {
  assert.match(migration, /model_key='grok-4\.6'/)
  assert.match(migration, /context_window=500000/)
  assert.match(migration, /supports_vision=true/)
  assert.match(migration, /supports_tools=true/)
})
