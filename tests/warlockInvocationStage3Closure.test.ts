import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

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

function qualityBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-warlock-stage3-closure",
      character_id: "character-warlock-stage3-closure",
      template_id: "class-warlock-stage3-closure",
      template_level: 5,
      selected_choices: {},
      assigned_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    template: {
      id: "class-warlock-stage3-closure",
      campaign_id: "campaign",
      kind: "class",
      slug: "warlock-stage3-closure",
      name: "Колдун",
      description: "Колдун с проверенными Мистическими воззваниями и их точными игровыми границами.",
      version: 1,
      mechanics: [{
        id: "warlock-stage3-certification",
        type: "grant",
        target: "feature",
        key: "warlock_invocation_stage3_certified",
        sourceKey: "warlock-base:eldritch-invocations",
        payload: {
          label: "Мистические воззвания",
          description: "Выбранные Мистические воззвания применяют свои постоянные эффекты, требования уровня и зависимости только пока соответствующий выбор активен.",
        },
      }],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:warlock",
      catalog_revision: "xphb-2024-warlock-stage3-closure-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Колдун получает постоянные Мистические воззвания с точными требованиями, зависимостями, ресурсами и явно отделёнными ситуативными эффектами.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    levels: [],
  }
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

test("Stage 3 package still passes strict quality, resource policy, parser, and CE", () => {
  const source = qualityBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([source]))
  assert.doesNotThrow(() => assertClassResourcePolicy([source]))

  const parsed = resolveTemplateBundles([source], 5)
  assert.ok(parsed.contributions.length > 0)

  const contract = resolveCharacterContract({
    base: {
      id: "warlock-stage3-closure",
      name: "Колдун",
      level: 5,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 40,
      baseSpeed: 30,
    },
    state: { currentHp: 40, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  })
  assert.match(JSON.stringify(contract), /warlock_invocation_stage3_certified/)
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

  assert.match(runtime, /v_kind = 'at_will_spell'/)
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
