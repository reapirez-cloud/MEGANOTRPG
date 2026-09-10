import type { CharacterTemplateBundle } from "../../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../../src/types/characterMechanics.ts"

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description } }
}

const levels: Array<{ level: number; mechanics: StoredMechanics }> = [
  {
    level: 1,
    mechanics: [
      feature(
        "innate-feature",
        "innate-sorcery",
        "class:sorcerer:innate-sorcery:l1",
        "Врождённое чародейство",
        "Бонусным действием вы высвобождаете врождённую магию на 1 минуту. Сл спасброска заклинаний чародея увеличивается на 1, а броски атаки заклинаниями чародея совершаются с преимуществом. Использований: 2; все потраченные использования восстанавливаются после долгого отдыха.",
      ),
      { id: "innate-resource", type: "resource", sourceKey: "innate-sorcery", key: "innate_sorcery", label: "Врождённое чародейство", max: 2, recharge: ["long_rest"], initial: "full" },
      { id: "innate-action", type: "action", sourceKey: "innate-sorcery", key: "innate_sorcery", label: "Врождённое чародейство", economy: "bonus_action", resourceCosts: [{ key: "innate_sorcery", amount: 1 }], effects: [{ kind: "semantic", key: "activate_innate_sorcery", payload: { duration_minutes: 1, sorcerer_spell_save_dc_bonus: 1, sorcerer_spell_attack_advantage: true } }], tags: ["class", "sorcerer"] },
    ],
  },
  {
    level: 2,
    mechanics: [
      feature(
        "font-feature",
        "font-of-magic",
        "class:sorcerer:font-of-magic:l2",
        "Источник магии",
        "Со 2 уровня у вас есть Очки чародейства. Максимум очков равен вашему уровню чародея, и все потраченные Очки чародейства восстанавливаются после долгого отдыха. Способы расходования этого запаса определяются отдельными способностями класса.",
      ),
      { id: "sorcery-resource", type: "resource", sourceKey: "font-of-magic", key: "sorcery_points", label: "Очки чародейства", max: { kind: "reference", key: "source.level" }, recharge: ["long_rest"], initial: "full" },
    ],
  },
  {
    level: 5,
    mechanics: [
      feature(
        "restoration-feature",
        "sorcerous-restoration",
        "class:sorcerer:sorcerous-restoration:l5",
        "Чародейское восстановление",
        "Когда вы заканчиваете короткий отдых, вы можете восстановить потраченные Очки чародейства в количестве не больше половины вашего уровня чародея с округлением вниз. После такого восстановления способность нельзя использовать снова до окончания долгого отдыха.",
      ),
      { id: "restoration-resource", type: "resource", sourceKey: "sorcerous-restoration", key: "sorcerous_restoration", label: "Чародейское восстановление", max: 1, recharge: ["long_rest"], initial: "full" },
      { id: "restoration-value-5", type: "grant", sourceKey: "sorcerous-restoration", target: "value", key: "sorcerous_restoration_amount", grantOperation: "REPLACE", priority: 5, payload: { label: "Возврат Очков чародейства", value: 2 } },
      { id: "restoration-action", type: "action", sourceKey: "sorcerous-restoration", key: "sorcerous_restoration", label: "Чародейское восстановление", economy: "special", resourceCosts: [{ key: "sorcerous_restoration", amount: 1 }], effects: [{ kind: "resource", key: "sorcery_points", operation: "RESTORE", amount: { kind: "reference", key: "values.sorcerous_restoration_amount" } }], tags: ["class", "sorcerer", "short_rest"] },
    ],
  },
  ...([[7, 3], [9, 4], [11, 5], [13, 6], [15, 7], [17, 8], [19, 9], [20, 10]] as const).map(([level, value]) => ({
    level,
    mechanics: [
      {
        id: `restoration-value-${level}`,
        type: "grant",
        sourceKey: "sorcerous-restoration",
        target: "value",
        key: "sorcerous_restoration_amount",
        grantOperation: "REPLACE",
        priority: level,
        payload: { label: "Возврат Очков чародейства", value },
      } as StoredMechanic,
    ],
  })),
]

export function sorcererRuntimePackageFixture(level = 20): CharacterTemplateBundle {
  return {
    assignment: {
      id: "sorcerer-runtime-gate-assignment",
      character_id: "sorcerer-runtime-gate-character",
      template_id: "class-sorcerer-runtime-gate",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-08T00:00:00Z",
      updated_at: "2026-09-08T00:00:00Z",
    },
    template: {
      id: "class-sorcerer-runtime-gate",
      campaign_id: "campaign",
      kind: "class",
      slug: "sorcerer-core",
      name: "Чародей",
      description: "Базовый класс чародея 2024 с врождённой магией и управляемым запасом Очков чародейства.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:sorcerer",
      catalog_revision: "xphb-2024-sorcerer-runtime-gate",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Чародей использует Харизму, два применения Врождённого чародейства и уровень-зависимый запас Очков чародейства с восстановлением после отдыха.",
      is_active: true,
      created_by: null,
      created_at: "2026-09-08T00:00:00Z",
      updated_at: "2026-09-08T00:00:00Z",
    },
    levels: levels.map((entry) => ({
      id: `sorcerer-runtime-gate-level-${entry.level}`,
      template_id: "class-sorcerer-runtime-gate",
      level: entry.level,
      mechanics: entry.mechanics,
      choices: [],
    })),
  }
}
