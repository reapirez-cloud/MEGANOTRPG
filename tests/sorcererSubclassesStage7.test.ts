import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { choiceOptionSourceAvailable } from "../src/rule-templates/choiceSourceRequirements.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import {
  SORCERER_STAGE7_REFERENCE_ONLY,
  SORCERER_STAGE7_RUNTIME_CATALOG_KEYS,
  SORCERER_STAGE7_RUNTIME_REVISION,
  sorcererStage7RuntimeBundles,
} from "../src/rule-templates/sorcererSubclassMechanics.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migrationPath = "supabase/migrations/20260910200000_sorcerer_stage7_subclass_runtime_v1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

const parent = sorcererStage7RuntimeBundles.find((bundle) => bundle.template.catalog_key === "class:sorcerer")!
const subclasses = sorcererStage7RuntimeBundles.filter((bundle) => bundle.template.kind === "subclass")

function activeBundles(catalogKey: string, level: number, selectedChoices: Record<string, string | string[]> = {}): CharacterTemplateBundle[] {
  const subclass = subclasses.find((bundle) => bundle.template.catalog_key === catalogKey)
  if (!subclass) throw new Error("Missing Sorcerer Stage 7 bundle: " + catalogKey)
  return [
    { ...parent, assignment: { ...parent.assignment, template_level: level, selected_choices: {} } },
    { ...subclass, assignment: { ...subclass.assignment, template_level: null, selected_choices: selectedChoices } },
  ]
}

function contractFor(catalogKey: string, level: number, selectedChoices: Record<string, string | string[]> = {}) {
  const bundles = activeBundles(catalogKey, level, selectedChoices)
  const parsed = resolveTemplateBundles(bundles, level)
  const input: CharacterEngineInput = {
    base: {
      id: "sorcerer-stage7-test",
      name: "Чародей",
      level,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 30,
      baseSpeed: 30,
    },
    state: { currentHp: 30, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  }
  return { bundles, parsed, contract: resolveCharacterContract(input) }
}

function spellMethods(catalogKey: string, level: number, slug: string, selectedChoices: Record<string, string | string[]> = {}) {
  const { contract } = contractFor(catalogKey, level, selectedChoices)
  return contract.spells.find((spell) => spell.key === "spell:" + slug)?.accesses.flatMap((access) => access.methods) || []
}

test("Stage 7 publishes exactly the nine approved Sorcerer runtime subclasses", () => {
  assert.deepEqual(subclasses.map((bundle) => bundle.template.catalog_key), [...SORCERER_STAGE7_RUNTIME_CATALOG_KEYS])
  assert.equal(subclasses.length, 9)
  for (const excluded of SORCERER_STAGE7_REFERENCE_ONLY) {
    assert.equal(subclasses.some((bundle) => bundle.template.catalog_key === excluded), false)
  }
})

test("all Stage 7 subclasses are children of class:sorcerer and use parent Sorcerer level", () => {
  for (const bundle of subclasses) {
    assert.equal(bundle.template.parent_template_id, parent.template.id)
    assert.equal(bundle.template.unlock_level, 3)
    assert.equal(bundle.assignment.template_level, null)
  }
  const low = contractFor("subclass:sorcerer:draconic-sorcery", 2).contract
  assert.equal(low.grants.some((grant) => grant.key === "sorcerer_draconic_resilience"), false)
  const unlocked = contractFor("subclass:sorcerer:draconic-sorcery", 3).contract
  assert.ok(unlocked.grants.some((grant) => grant.key === "sorcerer_draconic_resilience"))
})

test("Stage 7 passes strict class quality/resource gates and parser to CE", () => {
  assert.doesNotThrow(() => assertClassPackageQuality(sorcererStage7RuntimeBundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(sorcererStage7RuntimeBundles))
  for (const level of [3, 9, 18]) {
    const parsed = resolveTemplateBundles(activeBundles("subclass:sorcerer:aberrant-sorcery", level), level)
    assert.ok(parsed.contributions.length > 0)
    const contract = resolveCharacterContract({
      base: {
        id: "sorcerer-stage7-" + level,
        name: "Чародей",
        level,
        abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
        baseMaxHp: 30,
        baseSpeed: 30,
      },
      state: { currentHp: 30, tempHp: 0, resources: {} },
      contributions: parsed.contributions,
    })
    assert.ok(contract.resources.some((entry) => entry.key === "sorcery_points"))
  }
})

test("Aberrant Psionic Sorcery exposes real sorcery-point casting methods", () => {
  const methods = spellMethods("subclass:sorcerer:aberrant-sorcery", 6, "detect-thoughts")
  const psionic = methods.find((method) => method.kind === "class_feature" && method.key === "psionic-sorcery")
  assert.ok(psionic)
  assert.ok(psionic.resourceOptions.some((option) =>
    option.costs.some((cost) => cost.key === "sorcery_points" && cost.amount === 2)))
})

test("Clockwork Restore Balance scales from Charisma instead of proficiency", () => {
  const { contract } = contractFor("subclass:sorcerer:clockwork-sorcery", 3)
  assert.equal(contract.resources.find((entry) => entry.key === "sorcerer_clockwork_restore_balance")?.max.value, 4)
})

test("Draconic Resilience changes max HP and affinity grants a native resistance", () => {
  const level3 = contractFor("subclass:sorcerer:draconic-sorcery", 3).contract
  const level6 = contractFor("subclass:sorcerer:draconic-sorcery", 6, { sorcerer_draconic_affinity: "fire" }).contract
  assert.equal(level3.combat.maxHp.value, 33)
  assert.equal(level6.combat.maxHp.value, 36)
  assert.ok(level6.capabilities.resistances.some((entry) => entry.key === "damage:fire"))
})

test("Wild Magic uses the 2024 player-driven surge and Tides recharge contract", () => {
  const serialized = JSON.stringify(activeBundles("subclass:sorcerer:wild-magic-sorcery", 18))
  assert.match(serialized, /"triggerResult":20/)
  assert.match(serialized, /rechargeOnNextSorcererSlotSpell/)
  assert.match(serialized, /automaticSurgeOnRecharge/)
  assert.doesNotMatch(serialized, /Мастер может потребовать/)
})

test("Divine Soul has affinity spell access and generic source-gated Cleric expansion", () => {
  const methods = spellMethods("subclass:sorcerer:divine-soul", 3, "cure-wounds", { sorcerer_divine_soul_affinity: "good" })
  assert.ok(methods.some((method) => method.kind === "class_spell"))
  const rule = { source_requirements_any: [{ catalog_key: "subclass:sorcerer:divine-soul" }] }
  assert.equal(choiceOptionSourceAvailable(rule, activeBundles("subclass:sorcerer:divine-soul", 3), 3), true)
  assert.equal(choiceOptionSourceAvailable(rule, activeBundles("subclass:sorcerer:draconic-sorcery", 3), 3), false)
  assert.match(migration, /source_requirements_any/)
  assert.match(migration, /subclass:sorcerer:divine-soul/)
  assert.match(migration, /class_key\s*=\s*'cleric'/)
})

test("Shadow Darkness and Lunar free phase spell are actual spell methods", () => {
  const darkness = spellMethods("subclass:sorcerer:shadow-magic", 3, "darkness")
    .find((method) => method.kind === "class_feature" && method.key === "eyes-of-the-dark")
  assert.ok(darkness)
  assert.ok(darkness.resourceOptions[0]?.costs.some((cost) => cost.key === "sorcery_points" && cost.amount === 2))

  const shield = spellMethods("subclass:sorcerer:lunar-sorcery", 3, "shield", { sorcerer_lunar_phase: "full" })
    .find((method) => method.kind === "class_feature" && method.key === "lunar-free-full")
  assert.ok(shield)
  assert.ok(shield.resourceOptions[0]?.costs.some((cost) => cost.key === "sorcerer_lunar_free_phase_cast" && cost.amount === 1))
  assert.ok(spellMethods("subclass:sorcerer:lunar-sorcery", 3, "sacred-flame").some((method) => method.kind === "class_spell"))
})

test("high-level legacy subclasses resolve their native durable grants", () => {
  const shadow = contractFor("subclass:sorcerer:shadow-magic", 18).contract
  assert.ok(shadow.resources.some((entry) => entry.key === "sorcerer_shadow_strength_of_grave"))
  const storm = contractFor("subclass:sorcerer:storm-sorcery", 18).contract
  assert.ok(storm.capabilities.immunities.some((entry) => entry.key === "damage:lightning"))
  assert.ok(storm.capabilities.immunities.some((entry) => entry.key === "damage:thunder"))
  const pyro = contractFor("subclass:sorcerer:pyromancer", 18).contract
  assert.ok(pyro.capabilities.immunities.some((entry) => entry.key === "damage:fire"))
})

test("Stage 7 migration is a strict mechanics package and excludes reference-only candidates", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*subclass:sorcerer/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/sorcererSubclassesStage7\.test\.ts/i)
  assert.ok(migration.includes(SORCERER_STAGE7_RUNTIME_REVISION))
  assert.match(migration, /ensure_sorcerer_stage7_subclass_runtime_v1/)
  assert.match(migration, /subclass_runtime_count[^\n]*9/i)
  for (const key of SORCERER_STAGE7_RUNTIME_CATALOG_KEYS) assert.ok(migration.includes(key))
  for (const excluded of SORCERER_STAGE7_REFERENCE_ONLY) assert.equal(migration.includes(excluded), false)
})

test("Stage 7 keeps scene and turn legality semantic instead of inventing persistent counters", () => {
  const serialized = JSON.stringify(sorcererStage7RuntimeBundles)
  assert.doesNotMatch(serialized, /turn_counter|round_counter|target_is_hit|scene_[a-z_]+_confirmed|_available\b/)
})
