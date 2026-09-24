import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260924183500_ai_gm_interruptible_player_turn_and_npc_leverage_v1.sql",
)
const composer = read("src/ui-v1-isolated/chat-room/ChatComposer.tsx")
const host = read("src/ui-v1-isolated/chat-room/ChatActionHost.tsx")
const queue = read("src/ui-v1-isolated/chat-room/playerTurnQueue.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `missing block: ${start}`)
  return source.slice(from, to)
}

test("turn draft accepts a long ordered plan but spends nothing before final Send", () => {
  assert.match(migration, /plan_entries jsonb not null default '\[\]'::jsonb/)
  assert.match(migration, /jsonb_array_length\(plan_entries\)<=64/)
  assert.match(migration, /save_player_turn_draft_v3/)
  const save = block(
    migration,
    "create or replace function public.save_player_turn_draft_v3",
    "create or replace function public.submit_player_turn_stage12_v2",
  )
  assert.doesNotMatch(save, /execute_player_turn_entry_v1/)
  assert.doesNotMatch(save, /send_chat_(?:roll|event|template|inventory|spell)/)
  assert.doesNotMatch(save, /consume_character_resource_costs/)
})

test("linked mechanics cannot wake the GM until the player writes final text", () => {
  const gate = read(
    "supabase/migrations/20260924192000_ai_gm_player_turn_final_text_gate_v5.sql",
  )
  assert.match(gate, /btrim\(coalesce\(new\.description,''\)\)=''/)
  assert.match(gate, /player_turn_text_required/)
  assert.match(composer, /if \(queuePlayerTurn && !body\) return/)
  assert.match(composer, /disabled=\{!canCompose \|\| sending \|\| !text\.trim\(\)\}/)
})

test("final Send seals one declaration and does not execute abilities or rolls", () => {
  const submit = block(
    migration,
    "create or replace function public.submit_player_turn_stage12_v2",
    "create or replace function private.assert_player_turn_entry_slot_v1",
  )
  assert.match(submit, /declaration_only',true/)
  assert.match(submit, /'player\.turn\.v2'/)
  assert.match(submit, /player_turn_plan/)
  assert.match(submit, /insert into public\.chat_messages/)
  assert.doesNotMatch(submit, /execute_player_turn_entry_v1/)
  assert.doesNotMatch(submit, /send_chat_(?:roll|template|inventory|spell)/)
})

test("legacy immediate-submit RPCs are closed to authenticated clients", () => {
  const closure = read(
    "supabase/migrations/20260924191000_ai_gm_interruptible_player_turn_legacy_submit_closure_v3.sql",
  )
  assert.match(
    closure,
    /revoke execute on function public\.submit_player_turn_v1\(uuid,integer,uuid\)/,
  )
  assert.match(
    closure,
    /revoke execute on function public\.submit_player_turn_stage12_v1\(uuid,integer,uuid,uuid\[\]\)/,
  )
  assert.match(closure, /from public,anon,authenticated/)
})

test("current draft read/cancel stay public invokers while legacy saves are closed", () => {
  const hardening = read(
    "supabase/migrations/20260924191500_ai_gm_interruptible_player_turn_legacy_rpc_hardening_v4.sql",
  )
  assert.match(hardening, /alter function public\.get_player_turn_draft_v1\(uuid,uuid\)[\s\S]*set schema private/)
  assert.match(hardening, /alter function public\.cancel_player_turn_draft_v1\(uuid\)[\s\S]*set schema private/)
  assert.match(hardening, /create or replace function public\.get_player_turn_draft_v1[\s\S]*security invoker/)
  assert.match(hardening, /create or replace function public\.cancel_player_turn_draft_v1[\s\S]*security invoker/)
  assert.match(hardening, /revoke execute on function public\.save_player_turn_draft_v1/)
  assert.match(hardening, /revoke execute on function public\.save_player_turn_draft_v2/)
})

test("AI can advance only the exact next declared non-reaction component", () => {
  const advance = block(
    migration,
    "create or replace function public.execute_ai_gm_player_turn_next_v1",
    "create or replace function public.execute_ai_gm_player_turn_reaction_v1",
  )
  assert.match(advance, /where ord::integer>v_draft\.execution_cursor/)
  assert.match(advance, /coalesce\(v_entry->>'economy',''\)='reaction'/)
  assert.match(advance, /player_turn_next_entry_mismatch/)
  assert.match(advance, /private\.execute_player_turn_entry_v1/)
  assert.match(advance, /execution_cursor=v_next_ord/)
  assert.match(runtime, /player_turn_requires_one_execution_tool_per_provider_round/)
})

test("declared reactions are armed without spending until a real trigger", () => {
  assert.match(queue, /PlayerTurnSlot = "action" \| "bonus_action" \| "reaction"/)
  assert.match(queue, /return "reaction"/)
  assert.match(composer, /Условие реакции/)
  assert.match(composer, /если маг начинает каст/)
  assert.match(runtime, /trigger_player_reaction/)
  assert.match(runtime, /когда канонический trigger действительно произошёл/)
  const reaction = block(
    migration,
    "create or replace function public.execute_ai_gm_player_turn_reaction_v1",
    "create or replace function public.settle_ai_gm_player_turn_plan_v1",
  )
  assert.match(reaction, /player_reaction_already_spent_this_turn/)
  assert.match(reaction, /declaredReactionTrigger/)
  assert.match(reaction, /private\.execute_player_turn_entry_v1/)
})

test("AI sees the sealed plan only through the final chat declaration", () => {
  assert.match(context, /player_turn_plan/)
  assert.match(context, /entries: rows\(playerTurnPlan\.entries\)\.slice\(0, 64\)/)
  assert.match(composer, /До «Отправить» ИИ не видит способности, броски и расход ресурсов/)
  const submitIndex = composer.indexOf("submitPlayerTurnDraft")
  const aiIndex = composer.indexOf(
    "sourceChatMessageId: submitted.trigger_message_id",
  )
  assert.ok(submitIndex >= 0 && aiIndex > submitIndex)
  const queueBranch = block(
    host,
    "async function queueTurnEntry",
    "async function queueSpellTurnEntry",
  )
  assert.doesNotMatch(queueBranch, /triggerAiGameMasterTurn|functions\.invoke/)
})

test("GM may stop the remaining declaration when the world gets an intervention window", () => {
  assert.match(runtime, /естественное право вмешаться/)
  assert.match(runtime, /НЕ исполняй остаток плана/)
  assert.match(runtime, /Fireball → Fireball → Fireball/)
  assert.match(runtime, /settleDeclaredPlayerTurnAfterDecision/)
  assert.match(runtime, /world_or_npc_intervened_before_remaining_declared_actions/)
  assert.match(migration, /execution_state=case when v_more then 'interrupted' else 'completed' end/)
})

test("NPC leverage is situational instead of a static weakness whitelist", () => {
  assert.match(runtime, /situational leverage analysis/)
  assert.match(runtime, /Fingerprint НЕ является таблицей/)
  for (const classification of [
    "no_leverage",
    "weak_leverage",
    "credible_leverage",
    "decisive_leverage",
    "blocked_by_identity",
  ]) {
    assert.match(runtime, new RegExp(classification))
  }
  assert.match(runtime, /угрожать смертью человеку, которого завтра гарантированно казнят/)
})

test("no leverage and identity blocks cannot silently become a Persuasion roll", () => {
  assert.match(
    runtime,
    /socialLeverageAnalysis\.classification === "no_leverage"/,
  )
  assert.match(
    runtime,
    /socialLeverageAnalysis\.classification === "blocked_by_identity"/,
  )
  assert.match(runtime, /rollRequest = null/)
  assert.match(runtime, /no_leverage обычно означает deterministic_failure/)
  assert.match(runtime, /blocked_by_identity — deterministic_failure или impossible_exact/)
})

test("sparse NPC identity refinement cannot tailor a weakness to the current tactic", () => {
  assert.match(migration, /refine_npc_identity_bootstrap_v2/)
  assert.match(migration, /fill_missing_stable_dimensions_only/)
  assert.match(migration, /current_player_tactic_excluded/)
  assert.match(runtime, /ТЕБЕ НАМЕРЕННО НЕ ПЕРЕДАЁТСЯ текущая тактика игрока/)
  assert.match(runtime, /current_player_tactic_excluded: true/)
  assert.match(runtime, /current_chat_messages_excluded: true/)
  assert.match(runtime, /resolveCampaignJuniorModel/)
  assert.doesNotMatch(
    block(
      runtime,
      "async function refineNpcIdentityForSocialScene",
      "async function requestPrimaryGmDecision",
    ),
    /recentMessages|originalMessage|userContent/,
  )
})

test("identity refinement fills only empty stable dimensions", () => {
  const refine = block(
    migration,
    "create or replace function public.refine_npc_identity_bootstrap_v2",
    "revoke all on function private.normalize_player_turn_plan_entry_v1",
  )
  assert.match(refine, /jsonb_array_length\(v_existing->'weighted_values'\)=0/)
  assert.match(refine, /jsonb_array_length\(v_existing->'red_lines'\)=0/)
  assert.match(refine, /v_existing->'weighted_values' end/)
  assert.match(refine, /v_existing->'red_lines' end/)
  assert.match(refine, /p_expected_version/)
  assert.match(refine, /npc_identity_refinement_version_mismatch/)
})
