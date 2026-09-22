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
const bridgeMigration = fs.readFileSync(
  "supabase/migrations/20260922215945_quest_world_bridge_stage6_v1.sql",
  "utf8",
)
const itemSourceFix = fs.readFileSync(
  "supabase/migrations/20260922220435_quest_world_bridge_stage6_item_source_fix_v1.sql",
  "utf8",
)

test("quest tools expose atomic target materialization", () => {
  assert.match(questTools, /name: "materialize_quest_target"/)
  assert.match(questTools, /materialize_quest_target_v1/)
  assert.match(questTools, /already-bound target is idempotent/)
})

test("bridge locks quest and target before materialization", () => {
  assert.match(bridgeMigration, /from public\.quests q[\s\S]*for update/i)
  assert.match(bridgeMigration, /from public\.quest_targets qt[\s\S]*for update/i)
})

test("bridge materializes all three canonical target kinds", () => {
  assert.match(bridgeMigration, /v_target\.target_kind='location'/)
  assert.match(bridgeMigration, /insert into public\.locations/i)
  assert.match(bridgeMigration, /v_target\.target_kind='npc'/)
  assert.match(bridgeMigration, /create_world_npc_v1/)
  assert.match(bridgeMigration, /v_target\.target_kind='item'/)
  assert.match(bridgeMigration, /create_reference_definition_v2/)
})

test("bridge binds target and reruns the canonical resolver", () => {
  assert.match(bridgeMigration, /update public\.quest_targets/)
  assert.match(bridgeMigration, /binding_state<>'bound'/)
  assert.match(bridgeMigration, /private\.resolve_quest_v1\(p_quest_id\)/)
  assert.match(bridgeMigration, /public\.read_quest_plan_v1\(p_quest_id\)/)
})

test("retrying a bound target does not create a duplicate", () => {
  assert.match(bridgeMigration, /v_existing_id is not null/)
  assert.match(bridgeMigration, /'created',false/)
  assert.match(bridgeMigration, /'already_bound',true/)
})

test("new quest items default to GM-only and keep traceable provenance", () => {
  assert.match(itemSourceFix, /coalesce\(v_input->>'visibility','gm'\)/)
  assert.match(itemSourceFix, /'custom'/)
  assert.match(itemSourceFix, /'quest_target:' \|\| v_target\.id::text/)
  assert.doesNotMatch(itemSourceFix, /'quest_materialization'/)
})

test("Freddy distinguishes materialize from bind and discovery", () => {
  assert.match(agentIndex, /materialize_quest_target/)
  assert.match(agentIndex, /Если нужная каноническая сущность уже существует/)
  assert.match(agentIndex, /используй bind_quest_target/)
  assert.match(agentIndex, /не создаёт сущность/)
})

test("bridge remains GM or admin only", () => {
  assert.match(bridgeMigration, /private\.can_manage_quest\(p_quest_id,v_user_id\)/)
  assert.match(bridgeMigration, /quest_target_materialization_denied/)
  assert.match(bridgeMigration, /grant execute[\s\S]*to authenticated,service_role/i)
})
