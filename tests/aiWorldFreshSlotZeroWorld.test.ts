import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const isolation = read(
  "supabase/migrations/20260923152912_ai_world_campaign_isolation_v1.sql",
)
const lazyRules = read(
  "supabase/migrations/20260924212500_ai_world_fresh_slot_lazy_rules_v1.sql",
)
const membershipFix = read(
  "supabase/migrations/20260924213500_ai_world_slot_membership_conflict_fix_v1.sql",
)
const spellLinks = read(
  "supabase/migrations/20260924214500_ai_world_lazy_spell_link_idempotency_v1.sql",
)
const authGate = read("src/components/auth/AuthGate.tsx")

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `missing block: ${start}`)
  return source.slice(from, to)
}

test("fresh AI-world slot creates only campaign container and membership", () => {
  const openSlot = block(
    isolation,
    "create or replace function public.open_ai_world_slot_v2",
    "create or replace function private.sync_ai_world_slot_campaign_title_v1",
  )

  assert.match(openSlot, /insert into public\.campaigns/)
  assert.match(openSlot, /update public\.ai_world_slots/)
  assert.match(openSlot, /insert into public\.campaign_members/)
  assert.doesNotMatch(openSlot, /insert into public\.locations/)
  assert.doesNotMatch(openSlot, /insert into public\.characters/)
  assert.doesNotMatch(openSlot, /insert into public\.quests/)
  assert.doesNotMatch(openSlot, /insert into public\.chat_rooms/)
  assert.doesNotMatch(openSlot, /insert into public\.campaign_events/)
})

test("AI-world campaign insert skips historical eager rule installers", () => {
  assert.match(lazyRules, /c\.relname='campaigns'/)
  assert.match(lazyRules, /new\.slug !~~ ''ai-world-%''::text/)
  assert.match(lazyRules, /unexpected_campaign_trigger_shape/)
  assert.match(lazyRules, /campaign_trigger_guard_patch_failed/)
})

test("AI-world character picker reads a canonical catalog without populating the empty slot", () => {
  assert.match(lazyRules, /list_ai_world_class_templates_v1/)
  assert.match(lazyRules, /ai_world_rules_source_campaign_v1/)
  assert.match(lazyRules, /t\.kind='class'/)
  assert.match(lazyRules, /t\.is_builtin=true/)
  assert.match(authGate, /list_ai_world_class_templates_v1/)
  assert.doesNotMatch(
    block(
      authGate,
      "const { data: classRows, error: classError }",
      "const classes = (classRows || [])",
    ),
    /\.from\("rule_templates"\)/,
  )
})

test("only the chosen class bundle is lazily materialized into the AI campaign", () => {
  assert.match(lazyRules, /ensure_ai_world_class_bundle_v1/)
  assert.match(lazyRules, /v_source_subclass\.parent_template_id/)
  assert.match(lazyRules, /insert into public\.rule_templates/)
  assert.match(lazyRules, /insert into public\.rule_template_levels/)
  assert.match(lazyRules, /insert into public\.rule_template_spell_links/)
  assert.match(lazyRules, /ai_world_normalize_rule_json_v1/)
  assert.match(lazyRules, /subclass_spell/)
  assert.match(lazyRules, /class_spell/)
  assert.match(spellLinks, /rule_template_spell_links_pkey do nothing/)
})

test("AI-world player creation accepts the canonical source id and assigns the local clone", () => {
  const createCharacter = block(
    lazyRules,
    "create or replace function public.create_ai_world_player_character_v1",
    "revoke all on function public.create_ai_world_player_character_v1",
  )

  assert.match(createCharacter, /v_requested_class\.campaign_id=p_campaign_id/)
  assert.match(createCharacter, /ensure_ai_world_class_bundle_v1/)
  assert.match(createCharacter, /create_campaign_character_v2/)
  assert.match(createCharacter, /assign_character_template_v2/)
  assert.match(createCharacter, /set_campaign_active_character/)
  assert.match(createCharacter, /ensure_character_chat_room/)
})

test("fresh-slot membership upsert is unambiguous under PLpgSQL output columns", () => {
  assert.match(membershipFix, /on conflict on constraint campaign_members_pkey/)
})
