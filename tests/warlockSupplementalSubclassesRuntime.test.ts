import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import {
  WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS,
  WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS,
  WARLOCK_SUPPLEMENTAL_RUNTIME_REVISION,
  assertWarlockSupplementalRuntime,
  warlockSupplementalRuntimeBundles,
} from "../src/rule-templates/warlockSupplementalSubclasses.ts"

function bundlesAtLevel(level: number, selected: Record<string, unknown> = {}): CharacterTemplateBundle[] {
  return warlockSupplementalRuntimeBundles.map((bundle) => ({
    ...bundle,
    assignment: {
      ...bundle.assignment,
      ...(bundle.template.kind === "class" ? { template_level: level } : { template_level: null }),
      selected_choices: bundle.template.catalog_key === "subclass:warlock:genie" ? selected as never : bundle.assignment.selected_choices,
    },
  }))
}

function contractFor(key: string, level: number, selected: Record<string, unknown> = {}) {
  const active = bundlesAtLevel(level, selected).filter((bundle) => bundle.template.kind === "class" || bundle.template.catalog_key === key)
  const parsed = resolveTemplateBundles(active, level)
  const input: CharacterEngineInput = {
    base: { id: `supp-${key}`, name: "Колдун", level, abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 }, baseMaxHp: 90, baseSpeed: 30 },
    state: { currentHp: 90, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  }
  return resolveCharacterContract(input)
}

test("Stage 2 defines exactly five supplemental Warlock patrons", () => {
  assert.equal(WARLOCK_SUPPLEMENTAL_RUNTIME_REVISION, "warlock-supplemental-runtime-v1")
  assert.deepEqual([...WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS], [
    "subclass:warlock:hexblade", "subclass:warlock:fathomless", "subclass:warlock:genie", "subclass:warlock:undead", "subclass:warlock:undying",
  ])
  assert.deepEqual([...WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS], [3,5,6,7,9,10,14])
  assert.doesNotThrow(assertWarlockSupplementalRuntime)
})

test("supplemental package reaches strict class and CE gates", () => {
  assert.doesNotThrow(() => assertClassPackageQuality(warlockSupplementalRuntimeBundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(warlockSupplementalRuntimeBundles))
  for (const key of WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS) {
    const contract = contractFor(key, 14, key.endsWith(":genie") ? { warlock_genie_patron_kind: ["efreeti"] } : {})
    assert.ok(contract.rules.length > 0, key)
    assert.ok(contract.resources.some((entry) => entry.key === "warlock_pact_slots"), key)
  }
})

test("Hexblade and Fathomless finite abilities use real CE resources", () => {
  const hex = contractFor("subclass:warlock:hexblade", 14)
  assert.equal(hex.resources.find((entry) => entry.key === "warlock_hexblade_curse")?.max.value, 1)
  assert.ok(hex.actions.some((entry) => entry.key === "warlock_hexblade_curse_action"))
  assert.ok(hex.actions.some((entry) => entry.key === "warlock_hexblade_armor_of_hexes_action"))
  assert.ok(hex.resources.some((entry) => entry.key === "warlock_hexblade_accursed_specter"))

  const fathomless = contractFor("subclass:warlock:fathomless", 14)
  assert.equal(fathomless.resources.find((entry) => entry.key === "warlock_fathomless_tentacle")?.max.value, 5)
  assert.ok(fathomless.capabilities.resistances.some((entry) => entry.key === "damage:cold"))
  assert.ok(fathomless.actions.some((entry) => entry.key === "warlock_fathomless_guardian_coil_action"))
  assert.ok(fathomless.resources.some((entry) => entry.key === "warlock_fathomless_fathomless_plunge"))
})

test("Genie keeps patron choice persistent and exposes resistance plus flight", () => {
  const contract = contractFor("subclass:warlock:genie", 14, { warlock_genie_patron_kind: ["efreeti"] })
  assert.ok(contract.capabilities.resistances.some((entry) => entry.key === "damage:fire"))
  assert.equal(contract.resources.find((entry) => entry.key === "warlock_genie_elemental_flight")?.max.value, 5)
  assert.ok(contract.actions.some((entry) => entry.key === "warlock_genie_limited_wish_action"))
  assert.ok(!contract.resources.some((entry) => entry.key === "warlock_genie_limited_wish"))
})

test("Undead and Undying resolve their durable finite pools", () => {
  const undead = contractFor("subclass:warlock:undead", 14)
  assert.equal(undead.resources.find((entry) => entry.key === "warlock_undead_form_of_dread")?.max.value, 5)
  assert.ok(undead.capabilities.resistances.some((entry) => entry.key === "damage:necrotic"))
  assert.ok(undead.actions.some((entry) => entry.key === "warlock_undead_necrotic_husk_action"))
  assert.ok(undead.resources.some((entry) => entry.key === "warlock_undead_spirit_projection"))

  const undying = contractFor("subclass:warlock:undying", 14)
  assert.ok(undying.resources.some((entry) => entry.key === "warlock_undying_defy_death"))
  assert.ok(undying.resources.some((entry) => entry.key === "warlock_undying_indestructible_life"))
})

test("Stage 2 keeps target hit turn scene and randomized cooldown state semantic", () => {
  const serialized = JSON.stringify(warlockSupplementalRuntimeBundles)
  assert.match(serialized, /gm_(?:target|hit|turn|trigger|scene|cooldown)/)
  assert.match(serialized, /1d4_long_rests/)
  assert.doesNotMatch(serialized, /turn_counter|target_is_hit|scene_state_confirmed|limited_wish_roll_state/)
})
