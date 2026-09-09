import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateChoiceStates } from "../src/rule-templates/choiceState.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"

const reverseFix = fs.readFileSync(
  "supabase/migrations/20260908230000_sorcerer_stage3_reverse_conversion_fix_v1.sql",
  "utf8",
)
const stage4Runtime = fs.readFileSync(
  "supabase/migrations/20260908231500_sorcerer_stage4_spell_modifier_runtime_v1.sql",
  "utf8",
)
const stage4 = fs.readFileSync(
  "supabase/migrations/20260908232000_sorcerer_stage4_metamagic_runtime_v1.sql",
  "utf8",
)
const gateway = fs.readFileSync("src/game-engine/supabase.ts", "utf8")
const chatHook = fs.readFileSync("src/hooks/useChatMessages.ts", "utf8")
const modifierSheet = fs.readFileSync("src/components/chat/ChatSpellModifierSheet.tsx", "utf8")
const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")

function extractMetamagicChoice(): RuleChoiceDefinition {
  const match = stage4.match(/v_choice := \$metamagic\$\n([\s\S]*?)\n\$metamagic\$::jsonb/)
  assert.ok(match, "Stage 4 migration must embed one canonical Metamagic choice JSON")
  return JSON.parse(match[1]!) as RuleChoiceDefinition
}

const metamagicChoice = extractMetamagicChoice()

function stage4Bundle(level = 10): CharacterTemplateBundle {
  const selected = ["careful-spell", "empowered-spell", "quickened-spell", "subtle-spell"]
    .slice(0, level >= 10 ? 4 : 2)
  return {
    assignment: {
      id: "assignment-sorcerer-stage4",
      character_id: "character-sorcerer-stage4",
      template_id: "class-sorcerer-stage4",
      template_level: level,
      selected_choices: {
        sorcerer_metamagic: selected,
        _choice_runtime_v2: {
          version: 2,
          choices: {
            sorcerer_metamagic: {
              source_level: level >= 10 ? 9 : 2,
              instances: selected.map((option) => ({ option, config: {} })),
            },
          },
        },
      } as never,
      assigned_at: "2026-09-08T00:00:00Z",
      updated_at: "2026-09-08T00:00:00Z",
    },
    template: {
      id: "class-sorcerer-stage4",
      campaign_id: "campaign",
      kind: "class",
      slug: "sorcerer-core",
      name: "Чародей",
      description: "Чародей 2024",
      mechanical_summary: "Чародей расходует Очки чародейства на выбранные варианты Метамагии, которые модифицируют конкретное сотворение заклинания.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:sorcerer",
      catalog_revision: "xphb-2024-sorcerer-stage4-metamagic-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-08T00:00:00Z",
      updated_at: "2026-09-08T00:00:00Z",
    },
    levels: [
      {
        id: "sorcerer-stage4-level-2",
        template_id: "class-sorcerer-stage4",
        level: 2,
        mechanics: [
          {
            id: "sorcerer-font-of-magic-feature-test",
            type: "grant",
            target: "feature",
            key: "class:sorcerer:font-of-magic:test",
            sourceKey: "font-of-magic",
            payload: {
              label: "Источник магии",
              description: "Со 2 уровня у вас есть Очки чародейства. Их максимум равен уровню чародея, а весь потраченный запас восстанавливается после долгого отдыха.",
            },
          },
          {
            id: "sorcerer-sorcery-points-resource-test",
            type: "resource",
            key: "sorcery_points",
            label: "Очки чародейства",
            max: 10,
            recharge: "long_rest",
            initial: "full",
            sourceKey: "font-of-magic",
          },
        ],
        choices: [metamagicChoice],
      },
    ],
  }
}

test("Stage 4 publishes the complete 2024 Metamagic roster and exact Sorcery Point costs", () => {
  assert.deepEqual(metamagicChoice.options, [
    "careful-spell",
    "distant-spell",
    "empowered-spell",
    "extended-spell",
    "heightened-spell",
    "quickened-spell",
    "seeking-spell",
    "subtle-spell",
    "transmuted-spell",
    "twinned-spell",
  ])

  const costs = Object.fromEntries(metamagicChoice.options.map((option) => {
    const mechanics = metamagicChoice.option_mechanics?.[option] || []
    const action = mechanics.find((entry) => entry.type === "action")
    assert.ok(action && "resourceCosts" in action, `${option} must resolve to an actionable Metamagic spend`)
    const resourceCosts = (action as { resourceCosts?: Array<{ key: string; amount: number }> }).resourceCosts || []
    assert.deepEqual(resourceCosts.map((cost) => cost.key), ["sorcery_points"])
    return [option, resourceCosts[0]?.amount]
  }))

  assert.deepEqual(costs, {
    "careful-spell": 1,
    "distant-spell": 1,
    "empowered-spell": 1,
    "extended-spell": 1,
    "heightened-spell": 2,
    "quickened-spell": 2,
    "seeking-spell": 1,
    "subtle-spell": 1,
    "transmuted-spell": 1,
    "twinned-spell": 1,
  })
})

test("Metamagic choice grows 2 to 4 to 6 and permits one replacement on Sorcerer level gain", () => {
  assert.equal(metamagicChoice.count, 2)
  assert.deepEqual(metamagicChoice.count_by_level, { "2": 2, "10": 4, "17": 6 })
  assert.equal(metamagicChoice.replacement_policy, "on_level_change")
  assert.equal(metamagicChoice.replacement_limit, 1)

  const level2 = resolveTemplateChoiceStates([stage4Bundle(2)], 2)
    .find((entry) => entry.key === "sorcerer_metamagic")
  assert.equal(level2?.required, 2)

  const level10 = resolveTemplateChoiceStates([stage4Bundle(10)], 10)
    .find((entry) => entry.key === "sorcerer_metamagic")
  assert.equal(level10?.required, 4)
  assert.equal(level10?.status, "editable")
  assert.equal(level10?.replacementPolicy, "on_level_change")
  assert.equal(level10?.replacementLimit, 1)

  const level17Bundle = stage4Bundle(17)
  level17Bundle.assignment.selected_choices = {
    ...level17Bundle.assignment.selected_choices,
    sorcerer_metamagic: [
      "careful-spell",
      "empowered-spell",
      "quickened-spell",
      "subtle-spell",
      "extended-spell",
      "distant-spell",
    ],
  } as never
  const level17 = resolveTemplateChoiceStates([level17Bundle], 17)
    .find((entry) => entry.key === "sorcerer_metamagic")
  assert.equal(level17?.required, 6)
})

test("selected Metamagic traverses Choice Runtime into CE as real resource-backed actions", () => {
  const bundle = stage4Bundle(10)
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))

  const parsed = resolveTemplateBundles([bundle], 10)
  const contract = resolveCharacterContract({
    base: {
      id: "sorcerer-stage4",
      name: "Чародей",
      level: 10,
      abilities: {
        strength: 8,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 18,
      },
      baseMaxHp: 62,
      baseSpeed: 30,
    },
    state: {
      currentHp: 62,
      tempHp: 0,
      resources: { sorcery_points: { current: 10 } },
    },
    contributions: parsed.contributions,
  })

  const metamagicActions = contract.actions.filter((action) => action.tags.includes("metamagic"))
  assert.equal(metamagicActions.length, 4)
  assert.deepEqual(
    metamagicActions.map((action) => action.resourceCosts[0]?.amount).sort((a, b) => Number(a) - Number(b)),
    [1, 1, 1, 2],
  )
  assert.ok(metamagicActions.every((action) => action.effects.some((effect) => effect.kind === "semantic")))
})

test("Empowered and Seeking are the explicit combination exceptions", () => {
  for (const option of ["empowered-spell", "seeking-spell"]) {
    const action = metamagicChoice.option_mechanics?.[option]
      ?.find((entry) => entry.type === "action") as { tags?: string[] } | undefined
    assert.ok(action?.tags?.includes("metamagic_stack_exception"))
  }

  for (const option of metamagicChoice.options.filter((option) => !["empowered-spell", "seeking-spell"].includes(option))) {
    const action = metamagicChoice.option_mechanics?.[option]
      ?.find((entry) => entry.type === "action") as { tags?: string[] } | undefined
    assert.equal(action?.tags?.includes("metamagic_stack_exception"), false)
  }
})

test("Stage 3 correction restores slot to Sorcery Point conversion for slot levels 1 through 9", () => {
  assert.match(reverseFix, /\(2,1\),\(3,2\),\(5,3\),\(7,4\),\(9,5\),\(11,6\),\(13,7\),\(15,8\),\(17,9\)/)
  assert.match(reverseFix, /'economy','special'/)
  assert.match(reverseFix, /'key','spell_slot_'\|\|v_slot::text,'amount',1/)
  assert.match(reverseFix, /'key','sorcery_points',\s*'operation','RESTORE',\s*'amount',v_slot/)
  assert.match(reverseFix, /'font_of_magic_reverse_conversion_runtime',true/)
  assert.match(reverseFix, /'font_of_magic_reverse_conversion_action_required',false/)
})

test("spell plus Metamagic execution is one receipt-aware GENA transaction", () => {
  assert.match(stage4Runtime, /send_chat_spell_with_template_modifiers_v1/)
  assert.match(stage4Runtime, /command_kind is distinct from 'spell\.with_modifiers'/)
  assert.match(stage4Runtime, /perform public\.use_character_template_resource_action/)
  assert.match(stage4Runtime, /perform public\.use_character_template_spell_v1/)
  assert.match(stage4Runtime, /perform private\.consume_character_resource_costs/)
  assert.match(stage4Runtime, /'templateModifiers',v_modifiers/)
  assert.match(stage4Runtime, /insert into public\.engine_command_receipts/)
  assert.match(stage4Runtime, /\? 'spell_modifier'/)
  assert.match(stage4Runtime, /\? 'metamagic_stack_exception'/)
})

test("chat attaches selected Metamagic to the exact spell cast instead of firing an unrelated action", () => {
  assert.match(gateway, /sendSpellWithModifiers/)
  assert.match(gateway, /send_chat_spell_with_template_modifiers_v2/)
  assert.match(chatHook, /sendSpellWithModifiers/)
  assert.match(modifierSheet, /spell_modifier/)
  assert.match(modifierSheet, /metamagic_stack_exception/)
  assert.match(chatRoom, /ChatSpellModifierSheet/)
  assert.match(chatRoom, /executeSpell/)
  assert.match(chatRoom, /modifierActions/)
})

test("Stage 4 stops before Sorcery Incarnate and Arcane Apotheosis runtime", () => {
  assert.match(stage4, /'runtime_stage',4/)
  assert.match(stage4, /'metamagic_runtime_included',true/)
  assert.match(stage4, /'sorcery_incarnate_runtime',false/)
  assert.match(stage4, /'arcane_apotheosis_runtime',false/)
  assert.match(stage4, /'spell_runtime_included',false/)
  assert.match(stage4, /'subclass_runtime_included',false/)
})
