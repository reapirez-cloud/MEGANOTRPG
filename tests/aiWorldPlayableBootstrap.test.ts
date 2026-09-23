import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923154800_ai_world_play_bootstrap_v1.sql",
)
const authGate = read("src/components/auth/AuthGate.tsx")
const composer = read("src/ui-v1-isolated/chat-room/ChatComposer.tsx")

test("AI world owner stays a player identity while retaining owner authority", () => {
  assert.match(
    migration,
    /values\(v_campaign_id,v_user_id,'player',true\)/,
  )
  assert.match(
    migration,
    /on conflict\(campaign_id,user_id\) do update set[\s\S]*role = 'player'[\s\S]*is_owner = true/,
  )
})

test("first AI world character bootstrap is atomic and gameplay-ready", () => {
  assert.match(migration, /create_ai_world_player_character_v1/)
  assert.match(migration, /create_campaign_character_v2/)
  assert.match(migration, /assign_character_template_v2/)
  assert.match(migration, /set_campaign_active_character/)
  assert.match(migration, /ensure_character_chat_room/)
  assert.match(migration, /ai_world_owner_required/)
})

test("slot no longer ends in a placeholder and opens character onboarding", () => {
  assert.doesNotMatch(authGate, /phase === "ai-world"/)
  assert.match(authGate, /phase === "ai-character"/)
  assert.match(authGate, /create_ai_world_player_character_v1/)
  assert.match(authGate, /Создать и играть/)
  assert.match(
    authGate,
    /window\.location\.hash = "#\/chats\/" \+ encodeURIComponent\(created\.room_id\)/,
  )
})

test("existing live PC resumes without forcing another character creation", () => {
  assert.match(
    authGate,
    /\.eq\("assigned_user_id", user\.id\)[\s\S]*\.eq\("publication_state", "campaign"\)[\s\S]*\.eq\("life_state", "alive"\)/,
  )
  assert.match(authGate, /set_campaign_active_character/)
})

test("AI world owner-player uses the staged player turn queue", () => {
  assert.match(
    composer,
    /model\.viewer\.aiGameMasterEnabled === true[\s\S]*model\.viewer\.role === "player"[\s\S]*selectedCharacterId === model\.viewer\.playerCharacterId/,
  )
})
