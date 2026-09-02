import type { FormulaExpression, SpellCastingMethodDefinition, SpellResourceOption } from "../character-engine/index.ts"
import { recoverableStateKey } from "../character-engine/stateLifecycle.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"
import { WIZARD_SUBCLASSES } from "./wizardSubclasses.ts"

export const WIZARD_SUBCLASS_RUNTIME_REVISION = "wizard-subclasses-runtime@3" as const
export const WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS = [
  "subclass:wizard:abjurer",
  "subclass:wizard:diviner",
  "subclass:wizard:evoker",
  "subclass:wizard:illusionist",
  "subclass:wizard:enchantment",
  "subclass:wizard:conjuration",
  "subclass:wizard:necromancy",
  "subclass:wizard:transmutation",
  "subclass:wizard:war-magic",
  "subclass:wizard:bladesinging",
  "subclass:wizard:order-of-scribes",
  "subclass:wizard:graviturgy",
  "subclass:wizard:chronurgy",
] as const

const now = "2026-09-02T00:00:00Z"
const wizardParentId = "wizard-subclass-runtime-parent"

const lit = (value: number): FormulaExpression => ({ kind: "literal", value })
const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })
const mul = (...factors: FormulaExpression[]): FormulaExpression => ({ kind: "multiply", factors })
const max = (...values: FormulaExpression[]): FormulaExpression => ({ kind: "max", values })

const sourceLevel = ref("source.level")
const intMod = ref("abilities.intelligence.modifier")
const spellDc = add(lit(8), ref("core.proficiencyBonus"), intMod)
const spellAttack = add(ref("core.proficiencyBonus"), intMod)

type School = "abjuration" | "divination" | "evocation" | "illusion"
type RuntimeSpellCastingMethod = Omit<SpellCastingMethodDefinition, "resourceOptions"> & {
  resourceOptions?: Array<SpellResourceOption & { label?: string }>
}
type FeatureLevel = 3 | 6 | 10 | 14

type RuntimeSubclass = {
  id:
    | "abjurer"
    | "diviner"
    | "evoker"
    | "illusionist"
    | "enchantment"
    | "conjuration"
    | "necromancy"
    | "transmutation"
    | "war-magic"
    | "bladesinging"
    | "order-of-scribes"
    | "graviturgy"
    | "chronurgy"
  slug: string
  catalogKey: (typeof WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS)[number]
  name: string
  description: string
  summary: string
  levels: Record<FeatureLevel, StoredMechanics>
  choicesByLevel?: Partial<Record<FeatureLevel, RuleChoiceDefinition[]>>
}

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
    sourceKey,
    target: "feature",
    key,
    payload: { label, description, mechanic },
  } as StoredMechanic
}

function permission(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  school: School,
): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey,
    target: "permission",
    key,
    payload: {
      label,
      school,
      destination: "spellbook",
      initialSpells: 2,
      initialMaxSpellLevel: 2,
      additionalSpellOnNewSlotLevel: 1,
    },
  } as StoredMechanic
}

function schoolSavant(prefix: RuntimeSubclass["id"], school: School, label: string): StoredMechanics {
  const sourceKey = `wizard:${prefix}:savant`
  const ru = label.replace("Знаток ", "")
  return [
    feature(
      `${prefix}-savant-rules`,
      sourceKey,
      `subclass:wizard:${prefix}:savant`,
      label,
      `При получении подкласса добавьте в книгу два заклинания Волшебника школы ${ru} не выше 2 уровня. Каждый раз, когда Волшебник впервые получает ячейки нового уровня, добавьте ещё одно заклинание Волшебника этой школы доступного уровня. Эти заклинания не занимают обычные два заклинания за уровень.`,
      {
        kind: "wizard_school_savant",
        school,
        addsToSpellbook: true,
        initialSpells: 2,
        initialMaxSpellLevel: 2,
        additionalSpellOnNewSlotLevel: 1,
      },
    ),
    permission(
      `${prefix}-savant-permission`,
      sourceKey,
      `wizard.school_savant.${school}`,
      `Бесплатные заклинания: ${ru}`,
      school,
    ),
  ]
}

function legacySavant(
  prefix: RuntimeSubclass["id"],
  school: string,
  schoolLabel: string,
): StoredMechanic {
  return feature(
    `${prefix}-legacy-savant-rules`,
    `wizard:${prefix}:savant`,
    `subclass:wizard:${prefix}:savant`,
    `Знаток ${schoolLabel}`,
    `Время и золото, необходимые для переписывания заклинания школы ${schoolLabel} в книгу заклинаний, уменьшаются вдвое. Эту транзакцию подтверждает ГМ.`,
    { kind: "wizard_legacy_school_savant", school, copyTimeMultiplier: 0.5, copyGoldMultiplier: 0.5 },
  )
}

function initiativeWithInt(prefix: RuntimeSubclass["id"], label: string): StoredMechanic {
  return {
    id: `${prefix}-initiative-formula`,
    type: "formula",
    sourceKey: `wizard:${prefix}:initiative`,
    label,
    target: "combat.initiative",
    operation: "SET_FORMULA",
    formula: add(ref("abilities.dexterity.modifier"), intMod),
  }
}

function resource(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  max: number | FormulaExpression,
  recharge: "long_rest" | Array<"short_rest" | "long_rest">,
  initial: "full" | "empty" | number = "full",
  recoveryRules?: Array<
    | { trigger: "short_rest" | "long_rest"; restore: "full" }
    | { trigger: "short_rest" | "long_rest"; restore: "amount" | "set"; amount: number }
  >,
): StoredMechanic {
  return {
    id,
    type: "resource",
    sourceKey,
    key,
    label,
    max,
    recharge,
    restore: "full",
    initial,
    ...(recoveryRules?.length ? { recoveryRules } : {}),
    presentation: { tone: "violet", display: "pips" },
  } as StoredMechanic
}

function action(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  economy: string,
  extra: Record<string, unknown> = {},
): StoredMechanic {
  return { id, type: "action", sourceKey, key, label, economy, ...extra } as StoredMechanic
}

function slotOptions(from: number, to = 9) {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const level = from + index
    return {
      key: `slot-${level}`,
      castLevel: level,
      label: `Ячейка ${level} уровня`,
      costs: [{ key: `spell_slot_${level}`, amount: 1 }],
    }
  })
}

function wardSlotActions(sourceKey: string, createdStateKey: string): StoredMechanics {
  return Array.from({ length: 9 }, (_, index) => {
    const level = index + 1
    return action(
      `abjurer-ward-spend-slot-${level}`,
      sourceKey,
      `abjurer_ward_spend_slot_${level}`,
      `Подпитать Тайный заслон ячейкой ${level} уровня`,
      "bonus_action",
      {
        resourceCosts: [{ key: `spell_slot_${level}`, amount: 1 }],
        requirements: [
          {
            kind: "condition",
            condition: { kind: "state", key: createdStateKey, operator: "EQUALS", value: true },
            label: "Тайный заслон уже создан",
          },
        ],
        effects: [
          { kind: "resource", key: "wizard_abjurer_arcane_ward", operation: "RESTORE", amount: level * 2 },
        ],
        tags: ["wizard", "subclass", "resource-conversion", `slot:${level}`],
      },
    )
  })
}

function wardCastRestoreActions(sourceKey: string, createdStateKey: string): StoredMechanics {
  return Array.from({ length: 9 }, (_, index) => {
    const level = index + 1
    return action(
      `abjurer-ward-cast-restore-${level}`,
      sourceKey,
      `abjurer_ward_cast_restore_${level}`,
      `Учесть Ограждение ячейкой ${level} уровня`,
      "special",
      {
        effects: [
          { kind: "state", key: createdStateKey, operation: "SET", value: true },
          { kind: "resource", key: "wizard_abjurer_arcane_ward", operation: "RESTORE", amount: level * 2 },
          {
            kind: "semantic",
            key: "arcane_ward_abjuration_cast",
            payload: { slotLevel: level, createsWardIfAbsent: true },
          },
        ],
        tags: ["wizard", "subclass", "gm-adjudicated-trigger", `slot:${level}`],
      },
    )
  })
}

function restoreSlotActions(
  prefix: string,
  sourceKey: string,
  from: number,
  to: number,
  label: string,
): StoredMechanics {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const level = from + index
    return action(
      `${prefix}-slot-${level}`,
      sourceKey,
      `${prefix}_slot_${level}`,
      `${label} ${level} уровня`,
      "special",
      {
        effects: [{ kind: "resource", key: `spell_slot_${level}`, operation: "RESTORE", amount: 1 }],
        tags: ["wizard", "subclass", "gm-adjudicated-trigger", "slot-restore", `slot:${level}`],
      },
    )
  })
}

function restoreBySlotActions(
  prefix: string,
  sourceKey: string,
  from: number,
  to: number,
  target: string,
  label: string,
): StoredMechanics {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const level = from + index
    return action(
      `${prefix}-slot-${level}`,
      sourceKey,
      `${prefix}_slot_${level}`,
      `${label} ${level} уровня`,
      "special",
      {
        resourceCosts: [{ key: `spell_slot_${level}`, amount: 1 }],
        effects: [{ kind: "resource", key: target, operation: "RESTORE", amount: 1 }],
        tags: ["wizard", "subclass", "resource-conversion", `slot:${level}`],
      },
    )
  })
}

function spell(
  id: string,
  sourceKey: string,
  slug: string,
  name: string,
  level: number,
  school: string,
  preparation: "prepared" | "always_prepared" | "not_required",
  methods: RuntimeSpellCastingMethod[],
): StoredMechanic {
  return {
    id,
    type: "spell",
    sourceKey,
    key: `spell:${slug}`,
    catalogSlug: slug,
    variantKey: `${sourceKey}:${slug}`,
    payload: { spell: { name, level, school }, preparation: { mode: preparation }, methods },
  } as StoredMechanic
}

function slotMethod(from: number, key = "slot"): RuntimeSpellCastingMethod {
  return {
    key,
    kind: "class_spell",
    ability: "intelligence",
    saveDc: spellDc,
    attackBonus: spellAttack,
    requiresPrepared: false,
    resourceOptions: slotOptions(from),
  }
}

function portentChoice(index: 1 | 2 | 3): RuleChoiceDefinition {
  const resourceKey = `wizard_diviner_portent_${index}`
  const choiceKey = `wizard_diviner_portent_${index}_value`
  const options = Array.from({ length: 20 }, (_, optionIndex) => String(optionIndex + 1))
  return {
    key: choiceKey,
    label: `Знамение ${index}: выпавшее значение d20`,
    target: "trait",
    options,
    option_labels: Object.fromEntries(options.map((value) => [value, `d20 = ${value}`])),
    count: 1,
    selection_mode: "player_once",
    refresh: "long_rest",
    option_mechanics: Object.fromEntries(
      options.map((value) => [
        value,
        [
          action(
            `diviner-portent-${index}-value-${value}`,
            "wizard:diviner:portent",
            `wizard_diviner_use_portent_${index}_${value}`,
            `Использовать Знамение ${index}: ${value}`,
            "special",
            {
              resourceCosts: [{ key: resourceKey, amount: 1 }],
              effects: [
                {
                  kind: "semantic",
                  key: "replace_d20_before_roll",
                  payload: { portentIndex: index, portentValue: Number(value) },
                },
              ],
              tags: ["wizard", "subclass", "d20", "gm-adjudicated-trigger"],
            },
          ),
        ],
      ]),
    ),
  }
}

const arcaneWardCreatedState = recoverableStateKey(
  "wizard_abjurer_arcane_ward_created",
  ["long_rest"],
)
const thirdEyeModeState = recoverableStateKey(
  "wizard_diviner_third_eye_mode",
  ["short_rest", "long_rest"],
)
const overchannelRepeatState = recoverableStateKey(
  "wizard_evoker_overchannel_repeat_count",
  ["long_rest"],
)
const convergentFutureExhaustionState = recoverableStateKey(
  "wizard_chronurgy_convergent_future_exhaustion",
  ["long_rest"],
)

const abjurerWardKey = "wizard:abjurer:arcane-ward"
const abjurer: RuntimeSubclass = {
  id: "abjurer",
  slug: "wizard-abjurer",
  catalogKey: "subclass:wizard:abjurer",
  name: "Абьюратор",
  description: "Абьюратор превращает Ограждение в рабочую защиту: книгу защитных заклинаний, Тайный заслон, защиту союзника и инструменты против чужих чар.",
  summary: "Тайный заслон хранит HP и факт создания до долгого отдыха; ситуативные боевые триггеры остаются на решении ГМ.",
  levels: {
    3: [
      ...schoolSavant("abjurer", "abjuration", "Знаток Ограждения"),
      resource(
        "abjurer-arcane-ward-hp",
        abjurerWardKey,
        "wizard_abjurer_arcane_ward",
        "HP Тайного заслона",
        add(mul(lit(2), sourceLevel), intMod),
        "long_rest",
      ),
      feature(
        "abjurer-arcane-ward-rules",
        abjurerWardKey,
        "subclass:wizard:abjurer:arcane-ward",
        "Тайный заслон",
        "Когда вы впервые после долгого отдыха накладываете заклинание Ограждения ячейкой, создайте Тайный заслон с максимумом HP, равным удвоенному уровню Волшебника + модификатор Интеллекта. Заслон существует до долгого отдыха даже при 0 HP. При каждом заклинании Ограждения, наложенном ячейкой, восстановите HP заслона на удвоенный уровень ячейки. Бонусным действием можно потратить ячейку и восстановить столько же HP.",
        {
          kind: "damage_buffer",
          resource: "wizard_abjurer_arcane_ward",
          createdState: arcaneWardCreatedState,
          maximum: "2 * wizard_level + intelligence_modifier",
          restoreOnAbjurationSlotCast: "2 * slot_level",
          bonusActionSlotRestore: true,
        },
      ),
      ...wardCastRestoreActions(abjurerWardKey, arcaneWardCreatedState),
      ...wardSlotActions(abjurerWardKey, arcaneWardCreatedState),
    ],
    6: [
      feature(
        "abjurer-projected-ward-rules",
        "wizard:abjurer:projected-ward",
        "subclass:wizard:abjurer:projected-ward",
        "Переданный заслон",
        "Когда видимое существо в пределах 30 футов получает урон, реакцией направьте на него созданный Тайный заслон. Урон уменьшает HP заслона; остаток получает защищаемое существо. Приложение не проверяет видимость, дистанцию или момент получения урона — это решает ГМ.",
        { kind: "reaction_damage_buffer", resource: "wizard_abjurer_arcane_ward", rangeFeet: 30, usesReaction: true },
      ),
      action(
        "abjurer-projected-ward-action",
        "wizard:abjurer:projected-ward",
        "wizard_abjurer_projected_ward",
        "Передать Тайный заслон",
        "reaction",
        {
          range: { kind: "ranged", normal: 30, unit: "ft" },
          requirements: [
            {
              kind: "condition",
              condition: { kind: "state", key: arcaneWardCreatedState, operator: "EQUALS", value: true },
              label: "Тайный заслон создан",
            },
            { kind: "resource", key: "wizard_abjurer_arcane_ward", minimum: 1, label: "У заслона есть HP" },
          ],
          effects: [
            {
              kind: "semantic",
              key: "damage_buffer_redirect",
              payload: { resource: "wizard_abjurer_arcane_ward", rangeFeet: 30 },
            },
          ],
          tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"],
        },
      ),
    ],
    10: [
      feature(
        "abjurer-spell-breaker-rules",
        "wizard:abjurer:spell-breaker",
        "subclass:wizard:abjurer:spell-breaker",
        "Разрушитель чар",
        "Контрзаклинание и Рассеивание магии всегда подготовлены и не занимают лимит подготовки. Рассеивание магии можно накладывать бонусным действием. Если Контрзаклинание или Рассеивание магии, наложенное ячейкой, не прекращает заклинание, ячейка не расходуется. ГМ определяет, когда условие выполнено; кнопка только возвращает соответствующую ячейку.",
        {
          kind: "spell_breaker",
          alwaysPrepared: ["counterspell", "dispel-magic"],
          dispelMagicBonusAction: true,
          addProficiencyToDispelCheck: true,
          refundSlotOnFailedBreak: true,
        },
      ),
      spell(
        "abjurer-counterspell-access",
        "wizard:abjurer:spell-breaker",
        "counterspell",
        "Контрзаклинание",
        3,
        "abjuration",
        "always_prepared",
        [slotMethod(3, "reaction")],
      ),
      spell(
        "abjurer-dispel-magic-access",
        "wizard:abjurer:spell-breaker",
        "dispel-magic",
        "Рассеивание магии",
        3,
        "abjuration",
        "always_prepared",
        [slotMethod(3), slotMethod(3, "spell-breaker-bonus-action")],
      ),
      ...restoreSlotActions(
        "abjurer_spell_breaker_refund",
        "wizard:abjurer:spell-breaker",
        3,
        9,
        "Вернуть ячейку Разрушителя чар",
      ),
    ],
    14: [
      feature(
        "abjurer-spell-resistance-rules",
        "wizard:abjurer:spell-resistance",
        "subclass:wizard:abjurer:spell-resistance",
        "Сопротивление заклинаниям",
        "Вы получаете преимущество на спасброски против заклинаний и сопротивление урону, источником которого является заклинание.",
        { kind: "spell_resistance", advantageOnSpellSavingThrows: true, resistanceToSpellDamage: true },
      ),
      {
        id: "abjurer-spell-damage-resistance",
        type: "grant",
        sourceKey: "wizard:abjurer:spell-resistance",
        target: "resistance",
        key: "damage:spell",
        payload: { label: "Сопротивление урону заклинаний" },
      } as StoredMechanic,
    ],
  },
}

const diviner: RuntimeSubclass = {
  id: "diviner",
  slug: "wizard-diviner",
  catalogKey: "subclass:wizard:diviner",
  name: "Прорицатель",
  description: "Прорицатель хранит реальные выпавшие Знамения до долгого отдыха и выбранный режим Третьего глаза до следующего отдыха.",
  summary: "Каждый d20 Знамения имеет собственное значение и собственный расход; Третий глаз хранит режим, а ситуативные условия остаются ГМу.",
  choicesByLevel: {
    3: [portentChoice(1), portentChoice(2)],
    14: [portentChoice(3)],
  },
  levels: {
    3: [
      ...schoolSavant("diviner", "divination", "Знаток Прорицания"),
      resource("diviner-portent-1", "wizard:diviner:portent", "wizard_diviner_portent_1", "Знамение 1", 1, "long_rest"),
      resource("diviner-portent-2", "wizard:diviner:portent", "wizard_diviner_portent_2", "Знамение 2", 1, "long_rest"),
      feature(
        "diviner-portent-rules",
        "wizard:diviner:portent",
        "subclass:wizard:diviner:portent",
        "Знамение",
        "После долгого отдыха бросьте два d20 и запишите каждое значение отдельно. До следующего долгого отдыха можно до броска d20 Теста видимого существа потратить одно записанное Знамение и заменить бросок его значением. Одно Знамение можно применить не более одного раза, а правило «раз в ход» не создаёт отдельного ресурса — момент применения контролирует ГМ.",
        {
          kind: "portent",
          resources: ["wizard_diviner_portent_1", "wizard_diviner_portent_2"],
          values: ["wizard_diviner_portent_1_value", "wizard_diviner_portent_2_value"],
          die: "d20",
          replaceBeforeRoll: true,
          perTurnLimit: 1,
        },
      ),
    ],
    6: [
      feature(
        "diviner-expert-divination-rules",
        "wizard:diviner:expert-divination",
        "subclass:wizard:diviner:expert-divination",
        "Опытное прорицание",
        "Когда вы накладываете заклинание Прорицания ячейкой 2 уровня или выше, восстановите одну потраченную ячейку более низкого уровня, но не выше 5. ГМ определяет, выполнено ли условие; приложение только возвращает выбранную ячейку.",
        { kind: "expert_divination", maximumRestoredSlotLevel: 5 },
      ),
      ...restoreSlotActions(
        "diviner_expert_restore",
        "wizard:diviner:expert-divination",
        1,
        5,
        "Вернуть ячейку Опытным прорицанием",
      ),
    ],
    10: [
      resource(
        "diviner-third-eye-use",
        "wizard:diviner:third-eye",
        "wizard_diviner_third_eye",
        "Третий глаз",
        1,
        ["short_rest", "long_rest"],
      ),
      feature(
        "diviner-third-eye-rules",
        "wizard:diviner:third-eye",
        "subclass:wizard:diviner:third-eye",
        "Третий глаз",
        "Бонусным действием выберите один режим до начала короткого или долгого отдыха: тёмное зрение 120 футов, чтение любого языка или возможность накладывать Видение невидимого без траты ячейки. После короткого или долгого отдыха режим заканчивается и использование восстанавливается.",
        {
          kind: "third_eye",
          resource: "wizard_diviner_third_eye",
          modeState: thirdEyeModeState,
          options: ["darkvision", "greater_comprehension", "see_invisibility"],
        },
      ),
      action(
        "diviner-third-eye-darkvision",
        "wizard:diviner:third-eye",
        "wizard_diviner_third_eye_darkvision",
        "Третий глаз: тёмное зрение",
        "bonus_action",
        {
          resourceCosts: [{ key: "wizard_diviner_third_eye", amount: 1 }],
          effects: [
            { kind: "state", key: thirdEyeModeState, operation: "SET", value: "darkvision" },
            { kind: "semantic", key: "third_eye_mode", payload: { mode: "darkvision", rangeFeet: 120 } },
          ],
        },
      ),
      action(
        "diviner-third-eye-comprehension",
        "wizard:diviner:third-eye",
        "wizard_diviner_third_eye_comprehension",
        "Третий глаз: читать любой язык",
        "bonus_action",
        {
          resourceCosts: [{ key: "wizard_diviner_third_eye", amount: 1 }],
          effects: [
            { kind: "state", key: thirdEyeModeState, operation: "SET", value: "greater_comprehension" },
            { kind: "semantic", key: "third_eye_mode", payload: { mode: "greater_comprehension", readAnyLanguage: true } },
          ],
        },
      ),
      action(
        "diviner-third-eye-see-invisibility",
        "wizard:diviner:third-eye",
        "wizard_diviner_third_eye_see_invisibility",
        "Третий глаз: Видение невидимого",
        "bonus_action",
        {
          resourceCosts: [{ key: "wizard_diviner_third_eye", amount: 1 }],
          effects: [
            { kind: "state", key: thirdEyeModeState, operation: "SET", value: "see_invisibility" },
            {
              kind: "semantic",
              key: "third_eye_mode",
              payload: { mode: "see_invisibility", castWithoutSlot: "see-invisibility" },
            },
          ],
        },
      ),
    ],
    14: [
      resource("diviner-portent-3", "wizard:diviner:portent", "wizard_diviner_portent_3", "Знамение 3", 1, "long_rest"),
      feature(
        "diviner-greater-portent-rules",
        "wizard:diviner:portent",
        "subclass:wizard:diviner:greater-portent",
        "Великое знамение",
        "После долгого отдыха бросайте и записывайте три d20 для Знамения вместо двух. Третье значение хранится и расходуется отдельно; дополнительного ресурса «Великого знамения» нет.",
        { kind: "portent_upgrade", addedResource: "wizard_diviner_portent_3", newMaximum: 3 },
      ),
    ],
  },
}

const evoker: RuntimeSubclass = {
  id: "evoker",
  slug: "wizard-evoker",
  catalogKey: "subclass:wizard:evoker",
  name: "Воплотитель",
  description: "Воплотитель усиливает прямой урон и хранит только то состояние, которое переживает конкретный бросок: безопасную Перегрузку и число повторных Перегрузок до отдыха.",
  summary: "Разовые боевые условия не становятся ресурсами; Перегрузка хранит безопасное использование и растущий счётчик отдачи до долгого отдыха.",
  levels: {
    3: [
      ...schoolSavant("evoker", "evocation", "Знаток Воплощения"),
      feature(
        "evoker-potent-cantrip-rules",
        "wizard:evoker:potent-cantrip",
        "subclass:wizard:evoker:potent-cantrip",
        "Мощный заговор",
        "Если наносящий урон заговор Волшебника промахивается атакой заклинанием или цель успешно проходит его спасбросок, цель всё равно получает половину урона заговора без дополнительных эффектов этого попадания. Это правило не создаёт ресурс.",
        { kind: "potent_cantrip", appliesTo: "wizard_cantrip_damage", missOrSuccessfulSave: "half_damage", noAdditionalEffects: true },
      ),
    ],
    6: [
      feature(
        "evoker-sculpt-spells-rules",
        "wizard:evoker:sculpt-spells",
        "subclass:wizard:evoker:sculpt-spells",
        "Ваяние заклинаний",
        "При сотворении заклинания Воплощения выберите до 1 + уровень заклинания видимых существ в его области. Они автоматически успешно проходят спасброски против этого заклинания и не получают урон, который при успехе обычно был бы половинным. Выбор действует только для этого заклинания и не сохраняется как ресурс.",
        { kind: "sculpt_spells", school: "evocation", protectedCreaturesFormula: "1 + spell_level", autoSaveSuccess: true, negatesHalfDamageOnSuccessfulSave: true },
      ),
    ],
    10: [
      feature(
        "evoker-empowered-evocation-rules",
        "wizard:evoker:empowered-evocation",
        "subclass:wizard:evoker:empowered-evocation",
        "Усиленное воплощение",
        "При сотворении заклинания Волшебника школы Воплощения добавьте модификатор Интеллекта к одному броску его урона. Ограничение «один раз на заклинание» не создаёт отдельный ресурс.",
        { kind: "spell_damage_modifier", appliesTo: "wizard_evocation_spell", modifier: "intelligence_modifier", oncePerSpell: true },
      ),
    ],
    14: [
      resource(
        "evoker-overchannel-safe-use",
        "wizard:evoker:overchannel",
        "wizard_evoker_overchannel_safe",
        "Безопасная перегрузка",
        1,
        "long_rest",
      ),
      feature(
        "evoker-overchannel-rules",
        "wizard:evoker:overchannel",
        "subclass:wizard:evoker:overchannel",
        "Перегрузка",
        "При сотворении наносящего урон заклинания Волшебника ячейкой 1–5 уровня можно назначить максимальный урон вместо броска в ход сотворения. Первое использование после долгого отдыха безопасно. При каждом повторном использовании до следующего долгого отдыха вы получаете некротическую отдачу: 2d12 за уровень ячейки при первом повторе и ещё +1d12 за уровень ячейки за каждый следующий повтор. Число повторов хранится до долгого отдыха.",
        {
          kind: "overchannel",
          resource: "wizard_evoker_overchannel_safe",
          repeatState: overchannelRepeatState,
          spellSlotMin: 1,
          spellSlotMax: 5,
          maximizeDamageThisTurn: true,
          repeatNecroticBacklash: { dicePerSlotLevel: "repeat_count + 1", ignoresResistanceAndImmunity: true },
        },
      ),
      action(
        "evoker-overchannel-safe-action",
        "wizard:evoker:overchannel",
        "wizard_evoker_overchannel_safe",
        "Перегрузить заклинание без отдачи",
        "special",
        {
          resourceCosts: [{ key: "wizard_evoker_overchannel_safe", amount: 1 }],
          effects: [
            { kind: "state", key: overchannelRepeatState, operation: "SET", value: 0 },
            { kind: "semantic", key: "maximize_spell_damage", payload: { slotMin: 1, slotMax: 5 } },
          ],
        },
      ),
      action(
        "evoker-overchannel-repeat-action",
        "wizard:evoker:overchannel",
        "wizard_evoker_overchannel_repeat",
        "Повторно перегрузить заклинание",
        "special",
        {
          requirements: [
            {
              kind: "condition",
              condition: { kind: "state", key: overchannelRepeatState, operator: "EXISTS" },
              label: "Сначала используйте безопасную Перегрузку после продолжительного отдыха",
            },
          ],
          effects: [
            { kind: "state", key: overchannelRepeatState, operation: "ADD", value: 1 },
            {
              kind: "semantic",
              key: "overchannel_repeat",
              payload: {
                slotMin: 1,
                slotMax: 5,
                counterState: overchannelRepeatState,
                backlashDicePerSlotLevel: "repeat_count + 1",
                damageType: "necrotic",
                ignoresResistanceAndImmunity: true,
              },
            },
          ],
          tags: ["wizard", "subclass", "persistent-counter"],
        },
      ),
    ],
  },
}

const illusionist: RuntimeSubclass = {
  id: "illusionist",
  slug: "wizard-illusionist",
  catalogKey: "subclass:wizard:illusionist",
  name: "Иллюзионист",
  description: "Иллюзионист хранит только реальные ограниченные применения: два бесплатных призыва и Иллюзорное я. Ситуативные условия Иллюзорной реальности остаются ГМу.",
  summary: "Бесплатные призывы и Иллюзорное я — ресурсы; разовые условия попадания, дистанции и существования иллюзии не становятся состоянием CE.",
  levels: {
    3: [
      ...schoolSavant("illusionist", "illusion", "Знаток Иллюзии"),
      feature(
        "illusionist-improved-illusions-rules",
        "wizard:illusionist:improved-illusions",
        "subclass:wizard:illusionist:improved-illusions",
        "Улучшенные иллюзии",
        "Заклинания Иллюзии можно накладывать без словесных компонентов. Их дальность увеличивается на 60 футов, если базовая дальность не меньше 10 футов. Вы знаете Малую иллюзию сверх лимита заговоров; она может одновременно создавать звук и изображение и может накладываться бонусным действием.",
        { kind: "improved_illusions", removeVerbalComponentsFromIllusionSpells: true, rangeBonusFeet: 60, minorIllusion: { granted: true, soundAndImageTogether: true, canCastAsBonusAction: true } },
      ),
      spell(
        "illusionist-minor-illusion-access",
        "wizard:illusionist:improved-illusions",
        "minor-illusion",
        "Малая иллюзия",
        0,
        "illusion",
        "not_required",
        [{ key: "cantrip", kind: "class_spell", ability: "intelligence", saveDc: spellDc, requiresPrepared: false }],
      ),
    ],
    6: [
      resource(
        "illusionist-free-summon-beast-resource",
        "wizard:illusionist:phantasmal-creatures",
        "wizard_illusionist_free_summon_beast",
        "Призрачный зверь без ячейки",
        1,
        "long_rest",
      ),
      resource(
        "illusionist-free-summon-fey-resource",
        "wizard:illusionist:phantasmal-creatures",
        "wizard_illusionist_free_summon_fey",
        "Призрачная фея без ячейки",
        1,
        "long_rest",
      ),
      feature(
        "illusionist-phantasmal-creatures-rules",
        "wizard:illusionist:phantasmal-creatures",
        "subclass:wizard:illusionist:phantasmal-creatures",
        "Фантомные существа",
        "Призыв зверя и Призыв феи всегда подготовлены. Каждое из них можно один раз до долгого отдыха наложить без ячейки; существо такого бесплатного призыва имеет половину обычных HP. Эти два бесплатных применения хранятся раздельно.",
        { kind: "phantasmal_creatures", alwaysPrepared: ["summon-beast", "summon-fey"], canTreatAsIllusion: true, freeCastEachPerLongRest: true, freeCastSummonHpMultiplier: 0.5 },
      ),
      spell(
        "illusionist-summon-beast-access",
        "wizard:illusionist:phantasmal-creatures",
        "summon-beast",
        "Призыв зверя",
        2,
        "conjuration",
        "always_prepared",
        [slotMethod(2)],
      ),
      spell(
        "illusionist-summon-fey-access",
        "wizard:illusionist:phantasmal-creatures",
        "summon-fey",
        "Призыв феи",
        3,
        "conjuration",
        "always_prepared",
        [slotMethod(3)],
      ),
      action("illusionist-free-summon-beast-action", "wizard:illusionist:phantasmal-creatures", "wizard_illusionist_free_summon_beast", "Призвать призрачного зверя без ячейки", "special", { resourceCosts: [{ key: "wizard_illusionist_free_summon_beast", amount: 1 }], effects: [{ kind: "semantic", key: "cast_class_spell_without_slot", payload: { spell: "summon-beast", summonedHitPointMultiplier: 0.5, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
      action("illusionist-free-summon-fey-action", "wizard:illusionist:phantasmal-creatures", "wizard_illusionist_free_summon_fey", "Призвать призрачную фею без ячейки", "special", { resourceCosts: [{ key: "wizard_illusionist_free_summon_fey", amount: 1 }], effects: [{ kind: "semantic", key: "cast_class_spell_without_slot", payload: { spell: "summon-fey", summonedHitPointMultiplier: 0.5, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    10: [
      resource(
        "illusionist-illusory-self-resource",
        "wizard:illusionist:illusory-self",
        "wizard_illusionist_illusory_self",
        "Иллюзорное я",
        1,
        ["short_rest", "long_rest"],
      ),
      feature(
        "illusionist-illusory-self-rules",
        "wizard:illusionist:illusory-self",
        "subclass:wizard:illusionist:illusory-self",
        "Иллюзорное я",
        "Когда существо попадает по вам броском атаки, реакцией потратьте Иллюзорное я, чтобы атака промахнулась. Приложение не проверяет факт попадания. Ресурс восстанавливается после короткого или долгого отдыха; его также можно восстановить без действия, потратив ячейку 2 уровня или выше.",
        { kind: "illusory_self", resource: "wizard_illusionist_illusory_self", restoreBySlotMinLevel: 2 },
      ),
      action(
        "illusionist-illusory-self-action",
        "wizard:illusionist:illusory-self",
        "wizard_illusionist_illusory_self",
        "Подставить Иллюзорное я",
        "reaction",
        {
          resourceCosts: [{ key: "wizard_illusionist_illusory_self", amount: 1 }],
          effects: [{ kind: "semantic", key: "force_attack_miss", payload: { adjudicatedBy: "gm" } }],
          tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"],
        },
      ),
      ...restoreBySlotActions(
        "illusionist_restore_illusory_self",
        "wizard:illusionist:illusory-self",
        2,
        9,
        "wizard_illusionist_illusory_self",
        "Восстановить Иллюзорное я ячейкой",
      ),
    ],
    14: [
      feature(
        "illusionist-illusory-reality-rules",
        "wizard:illusionist:illusory-reality",
        "subclass:wizard:illusionist:illusory-reality",
        "Иллюзорная реальность",
        "При сотворении заклинания Иллюзии ячейкой можно бонусным действием сделать один немагический неодушевлённый объект из иллюзии реальным на 1 минуту. Объект не может наносить урон или накладывать состояния. Наличие подходящей иллюзии и объекта определяет ГМ; отдельного ресурса нет.",
        { kind: "illusory_reality", duration: "1_minute", object: "nonmagical_inanimate_part_of_illusion", cannotDealDamage: true, cannotApplyConditions: true },
      ),
      action(
        "illusionist-illusory-reality-action",
        "wizard:illusionist:illusory-reality",
        "wizard_illusionist_illusory_reality",
        "Сделать иллюзию реальной",
        "bonus_action",
        {
          effects: [
            {
              kind: "semantic",
              key: "make_illusion_object_real",
              payload: { duration: "1_minute", cannotDealDamage: true, cannotApplyConditions: true, adjudicatedBy: "gm" },
            },
          ],
          tags: ["wizard", "subclass", "gm-adjudicated-trigger"],
        },
      ),
    ],
  },
}

const enchantment: RuntimeSubclass = {
  id: "enchantment",
  slug: "wizard-enchantment",
  catalogKey: "subclass:wizard:enchantment",
  name: "Школа очарования",
  description: "Очарователь вмешивается в волю и память; приложение показывает действия, а цели, дистанции, иммунитеты и длительность контролирует ГМ.",
  summary: "У подкласса нет конечного пула: все ограничения зависят от сцены или конкретной цели и остаются в ведении ГМ.",
  levels: {
    3: [
      legacySavant("enchantment", "enchantment", "Очарования"),
      feature("enchantment-hypnotic-gaze-rules", "wizard:enchantment:hypnotic-gaze", "subclass:wizard:enchantment:hypnotic-gaze", "Гипнотический взгляд", "Действием выберите видимое существо в 5 футах, способное видеть или слышать вас. При провале спасброска Мудрости против Сл заклинаний оно очаровано, недееспособно и имеет скорость 0 до конца вашего следующего хода; действие продлевает эффект. Дистанцию, урон, чувства и иммунитет цели до долгого отдыха отслеживает ГМ.", { kind: "hypnotic_gaze", rangeFeet: 5, save: { ability: "wisdom", dc: spellDc }, conditions: ["charmed", "incapacitated", "speed_zero"], extensionEconomy: "action", targetImmunityUntil: "long_rest" }),
      action("enchantment-hypnotic-gaze-action", "wizard:enchantment:hypnotic-gaze", "wizard_enchantment_hypnotic_gaze", "Гипнотический взгляд", "action", { range: { kind: "ranged", normal: 5, unit: "ft" }, effects: [{ kind: "semantic", key: "hypnotic_gaze", payload: { saveAbility: "wisdom", saveDc: spellDc, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
      action("enchantment-hypnotic-gaze-extend", "wizard:enchantment:hypnotic-gaze", "wizard_enchantment_extend_hypnotic_gaze", "Продлить Гипнотический взгляд", "action", { effects: [{ kind: "semantic", key: "extend_hypnotic_gaze", payload: { until: "end_of_next_turn", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    6: [
      feature("enchantment-instinctive-charm-rules", "wizard:enchantment:instinctive-charm", "subclass:wizard:enchantment:instinctive-charm", "Инстинктивное очарование", "Когда видимый нападающий в 30 футах атакует вас и имеет другую допустимую цель, реакцией потребуйте спасбросок Мудрости. При провале он атакует ближайшую допустимую цель. Успех даёт этой цели иммунитет к способности до долгого отдыха; сцену и цели ведёт ГМ.", { kind: "instinctive_charm", rangeFeet: 30, save: { ability: "wisdom", dc: spellDc }, redirectsAttack: true, targetImmunityUntil: "long_rest" }),
      action("enchantment-instinctive-charm-action", "wizard:enchantment:instinctive-charm", "wizard_enchantment_instinctive_charm", "Инстинктивное очарование", "reaction", { range: { kind: "ranged", normal: 30, unit: "ft" }, effects: [{ kind: "semantic", key: "redirect_attack_to_nearest_valid_target", payload: { saveAbility: "wisdom", saveDc: spellDc, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }),
    ],
    10: [feature("enchantment-split-enchantment-rules", "wizard:enchantment:split-enchantment", "subclass:wizard:enchantment:split-enchantment", "Раздельное очарование", "Когда заклинание Очарования 1 уровня или выше на выбранном уровне нацеливается только на одно существо, оно может одновременно выбрать вторую допустимую цель.", { kind: "split_enchantment", minimumSpellLevel: 1, originalTargetCount: 1, addedTargets: 1 })],
    14: [
      feature("enchantment-alter-memories-rules", "wizard:enchantment:alter-memories", "subclass:wizard:enchantment:alter-memories", "Изменение воспоминаний", "Одну цель вашего Очарования можно оставить в неведении о магическом влиянии. Один раз до конца заклинания действием потребуйте спасбросок Интеллекта; при провале цель забывает до 1 + модификатор Харизмы часов очарования, минимум 1 и не больше фактической длительности. ГМ ведёт цель и окно применения.", { kind: "alter_memories", save: { ability: "intelligence", dc: spellDc }, forgottenHours: "max(1, 1 + charisma_modifier)", oncePerEnchantingSpell: true }),
      action("enchantment-alter-memories-action", "wizard:enchantment:alter-memories", "wizard_enchantment_alter_memories", "Изменить воспоминания", "action", { effects: [{ kind: "semantic", key: "alter_charmed_target_memories", payload: { saveAbility: "intelligence", saveDc: spellDc, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
  },
}

const conjuration: RuntimeSubclass = {
  id: "conjuration",
  slug: "wizard-conjuration",
  catalogKey: "subclass:wizard:conjuration",
  name: "Школа призыва",
  description: "Призыватель создаёт предметы, перемещает союзников и укрепляет вызванных существ.",
  summary: "Безопасное перемещение — конечный ресурс; восстановление от заклинания Призыва подтверждает ГМ, а положение и призванные существа остаются сценовыми.",
  levels: {
    3: [
      legacySavant("conjuration", "conjuration", "Призыва"),
      feature("conjuration-minor-conjuration-rules", "wizard:conjuration:minor-conjuration", "subclass:wizard:conjuration:minor-conjuration", "Малое призывание", "Действием создайте в руке или свободном пространстве в 10 футах виденный ранее немагический неодушевлённый предмет: до 3 футов по стороне, до 10 фунтов. Он светится на 5 футов и исчезает через час, при уроне или повторном использовании.", { kind: "minor_conjuration", rangeFeet: 10, maximumCubeFeet: 3, maximumWeightPounds: 10, duration: "1_hour" }),
      action("conjuration-minor-conjuration-action", "wizard:conjuration:minor-conjuration", "wizard_conjuration_minor_conjuration", "Малое призывание", "action", { effects: [{ kind: "semantic", key: "create_minor_conjured_object", payload: { adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    6: [
      resource("conjuration-benign-transposition-resource", "wizard:conjuration:benign-transposition", "wizard_conjuration_benign_transposition", "Безопасное перемещение", 1, "long_rest"),
      feature("conjuration-benign-transposition-rules", "wizard:conjuration:benign-transposition", "subclass:wizard:conjuration:benign-transposition", "Безопасное перемещение", "Действием телепортируйтесь в видимое свободное пространство в 30 футах либо поменяйтесь местами с согласным Маленьким или Средним существом. Одно применение восстанавливается после долгого отдыха или немедленно после заклинания Призыва 1 уровня или выше; этот триггер подтверждает ГМ.", { kind: "benign_transposition", resource: "wizard_conjuration_benign_transposition", rangeFeet: 30, restoreOnConjurationSpellMinLevel: 1 }),
      action("conjuration-benign-transposition-action", "wizard:conjuration:benign-transposition", "wizard_conjuration_benign_transposition", "Безопасное перемещение", "action", { resourceCosts: [{ key: "wizard_conjuration_benign_transposition", amount: 1 }], effects: [{ kind: "semantic", key: "teleport_or_swap", payload: { rangeFeet: 30, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
      action("conjuration-benign-transposition-restore", "wizard:conjuration:benign-transposition", "wizard_conjuration_restore_benign_transposition", "Восстановить Безопасное перемещение", "special", { effects: [{ kind: "resource", key: "wizard_conjuration_benign_transposition", operation: "RESTORE", amount: 1 }], tags: ["wizard", "subclass", "gm-adjudicated-trigger", "conjuration-spell-cast"] }),
    ],
    10: [feature("conjuration-focused-conjuration-rules", "wizard:conjuration:focused-conjuration", "subclass:wizard:conjuration:focused-conjuration", "Сосредоточенное призывание", "Полученный урон не может прервать вашу концентрацию на заклинании школы Призыва; остальные причины потери концентрации действуют обычно.", { kind: "concentration_protection", school: "conjuration", ignoresDamageChecks: true })],
    14: [feature("conjuration-durable-summons-rules", "wizard:conjuration:durable-summons", "subclass:wizard:conjuration:durable-summons", "Стойкие призывы", "Существо, призванное или созданное вашим заклинанием школы Призыва, получает 30 временных HP. Получателя и момент появления определяет ГМ.", { kind: "summon_temporary_hit_points", school: "conjuration", amount: 30 })],
  },
}

const necromancy: RuntimeSubclass = {
  id: "necromancy",
  slug: "wizard-necromancy",
  catalogKey: "subclass:wizard:necromancy",
  name: "Школа некромантии",
  description: "Некромант извлекает жизнь из убийств заклинаниями и усиливает созданную нежить.",
  summary: "Трупы, убийства, лечение и подконтрольная нежить остаются каноническими решениями ГМ; постоянные сопротивления попадают в CE.",
  levels: {
    3: [
      legacySavant("necromancy", "necromancy", "Некромантии"),
      feature("necromancy-grim-harvest-rules", "wizard:necromancy:grim-harvest", "subclass:wizard:necromancy:grim-harvest", "Мрачная жатва", "Один раз в ход, убив существо заклинанием 1 уровня или выше, восстановите HP: удвоенный уровень ячейки, либо утроенный для Некромантии. Конструкты и нежить не подходят. Убийство, ход и изменение HP подтверждает ГМ.", { kind: "grim_harvest", healingPerSlotLevel: 2, necromancyHealingPerSlotLevel: 3, minimumSpellLevel: 1, excludes: ["construct", "undead"], cadence: "once_per_turn", adjudicatedBy: "gm" }),
    ],
    6: [
      feature("necromancy-undead-thralls-rules", "wizard:necromancy:undead-thralls", "subclass:wizard:necromancy:undead-thralls", "Неживые рабы", "Добавьте Оживление мёртвых в книгу заклинаний, если его там нет. Каждое сотворение создаёт или возвращает под контроль дополнительную нежить; созданная вами нежить получает к максимуму HP ваш уровень Волшебника и добавляет бонус мастерства к урону оружием.", { kind: "undead_thralls", grantsSpellbookSpell: "animate-dead", additionalCorpsePerCast: 1, summonedMaxHpBonus: "wizard_level", weaponDamageBonus: "proficiency_bonus", adjudicatedBy: "gm" }),
      spell("necromancy-animate-dead-access", "wizard:necromancy:undead-thralls", "animate-dead", "Оживление мёртвых", 3, "necromancy", "prepared", [slotMethod(3)]),
    ],
    10: [
      feature("necromancy-inured-to-undeath-rules", "wizard:necromancy:inured-to-undeath", "subclass:wizard:necromancy:inured-to-undeath", "Привычка к нежити", "Вы получаете сопротивление некротическому урону, а максимум HP не может быть уменьшен.", { kind: "inured_to_undeath", necroticResistance: true, maximumHitPointsCannotBeReduced: true }),
      { id: "necromancy-necrotic-resistance", type: "grant", sourceKey: "wizard:necromancy:inured-to-undeath", target: "resistance", key: "damage:necrotic", payload: { label: "Сопротивление некротическому урону" } } as StoredMechanic,
    ],
    14: [
      feature("necromancy-command-undead-rules", "wizard:necromancy:command-undead", "subclass:wizard:necromancy:command-undead", "Подчинение нежити", "Действием выберите видимую нежить в 60 футах. При провале спасброска Харизмы она подчиняется вам; одновременно можно удерживать одну цель. Интеллект цели меняет повторные спасброски и иммунитет. Цель и длительный контроль ведёт ГМ.", { kind: "command_undead", rangeFeet: 60, save: { ability: "charisma", dc: spellDc }, maximumControlled: 1, adjudicatedBy: "gm" }),
      action("necromancy-command-undead-action", "wizard:necromancy:command-undead", "wizard_necromancy_command_undead", "Подчинить нежить", "action", { range: { kind: "ranged", normal: 60, unit: "ft" }, effects: [{ kind: "semantic", key: "command_undead", payload: { saveAbility: "charisma", saveDc: spellDc, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
  },
}

const transmutation: RuntimeSubclass = {
  id: "transmutation",
  slug: "wizard-transmutation",
  catalogKey: "subclass:wizard:transmutation",
  name: "Школа преобразования",
  description: "Преобразователь меняет материю, создаёт камень с переносимым эффектом и владеет ограниченным свободным превращением.",
  summary: "Свободное превращение — конечный ресурс; материал, носитель камня и его уничтожение ведёт ГМ.",
  levels: {
    3: [
      legacySavant("transmutation", "transmutation", "Преобразования"),
      feature("transmutation-minor-alchemy-rules", "wizard:transmutation:minor-alchemy", "subclass:wizard:transmutation:minor-alchemy", "Малая алхимия", "За 10 минут на кубический фут временно преобразуйте дерево, камень, железо, медь или серебро в другой материал из этого списка. Эффект требует концентрации и длится до часа.", { kind: "minor_alchemy", minutesPerCubicFoot: 10, duration: "1_hour", concentration: true, materials: ["wood", "stone", "iron", "copper", "silver"] }),
      action("transmutation-minor-alchemy-action", "wizard:transmutation:minor-alchemy", "wizard_transmutation_minor_alchemy", "Начать Малую алхимию", "special", { effects: [{ kind: "semantic", key: "minor_alchemy", payload: { adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    6: [
      feature("transmutation-stone-rules", "wizard:transmutation:stone", "subclass:wizard:transmutation:stone", "Камень преобразователя", "За 8 часов создайте один камень. Его носитель получает один выбранный эффект: тёмное зрение 60 футов, +10 футов скорости, владение спасбросками Телосложения или сопротивление одному из пяти типов урона. После заклинания Преобразования можно сменить эффект; носителя и камень ведёт ГМ.", { kind: "transmuters_stone", creationTimeHours: 8, modes: ["darkvision_60", "speed_10", "constitution_save_proficiency", "acid_cold_fire_lightning_thunder_resistance"], adjudicatedBy: "gm" }),
      action("transmutation-stone-create", "wizard:transmutation:stone", "wizard_transmutation_create_stone", "Создать Камень преобразователя", "special", { effects: [{ kind: "semantic", key: "create_transmuters_stone", payload: { creationTimeHours: 8, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
      action("transmutation-stone-change", "wizard:transmutation:stone", "wizard_transmutation_change_stone_effect", "Сменить эффект камня", "special", { effects: [{ kind: "semantic", key: "change_transmuters_stone_effect", payload: { trigger: "transmutation_spell_cast", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    10: [
      resource("transmutation-shapechanger-resource", "wizard:transmutation:shapechanger", "wizard_transmutation_shapechanger", "Свободное превращение", 1, ["short_rest", "long_rest"]),
      feature("transmutation-shapechanger-rules", "wizard:transmutation:shapechanger", "subclass:wizard:transmutation:shapechanger", "Изменяющий облик", "Добавьте Превращение в книгу заклинаний, если его там нет. Один раз до короткого или долгого отдыха наложите его на себя без ячейки, превращаясь в зверя с ПО не выше 1.", { kind: "shapechanger", grantsSpellbookSpell: "polymorph", resource: "wizard_transmutation_shapechanger", freeSelfCastMaximumCr: 1 }),
      spell("transmutation-polymorph-access", "wizard:transmutation:shapechanger", "polymorph", "Превращение", 4, "transmutation", "prepared", [slotMethod(4)]),
      action("transmutation-shapechanger-action", "wizard:transmutation:shapechanger", "wizard_transmutation_shapechanger", "Свободное превращение", "action", { resourceCosts: [{ key: "wizard_transmutation_shapechanger", amount: 1 }], effects: [{ kind: "semantic", key: "cast_class_spell_without_slot", payload: { spell: "polymorph", target: "self", maximumBeastCr: 1, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    14: [
      feature("transmutation-master-transmuter-rules", "wizard:transmutation:master-transmuter", "subclass:wizard:transmutation:master-transmuter", "Мастер преобразования", "Действием уничтожьте свой Камень преобразователя ради одного эффекта: крупное превращение предмета, Панацея, возвращение к жизни либо омоложение. Новый камень нельзя создать до долгого отдыха; существование камня, цель и результат ведёт ГМ.", { kind: "master_transmuter", consumesTransmutersStone: true, options: ["major_transformation", "panacea", "restore_life", "restore_youth"], stoneRecreationAfter: "long_rest", adjudicatedBy: "gm" }),
      ...["major_transformation", "panacea", "restore_life", "restore_youth"].map((mode) => action(`transmutation-master-${mode}`, "wizard:transmutation:master-transmuter", `wizard_transmutation_master_${mode}`, `Мастер преобразования: ${mode}`, "action", { effects: [{ kind: "semantic", key: "consume_transmuters_stone", payload: { mode, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] })),
    ],
  },
}

const warMagic: RuntimeSubclass = {
  id: "war-magic",
  slug: "wizard-war-magic",
  catalogKey: "subclass:wizard:war-magic",
  name: "Военная магия",
  description: "Военный маг быстрее вступает в бой, отклоняет атаки и накапливает силовые выбросы от разрушения чар.",
  summary: "Инициатива вычисляется CE; Силовые выбросы хранятся точно и после долгого отдыха устанавливаются в 1, а не заполняются.",
  levels: {
    3: [
      feature("war-magic-arcane-deflection-rules", "wizard:war-magic:arcane-deflection", "subclass:wizard:war-magic:arcane-deflection", "Тайное отклонение", "Реакцией после попадания или проваленного спасброска получите +2 КД против этой атаки либо +4 к этому спасброску. До конца следующего хода после этого можно творить только заговоры. Момент и временное ограничение ведёт ГМ.", { kind: "arcane_deflection", armorClassBonus: 2, savingThrowBonus: 4, spellRestrictionUntilEndOfNextTurn: "cantrips_only", adjudicatedBy: "gm" }),
      action("war-magic-arcane-deflection-ac", "wizard:war-magic:arcane-deflection", "wizard_war_magic_arcane_deflection_ac", "Тайное отклонение: +2 КД", "reaction", { effects: [{ kind: "semantic", key: "arcane_deflection", payload: { mode: "armor_class", bonus: 2, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }),
      action("war-magic-arcane-deflection-save", "wizard:war-magic:arcane-deflection", "wizard_war_magic_arcane_deflection_save", "Тайное отклонение: +4 к спасброску", "reaction", { effects: [{ kind: "semantic", key: "arcane_deflection", payload: { mode: "saving_throw", bonus: 4, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }),
      feature("war-magic-tactical-wit-rules", "wizard:war-magic:initiative", "subclass:wizard:war-magic:tactical-wit", "Тактическая смекалка", "Добавляйте модификатор Интеллекта к инициативе. Формула применяется автоматически.", { kind: "initiative_formula", formula: "dexterity_modifier + intelligence_modifier" }),
      initiativeWithInt("war-magic", "Тактическая смекалка"),
    ],
    6: [
      { id: "war-magic-power-surge-resource", type: "resource", sourceKey: "wizard:war-magic:power-surge", key: "wizard_war_magic_power_surge", label: "Силовые выбросы", max: max(lit(1), intMod), recharge: "long_rest", restore: "set", restoreAmount: 1, initial: 1, presentation: { tone: "violet", display: "pips" } } as StoredMechanic,
      feature("war-magic-power-surge-rules", "wizard:war-magic:power-surge", "subclass:wizard:war-magic:power-surge", "Силовой выброс", "Максимум выбросов равен модификатору Интеллекта, минимум 1. После долгого отдыха запас становится ровно 1. Успешное Контрзаклинание или Рассеивание магии добавляет 1 до максимума. Один раз в ход при уроне заклинанием потратьте 1, чтобы нанести одной цели дополнительный силовой урон, равный половине уровня Волшебника.", { kind: "power_surge", resource: "wizard_war_magic_power_surge", maximum: "max(1, intelligence_modifier)", longRestValue: 1, gainOnSuccessfulSpellBreak: 1, damage: "floor(wizard_level / 2)", cadence: "once_per_turn" }),
      action("war-magic-power-surge-gain", "wizard:war-magic:power-surge", "wizard_war_magic_gain_power_surge", "Получить Силовой выброс", "special", { effects: [{ kind: "resource", key: "wizard_war_magic_power_surge", operation: "RESTORE", amount: 1 }], tags: ["wizard", "subclass", "gm-adjudicated-trigger", "successful-spell-break"] }),
      action("war-magic-power-surge-spend", "wizard:war-magic:power-surge", "wizard_war_magic_spend_power_surge", "Потратить Силовой выброс", "special", { resourceCosts: [{ key: "wizard_war_magic_power_surge", amount: 1 }], effects: [{ kind: "semantic", key: "power_surge_damage", payload: { damageType: "force", amount: "floor(wizard_level / 2)", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    10: [feature("war-magic-durable-magic-rules", "wizard:war-magic:durable-magic", "subclass:wizard:war-magic:durable-magic", "Стойкая магия", "Пока вы поддерживаете концентрацию на заклинании, получаете +2 КД и +2 ко всем спасброскам. Состояние концентрации ведёт ГМ.", { kind: "durable_magic", whileConcentrating: { armorClassBonus: 2, savingThrowBonus: 2 }, adjudicatedBy: "gm" })],
    14: [
      feature("war-magic-deflecting-shroud-rules", "wizard:war-magic:deflecting-shroud", "subclass:wizard:war-magic:deflecting-shroud", "Отклоняющий покров", "При Тайном отклонении выберите до трёх видимых существ в 60 футах; каждое получает силовой урон, равный половине уровня Волшебника.", { kind: "deflecting_shroud", trigger: "arcane_deflection", rangeFeet: 60, maximumTargets: 3, damage: "floor(wizard_level / 2)", damageType: "force" }),
      action("war-magic-deflecting-shroud-action", "wizard:war-magic:deflecting-shroud", "wizard_war_magic_deflecting_shroud", "Отклоняющий покров", "special", { effects: [{ kind: "semantic", key: "deflecting_shroud", payload: { maximumTargets: 3, rangeFeet: 60, damage: "floor(wizard_level / 2)", damageType: "force", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
  },
}

const bladesingingWeaponOptions = ["club", "dagger", "handaxe", "javelin", "light-hammer", "mace", "quarterstaff", "sickle", "spear", "battleaxe", "flail", "longsword", "morningstar", "rapier", "scimitar", "shortsword", "trident", "war-pick", "warhammer", "whip"].map((key) => `weapon:${key}`)

const bladesinging: RuntimeSubclass = {
  id: "bladesinging",
  slug: "wizard-bladesinging",
  catalogKey: "subclass:wizard:bladesinging",
  name: "Песнь клинка",
  description: "Певец клинка соединяет магию с лёгким оружием и ограниченной боевой песней.",
  summary: "Применения Песни клинка хранятся по бонусу мастерства; её минутное состояние и зависящие от него реакции ведёт ГМ.",
  choicesByLevel: { 3: [{ key: "wizard_bladesinging_weapon", label: "Одноручное оружие Песни клинка", target: "proficiency", options: bladesingingWeaponOptions, count: 1, selection_mode: "player_once" }] },
  levels: {
    3: [
      { id: "bladesinging-light-armor", type: "grant", sourceKey: "wizard:bladesinging:training", target: "proficiency", key: "armor:light", payload: { rank: 1 } } as StoredMechanic,
      { id: "bladesinging-performance", type: "grant", sourceKey: "wizard:bladesinging:training", target: "proficiency", key: "skill:performance", payload: { rank: 1 } } as StoredMechanic,
      feature("bladesinging-training-rules", "wizard:bladesinging:training", "subclass:wizard:bladesinging:training", "Обучение войне и песне", "Получите владение лёгкими доспехами, навыком Выступление и одним выбранным одноручным рукопашным оружием.", { kind: "proficiency_training", grants: ["armor:light", "skill:performance"], choice: "wizard_bladesinging_weapon" }),
      resource("bladesinging-bladesong-resource", "wizard:bladesinging:bladesong", "wizard_bladesinging_bladesong", "Песнь клинка", ref("core.proficiencyBonus"), "long_rest"),
      feature("bladesinging-bladesong-rules", "wizard:bladesinging:bladesong", "subclass:wizard:bladesinging:bladesong", "Песнь клинка", "Бонусным действием, если вы не носите средние или тяжёлые доспехи и щит, начните Песнь на 1 минуту. Она даёт +модификатор Интеллекта к КД и концентрации (минимум +1), +10 футов скорости и преимущество на Акробатику. Применений — бонус мастерства до долгого отдыха; состояние ведёт ГМ.", { kind: "bladesong", resource: "wizard_bladesinging_bladesong", duration: "1_minute", armorClassBonus: "max(1, intelligence_modifier)", speedBonusFeet: 10, concentrationSaveBonus: "max(1, intelligence_modifier)", acrobaticsAdvantage: true }),
      action("bladesinging-bladesong-action", "wizard:bladesinging:bladesong", "wizard_bladesinging_bladesong", "Начать Песнь клинка", "bonus_action", { resourceCosts: [{ key: "wizard_bladesinging_bladesong", amount: 1 }], effects: [{ kind: "semantic", key: "start_bladesong", payload: { duration: "1_minute", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    6: [feature("bladesinging-extra-attack-rules", "wizard:bladesinging:extra-attack", "subclass:wizard:bladesinging:extra-attack", "Дополнительная атака", "При действии Атака атакуйте дважды вместо одного; одну атаку можно заменить заговором со временем сотворения 1 действие.", { kind: "extra_attack", attacks: 2, mayReplaceOneAttackWithActionCantrip: true })],
    10: [
      feature("bladesinging-song-of-defense-rules", "wizard:bladesinging:song-of-defense", "subclass:wizard:bladesinging:song-of-defense", "Песнь защиты", "Во время Песни клинка, получив урон, реакцией потратьте ячейку и уменьшите урон на пятикратный уровень ячейки. Активность Песни и момент урона подтверждает ГМ.", { kind: "song_of_defense", requiresBladesong: true, reductionPerSlotLevel: 5 }),
      ...Array.from({ length: 9 }, (_, index) => { const level = index + 1; return action(`bladesinging-song-defense-${level}`, "wizard:bladesinging:song-of-defense", `wizard_bladesinging_song_of_defense_${level}`, `Песнь защиты: ячейка ${level} уровня`, "reaction", { resourceCosts: [{ key: `spell_slot_${level}`, amount: 1 }], effects: [{ kind: "semantic", key: "reduce_incoming_damage", payload: { amount: level * 5, requiresBladesong: true, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }) }),
    ],
    14: [feature("bladesinging-song-of-victory-rules", "wizard:bladesinging:song-of-victory", "subclass:wizard:bladesinging:song-of-victory", "Песнь победы", "Во время Песни клинка добавляйте модификатор Интеллекта, минимум +1, к урону рукопашного оружия. Активность Песни ведёт ГМ.", { kind: "song_of_victory", requiresBladesong: true, meleeWeaponDamageBonus: "max(1, intelligence_modifier)", adjudicatedBy: "gm" })],
  },
}

const orderOfScribes: RuntimeSubclass = {
  id: "order-of-scribes",
  slug: "wizard-order-of-scribes",
  catalogKey: "subclass:wizard:order-of-scribes",
  name: "Орден писцов",
  description: "Писец пробуждает книгу заклинаний, проявляет её разум и создаёт ограниченные магические записи.",
  summary: "Бесплатный ритуал, проявление разума, дистанционные сотворения, особый свиток и защита книги — отдельные конечные ресурсы; положение и содержимое книги ведёт ГМ.",
  levels: {
    3: [
      feature("scribes-wizardly-quill-rules", "wizard:scribes:wizardly-quill", "subclass:wizard:order-of-scribes:wizardly-quill", "Волшебное перо", "Бонусным действием создайте перо: оно не требует чернил, выбирает цвет, переписывает заклинания в книгу за 2 минуты на уровень и стирает написанное им касанием.", { kind: "wizardly_quill", economy: "bonus_action", copyMinutesPerSpellLevel: 2 }),
      action("scribes-wizardly-quill-action", "wizard:scribes:wizardly-quill", "wizard_scribes_create_quill", "Создать Волшебное перо", "bonus_action", { effects: [{ kind: "semantic", key: "create_wizardly_quill", payload: { adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
      resource("scribes-ritual-resource", "wizard:scribes:awakened-spellbook", "wizard_scribes_fast_ritual", "Ускоренный ритуал", 1, "long_rest"),
      feature("scribes-awakened-spellbook-rules", "wizard:scribes:awakened-spellbook", "subclass:wizard:order-of-scribes:awakened-spellbook", "Пробуждённая книга заклинаний", "Книга служит фокусировкой. При заклинании Волшебника ячейкой можно заменить тип урона типом из другого заклинания того же уровня в книге. Один ритуал до долгого отдыха можно провести без дополнительных 10 минут.", { kind: "awakened_spellbook", arcaneFocus: true, damageTypeSwapFromSameLevelSpellbookSpell: true, fastRitualResource: "wizard_scribes_fast_ritual" }),
      action("scribes-fast-ritual-action", "wizard:scribes:awakened-spellbook", "wizard_scribes_fast_ritual", "Ускорить ритуал", "special", { resourceCosts: [{ key: "wizard_scribes_fast_ritual", amount: 1 }], effects: [{ kind: "semantic", key: "cast_wizard_ritual_at_normal_time", payload: { adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    6: [
      resource("scribes-manifest-free-resource", "wizard:scribes:manifest-mind", "wizard_scribes_manifest_mind_free", "Свободное проявление разума", 1, "long_rest"),
      resource("scribes-manifest-casts-resource", "wizard:scribes:manifest-mind", "wizard_scribes_manifest_mind_casts", "Сотворения через разум", ref("core.proficiencyBonus"), "long_rest"),
      feature("scribes-manifest-mind-rules", "wizard:scribes:manifest-mind", "subclass:wizard:order-of-scribes:manifest-mind", "Проявление разума", "Бонусным действием проявите разум книги в 60 футах бесплатно один раз до долгого отдыха; последующие проявления требуют любую ячейку. Пока он в 300 футах, через него можно сотворять заклинания Волшебника бонус мастерства раз до долгого отдыха. Положение и существование ведёт ГМ.", { kind: "manifest_mind", freeResource: "wizard_scribes_manifest_mind_free", originCastResource: "wizard_scribes_manifest_mind_casts", manifestRangeFeet: 60, maximumDistanceFeet: 300 }),
      action("scribes-manifest-mind-action", "wizard:scribes:manifest-mind", "wizard_scribes_manifest_mind", "Проявить разум книги", "bonus_action", { costOptions: [{ key: "free", label: "Свободное проявление", costs: [{ key: "wizard_scribes_manifest_mind_free", amount: 1 }] }, ...slotOptions(1)], effects: [{ kind: "semantic", key: "manifest_spellbook_mind", payload: { rangeFeet: 60, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
      action("scribes-cast-through-mind-action", "wizard:scribes:manifest-mind", "wizard_scribes_cast_through_mind", "Сотворить через разум книги", "special", { resourceCosts: [{ key: "wizard_scribes_manifest_mind_casts", amount: 1 }], effects: [{ kind: "semantic", key: "cast_from_manifested_mind", payload: { maximumDistanceFeet: 300, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    10: [
      resource("scribes-master-scrivener-resource", "wizard:scribes:master-scrivener", "wizard_scribes_master_scrivener", "Особый свиток", 1, "long_rest"),
      feature("scribes-master-scrivener-rules", "wizard:scribes:master-scrivener", "subclass:wizard:order-of-scribes:master-scrivener", "Мастер-переписчик", "После долгого отдыха создайте особый свиток заклинания 1 или 2 уровня из книги со временем сотворения 1 действие. При чтении оно сотворяется на уровень выше и свиток исчезает; заклинание выбирает ГМ вместе с игроком.", { kind: "master_scrivener", resource: "wizard_scribes_master_scrivener", sourceSpellLevels: [1, 2], castsOneLevelHigher: true }),
      action("scribes-master-scrivener-action", "wizard:scribes:master-scrivener", "wizard_scribes_master_scrivener", "Использовать особый свиток", "action", { resourceCosts: [{ key: "wizard_scribes_master_scrivener", amount: 1 }], effects: [{ kind: "semantic", key: "cast_master_scrivener_scroll", payload: { castsOneLevelHigher: true, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    14: [
      resource("scribes-one-with-word-resource", "wizard:scribes:one-with-word", "wizard_scribes_one_with_word", "Единство со словом", 1, "long_rest"),
      feature("scribes-one-with-word-rules", "wizard:scribes:one-with-word", "subclass:wizard:order-of-scribes:one-with-word", "Единство со словом", "С книгой при себе вы имеете преимущество на Магию. Пока разум проявлен, реакцией полностью предотвратите урон, затем бросьте 3d6 и временно утратьте заклинания суммарных уровней не меньше результата на 1d6 долгих отдыхов; при нехватке заклинаний падаете до 0 HP. Применение восстанавливается после долгого отдыха.", { kind: "one_with_word", resource: "wizard_scribes_one_with_word", arcanaAdvantage: true, lossRoll: "3d6", lossDurationLongRests: "1d6", adjudicatedBy: "gm" }),
      action("scribes-one-with-word-action", "wizard:scribes:one-with-word", "wizard_scribes_one_with_word", "Единство со словом", "reaction", { resourceCosts: [{ key: "wizard_scribes_one_with_word", amount: 1 }], effects: [{ kind: "semantic", key: "prevent_damage_and_lose_spells", payload: { lossRoll: "3d6", lossDurationLongRests: "1d6", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }),
    ],
  },
}

const graviturgy: RuntimeSubclass = {
  id: "graviturgy",
  slug: "wizard-graviturgy",
  catalogKey: "subclass:wizard:graviturgy",
  name: "Гравитургия",
  description: "Гравитург меняет вес, сдвигает цели и расходует ограниченное притяжение на урон и поле тяжести.",
  summary: "Насильственное притяжение и бесплатный Горизонт событий — конечные ресурсы; цели, начало хода и поле ведёт ГМ.",
  levels: {
    3: [
      feature("graviturgy-adjust-density-rules", "wizard:graviturgy:adjust-density", "subclass:wizard:graviturgy:adjust-density", "Изменение плотности", "Действием на 1 минуту с концентрацией удвойте или уменьшите вдвое вес видимой цели в 30 футах. Лёгкая цель получает +10 скорости и помеху на Силу; тяжёлая — −10 скорости и преимущество на Силу. Размер цели и состояние ведёт ГМ.", { kind: "adjust_density", rangeFeet: 30, duration: "1_minute", concentration: true, sizeLimitBeforeLevel10: "large", sizeLimitAtLevel10: "huge" }),
      action("graviturgy-adjust-density-action", "wizard:graviturgy:adjust-density", "wizard_graviturgy_adjust_density", "Изменить плотность", "action", { effects: [{ kind: "semantic", key: "adjust_density", payload: { rangeFeet: 30, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    6: [feature("graviturgy-gravity-well-rules", "wizard:graviturgy:gravity-well", "subclass:wizard:graviturgy:gravity-well", "Гравитационный колодец", "При заклинании на существо переместите его на 5 футов в свободное пространство, если оно согласно, если атака заклинанием попала либо если оно провалило спасбросок. Условия и пространство определяет ГМ.", { kind: "gravity_well", distanceFeet: 5, triggers: ["willing_target", "spell_attack_hit", "failed_save"], adjudicatedBy: "gm" })],
    10: [
      resource("graviturgy-violent-attraction-resource", "wizard:graviturgy:violent-attraction", "wizard_graviturgy_violent_attraction", "Насильственное притяжение", max(lit(1), intMod), "long_rest"),
      feature("graviturgy-violent-attraction-rules", "wizard:graviturgy:violent-attraction", "subclass:wizard:graviturgy:violent-attraction", "Насильственное притяжение", "Реакцией в 60 футах добавьте 1d10 к урону попадания оружием другого существа либо 2d10 к урону от падения. Применений — модификатор Интеллекта, минимум 1, до долгого отдыха.", { kind: "violent_attraction", resource: "wizard_graviturgy_violent_attraction", rangeFeet: 60, weaponDamage: "1d10", fallingDamage: "2d10" }),
      action("graviturgy-violent-attraction-weapon", "wizard:graviturgy:violent-attraction", "wizard_graviturgy_violent_attraction_weapon", "Притяжение: усилить оружие", "reaction", { resourceCosts: [{ key: "wizard_graviturgy_violent_attraction", amount: 1 }], effects: [{ kind: "semantic", key: "add_damage", payload: { dice: "1d10", trigger: "weapon_hit", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }),
      action("graviturgy-violent-attraction-fall", "wizard:graviturgy:violent-attraction", "wizard_graviturgy_violent_attraction_fall", "Притяжение: усилить падение", "reaction", { resourceCosts: [{ key: "wizard_graviturgy_violent_attraction", amount: 1 }], effects: [{ kind: "semantic", key: "add_damage", payload: { dice: "2d10", trigger: "falling_damage", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }),
    ],
    14: [
      resource("graviturgy-event-horizon-resource", "wizard:graviturgy:event-horizon", "wizard_graviturgy_event_horizon", "Свободный Горизонт событий", 1, "long_rest"),
      feature("graviturgy-event-horizon-rules", "wizard:graviturgy:event-horizon", "subclass:wizard:graviturgy:event-horizon", "Горизонт событий", "Действием создайте на 1 минуту концентрируемое поле радиусом 30 футов. Враг в начале хода делает спасбросок Силы: 2d10 силового урона и скорость 0 при провале, половина урона и половина скорости при успехе. Одно свободное применение до долгого отдыха; далее ячейка 3+.", { kind: "event_horizon", freeResource: "wizard_graviturgy_event_horizon", radiusFeet: 30, duration: "1_minute", save: { ability: "strength", dc: spellDc }, damage: "2d10 force", additionalUseMinimumSlotLevel: 3 }),
      action("graviturgy-event-horizon-action", "wizard:graviturgy:event-horizon", "wizard_graviturgy_event_horizon", "Создать Горизонт событий", "action", { costOptions: [{ key: "free", label: "Свободное применение", costs: [{ key: "wizard_graviturgy_event_horizon", amount: 1 }] }, ...slotOptions(3)], effects: [{ kind: "semantic", key: "create_event_horizon", payload: { radiusFeet: 30, duration: "1_minute", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
  },
}

const chronurgy: RuntimeSubclass = {
  id: "chronurgy",
  slug: "wizard-chronurgy",
  catalogKey: "subclass:wizard:chronurgy",
  name: "Хронургия",
  description: "Хронург переписывает броски, останавливает цели и заключает заклинания во временные частицы.",
  summary: "Все конечные применения и особое Истощение сохраняются приложением; цели, дистанции и частица остаются у ГМ.",
  levels: {
    3: [
      resource("chronurgy-chronal-shift-resource", "wizard:chronurgy:chronal-shift", "wizard_chronurgy_chronal_shift", "Хрональный сдвиг", 2, "long_rest"),
      feature("chronurgy-chronal-shift-rules", "wizard:chronurgy:chronal-shift", "subclass:wizard:chronurgy:chronal-shift", "Хрональный сдвиг", "После результата d20 Теста видимого существа в 30 футах реакцией заставьте перебросить и использовать второй результат. Два применения до долгого отдыха.", { kind: "chronal_shift", resource: "wizard_chronurgy_chronal_shift", rangeFeet: 30, usesSecondRoll: true }),
      action("chronurgy-chronal-shift-action", "wizard:chronurgy:chronal-shift", "wizard_chronurgy_chronal_shift", "Хрональный сдвиг", "reaction", { resourceCosts: [{ key: "wizard_chronurgy_chronal_shift", amount: 1 }], effects: [{ kind: "semantic", key: "reroll_d20_use_second", payload: { rangeFeet: 30, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "gm-adjudicated-trigger"] }),
      feature("chronurgy-temporal-awareness-rules", "wizard:chronurgy:initiative", "subclass:wizard:chronurgy:temporal-awareness", "Временная осведомлённость", "Добавляйте модификатор Интеллекта к инициативе. Формула применяется автоматически.", { kind: "initiative_formula", formula: "dexterity_modifier + intelligence_modifier" }),
      initiativeWithInt("chronurgy", "Временная осведомлённость"),
    ],
    6: [
      resource("chronurgy-stasis-resource", "wizard:chronurgy:momentary-stasis", "wizard_chronurgy_momentary_stasis", "Мгновенный стазис", max(lit(1), intMod), "long_rest"),
      feature("chronurgy-stasis-rules", "wizard:chronurgy:momentary-stasis", "subclass:wizard:chronurgy:momentary-stasis", "Мгновенный стазис", "Действием выберите видимое существо Большого размера или меньше в 60 футах. При провале спасброска Телосложения оно недееспособно и имеет скорость 0 до конца вашего следующего хода или до получения урона. Применений — модификатор Интеллекта, минимум 1.", { kind: "momentary_stasis", resource: "wizard_chronurgy_momentary_stasis", rangeFeet: 60, save: { ability: "constitution", dc: spellDc }, maximumSize: "large" }),
      action("chronurgy-stasis-action", "wizard:chronurgy:momentary-stasis", "wizard_chronurgy_momentary_stasis", "Мгновенный стазис", "action", { resourceCosts: [{ key: "wizard_chronurgy_momentary_stasis", amount: 1 }], effects: [{ kind: "semantic", key: "momentary_stasis", payload: { rangeFeet: 60, adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    10: [
      resource("chronurgy-arcane-abeyance-resource", "wizard:chronurgy:arcane-abeyance", "wizard_chronurgy_arcane_abeyance", "Тайное ожидание", 1, ["short_rest", "long_rest"]),
      feature("chronurgy-arcane-abeyance-rules", "wizard:chronurgy:arcane-abeyance", "subclass:wizard:chronurgy:arcane-abeyance", "Тайное ожидание", "При сотворении заклинания 4 уровня или ниже со временем 1 действие заключите его в частицу на 1 час; обычные затраты уже расходуются. Держатель высвобождает его действием с вашими Сл и атакой, но сам считается сотворившим и концентрируется. Одно применение до короткого или долгого отдыха.", { kind: "arcane_abeyance", resource: "wizard_chronurgy_arcane_abeyance", maximumSpellLevel: 4, requiredCastingTime: "1_action", beadDuration: "1_hour", adjudicatedBy: "gm" }),
      action("chronurgy-arcane-abeyance-action", "wizard:chronurgy:arcane-abeyance", "wizard_chronurgy_arcane_abeyance", "Создать частицу Тайного ожидания", "special", { resourceCosts: [{ key: "wizard_chronurgy_arcane_abeyance", amount: 1 }], effects: [{ kind: "semantic", key: "store_cast_spell_in_bead", payload: { maximumSpellLevel: 4, duration: "1_hour", adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "gm-adjudicated-trigger"] }),
    ],
    14: [
      feature("chronurgy-convergent-future-rules", "wizard:chronurgy:convergent-future", "subclass:wizard:chronurgy:convergent-future", "Сходящееся будущее", "Реакцией на d20 Тест видимого существа в 60 футах назначьте минимальный успех либо результат на 1 ниже порога. Затем получите 1 уровень особого Истощения, снимаемого только долгим отдыхом. Накопленное число хранит приложение.", { kind: "convergent_future", rangeFeet: 60, result: ["minimum_success", "one_below_success"], exhaustionState: convergentFutureExhaustionState, exhaustionRecovery: "long_rest" }),
      action("chronurgy-convergent-future-action", "wizard:chronurgy:convergent-future", "wizard_chronurgy_convergent_future", "Сходящееся будущее", "reaction", { effects: [{ kind: "state", key: convergentFutureExhaustionState, operation: "ADD", value: 1 }, { kind: "semantic", key: "force_d20_threshold_result", payload: { modes: ["minimum_success", "one_below_success"], adjudicatedBy: "gm" } }], tags: ["wizard", "subclass", "reaction", "persistent-state", "gm-adjudicated-trigger"] }),
    ],
  },
}

const runtimeSubclasses: RuntimeSubclass[] = [
  abjurer,
  diviner,
  evoker,
  illusionist,
  enchantment,
  conjuration,
  necromancy,
  transmutation,
  warMagic,
  bladesinging,
  orderOfScribes,
  graviturgy,
  chronurgy,
]

const wizardParentBundle: CharacterTemplateBundle = {
  assignment: {
    id: "wizard-subclass-runtime-parent-assignment",
    character_id: "wizard-subclass-runtime-character",
    template_id: wizardParentId,
    template_level: 14,
    selected_choices: {},
    assigned_at: now,
    updated_at: now,
  },
  template: {
    id: wizardParentId,
    campaign_id: "wizard-subclass-runtime-campaign",
    kind: "class",
    slug: "wizard-core",
    name: "Волшебник",
    description: "Родительская запись Волшебника для проверки подклассов: уровень класса задаёт доступные особенности подкласса, а не общий уровень персонажа.",
    version: 1,
    mechanics: [
      feature(
        "wizard-runtime-parent-rules",
        "wizard:runtime-parent",
        "class:wizard:runtime-parent",
        "Уровень Волшебника",
        "Уровень Волшебника является источником прогрессии выбранного подкласса. Особенности подкласса открываются на 3, 6, 10 и 14 уровнях этого класса.",
        { kind: "class_level_source", subclassLevels: [3, 6, 10, 14] },
      ),
    ],
    choices: [],
    parent_template_id: null,
    unlock_level: null,
    catalog_key: "class:wizard",
    catalog_revision: "phb-2024-runtime-parent@1",
    source_kind: "official",
    source_label: "Player's Handbook 2024",
    is_builtin: true,
    mechanical_summary: "Волшебник использует уровень класса как источник прогрессии подкласса.",
    author_description: "",
    author_comment: "",
    rules_meta: { rules_revision: "2024", mechanics_status: "READY", subclass_runtime_parent: true },
    is_active: true,
    created_by: null,
    created_at: now,
    updated_at: now,
  },
  levels: [],
}

function subclassBundle(entry: RuntimeSubclass): CharacterTemplateBundle {
  const templateId = `wizard-subclass-runtime-${entry.id}`
  const catalogEntry = WIZARD_SUBCLASSES.find((candidate) => candidate.catalogKey === entry.catalogKey)
  if (!catalogEntry) throw new Error(`Missing Wizard subclass catalog metadata: ${entry.catalogKey}`)
  return {
    assignment: {
      id: `${templateId}-assignment`,
      character_id: "wizard-subclass-runtime-character",
      template_id: templateId,
      template_level: null,
      selected_choices: {},
      assigned_at: now,
      updated_at: now,
    },
    template: {
      id: templateId,
      campaign_id: "wizard-subclass-runtime-campaign",
      kind: "subclass",
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: wizardParentId,
      unlock_level: 3,
      catalog_key: entry.catalogKey,
      catalog_revision: WIZARD_SUBCLASS_RUNTIME_REVISION,
      source_kind: "official",
      source_label: catalogEntry.sourceLabel,
      is_builtin: true,
      mechanical_summary: entry.summary,
      author_description: "",
      author_comment: "",
      rules_meta: {
        base_class: "class:wizard",
        rules_revision: catalogEntry.rulesRevision,
        mechanics_status: "READY",
        feature_levels: [3, 6, 10, 14],
        chat_template_actions: true,
        chat_template_spells: true,
      },
      is_active: true,
      created_by: null,
      created_at: now,
      updated_at: now,
    },
    levels: ([3, 6, 10, 14] as const).map((level) => ({
      id: `${templateId}-level-${level}`,
      template_id: templateId,
      level,
      mechanics: entry.levels[level],
      choices: entry.choicesByLevel?.[level] ?? [],
    })),
  }
}

export const wizardSubclassRuntimeBundles: CharacterTemplateBundle[] = [
  wizardParentBundle,
  ...runtimeSubclasses.map(subclassBundle),
]
