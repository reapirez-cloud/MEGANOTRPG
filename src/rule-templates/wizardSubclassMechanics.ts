import type { FormulaExpression, SpellCastingMethodDefinition, SpellResourceOption } from "../character-engine/index.ts"
import { recoverableStateKey } from "../character-engine/stateLifecycle.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"

export const WIZARD_SUBCLASS_RUNTIME_REVISION = "phb-2024-wizard-subclasses-runtime@2" as const
export const WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS = [
  "subclass:wizard:abjurer",
  "subclass:wizard:diviner",
  "subclass:wizard:evoker",
  "subclass:wizard:illusionist",
] as const

const now = "2026-09-02T00:00:00Z"
const wizardParentId = "wizard-subclass-runtime-parent"

const lit = (value: number): FormulaExpression => ({ kind: "literal", value })
const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })
const mul = (...factors: FormulaExpression[]): FormulaExpression => ({ kind: "multiply", factors })

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
  id: "abjurer" | "diviner" | "evoker" | "illusionist"
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

function resource(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  max: number | FormulaExpression,
  recharge: "long_rest" | Array<"short_rest" | "long_rest">,
  initial: "full" | "empty" = "full",
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
  preparation: "always_prepared" | "not_required",
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

function slotMethod(from: number, kind = "spell"): RuntimeSpellCastingMethod {
  return {
    key: "slot",
    kind,
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
        [slotMethod(3), { ...slotMethod(3, "bonus_action"), key: "spell-breaker-bonus-action" }],
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
        [{ key: "cantrip", kind: "cantrip", ability: "intelligence", saveDc: spellDc, requiresPrepared: false }],
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
        [
          slotMethod(2),
          {
            key: "phantom-free",
            kind: "spell",
            ability: "intelligence",
            saveDc: spellDc,
            requiresPrepared: false,
            resourceOptions: [{ key: "free", label: "Бесплатный призрачный призыв", costs: [{ key: "wizard_illusionist_free_summon_beast", amount: 1 }] }],
          },
        ],
      ),
      spell(
        "illusionist-summon-fey-access",
        "wizard:illusionist:phantasmal-creatures",
        "summon-fey",
        "Призыв феи",
        3,
        "conjuration",
        "always_prepared",
        [
          slotMethod(3),
          {
            key: "phantom-free",
            kind: "spell",
            ability: "intelligence",
            saveDc: spellDc,
            requiresPrepared: false,
            resourceOptions: [{ key: "free", label: "Бесплатный призрачный призыв", costs: [{ key: "wizard_illusionist_free_summon_fey", amount: 1 }] }],
          },
        ],
      ),
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

const runtimeSubclasses: RuntimeSubclass[] = [abjurer, diviner, evoker, illusionist]

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
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: entry.summary,
      author_description: "",
      author_comment: "",
      rules_meta: {
        base_class: "class:wizard",
        rules_revision: "2024",
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
