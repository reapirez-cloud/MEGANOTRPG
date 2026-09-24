import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 4 persists one durable draft for action, bonus action, movement and description", () => {
  const sql = read(
    "supabase/migrations/20260923095500_ai_gm_player_turn_stage4_v1.sql",
  )

  assert.match(sql, /create table if not exists public\.player_turn_drafts/)
  assert.match(sql, /action_entry jsonb/)
  assert.match(sql, /bonus_action_entry jsonb/)
  assert.match(sql, /movement jsonb/)
  assert.match(sql, /component_order text\[\]/)
  assert.match(sql, /description text/)
  assert.match(sql, /player_turn_drafts_one_open_per_actor/)
  assert.match(sql, /save_player_turn_draft_v1/)
  assert.match(sql, /get_player_turn_draft_v1/)
  assert.match(sql, /cancel_player_turn_draft_v1/)
})

test("Stage 4 draft selection does not spend resources or emit gameplay messages", () => {
  const sql = read(
    "supabase/migrations/20260923095500_ai_gm_player_turn_stage4_v1.sql",
  )
  const saveStart = sql.indexOf(
    "create or replace function public.save_player_turn_draft_v1",
  )
  const getStart = sql.indexOf(
    "create or replace function public.get_player_turn_draft_v1",
  )
  assert.ok(saveStart >= 0 && getStart > saveStart)
  const saveBody = sql.slice(saveStart, getStart)

  assert.doesNotMatch(saveBody, /consume_character_resource_costs/)
  assert.doesNotMatch(saveBody, /send_chat_event/)
  assert.doesNotMatch(saveBody, /send_chat_roll/)
  assert.doesNotMatch(saveBody, /use_character_template/)
  assert.match(saveBody, /player_turn_drafts/)
})

test("Stage 4 submit executes queued gameplay only inside one authoritative RPC", () => {
  const sql = read(
    "supabase/migrations/20260923095500_ai_gm_player_turn_stage4_v1.sql",
  )

  assert.match(sql, /submit_player_turn_v1/)
  assert.match(sql, /execute_player_turn_entry_v1/)
  assert.match(sql, /send_chat_template_action_v2/)
  assert.match(sql, /send_chat_template_roll_v2/)
  assert.match(sql, /send_chat_template_spell_v2/)
  assert.match(sql, /send_chat_spell_with_template_modifiers_v2/)
  assert.match(sql, /send_chat_inventory_event_v1/)
  assert.match(sql, /send_chat_inventory_roll_v1/)
  assert.match(sql, /send_chat_event_v3/)
  assert.match(sql, /send_chat_roll_v4/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /engine_command_receipts/)
  assert.match(sql, /command_kind,[\s\S]*'player\.turn\.v1'/)
  assert.match(sql, /result->>'draft_id'/)
  assert.match(sql, /assert_player_turn_entry_slot_v1/)
})

test("Stage 4 correlates every emitted component with one turn command and inserts trigger text last", () => {
  const sql = read(
    "supabase/migrations/20260923095500_ai_gm_player_turn_stage4_v1.sql",
  )
  const submitStart = sql.indexOf(
    "create or replace function public.submit_player_turn_v1",
  )
  assert.ok(submitStart >= 0)
  const submit = sql.slice(submitStart)

  assert.match(sql, /turn_command_id uuid/)
  assert.match(sql, /turn_component text/)
  assert.match(sql, /turn_order smallint/)
  assert.match(sql, /normalize_player_turn_order_v1/)
  assert.match(submit, /foreach v_component in array v_draft\.component_order loop/)
  assert.match(submit, /'action'/)
  assert.match(submit, /'bonus_action'/)
  assert.match(submit, /'movement'/)
  assert.match(submit, /'description'/)

  const actionIndex = submit.indexOf("private.execute_player_turn_entry_v1")
  const finalMessageIndex = submit.indexOf("insert into public.chat_messages")
  const completeIndex = submit.indexOf(
    "update public.player_turn_drafts",
    finalMessageIndex,
  )
  assert.ok(actionIndex >= 0)
  assert.ok(finalMessageIndex > actionIndex)
  assert.ok(completeIndex > finalMessageIndex)
  assert.match(submit, /'trigger_message_id', v_trigger_message_id/)
})

test("Stage 4 client builds an ordered declarative plan instead of executing selections immediately", () => {
  const host = read(
    "src/ui-v1-isolated/chat-room/ChatActionHost.tsx",
  )
  const composer = read(
    "src/ui-v1-isolated/chat-room/ChatComposer.tsx",
  )
  const queue = read(
    "src/ui-v1-isolated/chat-room/playerTurnQueue.ts",
  )

  assert.match(host, /queuePlayerTurn/)
  assert.match(host, /queueTurnEntry/)
  assert.match(host, /playerTurnSlotForEconomy/)
  assert.match(host, /kind: "template_roll"/)
  assert.match(host, /kind: "template_spell"/)
  assert.match(host, /kind: "spell_with_modifiers"/)
  assert.match(host, /kind: inventoryRolls \? "inventory_roll" : "inventory_event"/)

  assert.match(composer, /savePlayerTurnDraft/)
  assert.match(composer, /submitPlayerTurnDraft/)
  assert.match(composer, /План хода/)
  assert.match(composer, /До «Отправить» ИИ не видит способности, броски и расход ресурсов/)
  assert.match(composer, /moveTurnEntry/)
  assert.match(composer, /clearTurnEntry/)
  assert.match(composer, /updateReactionCondition/)
  assert.match(composer, /cancelTurn/)

  assert.match(queue, /get_player_turn_draft_v1/)
  assert.match(queue, /save_player_turn_draft_v3/)
  assert.match(queue, /p_plan_entries: planEntries/)
  assert.match(queue, /reorderPlayerTurnEntries/)
  assert.match(queue, /submit_player_turn_stage12_v2/)
})

test("Stage 4 AI GM starts only after atomic submit returns the final trigger message", () => {
  const composer = read(
    "src/ui-v1-isolated/chat-room/ChatComposer.tsx",
  )

  const submitIndex = composer.indexOf("submitPlayerTurnDraft")
  const triggerIndex = composer.indexOf(
    "sourceChatMessageId: submitted.trigger_message_id",
  )
  assert.ok(submitIndex >= 0)
  assert.ok(triggerIndex > submitIndex)
  assert.match(
    composer,
    /messageId: submitted\.trigger_message_id/,
  )
})

test("Stage 4 keeps turn grouping in maintenance while Stage 19 strips worker bookkeeping from GM context", () => {
  const context = read(
    "supabase/functions/voss-agent/game-chat-context.ts",
  )
  const worker = read(
    "supabase/functions/voss-agent/world-maintenance.ts",
  )

  assert.match(context, /player_turn_plan/)
  assert.match(context, /turn_command_id: nullableString\(playerTurnPlan\.turn_command_id\)/)
  assert.match(context, /worker_commands_are_not_narrative_memory: true/)
  assert.match(worker, /turn_command_id/)
  assert.match(worker, /turn_component/)
  assert.match(worker, /turn_order/)
})


test("Stage 4 queues free rolls and checks instead of rolling before submit", () => {
  const host = read(
    "src/ui-v1-isolated/chat-room/ChatActionHost.tsx",
  )

  const freeRollStart = host.indexOf("async function freeRoll")
  const checkStart = host.indexOf("async function rollCheck")
  const actionStart = host.indexOf("async function runAction")
  assert.ok(freeRollStart >= 0 && checkStart > freeRollStart)
  assert.ok(actionStart > checkStart)

  const freeRoll = host.slice(freeRollStart, checkStart)
  const check = host.slice(checkStart, actionStart)
  assert.match(freeRoll, /kind: "raw_roll"/)
  assert.match(freeRoll, /await queueTurnEntry/)
  assert.match(check, /kind: "raw_roll"/)
  assert.match(check, /await queueTurnEntry/)
})

test("Stage 4 server revalidates canonical action economy and spell casting time", () => {
  const sql = read(
    "supabase/migrations/20260923095500_ai_gm_player_turn_stage4_v1.sql",
  )
  const queue = read(
    "src/ui-v1-isolated/chat-room/playerTurnQueue.ts",
  )

  assert.match(sql, /player_turn_entry_economy_v1/)
  assert.match(sql, /character_template_selected_action_definition_v1/)
  assert.match(sql, /from public\.spell_catalog/)
  const hardening = read(
    "supabase/migrations/20260924183500_ai_gm_interruptible_player_turn_and_npc_leverage_v1.sql",
  )
  assert.match(hardening, /p_component not in \('action','bonus_action','reaction'\)/)
  assert.match(hardening, /Queued entry does not match its action economy/)
  assert.match(queue, /playerTurnSlotForSpell/)
  assert.match(queue, /\.from\("spell_catalog"\)/)
  assert.match(queue, /return "reaction"/)
})

test("Stage 4 UI does not let players manually move mechanics between action slots", () => {
  const composer = read(
    "src/ui-v1-isolated/chat-room/ChatComposer.tsx",
  )

  assert.doesNotMatch(composer, /В бонус/)
  assert.doesNotMatch(composer, /В действие/)
  assert.match(composer, /moveTurnEntry/)
  assert.match(composer, /aria-label="Убрать из плана"/)
  assert.match(composer, /turnEconomyLabel/)
})


test("Stage 4 preserves mechanics slots while allowing execution order changes", () => {
  const sql = read(
    "supabase/migrations/20260923095500_ai_gm_player_turn_stage4_v1.sql",
  )
  const composer = read(
    "src/ui-v1-isolated/chat-room/ChatComposer.tsx",
  )

  const hardening = read(
    "supabase/migrations/20260924183500_ai_gm_interruptible_player_turn_and_npc_leverage_v1.sql",
  )
  assert.match(hardening, /Queued entry does not match its action economy/)
  assert.match(hardening, /player_turn_plan_must_be_array/)
  assert.match(hardening, /jsonb_array_length\(v_entries\)>64/)
  assert.match(composer, /aria-label="Порядок заявленных компонентов хода"/)
  assert.match(composer, /Условие реакции/)
  assert.doesNotMatch(composer, /В бонус|В действие/)
})

test("Stage 4 queues a player roll instead of rolling before submit", () => {
  const host = read(
    "src/ui-v1-isolated/chat-room/ChatActionHost.tsx",
  )

  const freeRoll = host.indexOf("async function freeRoll")
  const check = host.indexOf("async function rollCheck", freeRoll)
  const action = host.indexOf("async function runAction", check)
  assert.ok(freeRoll >= 0 && check > freeRoll && action > check)

  const freeRollBody = host.slice(freeRoll, check)
  const checkBody = host.slice(check, action)
  assert.match(freeRollBody, /queueTurnEntry/)
  assert.match(checkBody, /queueTurnEntry/)
  assert.ok(
    freeRollBody.indexOf("queueTurnEntry") <
      freeRollBody.indexOf("genaSession.sendRoll"),
  )
  assert.ok(
    checkBody.indexOf("queueTurnEntry") <
      checkBody.indexOf("genaSession.sendRoll"),
  )
})


test("Stage 4 draft table stays read-only and anonymous callers are rejected", () => {
  const hardening = read(
    "supabase/migrations/20260923101000_ai_gm_player_turn_stage4_hardening_v1.sql",
  )

  assert.match(
    hardening,
    /revoke all on table public\.player_turn_drafts[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    hardening,
    /grant select on table public\.player_turn_drafts[\s\S]*to authenticated/,
  )
  assert.match(hardening, /Anonymous accounts cannot submit player turns/)
  assert.match(hardening, /auth\.jwt\(\) ->> 'is_anonymous'/)
})

test("Stage 4 stays READY after the roadmap closes", () => {
  const roadmap = read("docs/AI_GM_ROADMAP.md")

  assert.match(roadmap, /\| 4 \| READY \|/)
  assert.match(roadmap, /\| 12 \| READY \|/)
})
