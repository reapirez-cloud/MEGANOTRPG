import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923152912_ai_world_campaign_isolation_v1.sql",
)
const authGate = read("src/components/auth/AuthGate.tsx")
const contracts = read(
  "src/ui-v1-isolated/chat-room/chatRoomContracts.ts",
)
const chatShell = read(
  "src/ui-v1-isolated/chat-room/useChatRoomShell.ts",
)
const composer = read(
  "src/ui-v1-isolated/chat-room/ChatComposer.tsx",
)
const profileMark = read("src/ui-v1-isolated/PlayerProfileMark.tsx")
const runtime = read(
  "supabase/functions/voss-agent/game-chat-runtime.ts",
)

test("AI world slots materialize as canonical isolated campaigns", () => {
  assert.match(
    migration,
    /alter table public\.ai_world_slots[\s\S]*campaign_id uuid[\s\S]*references public\.campaigns\(id\)/,
  )
  assert.match(migration, /open_ai_world_slot_v2/)
  assert.match(
    migration,
    /insert into public\.campaigns[\s\S]*insert into public\.campaign_members/,
  )
  assert.match(
    migration,
    /private\.is_ai_world_campaign_v1/,
  )
})

test("AI GM server state is fail-closed outside AI worlds", () => {
  assert.match(
    migration,
    /agent_jobs_ai_gm_scope_guard_v1/,
  )
  assert.match(
    migration,
    /v_surface in \('game_chat_v1', 'world_maintenance_v1'\)/,
  )
  assert.match(
    migration,
    /player_turn_drafts_ai_gm_scope_guard_v1/,
  )
  assert.match(
    migration,
    /pending_player_roll_requests_ai_gm_scope_guard_v1/,
  )
  assert.match(
    migration,
    /not private\.is_ai_world_campaign_v1\(v_campaign_id\)[\s\S]*return new/,
  )
})

test("normal campaign selection excludes materialized AI slot campaigns", () => {
  assert.match(authGate, /\.select\("campaign_id"\)/)
  assert.match(authGate, /aiCampaignIds/)
  assert.match(authGate, /standardOwnerRows/)
  assert.match(authGate, /setBaseCampaign\(selectedAccess\)/)
  assert.match(authGate, /setCampaign\(baseCampaign\)/)
})

test("opening an experimental slot enters the same app through its own campaign", () => {
  assert.match(authGate, /ensure_ai_world_slots_v2/)
  assert.match(authGate, /open_ai_world_slot_v2/)
  assert.match(authGate, /setCampaign\(nextCampaign\)/)
  assert.match(authGate, /setPhase\("ready"\)/)
})

test("chat only queues and invokes AI GM inside experimental worlds", () => {
  assert.match(contracts, /aiGameMasterEnabled\?: boolean/)
  assert.match(chatShell, /is_ai_world_campaign_v1/)
  assert.match(chatShell, /aiGameMasterEnabled/)
  assert.match(
    composer,
    /model\.viewer\.aiGameMasterEnabled === true[\s\S]*!model\.canManage/,
  )
  assert.match(
    composer,
    /model\.viewer\.aiGameMasterEnabled === true[\s\S]*triggerAiGameMasterTurn/,
  )
})

test("AI model selector disappears from ordinary campaigns", () => {
  assert.match(profileMark, /is_ai_world_campaign_v1/)
  assert.match(profileMark, /setGmEnabled\(false\)/)
  assert.match(profileMark, /if \(!campaignId \|\| !gmEnabled\) return null/)
})

test("Edge runtime rejects direct AI GM calls for normal campaigns", () => {
  assert.match(runtime, /\.from\("ai_world_slots"\)/)
  assert.match(runtime, /\.eq\("campaign_id", input\.campaignId\)/)
  assert.match(runtime, /code: "ai_gm_not_available"/)
})
