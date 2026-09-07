import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const closurePath = "supabase/migrations/20260907020552_warlock_stage3_invocation_runtime_closure_v1.sql"
const runtimePath = "supabase/migrations/20260906192806_warlock_invocations_runtime_v1.sql"
const closure = fs.readFileSync(closurePath, "utf8")
const runtime = fs.readFileSync(runtimePath, "utf8")

const EXPECTED = [
  "agonizing-blast",
  "armor-of-shadows",
  "ascendant-step",
  "devils-sight",
  "devouring-blade",
  "eldritch-mind",
  "eldritch-smite",
  "eldritch-spear",
  "fiendish-vigor",
  "gaze-of-two-minds",
  "gift-of-the-depths",
  "gift-of-the-protectors",
  "investment-of-the-chain-master",
  "lessons-of-the-first-ones",
  "lifedrinker",
  "mask-of-many-faces",
  "master-of-myriad-forms",
  "misty-visions",
  "one-with-shadows",
  "otherworldly-leap",
  "pact-of-the-blade",
  "pact-of-the-chain",
  "pact-of-the-tome",
  "repelling-blast",
  "thirsting-blade",
  "visions-of-distant-realms",
  "whispers-of-the-grave",
  "witch-sight",
].sort()

function marker(name: string) {
  const match = closure.match(new RegExp(`^-- ${name}: ([^\\n]+)$`, "m"))
  assert.ok(match, `missing ${name} marker`)
  return match[1].split(",").map((value) => value.trim()).filter(Boolean)
}

const automated = marker("STAGE3_AUTOMATED")
const resourceAction = marker("STAGE3_RESOURCE_ACTION")
const gmSemantic = marker("STAGE3_GM_SEMANTIC")

test("Warlock Stage 3 classifies every invocation exactly once", () => {
  assert.equal(automated.length, 12)
  assert.equal(resourceAction.length, 3)
  assert.equal(gmSemantic.length, 13)

  const all = [...automated, ...resourceAction, ...gmSemantic]
  assert.equal(all.length, 28)
  assert.equal(new Set(all).size, 28)
  assert.deepEqual([...new Set(all)].sort(), EXPECTED)
})

test("Stage 3 certification preserves concrete invocation runtime", () => {
  assert.match(closure, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(closure, /CLASS_INTEGRATION_STRICT:\s*class:warlock/i)
  assert.match(closure, /CLASS_PACKAGE_TEST:\s*tests\/warlockInvocationStage3Closure\.test\.ts/i)
  assert.match(closure, /WARLOCK_STAGE3_EXPECTED_SPELL_ACCESS_MISSING/)
  assert.match(closure, /WARLOCK_STAGE3_EXPECTED_SENSE_MISSING/)
  assert.match(closure, /WARLOCK_STAGE3_ELDRITCH_SMITE_ACTION_MISSING/)
  assert.match(closure, /WARLOCK_STAGE3_GIFT_DEPTHS_RUNTIME_INCOMPLETE/)
  assert.match(closure, /WARLOCK_STAGE3_GIFT_PROTECTORS_RUNTIME_INCOMPLETE/)

  assert.match(runtime, /always_at_will_spell/)
  assert.match(runtime, /eldritch_smite/)
  assert.match(runtime, /gift_of_depths/)
  assert.match(runtime, /gift_of_protectors/)
  assert.match(runtime, /pact_chain/)
})

test("Pact Boons close through their real runtime boundaries", () => {
  assert.ok(automated.includes("pact-of-the-chain"))
  assert.ok(automated.includes("pact-of-the-tome"))
  assert.ok(gmSemantic.includes("pact-of-the-blade"))

  assert.match(closure, /structured_dynamic_weapon_binding/)
  assert.match(closure, /find_familiar_at_will_spell_access/)
  assert.match(closure, /dependent_rest_editable_spell_choices/)
  assert.match(closure, /WARLOCK_STAGE3_PACT_TOME_RUNTIME_INVALID/)
  assert.match(runtime, /warlock_pact_tome_cantrips/)
  assert.match(runtime, /warlock_pact_tome_rituals/)
  assert.match(runtime, /short_or_long_rest/)
})

test("scene-dependent invocations stay explicit instead of becoming fake state", () => {
  for (const slug of [
    "agonizing-blast",
    "eldritch-spear",
    "fiendish-vigor",
    "gaze-of-two-minds",
    "investment-of-the-chain-master",
    "lifedrinker",
    "one-with-shadows",
    "pact-of-the-blade",
    "repelling-blast",
  ]) {
    assert.ok(gmSemantic.includes(slug), `${slug} must remain on the explicit GM/semantic boundary`)
  }

  assert.match(closure, /selected_cantrip_roll_modifier/)
  assert.match(closure, /false_life_maximum_roll_override/)
  assert.match(closure, /scene_light_condition/)
  assert.match(closure, /dynamic_weapon_binding_transaction/)
  assert.match(closure, /confirmed_cantrip_hit_and_target/)
  assert.doesNotMatch(closure, /target_is_hit|scene_light_confirmed|turn_counter_resource/i)
})

test("every persisted invocation rule receives a certified runtime mode", () => {
  assert.match(closure, /'runtime',jsonb_strip_nulls/)
  assert.match(closure, /'mode',v_mode/)
  assert.match(closure, /'certified',true/)
  assert.match(closure, /invocation_runtime_certified/)
  assert.match(closure, /invocation_runtime_coverage/)
  assert.match(closure, /jsonb_array_length\(coalesce\(v_choice->'options'/)
  assert.match(closure, /WARLOCK_STAGE3_CATALOG_SET_MISMATCH/)
})
