import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  executeAction,
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync("supabase/migrations/20260904123000_monk_base_runtime_v1.sql", "utf8")
const auditMigration = fs.readFileSync("supabase/migrations/20260904123500_monk_base_runtime_audit.sql", "utf8")
const precisionMigration = fs.readFileSync("supabase/migrations/20260904124500_monk_2024_rules_precision.sql", "utf8")

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description } }
}

function resource(id: string, sourceKey: string, key: string, label: string, max: number, recharge: ("short_rest" | "long_rest")[], priority: number): StoredMechanic {
  return { id, type: "resource", sourceKey, key, label, max, recharge, initial: "full", grantOperation: "REPLACE", priority }
}

function value(id: string, sourceKey: string, key: string, label: string, amount: number, priority: number): StoredMechanic {
  return { id, type: "grant", target: "value", key, sourceKey, grantOperation: "REPLACE", priority, payload: { label, value: amount } }
}

function action(id: string, sourceKey: string, key: string, label: string, economy: string, cost: number): StoredMechanic {
  return {
    id,
    type: "action",
    sourceKey,
    key,
    label,
    economy,
    ...(cost ? { resourceCosts: [{ key: "monk_focus", amount: cost }] } : {}),
    tags: ["class"],
  }
}

const levels: Array<{ level: number; mechanics: StoredMechanics }> = [
  {
    level: 1,
    mechanics: [
      feature("ma-rules", "monk-martial-arts", "martial_arts", "Боевые искусства", "Монах использует куб Боевых искусств для подходящих безоружных ударов и монашеского оружия по точным правилам класса."),
      value("ma-die-1", "monk-martial-arts", "martial_arts_die_sides", "Куб Боевых искусств", 6, 1),
    ],
  },
  {
    level: 2,
    mechanics: [
      feature("focus-rules", "monk-focus", "monk_focus_rules", "Монашеская концентрация", "Запас Очков концентрации равен уровню монаха и полностью восстанавливается после короткого или долгого отдыха."),
      resource("focus-2", "monk-focus", "monk_focus", "Очки концентрации", 2, ["short_rest", "long_rest"], 2),
      feature("flurry-rules", "monk-flurry-of-blows", "flurry_rules", "Шквал ударов", "Бонусным действием монах тратит 1 Очко концентрации и делает два Безоружных удара; с 10 уровня — три."),
      action("flurry", "monk-flurry-of-blows", "flurry_of_blows", "Шквал ударов", "bonus_action", 1),
      value("speed-2", "monk-unarmored-movement", "unarmored_movement_bonus_feet", "Бонус Скорости без доспехов", 10, 2),
      feature("uncanny-rules", "monk-uncanny-metabolism", "uncanny_metabolism_rules", "Невероятный метаболизм", "При броске инициативы монах может восстановить весь Focus и HP по формуле способности; после использования способность восстанавливается после долгого отдыха."),
      resource("uncanny-use", "monk-uncanny-metabolism", "monk_uncanny_metabolism", "Невероятный метаболизм", 1, ["long_rest"], 2),
      {
        id: "uncanny-action",
        type: "action",
        sourceKey: "monk-uncanny-metabolism",
        key: "uncanny_metabolism",
        label: "Невероятный метаболизм",
        economy: "free",
        resourceCosts: [{ key: "monk_uncanny_metabolism", amount: 1 }],
        effects: [{ kind: "resource", key: "monk_focus", operation: "RESTORE", amount: 20 }],
        tags: ["class", "initiative-trigger"],
      },
    ],
  },
  {
    level: 5,
    mechanics: [
      resource("focus-5", "monk-focus", "monk_focus", "Очки концентрации", 5, ["short_rest", "long_rest"], 5),
      value("ma-die-5", "monk-martial-arts", "martial_arts_die_sides", "Куб Боевых искусств", 8, 5),
      value("attacks-5", "monk-extra-attack", "attacks_per_attack_action", "Атак за действие Атака", 2, 5),
    ],
  },
  {
    level: 10,
    mechanics: [
      resource("focus-10", "monk-focus", "monk_focus", "Очки концентрации", 10, ["short_rest", "long_rest"], 10),
      value("flurry-10", "monk-flurry-of-blows", "flurry_unarmed_strikes", "Ударов Шквала", 3, 10),
      value("speed-10", "monk-unarmored-movement", "unarmored_movement_bonus_feet", "Бонус Скорости без доспехов", 20, 10),
    ],
  },
  { level: 11, mechanics: [value("ma-die-11", "monk-martial-arts", "martial_arts_die_sides", "Куб Боевых искусств", 10, 11)] },
  { level: 17, mechanics: [value("ma-die-17", "monk-martial-arts", "martial_arts_die_sides", "Куб Боевых искусств", 12, 17)] },
  {
    level: 18,
    mechanics: [
      resource("focus-18", "monk-focus", "monk_focus", "Очки концентрации", 18, ["short_rest", "long_rest"], 18),
      feature("superior-rules", "monk-superior-defense", "superior_defense_rules", "Высшая защита", "В начале своего хода монах может потратить 3 Очка концентрации, чтобы на 1 минуту получить сопротивление всему урону, кроме Force, пока не станет недееспособен."),
      action("superior-action", "monk-superior-defense", "superior_defense", "Высшая защита", "free", 3),
      value("speed-18", "monk-unarmored-movement", "unarmored_movement_bonus_feet", "Бонус Скорости без доспехов", 30, 18),
    ],
  },
  { level: 20, mechanics: [resource("focus-20", "monk-focus", "monk_focus", "Очки концентрации", 20, ["short_rest", "long_rest"], 20)] },
]

function bundleAt(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-monk", character_id: "character-monk", template_id: "class-monk", template_level: level,
      selected_choices: {}, assigned_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    template: {
      id: "class-monk", campaign_id: "campaign", kind: "class", slug: "monk-core", name: "Монах",
      description: "Базовый класс монаха 2024.", version: 1, mechanics: [], choices: [], catalog_key: "class:monk",
      catalog_revision: "xphb-2024-monk-runtime-v1", source_kind: "official", source_label: "XPHB 2024", is_builtin: true,
      mechanical_summary: "Монах использует конечный запас Очков концентрации, масштабируемый куб Боевых искусств и уровневую боевую прогрессию.",
      is_active: true, created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    levels: levels.map((entry) => ({ id: `monk-level-${entry.level}`, template_id: "class-monk", level: entry.level, mechanics: entry.mechanics, choices: [] })),
  }
}

function inputAt(level: number, resources: CharacterEngineInput["state"]["resources"] = {}): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundleAt(level)], level)
  return {
    base: {
      id: "monk-test", name: "Монах", level,
      abilities: { strength: 10, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 8 },
      baseMaxHp: 80, baseSpeed: 30,
    },
    state: { currentHp: 80, tempHp: 0, resources },
    contributions: parsed.contributions,
  }
}

function valueOf(contract: ReturnType<typeof resolveCharacterContract>, key: string): number | undefined {
  return contract.values.find((entry) => entry.key === key)?.value.value
}

test("Monk migrations declare strict base-only integration", () => {
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:monk/)
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/monkOfficialPack\.test\.ts/)
  assert.match(migration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.doesNotMatch(migration, /subclass:monk:/)
  assert.match(auditMigration, /stored_mechanic_contract','current'/)
  assert.match(precisionMigration, /rules_precision_audited',true/)
})

test("base Monk passes strict class quality and resource policy", () => {
  assert.doesNotThrow(() => assertClassPackageQuality([bundleAt(20)]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundleAt(20)]))
})

test("Monk low, mid, and high levels resolve through parser into CE", () => {
  const low = resolveCharacterContract(inputAt(2))
  assert.equal(low.resources.find((entry) => entry.key === "monk_focus")?.max.value, 2)
  assert.equal(valueOf(low, "martial_arts_die_sides"), 6)
  assert.equal(valueOf(low, "unarmored_movement_bonus_feet"), 10)
  assert.equal(low.actions.find((entry) => entry.key === "flurry_of_blows")?.resourceCosts[0]?.amount, 1)

  const mid = resolveCharacterContract(inputAt(10))
  assert.equal(mid.resources.find((entry) => entry.key === "monk_focus")?.max.value, 10)
  assert.equal(valueOf(mid, "martial_arts_die_sides"), 8)
  assert.equal(valueOf(mid, "unarmored_movement_bonus_feet"), 20)
  assert.equal(valueOf(mid, "attacks_per_attack_action"), 2)
  assert.equal(valueOf(mid, "flurry_unarmed_strikes"), 3)

  const high = resolveCharacterContract(inputAt(20))
  assert.equal(high.resources.find((entry) => entry.key === "monk_focus")?.max.value, 20)
  assert.equal(valueOf(high, "martial_arts_die_sides"), 12)
  assert.equal(valueOf(high, "unarmored_movement_bonus_feet"), 30)
})

test("Uncanny Metabolism consumes its long-rest use and restores Focus to actual max", () => {
  const input = inputAt(2, { monk_focus: { current: 0 }, monk_uncanny_metabolism: { current: 1 } })
  const contract = resolveCharacterContract(input)
  const uncanny = contract.actions.find((entry) => entry.key === "uncanny_metabolism")
  assert.ok(uncanny)
  const next = executeAction(input.state, uncanny)
  assert.equal(next.resources?.monk_focus?.current, 2)
  assert.equal(next.resources?.monk_uncanny_metabolism?.current, 0)
})

test("Monk runtime does not fake initiative, hit, or duration as parser state", () => {
  const combined = `${migration}\n${auditMigration}\n${precisionMigration}`
  assert.doesNotMatch(combined, /"enforcement"\s*:\s*"gm"/)
  assert.doesNotMatch(combined, /'kind','state'/)
  assert.match(migration, /no_fake_scene_state/)
})
