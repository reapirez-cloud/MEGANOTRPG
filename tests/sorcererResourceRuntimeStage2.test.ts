import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { executeAction, resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migrationPath = "supabase/migrations/20260908192000_sorcerer_stage2_resource_runtime_v1.sql"
const migration = readFileSync(migrationPath, "utf8")

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description } }
}

const levels: Array<{ level: number; mechanics: StoredMechanics }> = [
  {
    level: 1,
    mechanics: [
      feature("innate-feature", "innate-sorcery", "class:sorcerer:innate-sorcery:l1", "Врождённое чародейство", "Бонусным действием вы высвобождаете врождённую магию на 1 минуту. Сл спасброска заклинаний чародея увеличивается на 1, а броски атаки заклинаниями чародея совершаются с преимуществом. Использований: 2; все потраченные использования восстанавливаются после долгого отдыха."),
      { id: "innate-resource", type: "resource", sourceKey: "innate-sorcery", key: "innate_sorcery", label: "Врождённое чародейство", max: 2, recharge: ["long_rest"], initial: "full" },
      { id: "innate-action", type: "action", sourceKey: "innate-sorcery", key: "innate_sorcery", label: "Врождённое чародейство", economy: "bonus_action", resourceCosts: [{ key: "innate_sorcery", amount: 1 }], effects: [{ kind: "semantic", key: "activate_innate_sorcery", payload: { duration_minutes: 1, sorcerer_spell_save_dc_bonus: 1, sorcerer_spell_attack_advantage: true } }], tags: ["class", "sorcerer"] },
    ],
  },
  {
    level: 2,
    mechanics: [
      feature("font-feature", "font-of-magic", "class:sorcerer:font-of-magic:l2", "Источник магии", "Со 2 уровня у вас есть Очки чародейства. Максимум очков равен вашему уровню чародея, и все потраченные Очки чародейства восстанавливаются после долгого отдыха. Способы расходования этого запаса определяются отдельными способностями класса."),
      { id: "sorcery-resource", type: "resource", sourceKey: "font-of-magic", key: "sorcery_points", label: "Очки чародейства", max: { kind: "reference", key: "source.level" }, recharge: ["long_rest"], initial: "full" },
    ],
  },
  {
    level: 5,
    mechanics: [
      feature("restoration-feature", "sorcerous-restoration", "class:sorcerer:sorcerous-restoration:l5", "Чародейское восстановление", "Когда вы заканчиваете короткий отдых, вы можете восстановить потраченные Очки чародейства в количестве не больше половины вашего уровня чародея с округлением вниз. После такого восстановления способность нельзя использовать снова до окончания долгого отдыха."),
      { id: "restoration-resource", type: "resource", sourceKey: "sorcerous-restoration", key: "sorcerous_restoration", label: "Чародейское восстановление", max: 1, recharge: ["long_rest"], initial: "full" },
      { id: "restoration-value-5", type: "grant", sourceKey: "sorcerous-restoration", target: "value", key: "sorcerous_restoration_amount", grantOperation: "REPLACE", priority: 5, payload: { label: "Возврат Очков чародейства", value: 2 } },
      { id: "restoration-action", type: "action", sourceKey: "sorcerous-restoration", key: "sorcerous_restoration", label: "Чародейское восстановление", economy: "special", resourceCosts: [{ key: "sorcerous_restoration", amount: 1 }], effects: [{ kind: "resource", key: "sorcery_points", operation: "RESTORE", amount: { kind: "reference", key: "values.sorcerous_restoration_amount" } }], tags: ["class", "sorcerer", "short_rest"] },
    ],
  },
  ...Array.from({ length: 15 }, (_, index) => {
    const level = index + 6
    const value = Math.floor(level / 2)
    return {
      level,
      mechanics: [{ id: `restoration-value-${level}`, type: "grant", sourceKey: "sorcerous-restoration", target: "value", key: "sorcerous_restoration_amount", grantOperation: "REPLACE", priority: level, payload: { label: "Возврат Очков чародейства", value } } as StoredMechanic],
    }
  }),
]

function bundleAt(level: number): CharacterTemplateBundle {
  return {
    assignment: { id: "sorcerer-assignment", character_id: "sorcerer-character", template_id: "class-sorcerer", template_level: level, selected_choices: {}, assigned_at: "2026-09-08T00:00:00Z", updated_at: "2026-09-08T00:00:00Z" },
    template: {
      id: "class-sorcerer", campaign_id: "campaign", kind: "class", slug: "sorcerer-core", name: "Чародей",
      description: "Базовый класс чародея 2024 с врождённой магией и управляемым запасом Очков чародейства.", version: 1,
      mechanics: [], choices: [], catalog_key: "class:sorcerer", catalog_revision: "xphb-2024-sorcerer-stage2-resource-v1",
      source_kind: "official", source_label: "Player's Handbook 2024", is_builtin: true,
      mechanical_summary: "Чародей использует Харизму, два применения Врождённого чародейства и уровень-зависимый запас Очков чародейства с восстановлением после отдыха.",
      is_active: true, created_by: null, created_at: "2026-09-08T00:00:00Z", updated_at: "2026-09-08T00:00:00Z",
    },
    levels: levels.map((entry) => ({ id: `sorcerer-level-${entry.level}`, template_id: "class-sorcerer", level: entry.level, mechanics: entry.mechanics, choices: [] })),
  }
}

function inputAt(level: number, resources: CharacterEngineInput["state"]["resources"] = {}): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundleAt(level)], level)
  return {
    base: { id: "sorcerer-test", name: "Чародей", level, abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 }, baseMaxHp: 60, baseSpeed: 30 },
    state: { currentHp: 60, tempHp: 0, resources },
    contributions: parsed.contributions,
  }
}

test("Stage 2 declares strict class and persistent-resource contracts", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE: mechanics/)
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:sorcerer/)
  assert.match(migration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/sorcererResourceRuntimeStage2\.test\.ts/)
})

test("Sorcerer Stage 2 resource package passes shared quality and resource gates", () => {
  assert.doesNotThrow(() => assertClassPackageQuality([bundleAt(20)]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundleAt(20)]))
})

test("Sorcery Points follow Sorcerer level and do not exist at level 1", () => {
  const level1 = resolveCharacterContract(inputAt(1))
  assert.equal(level1.resources.find((entry) => entry.key === "sorcery_points"), undefined)
  assert.equal(level1.resources.find((entry) => entry.key === "innate_sorcery")?.max.value, 2)

  const level2 = resolveCharacterContract(inputAt(2))
  assert.equal(level2.resources.find((entry) => entry.key === "sorcery_points")?.max.value, 2)

  const level10 = resolveCharacterContract(inputAt(10))
  assert.equal(level10.resources.find((entry) => entry.key === "sorcery_points")?.max.value, 10)

  const level20 = resolveCharacterContract(inputAt(20))
  assert.equal(level20.resources.find((entry) => entry.key === "sorcery_points")?.max.value, 20)
})

test("Innate Sorcery spends its canonical two-use Long Rest pool", () => {
  const input = inputAt(2, { innate_sorcery: { current: 2 }, sorcery_points: { current: 2 } })
  const contract = resolveCharacterContract(input)
  const action = contract.actions.find((entry) => entry.key === "innate_sorcery")
  assert.ok(action)
  const next = executeAction(input.state, action)
  assert.equal(next.resources?.innate_sorcery?.current, 1)
})

test("Sorcerous Restoration restores the level-scaled amount and consumes one use", () => {
  const input = inputAt(10, { innate_sorcery: { current: 0 }, sorcery_points: { current: 1 }, sorcerous_restoration: { current: 1 } })
  const contract = resolveCharacterContract(input)
  assert.equal(contract.values.find((entry) => entry.key === "sorcerous_restoration_amount")?.value.value, 5)
  const action = contract.actions.find((entry) => entry.key === "sorcerous_restoration")
  assert.ok(action)
  const next = executeAction(input.state, action)
  assert.equal(next.resources?.sorcery_points?.current, 5)
  assert.equal(next.resources?.sorcerous_restoration?.current, 0)
})

test("Stage 2 persistence sync preserves spent deficit across level changes", () => {
  assert.match(migration, /current=greatest\(0,excluded\.max_snapshot-greatest\(0,public\.character_resource_states\.max_snapshot-public\.character_resource_states\.current\)\)/)
  assert.match(migration, /v_resource\.state_key='sorcery_points'[\s\S]*v_max_numeric:=v_sorcerer_level/)
  assert.match(migration, /character_template_assignments_sync_sorcerer_resources_stage2_v1/)
  assert.match(migration, /ce_persistent_recharge_valid/)
})

test("Stage 2 deliberately leaves Font conversion and Metamagic execution pending", () => {
  assert.match(migration, /'font_of_magic_conversion_runtime',false/)
  assert.match(migration, /'metamagic_runtime_included',false/)
  assert.doesNotMatch(migration, /create_sorcerer_spell_slot|metamagic_option_action/)
})
