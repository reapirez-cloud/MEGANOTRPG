import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  applyResourceRecovery,
  executeAction,
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { recoverableStateKey } from "../src/character-engine/stateLifecycle.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import {
  WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS,
  wizardSubclassRuntimeBundles,
} from "../src/rule-templates/wizardSubclassMechanics.ts"

const migration = fs.readFileSync("supabase/migrations/20260902030000_wizard_subclass_runtime_completion.sql", "utf8")
const persistentStateMigration = fs.readFileSync("supabase/migrations/20260902060000_wizard_subclass_persistent_state_policy.sql", "utf8")
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
    if (bundle.template.kind === "subclass") {
      bundle.assignment.template_level = null
      if (catalogKey === "subclass:wizard:diviner") {
        bundle.assignment.selected_choices = {
          wizard_diviner_portent_1_value: "4",
          wizard_diviner_portent_2_value: "17",
          wizard_diviner_portent_3_value: "11",
        }
      }
      if (catalogKey === "subclass:wizard:bladesinging") {
        bundle.assignment.selected_choices = {
          wizard_bladesinging_weapon: "weapon:rapier",
        }
      }
    }
  }

  return selected
}

function engineInput(
  level: number,
  contributions: CharacterEngineInput["contributions"],
  state: CharacterEngineInput["state"] = { currentHp: 70, tempHp: 0 },
): CharacterEngineInput {
  return {
    base: {
      id: "wizard-subclass-runtime-character",
      name: "Runtime Wizard",
      level,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
      baseMaxHp: 70,
      baseSpeed: 30,
    },
    state,
    contributions,
  }
}

function parsedFor(catalogKey: string, wizardLevel: number) {
  return resolveTemplateBundles(packageFor(catalogKey, wizardLevel), wizardLevel)
}

function contractFor(catalogKey: string, wizardLevel: number, state?: CharacterEngineInput["state"]) {
  const parsed = parsedFor(catalogKey, wizardLevel)
  return resolveCharacterContract(engineInput(wizardLevel, parsed.contributions, state))
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

test("every supported Wizard subclass emits structured CE rules", () => {
  for (const catalogKey of WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS) {
    const contract = contractFor(catalogKey, 14)
    assert.ok(contract.rules.length >= 4, `${catalogKey} has too few rules`)
    assert.ok(contract.rules.every((rule) => rule.integration === "structured"), `${catalogKey} has prose-only mechanics`)
  }
})

test("Abjurer keeps only durable Ward state and leaves scene triggers to the GM", () => {
  assert.equal(resourceMax("subclass:wizard:abjurer", 3, "wizard_abjurer_arcane_ward"), 10)
  assert.equal(resourceMax("subclass:wizard:abjurer", 14, "wizard_abjurer_arcane_ward"), 32)
  assertHasAction("subclass:wizard:abjurer", 3, "abjurer_ward_cast_restore_1")
  assertHasAction("subclass:wizard:abjurer", 3, "abjurer_ward_spend_slot_1")
  assertHasAction("subclass:wizard:abjurer", 6, "wizard_abjurer_projected_ward")
  assertHasSpell("subclass:wizard:abjurer", 10, "spell:counterspell")
  assertHasSpell("subclass:wizard:abjurer", 10, "spell:dispel-magic")

  const projectedWard = contractFor("subclass:wizard:abjurer", 6).actions.find(
    (entry) => entry.key === "wizard_abjurer_projected_ward",
  )
  assert.ok(projectedWard)
  assert.equal(projectedWard.requirements.some((entry) => entry.enforcement === "gm"), false)
  assert.ok(projectedWard.tags.includes("gm-adjudicated-trigger"))
})

test("Diviner stores each Portent roll separately and Greater Portent only adds a third die", () => {
  assert.equal(resourceMax("subclass:wizard:diviner", 3, "wizard_diviner_portent_1"), 1)
  assert.equal(resourceMax("subclass:wizard:diviner", 3, "wizard_diviner_portent_2"), 1)
  assert.equal(contractFor("subclass:wizard:diviner", 3).resources.some((entry) => entry.key === "wizard_diviner_portent_3"), false)
  assert.equal(resourceMax("subclass:wizard:diviner", 14, "wizard_diviner_portent_3"), 1)
  assertHasAction("subclass:wizard:diviner", 3, "wizard_diviner_use_portent_1_4")
  assertHasAction("subclass:wizard:diviner", 3, "wizard_diviner_use_portent_2_17")
  assertHasAction("subclass:wizard:diviner", 14, "wizard_diviner_use_portent_3_11")
  assert.equal(contractFor("subclass:wizard:diviner", 14).resources.some((entry) => entry.key.includes("greater_portent")), false)

  const bundle = wizardSubclassRuntimeBundles.find((entry) => entry.template.catalog_key === "subclass:wizard:diviner")
  assert.ok(bundle)
  const level3 = bundle.levels.find((entry) => entry.level === 3)
  const level14 = bundle.levels.find((entry) => entry.level === 14)
  assert.deepEqual(level3?.choices.map((choice) => choice.key), [
    "wizard_diviner_portent_1_value",
    "wizard_diviner_portent_2_value",
  ])
  assert.deepEqual(level14?.choices.map((choice) => choice.key), ["wizard_diviner_portent_3_value"])
  assert.ok(level3?.choices.every((choice) => choice.refresh === "long_rest"))
})

test("Third Eye stores the chosen mode only until the next short or long rest", () => {
  const catalogKey = "subclass:wizard:diviner"
  const contract = contractFor(catalogKey, 10)
  const action = contract.actions.find((entry) => entry.key === "wizard_diviner_third_eye_darkvision")
  assert.ok(action)

  const initial = { currentHp: 70, tempHp: 0 }
  const used = executeAction(initial, action)
  const modeKey = recoverableStateKey("wizard_diviner_third_eye_mode", ["short_rest", "long_rest"])
  assert.equal(used.facts?.[modeKey], "darkvision")

  const recovered = applyResourceRecovery(used, contract.resources, "short_rest")
  assert.equal(recovered.facts?.[modeKey], undefined)
  assert.equal(recovered.resources?.wizard_diviner_third_eye?.current, 1)
})

test("Expert Divination exposes plain GM-adjudicated slot restoration actions", () => {
  const action = contractFor("subclass:wizard:diviner", 6).actions.find(
    (entry) => entry.key === "diviner_expert_restore_slot_1",
  )
  assert.ok(action)
  assert.equal(action.requirements.length, 0)
  assert.ok(action.tags.includes("gm-adjudicated-trigger"))
})

test("Evoker tracks repeated Overchannel backlash until a long rest", () => {
  const catalogKey = "subclass:wizard:evoker"
  const initialContract = contractFor(catalogKey, 14)
  assert.equal(resourceMax(catalogKey, 14, "wizard_evoker_overchannel_safe"), 1)
  assertHasAction(catalogKey, 14, "wizard_evoker_overchannel_safe")
  assertHasAction(catalogKey, 14, "wizard_evoker_overchannel_repeat")

  const safe = initialContract.actions.find((entry) => entry.key === "wizard_evoker_overchannel_safe")
  const repeatBeforeSafe = initialContract.actions.find((entry) => entry.key === "wizard_evoker_overchannel_repeat")
  assert.ok(safe)
  assert.ok(repeatBeforeSafe)
  assert.equal(repeatBeforeSafe.available, false)

  const safeState = executeAction({ currentHp: 70, tempHp: 0 }, safe)
  const counterKey = recoverableStateKey("wizard_evoker_overchannel_repeat_count", ["long_rest"])
  assert.equal(safeState.facts?.[counterKey], 0)

  const repeatContract = contractFor(catalogKey, 14, safeState)
  const repeat = repeatContract.actions.find((entry) => entry.key === "wizard_evoker_overchannel_repeat")
  assert.ok(repeat)
  assert.equal(repeat.available, true)

  const once = executeAction(safeState, repeat)
  const twice = executeAction(once, repeat)
  assert.equal(twice.facts?.[counterKey], 2)
  assert.equal(applyResourceRecovery(twice, repeatContract.resources, "long_rest").facts?.[counterKey], undefined)
})

test("Illusionist spends only true persistent resources", () => {
  assertHasSpell("subclass:wizard:illusionist", 3, "spell:minor-illusion")
  assertHasSpell("subclass:wizard:illusionist", 6, "spell:summon-beast")
  assertHasSpell("subclass:wizard:illusionist", 6, "spell:summon-fey")
  assert.equal(resourceMax("subclass:wizard:illusionist", 6, "wizard_illusionist_free_summon_beast"), 1)
  assert.equal(resourceMax("subclass:wizard:illusionist", 10, "wizard_illusionist_illusory_self"), 1)
  assertHasAction("subclass:wizard:illusionist", 10, "wizard_illusionist_illusory_self")
  assertHasAction("subclass:wizard:illusionist", 14, "wizard_illusionist_illusory_reality")

  const illusorySelf = contractFor("subclass:wizard:illusionist", 10).actions.find(
    (entry) => entry.key === "wizard_illusionist_illusory_self",
  )
  const illusoryReality = contractFor("subclass:wizard:illusionist", 14).actions.find(
    (entry) => entry.key === "wizard_illusionist_illusory_reality",
  )
  assert.ok(illusorySelf)
  assert.ok(illusoryReality)
  assert.equal(illusorySelf.requirements.length, 0)
  assert.equal(illusoryReality.requirements.length, 0)
})

test("legacy schools expose exact GM actions and persist only finite pools", () => {
  const enchantmentContract = contractFor("subclass:wizard:enchantment", 14)
  assertHasAction("subclass:wizard:enchantment", 3, "wizard_enchantment_hypnotic_gaze")
  assertHasAction("subclass:wizard:enchantment", 6, "wizard_enchantment_instinctive_charm")
  assert.equal(enchantmentContract.resources.length, 0)

  assert.equal(resourceMax("subclass:wizard:conjuration", 6, "wizard_conjuration_benign_transposition"), 1)
  assertHasAction("subclass:wizard:conjuration", 6, "wizard_conjuration_restore_benign_transposition")

  assertHasSpell("subclass:wizard:necromancy", 6, "spell:animate-dead")
  assert.ok(contractFor("subclass:wizard:necromancy", 10).grants.some(
    (entry) => entry.target === "resistance" && entry.key === "damage:necrotic",
  ))

  assert.equal(resourceMax("subclass:wizard:transmutation", 10, "wizard_transmutation_shapechanger"), 1)
  assertHasSpell("subclass:wizard:transmutation", 10, "spell:polymorph")
  assertHasAction("subclass:wizard:transmutation", 14, "wizard_transmutation_master_restore_life")
})

test("War Magic computes initiative and resets Power Surge to exactly one", () => {
  const catalogKey = "subclass:wizard:war-magic"
  const state = {
    currentHp: 70,
    tempHp: 0,
    resources: { wizard_war_magic_power_surge: { current: 4 } },
  }
  const contract = contractFor(catalogKey, 14, state)
  assert.equal(contract.combat.initiative.value, 6)
  assert.ok(contract.combat.initiative.sources.some((entry) => entry.contributionId.includes("war-magic-initiative-formula")))
  assert.equal(contract.resources.find((entry) => entry.key === "wizard_war_magic_power_surge")?.max.value, 4)
  assert.equal(
    applyResourceRecovery(state, contract.resources, "long_rest").resources?.wizard_war_magic_power_surge?.current,
    1,
  )
  assertHasAction(catalogKey, 6, "wizard_war_magic_gain_power_surge")
  assertHasAction(catalogKey, 6, "wizard_war_magic_spend_power_surge")
})

test("Bladesinging and Order of Scribes expose choices, pools, and slot payment", () => {
  const bladesinger = contractFor("subclass:wizard:bladesinging", 14)
  assert.equal(resourceMax("subclass:wizard:bladesinging", 14, "wizard_bladesinging_bladesong"), 5)
  assert.ok(bladesinger.grants.some((entry) => entry.target === "proficiency" && entry.key === "weapon:rapier"))
  assertHasAction("subclass:wizard:bladesinging", 10, "wizard_bladesinging_song_of_defense_9")

  assert.equal(resourceMax("subclass:wizard:order-of-scribes", 6, "wizard_scribes_manifest_mind_casts"), 3)
  const manifest = contractFor("subclass:wizard:order-of-scribes", 6).actions.find(
    (entry) => entry.key === "wizard_scribes_manifest_mind",
  )
  assert.ok(manifest)
  assert.equal(manifest.costOptions.length, 10)
  assertHasAction("subclass:wizard:order-of-scribes", 14, "wizard_scribes_one_with_word")
})

test("Graviturgy and Chronurgy persist finite uses while scene cadence remains semantic", () => {
  assert.equal(resourceMax("subclass:wizard:graviturgy", 10, "wizard_graviturgy_violent_attraction"), 4)
  const horizon = contractFor("subclass:wizard:graviturgy", 14).actions.find(
    (entry) => entry.key === "wizard_graviturgy_event_horizon",
  )
  assert.ok(horizon)
  assert.equal(horizon.costOptions.length, 8)

  const chronurgy = contractFor("subclass:wizard:chronurgy", 14)
  assert.equal(chronurgy.combat.initiative.value, 6)
  assert.equal(resourceMax("subclass:wizard:chronurgy", 3, "wizard_chronurgy_chronal_shift"), 2)
  const convergent = chronurgy.actions.find((entry) => entry.key === "wizard_chronurgy_convergent_future")
  assert.ok(convergent)
  const used = executeAction({ currentHp: 70, tempHp: 0 }, convergent)
  const exhaustionState = recoverableStateKey("wizard_chronurgy_convergent_future_exhaustion", ["long_rest"])
  assert.equal(used.facts?.[exhaustionState], 1)
  assert.equal(
    applyResourceRecovery(used, chronurgy.resources, "long_rest").facts?.[exhaustionState],
    undefined,
  )
})

test("supplemental Wizard bundles retain their source labels and revisions", () => {
  const sourceByKey = new Map(
    wizardSubclassRuntimeBundles.map((bundle) => [bundle.template.catalog_key, bundle.template]),
  )
  assert.equal(sourceByKey.get("subclass:wizard:war-magic")?.source_label, "Xanathar's Guide to Everything")
  assert.equal(sourceByKey.get("subclass:wizard:bladesinging")?.source_label, "Tasha's Cauldron of Everything")
  assert.equal(sourceByKey.get("subclass:wizard:chronurgy")?.source_label, "Explorer's Guide to Wildemount")
  assert.equal(sourceByKey.get("subclass:wizard:enchantment")?.rules_meta.rules_revision, "2014-compatible-on-wizard-2024")
})

test("forward migration installs the same persistent-state policy for existing and new campaigns", () => {
  assert.match(persistentStateMigration, /install_wizard_2024_subclass_runtime_v2/)
  assert.match(persistentStateMigration, /phb-2024-wizard-subclasses-runtime@2/)
  assert.match(persistentStateMigration, /recovery-state\[long_rest\]::wizard_abjurer_arcane_ward_created/)
  assert.match(persistentStateMigration, /wizard_diviner_portent_1_value/)
  assert.match(persistentStateMigration, /wizard_portent_choice_v2\(3\)/)
  assert.match(persistentStateMigration, /v_choice_key text := 'wizard_diviner_portent_'\|\|p_index::text\|\|'_value'/)
  assert.match(persistentStateMigration, /recovery-state\[long_rest,short_rest\]::wizard_diviner_third_eye_mode/)
  assert.match(persistentStateMigration, /wizard_evoker_overchannel_repeat_count/)
  assert.match(persistentStateMigration, /gm-adjudicated-trigger/)
  assert.match(persistentStateMigration, /install_wizard_2024_subclass_runtime_for_new_campaign_v2/)
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
