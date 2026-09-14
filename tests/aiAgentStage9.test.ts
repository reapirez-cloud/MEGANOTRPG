import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 9 establishes the campaign model registry foundation", () => {
  const migration = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )

  assert.match(migration, /supports_tools = true/)
  assert.match(migration, /supports_vision/)
  assert.match(migration, /model_kind/)
  assert.match(migration, /access_scope/)
})

test("current CheapVibeCode registry uses the confirmed DeepSeek V4.1 Flash id", () => {
  const migration = read(
    "supabase/migrations/20260915001000_cheapvibecode_deepseek_v41.sql",
  )

  assert.match(migration, /deepseek-v4\.1-flash/)
  assert.match(migration, /DeepSeek V4\.1 Flash/)
  assert.match(migration, /supports_vision = true/)
  assert.match(migration, /context_window = 1000000/)
  assert.match(migration, /model_key <> 'deepseek-v4\.1-flash'/)
  assert.match(migration, /enabled = false/)
})

test("Stage 9 separates system admin authority from campaign management", () => {
  const migration = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )

  assert.match(migration, /private\.system_admin_users/)
  assert.match(migration, /private\.is_system_admin/)
  assert.match(migration, /public\.is_system_admin_for_v1/)
  assert.match(
    migration,
    /revoke all on function public\.is_system_admin_for_v1\(uuid\) from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.is_system_admin_for_v1\(uuid\) to service_role/,
  )
})

test("owner-only content is creator-only even for campaign managers", () => {
  const migration = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )

  assert.match(migration, /private\.is_owner_only_creator/)
  assert.match(migration, /p_created_by = p_user_id/)
  assert.match(migration, /private\.can_manage_character/)
  assert.match(migration, /private\.can_manage_location/)
  assert.match(migration, /private\.can_manage_location_link/)
  assert.match(migration, /visibility_mode = 'private'/)
})

test("campaign settings cannot reference hidden or owner-only models by UUID", () => {
  const migration = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )

  assert.match(migration, /private\.can_select_campaign_ai_model/)
  assert.match(migration, /model_kind = 'agent'/)
  assert.match(migration, /access_scope = 'campaign'/)
  assert.match(migration, /private\.can_select_campaign_ai_model\(selected_model_id/)
})

test("provider gateway dispatches explicitly and never performs cross-provider fallback", () => {
  const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(gateway, /switch \(model\.provider_key\)/)
  assert.match(gateway, /case "deepseek"/)
  assert.match(gateway, /DEEPSEEK_API_KEY/)
  assert.match(gateway, /https:\/\/api\.deepseek\.com/)
  assert.match(gateway, /Unsupported AI provider/)
  assert.match(gateway, /case "astra-compatible"/)
  assert.match(gateway, /allowOwnerOverride/)
  assert.match(gateway, /owner_override_scope_denied/)
  assert.doesNotMatch(gateway, /catch[\s\S]{0,800}astraConfig/)
  assert.match(edge, /requestChatCompletion/)
  assert.doesNotMatch(edge, /fetch\(apiBase \+ "\/chat\/completions"/)
})

test("router excludes image and owner-override models from normal Voss routing", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(router, /model_kind/)
  assert.match(router, /access_scope/)
  assert.match(router, /model\.model_kind === "agent"/)
  assert.match(router, /model\.access_scope === "campaign"/)
  assert.match(router, /filter\(isCampaignAgent\)/)
})
