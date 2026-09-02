import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import {
  WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS,
  wizardSubclassRuntimeBundles,
} from "../src/rule-templates/wizardSubclassMechanics.ts"

const migration = fs.readFileSync("supabase/migrations/20260902030000_wizard_subclass_runtime_completion.sql", "utf8")
const actionRuntime = fs.readFileSync("supabase/migrations/20260830155543_gena_template_command_receipts.sql", "utf8")
const spellRuntime = fs.readFileSync("supabase/migrations/20260830020000_class_chat_template_spell_runtime.sql", "utf8")

function cloneBundle(bundle: CharacterTemplateBundle): CharacterTemplateBundle {
  return JSON.parse(JSON.stringify(bundle)) as CharacterTemplateBundle
}

function packageFor(catalogKey: string, wizardLevel: number): CharacterTemplateBundle[] {
  const selected = wizardSubclassRuntimeBundles
    .filter((bundle) => bundle.template.catalog_key === "class:wizard" || bundle.template.catalog_key === catalogKey)
    .map(cloneBundle)

  for (const bundle of selected) {
    if (bundle.template.kind === "class") bundle.assignment.template_level = wizardLevel
    if (bundle.template.kind === "subclass") bundle.assignment.template_level = null
  }

  return selected
}

function engineInput(level: number, contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "wizard-subclass-runtime-character",
      name: "Runtime Wizard",
      level,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
      baseMaxHp: 70,
      baseSpeed: 30,
    },
    state: { currentHp: 70, tempHp: 0 },
    contributions,
  }
}

function contractFor(catalogKey: string, wizardLevel: number) {
  const parsed = resolveTemplateBundles(packageFor(catalogKey, wizardLevel), wizardLevel)
  return resolveCharacterContract(engineInput(wizardLevel, parsed.contributions))
}

function resourceMax(catalogKey: string, wizardLevel: number, key: string) {
  const resource = contractFor(catalogKey, wizardLevel).resources.find((entry) => entry.key === key)
  assert.ok(resource, `missing resource ${key}`)
  return resource.max.value
}

function assertHasAction(catalogKey: string, wizardLevel: number, key: string) {
  assert.ok(contractFor(catalogKey, wizardLevel).actions.some((entry) => entry.key === key), `missing action ${key}`)
}

function assertHasSpell(catalogKey: string, wizardLevel: number, key: string) {
  assert.ok(contractFor(catalogKey, wizardLevel).spells.some((entry) => entry.key === key), `missing spell ${key}`)
}

test("Wizard subclass runtime package passes class quality and resource policy", () => {
  assert.doesNotThrow(() => assertClassPackageQuality(wizardSubclassRuntimeBundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(wizardSubclassRuntimeBundles))
})

test("every PHB 2024 Wizard subclass emits structured CE rules", () => {
  for (const catalogKey of WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS) {
    const contract = contractFor(catalogKey, 14)
    assert.ok(contract.rules.length >= 4, `${catalogKey} has too few rules`)
    assert.ok(contract.rules.every((rule) => rule.integration === "structured"), `${catalogKey} has prose-only mechanics`)
  }
})

test("Abjurer resolves Arcane Ward resources, reaction protection, and always prepared break spells", () => {
  assert.equal(resourceMax("subclass:wizard:abjurer", 3, "wizard_abjurer_arcane_ward"), 10)
  assert.equal(resourceMax("subclass:wizard:abjurer", 14, "wizard_abjurer_arcane_ward"), 32)
  assertHasAction("subclass:wizard:abjurer", 3, "abjurer_ward_restore_slot_1")
  assertHasAction("subclass:wizard:abjurer", 6, "wizard_abjurer_projected_ward")
  assertHasSpell("subclass:wizard:abjurer", 10, "spell:counterspell")
  assertHasSpell("subclass:wizard:abjurer", 10, "spell:dispel-magic")
})

test("Diviner resolves Portent as a scaling resource and exposes Gena-usable restore actions", () => {
  assert.equal(resourceMax("subclass:wizard:diviner", 3, "wizard_diviner_portent"), 2)
  assert.equal(resourceMax("subclass:wizard:diviner", 14, "wizard_diviner_portent"), 3)
  assertHasAction("subclass:wizard:diviner", 3, "wizard_diviner_use_portent")
  assertHasAction("subclass:wizard:diviner", 6, "diviner_expert_restore_slot_1")
  assertHasAction("subclass:wizard:diviner", 10, "wizard_diviner_third_eye_darkvision")
})

test("Evoker resolves direct damage rules and Overchannel as a persistent class resource", () => {
  const contract = contractFor("subclass:wizard:evoker", 14)
  assert.ok(contract.rules.some((rule) => rule.key === "subclass:wizard:evoker:potent-cantrip"))
  assert.ok(contract.rules.some((rule) => rule.key === "subclass:wizard:evoker:sculpt-spells"))
  assert.ok(contract.rules.some((rule) => rule.key === "subclass:wizard:evoker:empowered-evocation"))
  assert.equal(resourceMax("subclass:wizard:evoker", 14, "wizard_evoker_overchannel_safe"), 1)
  assertHasAction("subclass:wizard:evoker", 14, "wizard_evoker_overchannel_safe")
})

test("Illusionist resolves granted spells, free summon resources, Illusory Self, and Illusory Reality", () => {
  assertHasSpell("subclass:wizard:illusionist", 3, "spell:minor-illusion")
  assertHasSpell("subclass:wizard:illusionist", 6, "spell:summon-beast")
  assertHasSpell("subclass:wizard:illusionist", 6, "spell:summon-fey")
  assert.equal(resourceMax("subclass:wizard:illusionist", 6, "wizard_illusionist_free_summon_beast"), 1)
  assert.equal(resourceMax("subclass:wizard:illusionist", 10, "wizard_illusionist_illusory_self"), 1)
  assertHasAction("subclass:wizard:illusionist", 10, "wizard_illusionist_illusory_self")
  assertHasAction("subclass:wizard:illusionist", 14, "wizard_illusionist_illusory_reality")
})

test("migration installs the runtime package and reuses generic Gena template executors", () => {
  assert.match(migration, /install_wizard_2024_subclass_runtime_v1/)
  assert.match(migration, /subclass:wizard:abjurer/)
  assert.match(migration, /subclass:wizard:diviner/)
  assert.match(migration, /subclass:wizard:evoker/)
  assert.match(migration, /subclass:wizard:illusionist/)
  assert.match(migration, /chat_template_actions',true/)
  assert.match(migration, /chat_template_spells',true/)
  assert.match(actionRuntime, /send_chat_template_action_v2/)
  assert.match(actionRuntime, /use_character_template_resource_action/)
  assert.match(spellRuntime, /use_character_template_spell_v1/)
})
