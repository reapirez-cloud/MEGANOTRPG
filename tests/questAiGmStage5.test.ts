import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const questTools = fs.readFileSync(
  "supabase/functions/voss-agent/quest-tools.ts",
  "utf8",
)
const agentIndex = fs.readFileSync(
  "supabase/functions/voss-agent/index.ts",
  "utf8",
)
const capabilityBroker = fs.readFileSync(
  "supabase/functions/voss-agent/capability-broker.ts",
  "utf8",
)
const apiMigration = fs.readFileSync(
  "supabase/migrations/20260922203630_quest_engine_ai_gm_api_v1.sql",
  "utf8",
)
const discoverNpcMigration = fs.readFileSync(
  "supabase/migrations/20260922203522_quest_engine_discover_npc_resolver_v1.sql",
  "utf8",
)

test("AI GM exposes the complete Quest Engine tool surface", () => {
  for (const name of [
    "list_quests",
    "create_quest_plan",
    "read_quest_plan",
    "activate_quest",
    "update_quest_brief",
    "bind_quest_target",
    "resolve_quest_condition",
    "run_quest_resolver",
    "close_quest",
  ]) {
    assert.match(questTools, new RegExp(`name: "${name}"`))
  }
})

test("quest tools are gated behind manager authority and campaign.manage", () => {
  assert.match(questTools, /authority === "gm" \|\| context\.authority === "admin"/)
  assert.match(agentIndex, /grantedCapabilities\.has\("campaign\.manage"\)[\s\S]*VOSS_QUEST_TOOLS/)
  assert.match(agentIndex, /authority === "player"[\s\S]*return \[\]/)
  assert.match(capabilityBroker, /campaign\.manage/)
})

test("new quest plans are atomic hidden drafts and idempotent by quest_key", () => {
  assert.match(apiMigration, /create or replace function public\.create_quest_plan_v1/)
  assert.match(apiMigration, /status,[\s\S]*'draft'/)
  assert.match(apiMigration, /quest_key = v_quest_key/)
  assert.match(apiMigration, /'idempotent', true/)
  assert.match(apiMigration, /meganot\.quest_plan_building/)
  assert.match(apiMigration, /quest_plan_build_guard_v1/)
})

test("AI narrative resolution is explicitly distinguished from GM manual resolution", () => {
  assert.match(apiMigration, /set_quest_condition_resolution_ai_v1/)
  assert.match(apiMigration, /resolution_source,[\s\S]*'ai'/)
  assert.match(apiMigration, /'agent', 'voss'/)
  assert.match(questTools, /set_quest_condition_resolution_ai_v1/)
  assert.match(questTools, /custom_narrative/)
})

test("quest lifecycle separates authoring, activation, resolver and explicit closure", () => {
  assert.match(apiMigration, /activate_quest_v1/)
  assert.match(apiMigration, /close_quest_v1/)
  assert.match(questTools, /activation_required: true/)
  assert.match(questTools, /resolve_quest_v1/)
  assert.match(questTools, /normal successful completion should usually be left to the Quest Resolver/)
})

test("AI GM is instructed to keep future entities as placeholders", () => {
  assert.match(agentIndex, /create_quest_plan одним атомарным вызовом/)
  assert.match(agentIndex, /Не создавай заранее NPC, предмет или локацию/)
  assert.match(agentIndex, /bind_quest_target/)
  assert.match(agentIndex, /Игроку нельзя раскрывать существование будущих этапов/)
})

test("discover_npc is evaluated by the canonical NPC discovery resolver", () => {
  assert.match(
    discoverNpcMigration,
    /condition_type in \('meet_npc','discover_npc'\)/,
  )
  assert.match(discoverNpcMigration, /character_npc_discoveries/)
})

test("quest tool schema stays compatible with strict OpenAI-compatible providers", () => {
  assert.doesNotMatch(questTools, /type: \["string", "null"\]/)
  assert.match(questTools, /Use an empty string to remove an existing binding/)
})
