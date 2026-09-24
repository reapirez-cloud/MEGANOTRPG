import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260924172000_ai_gm_mimo_and_junior_model_selector_v1.sql",
)
const runtimeSettingsMigration = read(
  "supabase/migrations/20260925041000_ai_gm_control_panel_runtime_settings_v2.sql",
)
const juniorBackgroundRouteMigration = read(
  "supabase/migrations/20260925042000_ai_gm_junior_background_route_v1.sql",
)
const router = read("supabase/functions/voss-agent/model-router.ts")
const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const background = read("supabase/functions/voss-agent/background-world.ts")
const maintenance = read("supabase/functions/voss-agent/world-maintenance.ts")
const selector = read("src/ui-v1-isolated/PlayerProfileMark.tsx")

test("MiMo V2.5 Pro is a selectable 1M campaign GM model", () => {
  assert.match(migration, /'mimo-v2\.5-pro'/)
  assert.match(migration, /'MiMo V2\.5 Pro'/)
  assert.match(migration, /1000000/)
  assert.match(migration, /gm_selectable[^\n]*|gm_selectable/)
  assert.match(migration, /supports_tools/)
  assert.match(migration, /supports_json/)
  assert.match(gateway, /mimo-v2\.5-pro.*return "high"/)
})

test("junior selector exposes every compatible campaign tool model", () => {
  assert.match(runtimeSettingsMigration, /list_campaign_ai_junior_models_v1/)
  assert.match(migration, /set_campaign_ai_junior_model_v1/)
  assert.match(runtimeSettingsMigration, /supports_tools=true/)
  assert.match(runtimeSettingsMigration, /supports_json=true/)
  assert.doesNotMatch(router, /const allowedKeys =/)
  assert.match(runtimeSettingsMigration, /agent_key='junior'/)
  assert.match(runtimeSettingsMigration, /ai_gm_junior_model_ai_world_only/)
  assert.match(migration, /private\.is_campaign_manager/)
})

test("junior selection is RLS-bound and defaults to DeepSeek Flash", () => {
  assert.match(migration, /security invoker/i)
  assert.match(migration, /can_select_campaign_junior_model_v1/)
  assert.match(migration, /ensure_ai_gm_junior_setting_for_slot_v1/)
  assert.match(migration, /'junior',v_model_id/)
  assert.match(migration, /'deepseek-v4\.1-flash'/)
})

test("all live junior worker surfaces consume the campaign selector", () => {
  assert.match(router, /resolveCampaignJuniorModel/)
  assert.match(router, /agent_key", "junior"/)
  assert.match(router, /frozenModelKey/)

  assert.match(runtime, /resolveCampaignJuniorModel/)
  assert.doesNotMatch(runtime, /WORLD_MATERIALIZER_MODEL_KEY/)
  assert.doesNotMatch(runtime, /MECHANIC_WORKER_MODEL_KEY/)
  assert.doesNotMatch(runtime, /POST_TURN_WORKER_MODEL_KEY/)

  assert.match(background, /resolveCampaignJuniorModel/)
  assert.match(background, /frozenModelKey/)
  assert.doesNotMatch(background, /WORKER_MODEL_KEY/)

  assert.match(maintenance, /resolveCampaignJuniorModel/)
  assert.doesNotMatch(maintenance, /WORKER_MODEL_KEY/)
})

test("daily background run freezes the currently selected junior model", () => {
  assert.match(juniorBackgroundRouteMigration, /agent_key='junior'/)
  assert.match(juniorBackgroundRouteMigration, /can_select_campaign_junior_model_v1/)
  assert.match(background, /prepared\.worker_model/)
  assert.match(background, /model\.model_key !== frozenWorkerModel/)
})

test("AI model sheet exposes separate primary GM and junior choices", () => {
  assert.match(selector, /Основной ГМ/)
  assert.match(selector, /Младший ИИ/)
  assert.match(selector, /list_campaign_gm_models_v1/)
  assert.match(selector, /list_campaign_ai_junior_models_v1/)
  assert.match(selector, /set_campaign_gm_model_v1/)
  assert.match(selector, /set_campaign_ai_junior_model_v1/)
})

test("Stage 21 behavior tables use least-privilege authenticated grants", () => {
  assert.match(
    migration,
    /revoke all on table public\.ai_gm_behavior_profiles from anon, authenticated/,
  )
  assert.match(
    migration,
    /grant select on table public\.ai_gm_behavior_profiles to authenticated/,
  )
  assert.match(
    migration,
    /grant select, insert, update on table public\.ai_gm_behavior_settings to authenticated/,
  )
})
