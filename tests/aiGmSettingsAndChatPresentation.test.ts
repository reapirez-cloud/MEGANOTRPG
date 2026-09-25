import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const app = read("src/ui-v1-isolated/UiV1App.tsx")
const control = read("src/ui-v1-isolated/AiGmControl.tsx")
const controlCss = read("src/ui-v1-isolated/ai-gm-control.css")
const agentShell = read("src/ai/AgentShell.tsx")
const chatFeed = read("src/ui-v1-isolated/chat-room/ChatFeed.tsx")
const chatEvents = read("src/ui-v1-isolated/chat-room/useChatRoomEvents.ts")
const chatModel = read("src/ui-v1-isolated/chat-room/chatEventModel.ts")
const chatItem = read("src/ui-v1-isolated/chat-room/ChatFeedItem.tsx")
const identityMigration = read(
  "supabase/migrations/20260925052000_ai_gm_visible_chat_identity_v1.sql",
)

test("AI GM settings are a dedicated full-screen route without the agent overlay", () => {
  assert.match(app, /route\.type !== "ai-gm" \? <AgentShell \/> : null/)
  assert.match(controlCss, /\.u1-ai-gm-control\s*\{[\s\S]*position:\s*fixed/)
  assert.match(controlCss, /\.u1-ai-gm-control\s*\{[\s\S]*inset:\s*0/)
  assert.match(controlCss, /\.u1-ai-gm-control\s*\{[\s\S]*z-index:\s*120/)
  assert.match(app, /path === "ai-gm\/models"/)
  assert.match(app, /path === "ai-gm\/behavior"/)

  assert.match(agentShell, /gmBehavior\?\.ai_world && false/)
  assert.match(agentShell, /gmBehavior\?\.ai_world && contentProfile && false/)
  assert.match(agentShell, /gmBehavior\?\.ai_world && directorPreferences && false/)
})

test("dedicated behavior screen exposes campaign mode, 18 plus, director and runtime controls", () => {
  assert.match(control, /ХАРДКОР \/ ПРИКЛЮЧЕНИЕ \/ СИМС/)
  assert.match(control, /Хардкор \/ Жестокий/)
  assert.match(control, /18\+ \/ ВЗРОСЛАЯ ТЕМАТИКА/)
  assert.match(control, /18\+ · Взрослая жизнь/)
  assert.match(control, /DIRECTOR_CONTROLS/)
  assert.match(control, /ФУНКЦИИ ИИ-МИРА/)
  assert.match(control, /set_campaign_ai_gm_behavior_profile_v1/)
  assert.match(control, /set_campaign_ai_gm_content_profile_v1/)
  assert.match(control, /set_my_ai_director_preferences_v1/)
  assert.match(control, /set_campaign_ai_gm_runtime_feature_v1/)
})

test("AI GM messages are never classified as the viewer own outgoing message", () => {
  assert.match(chatEvents, /turn_command_id, turn_component, turn_order/)
  assert.match(chatModel, /message\.turn_component === "ai_gm_output"/)
  assert.match(chatModel, /"player_roll_request"/)
  assert.match(chatFeed, /!event\.source\.aiGm/)
  assert.match(chatItem, /NPC · ИИ/)
  assert.match(chatItem, /ИИ · Рассказчик/)
})

test("AI GM NPC messages publish the real persistent NPC identity", () => {
  assert.match(identityMigration, /c\.name/)
  assert.match(identityMigration, /c\.avatar_url/)
  assert.match(identityMigration, /author_name,author_avatar_url/)
  assert.match(identityMigration, /turn_component='ai_gm_output'/)
  assert.match(
    identityMigration,
    /revoke all on function public\.publish_ai_gm_turn_message_v1[\s\S]*authenticated/,
  )
  assert.match(
    identityMigration,
    /grant execute on function public\.publish_ai_gm_turn_message_v1[\s\S]*service_role/,
  )
})
