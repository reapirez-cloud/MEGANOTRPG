import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923133000_ai_gm_model_selector_stage10_v1.sql",
)
const router = read("supabase/functions/voss-agent/model-router.ts")
const gameRuntime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const profileMark = read("src/ui-v1-isolated/PlayerProfileMark.tsx")
const workspaceCss = read("src/ui-v1-isolated/workspace.css")
const roadmap = read("docs/AI_GM_ROADMAP.md")
const readinessDebt = read("src/ai/aiGmReadinessDebt.ts")

test("Stage 10 creates a separate campaign-level GM agent setting", () => {
  assert.match(migration, /'gm'/)
  assert.match(migration, /insert into public\.ai_agent_settings/)
  assert.match(migration, /agent_key='voss'/)
  assert.match(migration, /on conflict\(campaign_id,agent_key\) do nothing/)
  assert.match(migration, /private\.can_select_campaign_gm_model_v1/)
  assert.match(migration, /m\.gm_selectable=true/)
  assert.match(migration, /m\.supports_json=true/)
})

test("Stage 10 GM model list is visible to campaign members", () => {
  assert.match(migration, /list_campaign_gm_models_v1/)
  assert.match(migration, /private\.is_campaign_member/)
  assert.match(migration, /returns table\(/)
  assert.match(migration, /selected boolean/)
  assert.match(
    migration,
    /grant execute on function public\.list_campaign_gm_models_v1\(uuid\)[\s\S]*to authenticated,service_role/,
  )
})

test("Stage 10 model changes are manager-only and gm_selectable-only", () => {
  assert.match(migration, /set_campaign_gm_model_v1/)
  assert.match(migration, /private\.is_campaign_manager/)
  assert.match(migration, /campaign_manager_required/)
  assert.match(migration, /gm_model_not_selectable/)
  assert.match(
    migration,
    /agent_key='gm'[\s\S]*private\.can_select_campaign_gm_model_v1\(selected_model_id\)/,
  )
})

test("Stage 10 game runtime resolves the campaign GM model, not Voss user routing", () => {
  assert.match(router, /export async function resolveCampaignGmModel/)
  assert.match(router, /\.eq\("agent_key", "gm"\)/)
  assert.match(router, /\.eq\("gm_selectable", true\)/)
  assert.match(router, /\.eq\("supports_json", true\)/)
  assert.match(
    router,
    /Campaign GM runtime uses the model selected for agent_key=gm/,
  )
  assert.match(gameRuntime, /resolveCampaignGmModel/)
  assert.doesNotMatch(
    gameRuntime,
    /\.eq\("agent_key", "voss"\)[\s\S]{0,600}game_chat_runtime/,
  )
})

test("Stage 10 AI button opens a real campaign model sheet", () => {
  assert.match(profileMark, />\s*AI\s*</)
  assert.doesNotMatch(profileMark, />\s*VI\s*</)
  assert.match(profileMark, /aria-haspopup="dialog"/)
  assert.match(profileMark, /list_campaign_gm_models_v1/)
  assert.match(profileMark, /set_campaign_gm_model_v1/)
  assert.match(profileMark, /canManage/)
  assert.match(profileMark, /disabled=\{!canManage \|\| Boolean\(savingId\)\}/)
  assert.match(profileMark, /Модель задаёт мастер кампании/)
})

test("Stage 10 selector preserves the mobile grimdark sheet contract", () => {
  assert.match(workspaceCss, /\.u1-ai-model-shade/)
  assert.match(workspaceCss, /position: fixed/)
  assert.match(workspaceCss, /\.u1-ai-model-sheet/)
  assert.match(workspaceCss, /max-height: min\(78vh, 680px\)/)
  assert.match(workspaceCss, /\.u1-ai-model-choice\[data-selected\]/)
})

test("Stage 10 remains IN PROGRESS until live selector/runtime certification", () => {
  assert.match(
    roadmap,
    /\| 10 \| IN PROGRESS \| Campaign GM model selector and AI button \|/,
  )
  assert.match(roadmap, /Stage 10 is IN PROGRESS/)
  assert.match(readinessDebt, /id: "campaign-gm-model"/)
  assert.match(readinessDebt, /id: "ai-button-selector"/)
})
