import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const resolverMigration = fs.readFileSync(
  "supabase/migrations/20260922202506_quest_engine_stage4_resolver_v1.sql",
  "utf8",
)
const noCascadeMigration = fs.readFileSync(
  "supabase/migrations/20260922202846_quest_engine_stage4_no_cascade_v1.sql",
  "utf8",
)
const activationGuardMigration = fs.readFileSync(
  "supabase/migrations/20260922202958_quest_engine_stage4_activation_guard_v1.sql",
  "utf8",
)
const playerHook = fs.readFileSync(
  "src/ui-v1-isolated/useCharacterQuests.ts",
  "utf8",
)
const managerHook = fs.readFileSync(
  "src/ui-v1-isolated/useQuestManager.ts",
  "utf8",
)
const questUi = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetQuests.tsx",
  "utf8",
)

test("stage 4 persists manager-only quest condition resolver state", () => {
  assert.match(resolverMigration, /create table public\.quest_condition_states/)
  assert.match(resolverMigration, /quest_condition_states_manager_access/)
  assert.match(resolverMigration, /resolution_source in \('pending','resolver','gm','ai'\)/)
  assert.match(resolverMigration, /evidence jsonb/)
})

test("resolver supports canonical automatic condition sources", () => {
  for (const token of [
    "visit_location",
    "discover_location",
    "meet_npc",
    "talk_to_npc",
    "inventory_has",
    "deliver_item",
    "event_occurred",
    "character_state",
    "custom_narrative",
  ]) {
    assert.match(resolverMigration, new RegExp(token))
  }

  assert.match(resolverMigration, /character_world_state/)
  assert.match(resolverMigration, /character_location_discoveries/)
  assert.match(resolverMigration, /character_npc_discoveries/)
  assert.match(resolverMigration, /character_inventory_items/)
  assert.match(resolverMigration, /campaign_events/)
})

test("canonical world changes automatically invoke the quest resolver", () => {
  assert.match(resolverMigration, /character_inventory_items_quest_resolver_v1/)
  assert.match(resolverMigration, /character_location_discoveries_quest_resolver_v1/)
  assert.match(resolverMigration, /character_npc_discoveries_quest_resolver_v1/)
  assert.match(resolverMigration, /character_world_state_quest_resolver_v1/)
  assert.match(resolverMigration, /campaign_events_quest_resolver_v1/)
})

test("resolver records location entry and quest completion as campaign events", () => {
  assert.match(resolverMigration, /world\.location_entered/)
  assert.match(resolverMigration, /quest\.stage_completed/)
  assert.match(resolverMigration, /quest\.completed/)
  assert.match(resolverMigration, /source_kind[\s\S]*'quest_engine'/)
  assert.match(resolverMigration, /visibility[\s\S]*'characters'/)
})

test("future planned stages cannot cascade-complete in the same resolver pass", () => {
  assert.doesNotMatch(
    noCascadeMigration,
    /perform private\.resolve_quest_stage_v1\(v_next_stage_id\)/,
  )
  assert.match(
    noCascadeMigration,
    /where qs\.quest_id = p_quest_id[\s\S]*and qs\.status = 'active'/,
  )
  assert.match(
    activationGuardMigration,
    /meganot\.quest_resolver_running/,
  )
  assert.match(
    activationGuardMigration,
    /current_setting\('meganot\.quest_resolver_running', true\) = '1'/,
  )
})

test("only custom narrative conditions expose manager manual resolution", () => {
  assert.match(resolverMigration, /only_custom_narrative_conditions_are_manually_resolved/)
  assert.match(managerHook, /set_quest_condition_resolution_v1/)
  assert.match(questUi, /condition\.condition_type !== "custom_narrative"/)
  assert.match(questUi, /Подтвердить сюжетное условие/)
})

test("GM can inspect resolver state while player data remains isolated", () => {
  assert.match(managerHook, /resolution_source/)
  assert.match(managerHook, /last_evaluated_at/)
  assert.match(managerHook, /resolve_quest_v1/)
  assert.match(questUi, /Ждёт условия/)
  assert.match(questUi, /Выполнено/)

  assert.match(playerHook, /list_character_quests_v1/)
  assert.doesNotMatch(playerHook, /quest_condition_states/)
  assert.doesNotMatch(playerHook, /read_quest_plan_v1/)
})
