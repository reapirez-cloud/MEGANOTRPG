import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const manager = read("supabase/functions/voss-agent/manager-tools.ts")
const quests = read("supabase/functions/voss-agent/quest-tools.ts")
const status = read("src/ui-v1-isolated/chat-room/AiGmTurnStatus.tsx")
const control = read("src/ui-v1-isolated/AiGmControl.tsx")
const app = read("src/ui-v1-isolated/UiV1App.tsx")
const shell = read("src/ai/AgentShell.tsx")
const workspace = read("src/ui-v1-isolated/Workspace.tsx")
const controlMigration = read(
  "supabase/migrations/20260925024500_ai_gm_control_panel_v1.sql",
)
const migration = read(
  "supabase/migrations/20260925013000_ai_gm_runtime_entity_authority_and_output_fix_v1.sql",
)
const postTurnMigration = read(
  "supabase/migrations/20260925013500_ai_gm_post_turn_manager_identity_fix_v1.sql",
)

test("AI GM output is a legal chat turn component", () => {
  assert.match(migration, /chat_messages_turn_component_check/)
  assert.match(migration, /'ai_gm_output'/)
})

test("internal AI world mutations use a service-role-only manager bridge", () => {
  assert.match(migration, /ai_gm_invoke_as_manager_v1/)
  assert.match(migration, /service_role_required/)
  assert.match(migration, /revoke all on function public\.ai_gm_invoke_as_manager_v1[\s\S]*authenticated/)
  assert.match(migration, /grant execute on function public\.ai_gm_invoke_as_manager_v1[\s\S]*service_role/)

  assert.match(manager, /internalService\?: boolean/)
  assert.match(manager, /canonicalManagerRpc/)
  assert.match(manager, /ai_gm_invoke_as_manager_v1/)
  assert.match(quests, /internalService\?: boolean/)
  assert.match(quests, /canonicalQuestRpc/)
  assert.match(quests, /ai_gm_invoke_as_manager_v1/)

  const internalFlags = runtime.match(/internalService: true/g) || []
  assert.ok(internalFlags.length >= 3)
})

test("post-turn junior mutations execute as the immutable manager identity", () => {
  assert.match(postTurnMigration, /v_commit\.manager_user_id/)
  assert.match(
    postTurnMigration,
    /set_config\(''request\.jwt\.claim\.sub'',v_commit\.manager_user_id::text,true\)/,
  )
})

test("orphaned GM jobs recover after the hosted wall-clock while provider timeouts use durable continuation", () => {
  assert.match(runtime, /game_chat_turn_resume/)
  assert.match(runtime, /3 \* 60 \* 1000/)
  assert.match(runtime, /PRIMARY_GM_PROVIDER_TIMEOUT_MS = 90_000/)
  assert.match(runtime, /requeueTimedOutGameTurn/)
  assert.match(runtime, /background: runGameChatTurn/)
  assert.match(runtime, /provider_error:/)
  assert.match(status, /wakeGameTurn/)
  assert.match(status, /action: "game_chat_turn_resume"/)
})

test("dedicated AI button routes managers to the AI GM control page while Freddy stays Freddy", () => {
  assert.match(app, /type: "ai-gm"/)
  assert.match(app, /<AiGmControl/)
  assert.match(workspace, /className="u1-workspace__ai-button"/)
  assert.match(workspace, /is_ai_world_campaign_v1/)
  assert.match(workspace, /onOpenAiGm/)
  assert.match(app, /onOpenAiGm=\{\(\) => go\("ai-gm"\)\}/)
  assert.match(app, /<AgentShell \/>/)
  assert.doesNotMatch(shell, /onOpenControl/)
  assert.match(shell, /setOpen\(\(value\) => !value\)/)
})

test("AI GM control loads one complete panel and writes through canonical settings RPCs", () => {
  assert.match(control, /read_ai_gm_control_panel_v1/)
  for (const rpc of [
    "set_campaign_gm_model_v1",
    "set_campaign_ai_junior_model_v1",
    "set_campaign_ai_gm_behavior_profile_v1",
    "set_my_ai_director_preferences_v1",
    "set_campaign_ai_gm_content_profile_v1",
  ]) {
    assert.match(control, new RegExp(rpc))
  }
  for (const section of [
    "01 · ГЛАВНЫЙ ИИ",
    "02 · МЛАДШИЙ ИИ",
    "03 · РЕЖИМ МАСТЕРА",
    "04 · ДИРЕКТОР",
    "05 · КОНТЕНТ-ПРОФИЛЬ",
    "06 · ФУНКЦИИ МИРА",
  ]) {
    assert.match(control, new RegExp(section))
  }
})

test("server AI GM control panel bundles models, gameplay profiles and core runtime features", () => {
  assert.match(controlMigration, /read_ai_gm_control_panel_v1/)
  assert.match(controlMigration, /list_campaign_gm_models_v1/)
  assert.match(controlMigration, /list_campaign_ai_junior_models_v1/)
  assert.match(controlMigration, /list_campaign_ai_gm_behavior_profiles_v1/)
  assert.match(controlMigration, /read_my_ai_director_preferences_v1/)
  assert.match(controlMigration, /list_campaign_ai_gm_content_profiles_v1/)
  for (const feature of [
    "server_resolver",
    "junior_commit",
    "background_world",
    "npc_identity",
    "coop_sync",
    "bounded_context",
    "maintenance",
    "media_pipeline",
  ]) {
    assert.match(controlMigration, new RegExp(feature))
  }
})
