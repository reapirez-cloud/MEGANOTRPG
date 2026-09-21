import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveBonusDamageDiceSacrifice,
  resolveCharacterContract,
} from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migrationPath =
  "supabase/migrations/20260921130000_rogue_stage3_core_runtime_v1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

function feature(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  description: string,
  mechanic: Record<string, unknown>,
): StoredMechanic {
  return {
    id,
    type: "grant",
    target: "feature",
    sourceKey,
    key,
    payload: { label, description, mechanic },
  }
}

const sacrifice = (diceCost: number, label: string) => ({
  kind: "semantic" as const,
  key: "bonus_damage_dice_sacrifice",
  payload: {
    poolValueKey: "rogue_sneak_attack_dice",
    diceCost,
    dieSides: 6,
    label,
  },
})

const rider = (riderKey: string, saveAbility?: string) => ({
  kind: "semantic" as const,
  key: "bonus_damage_rider",
  payload: {
    riderKey,
    ...(saveAbility
      ? {
          saveAbility,
          saveDcValueKey: "rogue_cunning_strike_save_dc",
        }
      : {}),
  },
})

function actionMechanic(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  economy: string,
  effects: Array<ReturnType<typeof sacrifice> | ReturnType<typeof rider> | {
    kind: "semantic"
    key: string
    payload: Record<string, unknown>
  }>,
  damage: Extract<StoredMechanic, { type: "action" }>["damage"] = [],
): StoredMechanic {
  return {
    id,
    type: "action",
    sourceKey,
    key,
    label,
    economy,
    range: { kind: "self" },
    effects,
    damage,
    tags: ["rogue"],
  }
}

function stage3Bundle(level: number): CharacterTemplateBundle {
  const levels: CharacterTemplateBundle["levels"] = Array.from(
    { length: 20 },
    (_, index) => ({
      id: `rogue-stage3-l${index + 1}`,
      template_id: "rogue-stage3",
      level: index + 1,
      mechanics: [] as StoredMechanics,
      choices: [],
    }),
  )

  const at = (sourceLevel: number) =>
    levels.find((entry) => entry.level === sourceLevel)!.mechanics

  for (const [sourceLevel, dice] of [
    [1, 1], [3, 2], [5, 3], [7, 4], [9, 5],
    [11, 6], [13, 7], [15, 8], [17, 9], [19, 10],
  ] as const) {
    at(sourceLevel).push({
      id: `rogue-sa-dice-${sourceLevel}`,
      type: "grant",
      target: "value",
      key: "rogue_sneak_attack_dice",
      sourceKey: "sneak-attack",
      grantOperation: "REPLACE",
      priority: sourceLevel,
      payload: { value: dice, label: "Кости Скрытой атаки" },
    })
  }

  at(1).push(
    feature(
      "rogue-sa-feature",
      "sneak-attack",
      "class:rogue:sneak-attack:l1",
      "Скрытая атака",
      "Один раз за ход при попадании подходящим оружием добавьте урон Скрытой атаки при Преимуществе либо при наличии дееспособного союзника рядом с целью и отсутствии Помехи.",
      {
        kind: "bonus_damage",
        diceValueKey: "rogue_sneak_attack_dice",
        dieSides: 6,
        cadence: "once_per_turn",
      },
    ),
    actionMechanic(
      "rogue-sa-action",
      "sneak-attack",
      "rogue_sneak_attack",
      "Скрытая атака",
      "triggered",
      [{
        kind: "semantic",
        key: "bonus_damage_trigger",
        payload: { cadence: "once_per_turn", sceneEligibility: "gm" },
      }],
      [{
        key: "sneak_attack",
        damageType: "same_as_weapon",
        count: { kind: "reference", key: "values.rogue_sneak_attack_dice" },
        sides: 6,
      }],
    ),
  )

  at(2).push(
    feature(
      "rogue-ca-feature",
      "cunning-action",
      "class:rogue:cunning-action:l2",
      "Хитрое действие",
      "На своём ходу бонусным действием совершите Рывок, Отход или Скрыться.",
      { kind: "action_options", economy: "bonus_action" },
    ),
    ...[
      ["dash", "Рывок"],
      ["disengage", "Отход"],
      ["hide", "Скрыться"],
    ].map(([key, label]) =>
      actionMechanic(
        `rogue-ca-${key}`,
        "cunning-action",
        `cunning_${key}`,
        `Хитрое действие: ${label}`,
        "bonus_action",
        [{
          kind: "semantic",
          key: "action_option",
          payload: { option: key },
        }],
      ),
    ),
  )

  at(3).push(
    feature(
      "rogue-steady-feature",
      "steady-aim",
      "class:rogue:steady-aim:l3",
      "Точный прицел",
      "Бонусным действием получите Преимущество на следующую атаку текущего хода, если до применения не перемещались; после применения Скорость становится 0 до конца хода.",
      {
        kind: "scene_action",
        economy: "bonus_action",
        precondition: "no_movement_this_turn",
      },
    ),
    actionMechanic(
      "rogue-steady-action",
      "steady-aim",
      "rogue_steady_aim",
      "Точный прицел",
      "bonus_action",
      [
        {
          kind: "semantic",
          key: "scene_precondition",
          payload: { condition: "no_movement_this_turn", enforcement: "gm" },
        },
        {
          kind: "semantic",
          key: "next_attack_advantage",
          payload: { duration: "current_turn" },
        },
        {
          kind: "semantic",
          key: "speed_override",
          payload: { value: 0, duration: "until_end_of_current_turn" },
        },
      ],
    ),
  )

  at(5).push(
    {
      id: "rogue-cs-dc",
      type: "grant",
      target: "value",
      key: "rogue_cunning_strike_save_dc",
      sourceKey: "cunning-strike",
      grantOperation: "REPLACE",
      priority: 5,
      payload: {
        label: "СЛ Хитрого удара",
        value: {
          kind: "add",
          terms: [
            { kind: "literal", value: 8 },
            { kind: "reference", key: "abilities.dexterity.modifier" },
            { kind: "reference", key: "core.proficiencyBonus" },
          ],
        },
      },
    },
    feature(
      "rogue-cs-feature",
      "cunning-strike",
      "class:rogue:cunning-strike:l5",
      "Хитрый удар",
      "При нанесении урона Скрытой атакой откажитесь от указанного числа к6 и примените один эффект: Отравление, Подножка или Отступление. СЛ равна 8 + модификатор Ловкости + бонус мастерства.",
      {
        kind: "bonus_damage_riders",
        poolValueKey: "rogue_sneak_attack_dice",
        maxRiders: 1,
      },
    ),
    actionMechanic(
      "rogue-cs-poison",
      "cunning-strike",
      "rogue_cunning_strike_poison",
      "Хитрый удар: Отравление (−1к6)",
      "triggered",
      [sacrifice(1, "Отравление"), rider("poison", "constitution")],
    ),
    actionMechanic(
      "rogue-cs-trip",
      "cunning-strike",
      "rogue_cunning_strike_trip",
      "Хитрый удар: Подножка (−1к6)",
      "triggered",
      [sacrifice(1, "Подножка"), rider("trip", "dexterity")],
    ),
    actionMechanic(
      "rogue-cs-withdraw",
      "cunning-strike",
      "rogue_cunning_strike_withdraw",
      "Хитрый удар: Отступление (−1к6)",
      "triggered",
      [sacrifice(1, "Отступление"), rider("withdraw")],
    ),
  )

  at(11).push(
    feature(
      "rogue-ics-feature",
      "improved-cunning-strike",
      "class:rogue:improved-cunning-strike:l11",
      "Улучшенный хитрый удар",
      "При одной Скрытой атаке можно применить до двух разных эффектов Хитрого удара, оплачивая стоимость каждого эффекта отдельно.",
      { kind: "bonus_damage_rider_limit", maxRiders: 2, distinct: true },
    ),
    actionMechanic(
      "rogue-combo-poison-trip",
      "improved-cunning-strike",
      "rogue_combo_poison_trip",
      "Хитрый удар: Отравление + Подножка (−2к6)",
      "triggered",
      [
        sacrifice(2, "Отравление + Подножка"),
        rider("poison", "constitution"),
        rider("trip", "dexterity"),
      ],
    ),
  )

  at(14).push(
    feature(
      "rogue-ds-feature",
      "devious-strikes",
      "class:rogue:devious-strikes:l14",
      "Коварные удары",
      "Добавьте к Хитрому удару три эффекта: Оглушение чувств за 2к6, Затемнение зрения за 3к6 и Нокаут за 6к6.",
      { kind: "bonus_damage_rider_catalog_extension" },
    ),
    actionMechanic(
      "rogue-daze",
      "devious-strikes",
      "rogue_devious_daze",
      "Коварный удар: Оглушение чувств (−2к6)",
      "triggered",
      [sacrifice(2, "Оглушение чувств"), rider("daze", "constitution")],
    ),
    actionMechanic(
      "rogue-obscure",
      "devious-strikes",
      "rogue_devious_obscure",
      "Коварный удар: Затемнение зрения (−3к6)",
      "triggered",
      [sacrifice(3, "Затемнение зрения"), rider("obscure", "dexterity")],
    ),
    actionMechanic(
      "rogue-knockout",
      "devious-strikes",
      "rogue_devious_knockout",
      "Коварный удар: Нокаут (−6к6)",
      "triggered",
      [sacrifice(6, "Нокаут"), rider("knock_out", "constitution")],
    ),
  )

  return {
    assignment: {
      id: "rogue-stage3-assignment",
      character_id: "rogue-stage3-character",
      template_id: "rogue-stage3",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    template: {
      id: "rogue-stage3",
      campaign_id: "campaign",
      kind: "class",
      slug: "rogue-core",
      name: "Разбойник",
      description: "Разбойник 2024 использует навыки, Скрытую атаку, мобильность и точные приёмы Хитрого удара.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:rogue",
      catalog_revision: "xphb-2024-rogue-stage3-core-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Разбойник 2024: Скрытая атака 1к6–10к6, Хитрое действие, Точный прицел, Хитрый удар и Коварные удары с точной уровневой прогрессией.",
      author_description: "",
      author_comment: "",
      rules_meta: { mechanics_status: "IN_PROGRESS_STAGE3_CORE_RUNTIME_READY" },
      is_active: true,
      created_by: null,
      created_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    levels,
  }
}

function resolveRogue(level: number) {
  const bundle = stage3Bundle(level)
  const parsed = resolveTemplateBundles([bundle], level)
  const contract = resolveCharacterContract({
    base: {
      id: "rogue-stage3-character",
      name: "Разбойник",
      level,
      abilities: {
        strength: 10,
        dexterity: 18,
        constitution: 14,
        intelligence: 12,
        wisdom: 10,
        charisma: 12,
      },
      baseMaxHp: 40,
      baseSpeed: 30,
    },
    state: { currentHp: 40, tempHp: 0 },
    contributions: parsed.contributions,
  })
  return { bundle, parsed, contract }
}

test("Rogue Stage 3 migration declares the shared strict mechanics boundary", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:rogue/)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/rogueRuntimeStage3Core\.test\.ts/)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/)
  assert.match(migration, /xphb-2024-rogue-stage3-core-runtime-v1/)
  assert.doesNotMatch(migration, /mechanics_status','READY'/)
})

test("representative Stage 3 package passes the same class/resource/parser/CE gates", () => {
  for (const level of [1, 3, 5, 11, 14, 20]) {
    const { bundle, parsed, contract } = resolveRogue(level)
    assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
    assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))
    assert.ok(parsed.contributions.length > 0)
    assert.equal(contract.id, "rogue-stage3-character")
  }
})

test("Sneak Attack is resolved as actual scaling bonus-damage dice", () => {
  const l1 = resolveRogue(1).contract
  const l5 = resolveRogue(5).contract
  const l20 = resolveRogue(20).contract

  assert.equal(l1.values.find((value) => value.key === "rogue_sneak_attack_dice")?.value.value, 1)
  assert.equal(l5.values.find((value) => value.key === "rogue_sneak_attack_dice")?.value.value, 3)
  assert.equal(l20.values.find((value) => value.key === "rogue_sneak_attack_dice")?.value.value, 10)

  const action = l20.actions.find((entry) => entry.key === "rogue_sneak_attack")
  assert.ok(action)
  assert.equal(action.damage[0]?.dice?.count, 10)
  assert.equal(action.damage[0]?.dice?.sides, 6)
})

test("Cunning Action and Steady Aim use ordinary shared CE actions", () => {
  const contract = resolveRogue(3).contract
  for (const key of [
    "cunning_dash",
    "cunning_disengage",
    "cunning_hide",
    "rogue_steady_aim",
  ]) {
    assert.ok(contract.actions.some((action) => action.key === key), key)
  }
  assert.equal(
    contract.actions.find((action) => action.key === "rogue_steady_aim")?.economy,
    "bonus_action",
  )
})

test("Cunning Strike has a resolved Dexterity save DC and generic dice sacrifice", () => {
  const contract = resolveRogue(5).contract
  assert.equal(
    contract.values.find((value) => value.key === "rogue_cunning_strike_save_dc")?.value.value,
    15,
  )

  const poison = contract.actions.find(
    (action) => action.key === "rogue_cunning_strike_poison",
  )
  assert.ok(poison)

  const sacrificeResult = resolveBonusDamageDiceSacrifice(
    poison,
    contract.values,
  )
  assert.deepEqual(sacrificeResult, {
    poolValueKey: "rogue_sneak_attack_dice",
    diceCost: 1,
    dieSides: 6,
    poolDice: 3,
    remainingDice: 2,
    label: "Отравление",
  })
})

test("Improved Cunning Strike exposes an exact summed-cost two-rider action", () => {
  const contract = resolveRogue(11).contract
  const combo = contract.actions.find(
    (action) => action.key === "rogue_combo_poison_trip",
  )
  assert.ok(combo)
  assert.equal(
    combo.effects.filter(
      (effect) => effect.kind === "semantic" && effect.key === "bonus_damage_rider",
    ).length,
    2,
  )
  assert.equal(
    resolveBonusDamageDiceSacrifice(combo, contract.values)?.diceCost,
    2,
  )
})

test("Devious Strikes expose the exact 2d6/3d6/6d6 costs", () => {
  const contract = resolveRogue(14).contract
  const expected: Array<[string, number]> = [
    ["rogue_devious_daze", 2],
    ["rogue_devious_obscure", 3],
    ["rogue_devious_knockout", 6],
  ]
  for (const [key, cost] of expected) {
    const action = contract.actions.find((entry) => entry.key === key)
    assert.ok(action, key)
    assert.equal(
      resolveBonusDamageDiceSacrifice(action, contract.values)?.diceCost,
      cost,
      key,
    )
  }
})

test("production migration encodes every Cunning Action and Cunning/Devious Strike route without Rogue engine branches", () => {
  for (const marker of [
    "rogue-cunning-action-dash",
    "rogue-cunning-action-disengage",
    "rogue-cunning-action-hide",
    "rogue-steady-aim-action",
    "rogue-cunning-strike-poison",
    "rogue-cunning-strike-trip",
    "rogue-cunning-strike-withdraw",
    "rogue-devious-strike-daze",
    "rogue-devious-strike-obscure",
    "rogue-devious-strike-knockout",
    "bonus_damage_dice_sacrifice",
    "bonus_damage_rider_combination",
  ]) {
    assert.ok(migration.includes(marker), marker)
  }
  assert.doesNotMatch(
    fs.readFileSync("src/character-engine/actionSemantics.ts", "utf8"),
    /rogue|cunning|sneak/i,
  )
})

test("Stage 3 does not activate Rogue subclasses or pretend the class is complete", () => {
  assert.match(migration, /subclass_runtime_included',false/)
  assert.match(migration, /ROGUE_STAGE3_SUBCLASS_RUNTIME_LEAK/)
  assert.match(migration, /remaining_base_runtime_pending_stage4',true/)
})
