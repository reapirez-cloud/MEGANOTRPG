import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260925145000_gpt_5_6_luna_junior_and_inventory_profile_fix_v1.sql",
)
const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const selectorMigration = read(
  "supabase/migrations/20260925152000_luna_junior_selector_rls_visibility_fix_v1.sql",
)

test("GPT-5.6 Luna is registered as a 1M junior-only model", () => {
  assert.match(migration, /'gpt-5\.6-luna'/)
  assert.match(migration, /'GPT-5\.6 Luna'/)
  assert.match(migration, /1000000/)
  assert.match(migration, /gm_selectable=false/)
  assert.match(migration, /user_selectable=false/)
  assert.match(migration, /supports_vision=true/)
  assert.match(migration, /is_ai_gm_junior_model_key_v1/)
})

test("Luna is forced to high reasoning for junior calls", () => {
  assert.match(gateway, /gpt-5\.6-luna.*return "high"/)
  assert.match(
    runtime,
    /model\.model_key === "gpt-5\.6-luna" \? "high" : reasoningEffort/,
  )
})

test("Stage 27 normalizes incomplete AI inventory profiles server-side", () => {
  assert.match(migration, /ai_gm_normalize_inventory_profile_v1/)
  assert.match(migration, /'semantic_role',v_role/)
  assert.match(migration, /'footprint_mode','compact_1x1'/)
  assert.match(migration, /'shape_mask',jsonb_build_array\('1'\)/)
  assert.match(migration, /cheburashka_assert_inventory_profile_v1\(v_profile\)/)
  assert.match(runtime, /server injects semantic_role and fills a safe compact 1x1 baseline/)
})

test("Luna stays junior-only but bypasses ai_models RLS inside the guarded junior selector", () => {
  assert.match(selectorMigration, /list_campaign_ai_junior_models_v1/)
  assert.match(selectorMigration, /security definer/)
  assert.match(selectorMigration, /is_campaign_member/)
  assert.match(selectorMigration, /can_select_campaign_junior_model_v1/)
  assert.match(selectorMigration, /revoke all on function public\.list_campaign_ai_junior_models_v1\(uuid\) from public/)
})
