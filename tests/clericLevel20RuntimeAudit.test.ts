import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { resourceCostInputs, resourceSyncInputs } from "../src/lib/resourceRuntime.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"

const cleanup = fs.readFileSync("supabase/migrations/20260905130000_cleric_l20_runtime_cleanup.sql", "utf8")

const clericTemplate: RuleTemplate = {
  id: "cleric-l20-template",
  campaign_id: "test-campaign",
  kind: "class",
  slug: "cleric",
  name: "Жрец",
  description: "Тестовый пакет жреца двадцатого уровня.",
  version: 1,
  mechanics: [],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:cleric",
  catalog_revision: "cleric-l20-runtime-audit",
  source_kind: "official",
  source_label: "Official",
  is_builtin: true,
  mechanical_summary: "Полный finite-resource smoke test жреца.",
  author_description: "",
  author_comment: "",
  rules_meta: {},
  is_active: true,
  created_by: null,
  created_at: "2026-09-05T13:00:00Z",
  updated_at: "2026-09-05T13:00:00Z",
}

const warTemplate: RuleTemplate = {
  ...clericTemplate,
  id: "cleric-l20-war-template",
  kind: "subclass",
  slug: "war-domain",
  name: "Домен войны",
  description: "Домен для проверки независимого пула Жреца войны и общего Божественного канала.",
  parent_template_id: clericTemplate.id,
  unlock_level: 3,
  catalog_key: "subclass:cleric:war-domain",
}

function assignment(templateId: string) {
  return {
    id: `assignment:${templateId}`,
    character_id: "cleric-l20-test-character",
    template_id: templateId,
    template_level: 20,
    selected_choices: {},
    assigned_at: "2026-09-05T13:00:00Z",
    updated_at: "2026-09-05T13:00:00Z",
  }
}

const slotMax = [4, 3, 3, 3, 3, 2, 2, 1, 1] as const

function clericBundle(): CharacterTemplateBundle {
  const mechanics = [
    {
      id: "cleric-l20-channel",
      type: "resource" as const,
      key: "channel_divinity",
      label: "Божественный канал",
      max: 4,
      recharge: "long_rest" as const,
      recoveryRules: [
        { trigger: "short_rest" as const, restore: "amount" as const, amount: 1 },
        { trigger: "long_rest" as const, restore: "full" as const },
      ],
      sourceKey: "channel-divinity",
    },
    {
      id: "cleric-l20-divine-spark",
      type: "action" as const,
      key: "divine_spark",
      label: "Божественная искра",
      economy: "magic_action" as const,
      resourceKey: "channel_divinity",
      resourceCost: 1,
      sourceKey: "channel-divinity",
    },
    {
      id: "cleric-l20-turn-undead",
      type: "action" as const,
      key: "turn_undead",
      label: "Изгнание нежити",
      economy: "magic_action" as const,
      resourceKey: "channel_divinity",
      resourceCost: 1,
      sourceKey: "channel-divinity",
    },
    {
      id: "cleric-l20-divine-intervention-resource",
      type: "resource" as const,
      key: "divine_intervention",
      label: "Божественное вмешательство",
      max: 1,
      recharge: ["long_rest" as const],
      sourceKey: "divine-intervention",
    },
    {
      id: "cleric-l20-divine-intervention-action",
      type: "action" as const,
      key: "divine_intervention",
      label: "Божественное вмешательство",
      economy: "magic_action" as const,
      resourceKey: "divine_intervention",
      resourceCost: 1,
      sourceKey: "divine-intervention",
    },
    ...slotMax.map((max, index) => ({
      id: `cleric-l20-slot-${index + 1}`,
      type: "resource" as const,
      key: `spell_slot_${index + 1}`,
      label: `Ячейки ${index + 1} уровня`,
      max,
      recharge: ["long_rest" as const],
      sourceKey: "spellcasting",
    })),
  ]

  return {
    template: clericTemplate,
    assignment: assignment(clericTemplate.id),
    levels: [{ id: "cleric-l20-level", template_id: clericTemplate.id, level: 20, choices: [], mechanics }],
  }
}

function warBundle(): CharacterTemplateBundle {
  return {
    template: warTemplate,
    assignment: assignment(warTemplate.id),
    levels: [{
      id: "cleric-l20-war-level",
      template_id: warTemplate.id,
      level: 3,
      choices: [],
      mechanics: [
        {
          id: "cleric-war-priest-resource",
          type: "resource",
          key: "war_priest",
          label: "Жрец войны",
          max: { kind: "max", values: [{ kind: "literal", value: 1 }, { kind: "reference", key: "abilities.wisdom.modifier" }] },
          recharge: ["short_rest", "long_rest"],
          sourceKey: "war-domain-l3-1",
        },
        {
          id: "cleric-war-guided-strike-action",
          type: "action",
          key: "war_guided_strike",
          label: "Направленный удар",
          economy: "special",
          resourceKey: "channel_divinity",
          resourceCost: 1,
          sourceKey: "war-domain-l3-1",
        },
        {
          id: "cleric-war-priest-action",
          type: "action",
          key: "war_priest",
          label: "Жрец войны",
          economy: "bonus_action",
          resourceKey: "war_priest",
          resourceCost: 1,
          sourceKey: "war-domain-l3-1",
        },
      ],
    }],
  }
}

function resolveTestCleric() {
  const packages = [clericBundle(), warBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  const parsed = resolveTemplateBundles(packages, 20)
  const input: CharacterEngineInput = {
    base: {
      id: "cleric-l20-test-character",
      name: "Отец Тестий",
      level: 20,
      abilities: { strength: 14, dexterity: 10, constitution: 16, intelligence: 10, wisdom: 20, charisma: 12 },
      baseMaxHp: 163,
      baseSpeed: 30,
    },
    state: {
      currentHp: 163,
      tempHp: 0,
      resources: {
        channel_divinity: { current: 4 },
        divine_intervention: { current: 1 },
        war_priest: { current: 5 },
        ...Object.fromEntries(slotMax.map((max, index) => [`spell_slot_${index + 1}`, { current: max }])),
      },
    },
    contributions: parsed.contributions,
  }
  return resolveCharacterContract(input)
}

test("Отец Тестий resolves as a level-20 Cleric with the complete finite-resource ledger", () => {
  const contract = resolveTestCleric()
  assert.equal(contract.level, 20)
  assert.equal(contract.proficiencyBonus.value, 6)
  assert.equal(contract.abilities.wisdom.modifier, 5)

  const resources = new Map(contract.resources.map((resource) => [resource.stateKey, resource]))
  assert.equal(resources.get("channel_divinity")?.max.value, 4)
  assert.equal(resources.get("divine_intervention")?.max.value, 1)
  assert.equal(resources.get("war_priest")?.max.value, 5)
  slotMax.forEach((max, index) => assert.equal(resources.get(`spell_slot_${index + 1}`)?.max.value, max))

  const sync = resourceSyncInputs(contract)
  assert.equal(sync.length, 12)
  assert.deepEqual(sync.find((entry) => entry.stateKey === "channel_divinity")?.recharge, {
    rules: [
      { trigger: "short_rest", restore: "amount", amount: 1 },
      { trigger: "long_rest", restore: "full" },
    ],
  })
})

test("every finite action on the level-20 test Cleric resolves to an existing CE ledger", () => {
  const contract = resolveTestCleric()
  const finiteActions = contract.actions.filter((action) => action.resourceCosts.length > 0)
  assert.ok(finiteActions.length >= 5)

  for (const action of finiteActions) {
    assert.doesNotThrow(() => resourceCostInputs(contract, action.resourceCosts), action.key)
    for (const cost of action.resourceCosts) {
      assert.ok(contract.resources.some((resource) => resource.stateKey === cost.stateKey), `${action.key} -> ${cost.stateKey}`)
      assert.ok(cost.amount > 0)
    }
  }

  const actionKeys = contract.actions.map((action) => action.key)
  assert.equal(new Set(actionKeys).size, actionKeys.length, "runtime action keys must not be duplicated")
  assert.ok(contract.actions.some((action) => action.key === "war_guided_strike" && action.resourceCosts.some((cost) => cost.stateKey === "channel_divinity")))
  assert.ok(contract.actions.some((action) => action.key === "war_priest" && action.resourceCosts.some((cost) => cost.stateKey === "war_priest")))
})

test("cleric L20 cleanup removes every known legacy free alias and duplicate ledger", () => {
  const legacyIds = [
    "cleric-death-touch-of-death-action",
    "cleric-forge-artisans-blessing-action",
    "cleric-grave-path-to-grave-action",
    "cleric-grave-enhanced-necromancy-action",
    "cleric-knowledge-mind-magic-action",
    "cleric-light-radiance-of-dawn-action",
    "cleric-light-warding-flare-action",
    "cleric-peace-emboldening-bond-action",
    "cleric-tempest-wrath-action",
    "cleric-tempest-destructive-wrath-action",
    "cleric-trickery-invoke-duplicity-action",
    "cleric-war-guided-strike-action",
    "cleric-war-priest-action",
    "cleric-war-gods-blessing-shield",
    "cleric-war-gods-blessing-spiritual",
    "cleric-light-warding-flare-resource-l3",
    "cleric-light-warding-flare-resource-l6",
    "cleric-order-embodiment-resource",
    "cleric-peace-emboldening-bond-resource",
  ]
  for (const id of legacyIds) assert.match(cleanup, new RegExp(`cleric_l20_remove_legacy_mechanic\\([^;]+${id}`))

  const canonicalIds = [
    "cleric-death-touch-runtime",
    "cleric-forge-artisan-runtime",
    "cleric-grave-path-runtime",
    "cleric-grave-enhanced-necromancy-runtime",
    "cleric-knowledge-mind-magic-runtime",
    "cleric-light-radiance-runtime",
    "cleric-light-flare-action",
    "cleric-peace-bond-action",
    "cleric-tempest-wrath-action",
    "cleric-tempest-destructive-runtime",
    "cleric-trickery-duplicity-runtime",
    "cleric-war-guided-strike-action",
    "cleric-war-priest-action",
    "cleric-war-god-shield-action",
    "cleric-war-god-weapon-action",
    "cleric-light-flare-resource",
    "cleric-light-flare-upgrade-resource",
    "cleric-order-law-resource",
    "cleric-peace-bond-resource",
  ]
  for (const id of canonicalIds) assert.match(cleanup, new RegExp(id))
  assert.match(cleanup, /a\.resource_cost=1/)
})
