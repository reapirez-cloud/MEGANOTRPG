import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const stage2Choice = fs.readFileSync(
  "supabase/migrations/20260907170936_choice_runtime_long_rest_refresh.sql",
  "utf8",
)
const stage2 = fs.readFileSync(
  "supabase/migrations/20260907171053_paladin_base_runtime_stage2.sql",
  "utf8",
)
const bridge = fs.readFileSync(
  "supabase/migrations/20260907183502_spell_slot_runtime_bridge_v1.sql",
  "utf8",
)
const stage3 = fs.readFileSync(
  "supabase/migrations/20260907183823_paladin_spell_runtime_stage3.sql",
  "utf8",
)

test("Paladin Stage 2 prerequisites are committed before spell runtime", () => {
  assert.match(stage2Choice, /commit_character_template_rest_choice_v1/)
  assert.match(stage2Choice, /v_refresh = 'long_rest'/)
  assert.match(stage2, /CLASS_INTEGRATION_STRICT: class:paladin/)
  assert.match(stage2, /BASE_RUNTIME_READY_STAGE2/)
  assert.match(stage2, /paladin-weapon-mastery/)
  assert.match(stage2, /paladin-fighting-style/)
  assert.match(stage2, /lay_on_hands/)
  assert.match(stage2, /channel_divinity/)
})

test("spell slots use the CE ledger as the single persistent source", () => {
  assert.match(bridge, /sync_spell_slot_sheet_from_ledger_v1/)
  assert.match(bridge, /character_resource_states_sync_spell_slot_sheet_v1/)
  assert.match(bridge, /state_key=v_state_key/)
  assert.match(bridge, /set current=current-1/)
  assert.match(bridge, /spell_slots=jsonb_set/)
  assert.match(bridge, /jsonb_typeof\(v_slots_profile\)='array'/)
  assert.match(bridge, /jsonb_typeof\(v_slots_profile\)='object'/)
})

test("Paladin has exact 2024 half-caster slot and preparation progression", () => {
  assert.match(stage3, /SPELL_RUNTIME_READY_STAGE3/)
  assert.match(stage3, /'spell_progression','half'/)
  assert.match(stage3, /'spellcasting_ability','charisma'/)
  assert.match(stage3, /'spell_preparation_refresh','long_rest'/)
  assert.match(stage3, /'prepared_spell_replacement_limit',1/)
  assert.match(stage3, /\"1\":\{\"1\":2\}/)
  assert.match(stage3, /\"5\":\{\"1\":4,\"2\":2\}/)
  assert.match(stage3, /\"17\":\{\"1\":4,\"2\":3,\"3\":3,\"4\":3,\"5\":1\}/)
  assert.match(stage3, /\"20\":\{\"1\":4,\"2\":3,\"3\":3,\"4\":3,\"5\":2\}/)
  assert.match(stage3, /\"1\":2,\"2\":3,\"3\":4/)
  assert.match(stage3, /\"17\":14,\"18\":14,\"19\":15,\"20\":15/)
})

test("Paladin preparation is class-gated and allows at most one replacement per long rest", () => {
  assert.match(stage3, /assert_paladin_spell_preparation_v1/)
  assert.match(stage3, /scl\.class_key='paladin'/)
  assert.match(stage3, /PALADIN_PREPARATION_CONTAINS_UNAVAILABLE_OR_ALWAYS_PREPARED_SPELL/)
  assert.match(stage3, /PALADIN_LONG_REST_REPLACES_AT_MOST_ONE_SPELL/)
  assert.match(stage3, /s\.slug='divine-smite'/)
  assert.match(stage3, /s\.slug='find-steed'/)
  assert.match(stage3, /Paladin spell preparation must be committed through the long-rest preparation flow/)
})

test("Divine Smite and Faithful Steed share ordinary slots but keep one free long-rest use", () => {
  assert.match(stage3, /paladin-divine-smite-spell/)
  assert.match(stage3, /paladin-s-smite-slots/)
  assert.match(stage3, /paladin-s-smite-free/)
  assert.match(stage3, /paladin_smite_free_cast/)
  assert.match(stage3, /'trigger','immediately_after_melee_weapon_or_unarmed_hit'/)
  assert.match(stage3, /'damageBase','2d8'/)
  assert.match(stage3, /'upcastPerLevel','1d8'/)
  assert.match(stage3, /paladin-find-steed-spell/)
  assert.match(stage3, /paladin-faithful-steed-slots/)
  assert.match(stage3, /paladin-faithful-steed-free/)
  assert.match(stage3, /faithful_steed_free_cast/)
  assert.match(stage3, /'preparation',jsonb_build_object\('mode','always_prepared'\)/)
})

test("Blessed Warrior is dependent on the fighting style and replaces one cantrip on level-up", () => {
  assert.match(stage3, /paladin-blessed-warrior-cantrips/)
  assert.match(stage3, /'count',2/)
  assert.match(stage3, /'replacement_policy','on_level_change'/)
  assert.match(stage3, /'replacement_limit',1/)
  assert.match(stage3, /'requires_choice',jsonb_build_object\('key','paladin-fighting-style','option','style:blessed-warrior'\)/)
  assert.match(stage3, /scl\.class_key='cleric'/)
  assert.match(stage3, /'ability','charisma'/)
})

test("Stage 3 fails closed if the class profile or always-prepared links are incomplete", () => {
  assert.match(stage3, /PALADIN_STAGE3_PROFILE_CERTIFICATION_FAILED/)
  assert.match(stage3, /PALADIN_STAGE3_LEVEL_CERTIFICATION_FAILED/)
  assert.match(stage3, /PALADIN_STAGE3_DIVINE_SMITE_LINK_MISSING/)
  assert.match(stage3, /PALADIN_STAGE3_FIND_STEED_LINK_MISSING/)
  assert.match(stage3, /rule_template_spell_links/)
})
