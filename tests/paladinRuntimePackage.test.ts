import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

function paladinBundle(level = 6): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-paladin-package",
      character_id: "character-paladin-package",
      template_id: "class-paladin-package",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-09T00:00:00Z",
      updated_at: "2026-09-09T00:00:00Z",
    },
    template: {
      id: "class-paladin-package",
      campaign_id: "campaign",
      kind: "class",
      slug: "paladin-core",
      name: "Паладин",
      description: "Паладин 2024",
      mechanical_summary: "Паладин использует Харизму для классовой магии и расходует отдельные восстанавливаемые запасы Наложения рук и Божественного канала.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:paladin",
      catalog_revision: "xphb-2024-paladin-package-test-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-09T00:00:00Z",
      updated_at: "2026-09-09T00:00:00Z",
    },
    levels: [
      {
        id: "paladin-package-level-1",
        template_id: "class-paladin-package",
        level: 1,
        choices: [],
        mechanics: [
          {
            id: "paladin-package-lay-on-hands-feature",
            type: "grant",
            target: "feature",
            key: "class:paladin:lay-on-hands:package-test",
            sourceKey: "lay-on-hands",
            payload: {
              label: "Наложение рук",
              description: "После долгого отдыха запас полностью восстанавливается. Бонусным действием касанием Паладин тратит очки запаса и восстанавливает столько же HP.",
            },
          },
          {
            id: "paladin-package-lay-on-hands-resource",
            type: "resource",
            key: "lay_on_hands",
            label: "Наложение рук",
            max: 30,
            recharge: "long_rest",
            initial: "full",
            sourceKey: "lay-on-hands",
          },
          {
            id: "paladin-package-lay-on-hands-action",
            type: "action",
            key: "lay_on_hands",
            label: "Наложение рук",
            economy: "bonus_action",
            resourceKey: "lay_on_hands",
            resourceCost: 1,
            sourceKey: "lay-on-hands",
            effects: [
              {
                key: "paladin-package-lay-on-hands-heal",
                kind: "semantic",
                payload: { hpPerPoint: 1 },
              },
            ],
          },
        ],
      },
    ],
  }
}

test("Paladin runtime package satisfies the strict class and resource contracts end to end", () => {
  const bundle = paladinBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))

  const parsed = resolveTemplateBundles([bundle], 6)
  const contract = resolveCharacterContract({
    base: {
      id: "paladin-package-character",
      name: "Паладин",
      level: 6,
      abilities: {
        strength: 16,
        dexterity: 10,
        constitution: 14,
        intelligence: 8,
        wisdom: 10,
        charisma: 18,
      },
      baseMaxHp: 52,
      baseSpeed: 30,
    },
    state: {
      currentHp: 52,
      tempHp: 0,
      resources: { lay_on_hands: { current: 30 } },
    },
    contributions: parsed.contributions,
  })

  assert.ok(contract.resources.some((resource) => resource.key === "lay_on_hands"))
  const action = contract.actions.find((entry) => entry.key === "lay_on_hands")
  assert.ok(action)
  assert.equal(action.resourceCosts[0]?.key, "lay_on_hands")
  assert.equal(action.resourceCosts[0]?.amount, 1)
})
