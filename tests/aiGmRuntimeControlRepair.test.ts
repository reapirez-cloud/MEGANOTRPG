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
const runtimeSettingsMigration = read(
  "supabase/migrations/20260925041000_ai_gm_control_panel_runtime_settings_v2.sql",
)
const juniorBackgroundRouteMigration = read(
  "supabase/migrations/20260925042000_ai_gm_junior_background_route_v1.sql",
)
const runtimeQueueBoundaryMigration = read(
  "supabase/migrations/20260925043000_ai_gm_runtime_switch_queue_boundaries_v3.sql",
)
const autoRollMigration = read(
  "supabase/migrations/20260925044500_ai_gm_auto_player_roll_bridge_v1.sql",
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

test("AI GM model and behavior controls open as separate routed screens", () => {
  assert.match(control, /read_ai_gm_control_panel_v1/)
  for (const rpc of [
    "set_campaign_gm_model_v1",
    "set_campaign_ai_junior_model_v1",
    "set_campaign_ai_gm_behavior_profile_v1",
    "set_my_ai_director_preferences_v1",
    "set_campaign_ai_gm_content_profile_v1",
    "set_campaign_ai_gm_runtime_feature_v1",
  ]) {
    assert.match(control, new RegExp(rpc))
  }

  assert.match(app, /path === "ai-gm\/models"/)
  assert.match(app, /path === "ai-gm\/behavior"/)
  assert.match(app, /page=\{route\.page\}/)
  assert.match(app, /onNavigate=\{\(page\) => go\("ai-gm\/" \+ page\)\}/)

  assert.match(control, /page === "overview"/)
  assert.match(control, /onNavigate\("models"\)/)
  assert.match(control, /onNavigate\("behavior"\)/)
  assert.match(control, /Модели компании/)
  assert.match(control, /Настройки поведения ИИ/)

  assert.match(control, /page === "models"/)
  assert.match(control, /Старший ИИ/)
  assert.match(control, /Младший ИИ/)
  assert.match(control, /<select/)

  assert.match(control, /page === "behavior"/)
  assert.match(control, /ХАРДКОР \/ ПРИКЛЮЧЕНИЕ \/ СИМС/)
  assert.match(control, /ДИРЕКТОР/)
  assert.match(control, /18\+ \/ ВЗРОСЛАЯ ТЕМАТИКА/)
  assert.match(control, /ФУНКЦИИ ИИ-МИРА/)
  assert.match(control, /className="u1-ai-gm-switch"/)
  assert.match(control, /aria-pressed=\{feature\.enabled\}/)
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


test("AI GM runtime settings are persisted and optional systems are actually gated", () => {
  for (const key of [
    "junior_commit",
    "world_materialization",
    "background_world",
    "npc_identity",
    "quest_updates",
    "maintenance",
    "media_pipeline",
  ]) {
    assert.match(runtimeSettingsMigration, new RegExp("'" + key + "'"))
  }

  assert.match(runtimeSettingsMigration, /set_campaign_ai_gm_runtime_feature_v1/)
  assert.match(runtimeSettingsMigration, /ai_gm_runtime_feature_enabled_v1/)
  assert.match(runtimeSettingsMigration, /dispatch_ai_background_daily_run_v1/)
  assert.match(runtimeSettingsMigration, /dispatch_ai_gm_maintenance_job_v1/)
  assert.match(runtimeSettingsMigration, /dispatch_ai_gm_media_job_v1/)
  assert.match(runtime, /loadAiGmRuntimeSettings/)
  assert.match(runtime, /runtimeSettings\.worldMaterialization/)
  assert.match(runtime, /runtimeSettings\.npcIdentity/)
  assert.match(runtime, /settings\.juniorCommit/)
  assert.match(runtime, /settings\.questUpdates/)
})

test("junior model selector accepts every compatible campaign tool model", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.doesNotMatch(router, /const allowedKeys =/)
  assert.doesNotMatch(router, /\.in\("model_key", allowedKeys\)/)
  assert.match(runtimeSettingsMigration, /supports_tools=true/)
  assert.match(runtimeSettingsMigration, /supports_json=true/)
  assert.match(runtimeSettingsMigration, /list_campaign_ai_junior_models_v1/)
})


test("background world freezes the currently selected junior model instead of hardcoded Flash", () => {
  assert.match(juniorBackgroundRouteMigration, /agent_key='junior'/)
  assert.match(juniorBackgroundRouteMigration, /can_select_campaign_junior_model_v1/)
  assert.match(juniorBackgroundRouteMigration, /v_model:=coalesce\(nullif\(v_selected_model,''\),v_model\)/)
})


test("disabled automatic systems stop at queue boundaries and resume durable work when re-enabled", () => {
  assert.match(runtimeQueueBoundaryMigration, /queue_ai_gm_npc_media_after_profile_v1/)
  assert.match(runtimeQueueBoundaryMigration, /queue_ai_gm_location_media_after_entry_v1/)
  assert.match(runtimeQueueBoundaryMigration, /ai_gm_runtime_feature_enabled_v1/)
  assert.match(runtimeQueueBoundaryMigration, /dispatch_ai_background_daily_run_v1/)
  assert.match(runtimeQueueBoundaryMigration, /dispatch_ai_gm_maintenance_job_v1/)
  assert.match(runtimeQueueBoundaryMigration, /dispatch_ai_gm_media_job_v1/)
  assert.match(runtimeQueueBoundaryMigration, /if p_enabled and v_key='background_world'/)
})


test("AI GM player roll requests become visible auto-rolls and cannot tool-loop", () => {
  assert.match(runtime, /REQUEST_PLAYER_ROLL_TOOL/)
  assert.match(runtime, /name: "request_player_roll"/)
  assert.match(runtime, /converted_to_player_roll_reaction/)
  assert.match(runtime, /TOOL LOOP GUARD/)
  assert.match(runtime, /forceFinalWithoutTools/)
  assert.match(runtime, /roll_replayed === true/)
  assert.match(runtime, /resultPlan\.execution_state === "completed"/)

  assert.match(status, /pending_roll_request_id/)
  assert.match(status, /auto_roll_available/)
  assert.match(status, /resolve_player_roll_request_v1/)
  assert.match(status, /CHAT_MESSAGE_SENT_EVENT/)

  assert.match(autoRollMigration, /pending_player_roll_requests/)
  assert.match(autoRollMigration, /c\.assigned_user_id=v_user_id/)
  assert.match(autoRollMigration, /r\.status='pending'/)
  assert.match(autoRollMigration, /ИИ-ГМ запросил бросок · бросаем автоматически/)
})
