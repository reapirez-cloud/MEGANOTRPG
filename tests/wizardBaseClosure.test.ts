import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const closure = fs.readFileSync("supabase/migrations/20260901090000_wizard_base_closure.sql", "utf8")
const anyMessageClosure = fs.readFileSync("supabase/migrations/20260901090500_wizard_rest_any_message_closure.sql", "utf8")
const restRuntime = fs.readFileSync("supabase/migrations/20260831120000_wizard_arcane_recovery_runtime.sql", "utf8")
const hook = fs.readFileSync("src/hooks/useChatPreparation.ts", "utf8")
const card = fs.readFileSync("src/components/chat/ChatPreparationCard.tsx", "utf8")
const wizardChoices = fs.readFileSync("src/components/chat/ChatWizardRestChoices.tsx", "utf8")

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  assert.ok(from >= 0, `missing section ${start}`)
  const to = source.indexOf(end, from + start.length)
  return source.slice(from, to >= 0 ? to : undefined)
}

test("base Wizard has no class-authored starting equipment", () => {
  assert.match(closure, /jsonb_build_object\('starting_equipment','\[\]'::jsonb\)/)
  assert.match(closure, /cantrip_long_rest_replacement','gena_popup_rpc'/)
  assert.match(closure, /wizard-cantrip-replacement-notice/)
})

test("Wizard cantrip replacement is a real once-per-long-rest transaction", () => {
  assert.match(closure, /create table if not exists public\.wizard_cantrip_replacement_uses/)
  assert.match(closure, /primary key\(character_id,long_rest_generation\)/)
  assert.match(closure, /create or replace function public\.replace_character_wizard_cantrip_v1/)
  assert.match(closure, /character_preparation_sessions/)
  assert.match(closure, /not v_session\.is_open/)
  assert.match(closure, /class_link\.class_key='wizard'/)
  assert.match(closure, /v_new\.spell_level<>0/)
  assert.match(closure, /delete from public\.character_spells where id=v_old\.id/)
  assert.match(closure, /insert into public\.character_spells\(character_id,catalog_spell_id,prepared\)/)
})

test("the first assigned-player message closes every post-rest window", () => {
  const close = section(anyMessageClosure, "create or replace function private.close_character_rest_windows_from_chat", "revoke all on function private.close_character_rest_windows_from_chat")
  assert.match(close, /c\.assigned_user_id=new\.user_id/)
  assert.match(close, /update public\.character_short_rest_sessions/)
  assert.match(close, /update public\.character_preparation_sessions/)
  assert.doesNotMatch(close, /event_kind/)
  assert.doesNotMatch(close, /btrim\(coalesce\(new\.body/)
  assert.match(anyMessageClosure, /after insert on public\.chat_messages/)
  assert.match(anyMessageClosure, /first_assigned_player_message_closes_all_post_rest_choices/)
})

test("rest resources recover before Gena exposes the choice window", () => {
  const shortRest = section(restRuntime, "create or replace function public.grant_character_short_rest", "revoke all on function public.grant_character_short_rest")
  assert.ok(shortRest.indexOf("recover_character_resources(p_character_id,'short_rest')") < shortRest.indexOf("insert into public.character_short_rest_sessions"))

  const longRest = section(restRuntime, "create or replace function public.grant_character_long_rest", "create or replace function private.close_character_short_rest_from_chat")
  assert.ok(longRest.indexOf("recover_character_resources(p_character_id,'long_rest')") < longRest.indexOf("insert into public.character_preparation_sessions"))
})

test("Gena observes both rest windows and renders the Wizard choice surface", () => {
  assert.match(hook, /character_short_rest_sessions/)
  assert.match(hook, /character_resource_states/)
  assert.match(hook, /catalog_key === "class:wizard"/)
  assert.match(hook, /shortRestSession/)
  assert.match(hook, /assignmentId: bundle\.assignment\.id/)

  assert.match(card, /ChatWizardRestChoices/)
  assert.match(card, /shortRestOpen/)
  assert.match(card, /longRestOpen/)
  assert.match(card, /до первого сообщения/)
  assert.doesNotMatch(card, /!model\.session\?\.is_open \|\| model\.tasks\.length === 0/)
})

test("Gena persists every Wizard-specific post-rest decision without chat messages", () => {
  assert.match(wizardChoices, /use_wizard_arcane_recovery_v1/)
  assert.match(wizardChoices, /memorizeWizardSpell/)
  assert.match(wizardChoices, /replace_character_wizard_cantrip_v1/)
  assert.match(wizardChoices, /setWizardSpellMastery/)
  assert.match(wizardChoices, /setWizardSignatureSpells/)
  assert.doesNotMatch(wizardChoices, /chat_messages/)
  assert.doesNotMatch(wizardChoices, /sendMessage/)
})
