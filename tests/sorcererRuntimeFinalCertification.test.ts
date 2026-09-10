import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { classReference, SORCERER_RUNTIME_REFERENCE_SUBCLASS_IDS } from "../src/data/classReference.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { presentClassPackages } from "../src/rule-templates/classPresentation.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import {
  SORCERER_STAGE7_REFERENCE_ONLY,
  SORCERER_STAGE7_RUNTIME_CATALOG_KEYS,
  sorcererStage7RuntimeBundles,
} from "../src/rule-templates/sorcererSubclassMechanics.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import { sorcererRuntimePackageFixture } from "./support/sorcererRuntimePackageFixture.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260910210000_sorcerer_runtime_final_certification_v1.sql",
  "utf8",
)
const gateway = fs.readFileSync("src/game-engine/supabase.ts", "utf8")
const chatSheet = fs.readFileSync("src/components/chat/ChatActionSheet.tsx", "utf8")
const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")
const classPresentationSource = fs.readFileSync("src/rule-templates/classPresentation.ts", "utf8")

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function engineInput(
  totalLevel: number,
  contributions: CharacterEngineInput["contributions"],
  resources: CharacterEngineInput["state"]["resources"] = {},
): CharacterEngineInput {
  return {
    base: {
      id: "sorcerer-stage8-character",
      name: "Чародей",
      level: totalLevel,
      abilities: {
        strength: 8,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 20,
      },
      baseMaxHp: 80,
      baseSpeed: 30,
    },
    state: { currentHp: 80, tempHp: 0, resources },
    contributions,
  }
}

function baseContract(sorcererLevel: number, totalLevel = sorcererLevel) {
  const bundle = sorcererRuntimePackageFixture(sorcererLevel)
  const parsed = resolveTemplateBundles([bundle], totalLevel)
  return resolveCharacterContract(engineInput(totalLevel, parsed.contributions))
}

function subclassPackage(
  catalogKey: string,
  sorcererLevel: number,
  totalLevel = sorcererLevel,
  selectedChoices: Record<string, string | string[]> = {},
): CharacterTemplateBundle[] {
  const selected = sorcererStage7RuntimeBundles
    .filter((bundle) =>
      bundle.template.catalog_key === "class:sorcerer" || bundle.template.catalog_key === catalogKey,
    )
    .map(clone)

  for (const bundle of selected) {
    if (bundle.template.kind === "class") {
      bundle.assignment.template_level = sorcererLevel
      bundle.assignment.selected_choices = {}
    } else {
      bundle.assignment.template_level = null
      bundle.assignment.selected_choices = selectedChoices
    }
  }
  assert.equal(selected.length, 2, "Sorcerer Stage 8 package must contain parent + requested subclass")
  return selected
}

function subclassContract(
  catalogKey: string,
  sorcererLevel: number,
  totalLevel = sorcererLevel,
  selectedChoices: Record<string, string | string[]> = {},
) {
  const bundles = subclassPackage(catalogKey, sorcererLevel, totalLevel, selectedChoices)
  const parsed = resolveTemplateBundles(bundles, totalLevel)
  return {
    bundles,
    parsed,
    contract: resolveCharacterContract(engineInput(totalLevel, parsed.contributions)),
  }
}

test("Stage 8 keeps the base Sorcerer resource contract correct at every level 1-20", () => {
  for (let level = 1; level <= 20; level += 1) {
    const contract = baseContract(level)
    assert.equal(contract.resources.find((entry) => entry.key === "innate_sorcery")?.max.value, 2)

    const points = contract.resources.find((entry) => entry.key === "sorcery_points")
    if (level === 1) {
      assert.equal(points, undefined)
    } else {
      assert.equal(points?.max.value, level, `Sorcery Points must use Sorcerer level at level ${level}`)
    }

    const restoration = contract.resources.find((entry) => entry.key === "sorcerous_restoration")
    const amount = contract.values.find((entry) => entry.key === "sorcerous_restoration_amount")
    if (level < 5) {
      assert.equal(restoration, undefined)
      assert.equal(amount, undefined)
    } else {
      assert.equal(restoration?.max.value, 1)
      assert.equal(
        amount?.value.value,
        Math.floor(level / 2),
        `Sorcerous Restoration must be floor(Sorcerer level / 2) at level ${level}`,
      )
    }
  }
})

test("Stage 8 package passes strict quality/resource gates through parser and CE", () => {
  assert.doesNotThrow(() => assertClassPackageQuality([sorcererRuntimePackageFixture(20)]))
  assert.doesNotThrow(() => assertClassResourcePolicy([sorcererRuntimePackageFixture(20)]))
  assert.doesNotThrow(() => assertClassPackageQuality(sorcererStage7RuntimeBundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(sorcererStage7RuntimeBundles))

  for (const catalogKey of SORCERER_STAGE7_RUNTIME_CATALOG_KEYS) {
    const { parsed, contract } = subclassContract(catalogKey, 20)
    assert.ok(parsed.contributions.length > 0, `${catalogKey} emitted no contributions`)
    assert.ok(contract.rules.length > 0, `${catalogKey} emitted no resolved rules`)
  }
})

test("multiclass resolution uses Sorcerer class level instead of total character level", () => {
  const lowSorcerer = subclassContract(
    "subclass:sorcerer:draconic-sorcery",
    3,
    12,
    { sorcerer_draconic_affinity: "fire" },
  ).contract

  assert.equal(lowSorcerer.resources.find((entry) => entry.key === "sorcery_points")?.max.value, 3)
  assert.equal(lowSorcerer.combat.maxHp.value, 83)
  assert.equal(
    lowSorcerer.capabilities.resistances.some((entry) => entry.key === "damage:fire"),
    false,
    "total character level must not unlock Sorcerer 6 subclass mechanics",
  )

  const levelSixSorcerer = subclassContract(
    "subclass:sorcerer:draconic-sorcery",
    6,
    12,
    { sorcerer_draconic_affinity: "fire" },
  ).contract
  assert.equal(levelSixSorcerer.resources.find((entry) => entry.key === "sorcery_points")?.max.value, 6)
  assert.equal(levelSixSorcerer.combat.maxHp.value, 86)
  assert.ok(levelSixSorcerer.capabilities.resistances.some((entry) => entry.key === "damage:fire"))
})

test("player reference exposes exactly the certified Sorcerer runtime boundary", () => {
  const sorcerer = classReference.find((entry) => entry.id === "sorcerer")
  assert.ok(sorcerer)
  assert.equal(sorcerer.referenceOnly, false)

  const runtimeIds = new Set(SORCERER_RUNTIME_REFERENCE_SUBCLASS_IDS)
  assert.equal(runtimeIds.size, 9)
  assert.deepEqual(
    [...runtimeIds].sort(),
    SORCERER_STAGE7_RUNTIME_CATALOG_KEYS
      .map((key) => key.replace("subclass:sorcerer:", ""))
      .sort(),
  )

  for (const subclass of sorcerer.subclasses) {
    assert.equal(subclass.referenceOnly, !runtimeIds.has(subclass.id))
  }
  assert.equal(sorcerer.subclasses.filter((entry) => entry.referenceOnly).length, 3)
  assert.deepEqual(
    sorcerer.subclasses.filter((entry) => entry.referenceOnly).map((entry) => `subclass:sorcerer:${entry.id}`).sort(),
    [...SORCERER_STAGE7_REFERENCE_ONLY].sort(),
  )
})

test("Class tab presents Sorcerer mechanics from the resolved CE contract", () => {
  const { bundles, contract } = subclassContract(
    "subclass:sorcerer:draconic-sorcery",
    6,
    6,
    { sorcerer_draconic_affinity: "fire" },
  )
  const parent = bundles.find((bundle) => bundle.template.kind === "class")!
  const subclass = bundles.find((bundle) => bundle.template.kind === "subclass")!

  const presented = presentClassPackages(contract, [{
    classAssignmentId: parent.assignment.id,
    classTemplateId: parent.template.id,
    classCatalogKey: parent.template.catalog_key,
    className: parent.template.name,
    level: 6,
    subclassTemplateId: subclass.template.id,
    subclassName: subclass.template.name,
    subclassUnlockLevel: subclass.template.unlock_level ?? 3,
    subclassActive: true,
  }])[0]!

  assert.ok(presented.classMechanics.entries.some((entry) =>
    entry.type === "resource" && entry.integration === "runtime",
  ))
  assert.ok(presented.subclassMechanics?.entries.some((entry) =>
    entry.type === "resistance" && entry.integration === "structured",
  ))
  assert.doesNotMatch(classPresentationSource, /label\.includes\([^)]*(?:resource|spell|action)/i)
})

test("GENA/UI uses the final Metamagic and template-choice action routes", () => {
  const metamagicMethod = gateway.match(/async sendSpellWithModifiers[\s\S]*?\n  }/)
  assert.ok(metamagicMethod)
  assert.match(metamagicMethod[0], /send_chat_spell_with_template_modifiers_v2/)
  assert.doesNotMatch(metamagicMethod[0], /send_chat_spell_with_template_modifiers_v1/)

  assert.match(chatSheet, /template_choice/)
  assert.match(chatSheet, /optionLabels/)
  assert.match(chatRoom, /actionOptionKey/)
  assert.match(chatRoom, /chat\.sendTemplateAction/)
})

test("Stage 8 migration repairs even-level Sorcerous Restoration and certifies all base systems", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:sorcerer/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/sorcererRuntimeFinalCertification\.test\.ts/i)
  assert.match(migration, /generate_series\(5,20\)/)
  assert.match(migration, /floor\(g\.level::numeric\/2\)/)
  assert.match(migration, /SORCERER_FINAL_RESTORATION_SCALING_INVALID/)
  assert.match(migration, /SORCERER_FINAL_FONT_CREATE_SLOT_INVALID/)
  assert.match(migration, /SORCERER_FINAL_FONT_REVERSE_SLOT_INVALID/)
  assert.match(migration, /SORCERER_FINAL_METAMAGIC_CHOICE_INVALID/)
  assert.match(migration, /SORCERER_FINAL_PREPARED_CHOICE_INVALID/)
})

test("Stage 8 migration certifies all nine subclasses and rejects reference-only leakage", () => {
  assert.match(migration, /SORCERER_FINAL_ACTIVE_SUBCLASS_COUNT/)
  assert.match(migration, /SORCERER_FINAL_SUBCLASS_LEVELS_INVALID/)
  assert.match(migration, /SORCERER_FINAL_SUBCLASS_SPELL_LINKS_INVALID/)
  assert.match(migration, /SORCERER_FINAL_REFERENCE_ONLY_SUBCLASS_LEAK/)
  assert.match(migration, /SORCERER_FINAL_DUPLICATE_MECHANIC_IDS/)
  assert.match(migration, /SORCERER_FINAL_BROKEN_RESOURCE_REFS/)
  assert.match(migration, /SORCERER_FINAL_ABERRANT_PSIONIC_INVALID/)
  assert.match(migration, /SORCERER_FINAL_CLOCKWORK_BALANCE_INVALID/)
  assert.match(migration, /SORCERER_FINAL_DRACONIC_HP_INVALID/)
  assert.match(migration, /SORCERER_FINAL_WILD_SURGE_INVALID/)
  assert.match(migration, /SORCERER_FINAL_SHADOW_DARKNESS_INVALID/)
  assert.match(migration, /SORCERER_FINAL_LUNAR_PHASE_ACTION_INVALID/)
  for (const key of SORCERER_STAGE7_RUNTIME_CATALOG_KEYS) assert.ok(migration.includes(key))
  for (const key of SORCERER_STAGE7_REFERENCE_ONLY) assert.ok(migration.includes(key))
})

test("Stage 8 certifies chat RPCs and only writes READY after all fail-closed gates", () => {
  assert.match(migration, /send_chat_spell_with_template_modifiers_v2/)
  assert.match(migration, /send_chat_template_action_v2/)
  assert.match(migration, /send_chat_template_spell_v2/)
  assert.match(migration, /commit_character_template_choice_v2/)
  assert.match(migration, /apply_character_template_choice_action_effect_v1/)
  assert.match(migration, /has_function_privilege/)

  const lastGate = migration.indexOf("SORCERER_FINAL_TEMPLATE_CHOICE_ACTION_BRIDGE_MISSING")
  const readyWrite = migration.indexOf("'mechanics_status','READY'")
  assert.ok(lastGate >= 0)
  assert.ok(readyWrite > lastGate)
  assert.match(migration, /'runtime_stage',8/)
  assert.match(migration, /xphb-2024-sorcerer-runtime-final-v1/)
  assert.match(migration, /'runtime_certified_at','2026-09-10'/)
  assert.match(migration, /'runtime_status','ready'/)
  assert.match(migration, /'multiclass_parent_level_certified',true/)
})

test("new campaigns install Stage 7, apply final precision, then run Stage 8 certification", () => {
  const installer = migration.match(/create or replace function private\.install_sorcerer_stage7_for_new_campaign_v1\(\)[\s\S]*?\$function\$;/)
  assert.ok(installer)
  const body = installer[0]
  const stage7 = body.indexOf("ensure_sorcerer_stage7_subclass_runtime_v1")
  const precision = body.indexOf("sorcerer_stage8_patch_precision_v1")
  const certify = body.indexOf("certify_sorcerer_runtime_final_v1")
  assert.ok(stage7 >= 0)
  assert.ok(precision > stage7)
  assert.ok(certify > precision)
})
