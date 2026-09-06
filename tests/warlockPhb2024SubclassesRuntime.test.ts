import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import {
  warlockSubclassRuntimeBundles,
  WARLOCK_SUBCLASS_RUNTIME_CATALOG_KEYS,
  WARLOCK_SUBCLASS_RUNTIME_REVISION,
} from "../src/rule-templates/warlockSubclassMechanics.ts"
import {
  WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS,
  WARLOCK_SUBCLASS_RUNTIME_LEVELS,
  assertWarlockSubclassPackage,
} from "../src/rule-templates/warlockSubclasses.ts"

const migrationPath = "supabase/migrations/20260907090000_warlock_phb2024_subclasses_runtime_v1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

const parent = warlockSubclassRuntimeBundles.find((bundle) => bundle.template.catalog_key === "class:warlock")!
const subclasses = warlockSubclassRuntimeBundles.filter((bundle) => bundle.template.kind === "subclass")

function bundlesAtLevel(level: number, selectedChoices: Record<string, unknown> = {}): CharacterTemplateBundle[] {
  return warlockSubclassRuntimeBundles.map((bundle) => ({
    ...bundle,
    assignment: {
      ...bundle.assignment,
      ...(bundle.template.kind === "class" ? { template_level: level } : { template_level: null }),
      selected_choices: bundle.template.catalog_key === "subclass:warlock:fiend"
        ? selectedChoices as never
        : bundle.assignment.selected_choices,
    },
  }))
}

function contractFor(catalogKey: string, level: number, selectedChoices: Record<string, unknown> = {}) {
  const active = bundlesAtLevel(level, selectedChoices).filter((bundle) =>
    bundle.template.catalog_key === "class:warlock" || bundle.template.catalog_key === catalogKey)
  const parsed = resolveTemplateBundles(active, level)
  const input: CharacterEngineInput = {
    base: {
      id: `warlock-${catalogKey}`,
      name: "Колдун",
      level,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 8 + Math.max(0, level - 1) * 6,
      baseSpeed: 30,
    },
    state: { currentHp: 20, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  }
  return { parsed, contract: resolveCharacterContract(input) }
}

function spellKey(slug: string): string {
  return `spell:${slug}`
}

function spellAccess(contract: ReturnType<typeof resolveCharacterContract>, slug: string) {
  return contract.spells
    .find((spell) => spell.key === spellKey(slug))
    ?.accesses.find((access) => access.key.includes("warlock-subclass"))
}

function hasSpell(contract: ReturnType<typeof resolveCharacterContract>, slug: string): boolean {
  return contract.spells.some((spell) => spell.key === spellKey(slug))
}

test("Stage 5 defines exactly the four PHB 2024 patron identities", () => {
  assert.deepEqual([...WARLOCK_SUBCLASS_RUNTIME_CATALOG_KEYS], [...WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS])
  assert.deepEqual([...WARLOCK_SUBCLASS_RUNTIME_CATALOG_KEYS], [
    "subclass:warlock:archfey",
    "subclass:warlock:celestial",
    "subclass:warlock:fiend",
    "subclass:warlock:great-old-one",
  ])
  assert.equal(subclasses.length, 4)
  for (const legacy of ["hexblade", "fathomless", "genie", "undead", "undying"]) {
    assert.equal(subclasses.some((bundle) => bundle.template.catalog_key?.includes(legacy)), false)
  }
})

test("all four patrons attach to class:warlock, unlock at 3, and use the shared parent level", () => {
  assert.equal(parent.template.catalog_key, "class:warlock")
  for (const bundle of subclasses) {
    assertWarlockSubclassPackage({ template: bundle.template, parent: parent.template, levels: bundle.levels })
    assert.deepEqual(bundle.levels.map((entry) => entry.level), [...WARLOCK_SUBCLASS_RUNTIME_LEVELS])
  }

  const low = contractFor("subclass:warlock:archfey", 2).contract
  assert.equal(low.resources.some((entry) => entry.key.startsWith("warlock_archfey")), false)
  assert.equal(hasSpell(low, "misty-step"), false)

  const unlocked = contractFor("subclass:warlock:archfey", 3).contract
  assert.ok(unlocked.resources.some((entry) => entry.key === "warlock_archfey_steps_of_the_fey"))
})

test("Stage 5 package passes strict quality/resource gates and reaches parser plus Character Engine", () => {
  assert.doesNotThrow(() => assertClassPackageQuality(warlockSubclassRuntimeBundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(warlockSubclassRuntimeBundles))
  const parsed = resolveTemplateBundles(bundlesAtLevel(14), 14)
  assert.ok(parsed.contributions.length > 0)
  const contract = resolveCharacterContract({
    base: {
      id: "warlock-stage5", name: "Колдун", level: 14,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 92, baseSpeed: 30,
    },
    state: { currentHp: 92, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  })
  assert.ok(contract.rules.length > 0)
  assert.ok(contract.resources.some((entry) => entry.key === "warlock_pact_slots"))
})

test("Archfey resolves Steps of the Fey, charm immunity and Beguiling Defenses through CE", () => {
  const { contract } = contractFor("subclass:warlock:archfey", 14)
  assert.equal(contract.resources.find((entry) => entry.key === "warlock_archfey_steps_of_the_fey")?.max.value, 4)
  assert.ok(contract.capabilities.immunities.some((entry) => entry.key === "condition:charmed"))
  assert.ok(contract.resources.some((entry) => entry.key === "warlock_archfey_beguiling_defenses"))
  assert.ok(contract.actions.some((entry) => entry.key === "warlock_archfey_beguiling_defenses_restore_by_pact_slot"))
  const misty = spellAccess(contract, "misty-step")
  assert.ok(misty)
  assert.equal(misty.preparationMode, "always_prepared")
  assert.ok(misty.methods.some((method) => method.kind === "pact_magic"))
  assert.ok(misty.methods.some((method) => method.key === "steps-of-the-fey"))
})

test("Celestial resolves Healing Light progression, radiant resistance and Searing Vengeance", () => {
  const { contract } = contractFor("subclass:warlock:celestial", 14)
  assert.equal(contract.resources.find((entry) => entry.key === "warlock_celestial_healing_light")?.max.value, 15)
  assert.ok(contract.actions.some((entry) => entry.key === "warlock_celestial_healing_light_5d6"))
  assert.ok(contract.capabilities.resistances.some((entry) => entry.key === "damage:radiant"))
  assert.ok(contract.resources.some((entry) => entry.key === "warlock_celestial_searing_vengeance"))
  assert.ok(hasSpell(contract, "summon-celestial"))
})

test("Fiend resolves Luck, rest-editable Fiendish Resilience and Hurl Through Hell", () => {
  const selected = { warlock_fiend_fiendish_resilience: ["fire"] }
  const { contract } = contractFor("subclass:warlock:fiend", 14, selected)
  assert.equal(contract.resources.find((entry) => entry.key === "warlock_fiend_dark_ones_own_luck")?.max.value, 4)
  assert.ok(contract.capabilities.resistances.some((entry) => entry.key === "damage:fire"))
  assert.ok(contract.resources.some((entry) => entry.key === "warlock_fiend_hurl_through_hell"))
  assert.ok(contract.actions.some((entry) => entry.key === "warlock_fiend_hurl_through_hell_restore_by_pact_slot"))
  assert.ok(hasSpell(contract, "fireball"))
})

test("Great Old One resolves Hex, Clairvoyant Combatant and Thought Shield", () => {
  const { contract } = contractFor("subclass:warlock:great-old-one", 14)
  assert.ok(hasSpell(contract, "hex"))
  assert.ok(contract.resources.some((entry) => entry.key === "warlock_goo_clairvoyant_combatant"))
  assert.ok(contract.actions.some((entry) => entry.key === "warlock_goo_clairvoyant_combatant_restore_by_pact_slot"))
  assert.ok(contract.capabilities.resistances.some((entry) => entry.key === "damage:psychic"))
  assert.ok(contract.rules.some((entry) => entry.key === "warlock_goo_create_thrall"))
})

test("patron spell access is always prepared Pact Magic and follows Warlock pact-slot level", () => {
  const fireball5 = spellAccess(contractFor("subclass:warlock:fiend", 5).contract, "fireball")
  assert.ok(fireball5)
  assert.equal(fireball5.preparationMode, "always_prepared")
  assert.equal(fireball5.methods[0]?.kind, "pact_magic")
  assert.equal(fireball5.methods[0]?.resourceOptions[0]?.castLevel, 3)

  const fireball9 = spellAccess(contractFor("subclass:warlock:fiend", 9).contract, "fireball")
  assert.ok(fireball9)
  const pact5 = fireball9.methods[0]?.resourceOptions[0]
  assert.equal(pact5?.castLevel, 5)
  assert.ok(pact5?.costs.some((cost) => cost.key === "warlock_pact_slots" && cost.amount === 1))
})

test("Stage 5 keeps scene/turn legality semantic instead of inventing runtime state", () => {
  const serialized = JSON.stringify(warlockSubclassRuntimeBundles)
  assert.match(serialized, /gm_(?:trigger|target|hit|turn)_gate/)
  assert.doesNotMatch(serialized, /turn_counter|target_is_hit|scene_light_state_confirmed|_available\b/)
})

test("Stage 5 migration installs exactly the PHB 2024 patron runtime and preserves global spell classification", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*subclass:warlock/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/warlockPhb2024SubclassesRuntime\.test\.ts/i)
  assert.match(migration, new RegExp(WARLOCK_SUBCLASS_RUNTIME_REVISION))
  for (const key of WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS) assert.match(migration, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  for (const legacy of ["subclass:warlock:hexblade", "subclass:warlock:fathomless", "subclass:warlock:genie", "subclass:warlock:undead", "subclass:warlock:undying"]) {
    assert.doesNotMatch(migration, new RegExp(legacy))
  }
  assert.match(migration, /install_warlock_phb2024_subclasses_v1/)
  assert.match(migration, /subclass_runtime_count[^\n]*4/i)
  assert.doesNotMatch(migration, /insert\s+into\s+public\.spell_catalog_classes/i)
})
