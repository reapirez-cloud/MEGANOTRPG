import type { FormulaExpression, SpellCastingMethodDefinition } from "../character-engine/index.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"
import {
  WARLOCK_PHB2024_SUBCLASSES,
  WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS,
  WARLOCK_SUBCLASS_RUNTIME_LEVELS,
  type WarlockPhb2024SubclassCatalogKey,
} from "./warlockSubclasses.ts"

export const WARLOCK_SUBCLASS_RUNTIME_REVISION = "xphb-2024-warlock-subclasses-runtime-v1" as const
export const WARLOCK_SUBCLASS_RUNTIME_CATALOG_KEYS = WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS

const now = "2026-09-07T00:00:00Z"
const warlockParentId = "warlock-subclass-runtime-parent"

const lit = (value: number): FormulaExpression => ({ kind: "literal", value })
const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })
const max = (...values: FormulaExpression[]): FormulaExpression => ({ kind: "max", values })
const chaMod = ref("abilities.charisma.modifier")
const sourceLevel = ref("source.level")
const spellDc = add(lit(8), ref("core.proficiencyBonus"), chaMod)
const spellAttack = add(ref("core.proficiencyBonus"), chaMod)

type RuntimeLevel = (typeof WARLOCK_SUBCLASS_RUNTIME_LEVELS)[number]
type RuntimeSubclass = {
  id: "archfey" | "celestial" | "fiend" | "great-old-one"
  catalogKey: WarlockPhb2024SubclassCatalogKey
  slug: string
  name: string
  description: string
  summary: string
  levels: Record<RuntimeLevel, StoredMechanics>
  choicesByLevel?: Partial<Record<RuntimeLevel, RuleChoiceDefinition[]>>
}

type PatronSpell = { slug: string; name: string; level: number; school: string; unlock: 3 | 5 | 7 | 9 }

function feature(id: string, sourceKey: string, key: string, label: string, description: string, mechanic: Record<string, unknown>): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description, mechanic } } as StoredMechanic
}

function grant(id: string, sourceKey: string, target: "resistance" | "immunity", key: string, label: string): StoredMechanic {
  return { id, type: "grant", sourceKey, target, key, payload: { label } } as StoredMechanic
}

function resource(id: string, sourceKey: string, key: string, label: string, maximum: number | FormulaExpression, recharge: "long_rest" | Array<"short_rest" | "long_rest">): StoredMechanic {
  return { id, type: "resource", sourceKey, key, label, max: maximum, recharge, initial: "full", presentation: { tone: "violet", display: "pips" } } as StoredMechanic
}

function action(id: string, sourceKey: string, key: string, label: string, economy: string, extra: Record<string, unknown> = {}): StoredMechanic {
  return { id, type: "action", sourceKey, key, label, economy, tags: ["warlock", "subclass"], ...extra } as StoredMechanic
}

function semanticAction(id: string, sourceKey: string, key: string, label: string, economy: string, resourceKey: string | null, semanticKey: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}): StoredMechanic {
  return action(id, sourceKey, key, label, economy, {
    ...(resourceKey ? { resourceCosts: [{ key: resourceKey, amount: 1 }] } : {}),
    effects: [{ kind: "semantic", key: semanticKey, payload }],
    ...extra,
  })
}

function restoreByPactSlot(prefix: string, sourceKey: string, targetResource: string, label: string): StoredMechanic {
  return action(`${prefix}-restore-by-pact-slot`, sourceKey, `${prefix}_restore_by_pact_slot`, label, "no_action", {
    resourceCosts: [{ key: "warlock_pact_slots", amount: 1 }],
    effects: [{ kind: "resource", key: targetResource, operation: "RESTORE", amount: 1 }],
    tags: ["warlock", "subclass", "resource-conversion", "pact-magic"],
  })
}

function pactMethod(spellLevel: number, castLevel: number): SpellCastingMethodDefinition {
  return {
    key: `pact-${castLevel}`,
    kind: "pact_magic",
    ability: "charisma",
    saveDc: spellDc,
    attackBonus: spellAttack,
    requiresPrepared: false,
    ...(spellLevel === 0 ? {} : {
      resourceOptions: [{ key: `pact-${castLevel}`, castLevel, costs: [{ key: "warlock_pact_slots", amount: 1 }] }],
    }),
  }
}

function patronSpell(sourceKey: string, patron: string, spell: PatronSpell, castLevel: number, priority: number): StoredMechanic {
  return {
    id: `${patron}-spell-${spell.slug}-l${priority}`,
    type: "spell",
    sourceKey,
    key: `spell:${spell.slug}`,
    catalogSlug: spell.slug,
    variantKey: `warlock-subclass:${patron}:${spell.slug}`,
    grantOperation: priority > spell.unlock ? "REPLACE" : "GRANT",
    priority,
    payload: {
      spell: { name: spell.name, level: spell.level, school: spell.school },
      preparation: { mode: "always_prepared" },
      methods: [pactMethod(spell.level, spell.level === 0 ? 0 : castLevel)],
    },
  } as StoredMechanic
}

function patronSpellProgression(patron: string, spells: PatronSpell[]): Record<3 | 5 | 7 | 9, StoredMechanics> {
  const result = { 3: [], 5: [], 7: [], 9: [] } as Record<3 | 5 | 7 | 9, StoredMechanics>
  for (const level of [3, 5, 7, 9] as const) {
    const pactLevel = level === 3 ? 2 : level === 5 ? 3 : level === 7 ? 4 : 5
    for (const spell of spells) {
      if (spell.unlock > level) continue
      if (spell.level === 0 && spell.unlock < level) continue
      result[level].push(patronSpell(`warlock:${patron}:patron-spells`, patron, spell, pactLevel, level))
    }
  }
  return result
}

const archfeySpells: PatronSpell[] = [
  { slug: "calm-emotions", name: "Умиротворение", level: 2, school: "Enchantment", unlock: 3 },
  { slug: "faerie-fire", name: "Фейское сияние", level: 1, school: "Evocation", unlock: 3 },
  { slug: "misty-step", name: "Туманный шаг", level: 2, school: "Conjuration", unlock: 3 },
  { slug: "phantasmal-force", name: "Фантомная сила", level: 2, school: "Illusion", unlock: 3 },
  { slug: "sleep", name: "Сон", level: 1, school: "Enchantment", unlock: 3 },
  { slug: "blink", name: "Мерцание", level: 3, school: "Transmutation", unlock: 5 },
  { slug: "plant-growth", name: "Рост растений", level: 3, school: "Transmutation", unlock: 5 },
  { slug: "dominate-beast", name: "Подчинение зверя", level: 4, school: "Enchantment", unlock: 7 },
  { slug: "greater-invisibility", name: "Высшая невидимость", level: 4, school: "Illusion", unlock: 7 },
  { slug: "dominate-person", name: "Подчинение личности", level: 5, school: "Enchantment", unlock: 9 },
  { slug: "seeming", name: "Маскарад", level: 5, school: "Illusion", unlock: 9 },
]

const celestialSpells: PatronSpell[] = [
  { slug: "aid", name: "Подмога", level: 2, school: "Abjuration", unlock: 3 },
  { slug: "cure-wounds", name: "Лечение ран", level: 1, school: "Abjuration", unlock: 3 },
  { slug: "guiding-bolt", name: "Направляющий снаряд", level: 1, school: "Evocation", unlock: 3 },
  { slug: "lesser-restoration", name: "Малое восстановление", level: 2, school: "Abjuration", unlock: 3 },
  { slug: "light", name: "Свет", level: 0, school: "Evocation", unlock: 3 },
  { slug: "sacred-flame", name: "Священное пламя", level: 0, school: "Evocation", unlock: 3 },
  { slug: "daylight", name: "Дневной свет", level: 3, school: "Evocation", unlock: 5 },
  { slug: "revivify", name: "Возвращение к жизни", level: 3, school: "Necromancy", unlock: 5 },
  { slug: "guardian-of-faith", name: "Страж веры", level: 4, school: "Conjuration", unlock: 7 },
  { slug: "wall-of-fire", name: "Стена огня", level: 4, school: "Evocation", unlock: 7 },
  { slug: "greater-restoration", name: "Высшее восстановление", level: 5, school: "Abjuration", unlock: 9 },
  { slug: "summon-celestial", name: "Призыв небожителя", level: 5, school: "Conjuration", unlock: 9 },
]

const fiendSpells: PatronSpell[] = [
  { slug: "burning-hands", name: "Пылающие ладони", level: 1, school: "Evocation", unlock: 3 },
  { slug: "command", name: "Приказ", level: 1, school: "Enchantment", unlock: 3 },
  { slug: "scorching-ray", name: "Палящий луч", level: 2, school: "Evocation", unlock: 3 },
  { slug: "suggestion", name: "Внушение", level: 2, school: "Enchantment", unlock: 3 },
  { slug: "fireball", name: "Огненный шар", level: 3, school: "Evocation", unlock: 5 },
  { slug: "stinking-cloud", name: "Зловонное облако", level: 3, school: "Conjuration", unlock: 5 },
  { slug: "fire-shield", name: "Огненный щит", level: 4, school: "Evocation", unlock: 7 },
  { slug: "wall-of-fire", name: "Стена огня", level: 4, school: "Evocation", unlock: 7 },
  { slug: "geas", name: "Гейс", level: 5, school: "Enchantment", unlock: 9 },
  { slug: "insect-plague", name: "Нашествие насекомых", level: 5, school: "Conjuration", unlock: 9 },
]

const greatOldOneSpells: PatronSpell[] = [
  { slug: "detect-thoughts", name: "Обнаружение мыслей", level: 2, school: "Divination", unlock: 3 },
  { slug: "dissonant-whispers", name: "Диссонирующий шёпот", level: 1, school: "Enchantment", unlock: 3 },
  { slug: "phantasmal-force", name: "Фантомная сила", level: 2, school: "Illusion", unlock: 3 },
  { slug: "hideous-laughter", name: "Отвратительный смех", level: 1, school: "Enchantment", unlock: 3 },
  { slug: "clairvoyance", name: "Ясновидение", level: 3, school: "Divination", unlock: 5 },
  { slug: "hunger-of-hadar", name: "Голод Хадара", level: 3, school: "Conjuration", unlock: 5 },
  { slug: "confusion", name: "Замешательство", level: 4, school: "Enchantment", unlock: 7 },
  { slug: "summon-aberration", name: "Призыв аберрации", level: 4, school: "Conjuration", unlock: 7 },
  { slug: "modify-memory", name: "Изменение памяти", level: 5, school: "Enchantment", unlock: 9 },
  { slug: "telekinesis", name: "Телекинез", level: 5, school: "Transmutation", unlock: 9 },
]

const archfeySpellLevels = patronSpellProgression("archfey", archfeySpells)
const celestialSpellLevels = patronSpellProgression("celestial", celestialSpells)
const fiendSpellLevels = patronSpellProgression("fiend", fiendSpells)
const gooSpellLevels = patronSpellProgression("great-old-one", greatOldOneSpells)

const archfey: RuntimeSubclass = {
  id: "archfey",
  catalogKey: "subclass:warlock:archfey",
  slug: "warlock-archfey",
  name: "Архифея",
  description: "Покровительство Архифеи превращает Туманный шаг в основной инструмент перемещения, защиты и давления.",
  summary: "Всегда подготовленные заклинания Архифеи, бесплатные Туманные шаги, новые эффекты шага, Фейская защита и Блуждающие чары.",
  levels: {
    3: [
      ...archfeySpellLevels[3],
      feature("archfey-steps-rules", "warlock:archfey:steps", "warlock_archfey_steps_of_the_fey", "Шаги фей", "Туманный шаг можно бесплатно сотворить число раз, равное модификатору Харизмы (минимум 1), с полным восстановлением после долгого отдыха. Каждый Туманный шаг может получить один дополнительный эффект: временные хиты союзнику рядом после телепортации или помеху атакам существ у оставленного пространства против целей, кроме колдуна.", { kind: "archfey_steps_of_the_fey", freeMistyStepUses: "charisma_modifier_min_1", refreshingStep: { tempHp: "1d10", rangeFeet: 10 }, tauntingStep: { radiusFeet: 5, save: "wisdom", duration: "until_start_of_next_turn" } }),
      resource("archfey-steps-resource", "warlock:archfey:steps", "warlock_archfey_steps_of_the_fey", "Шаги фей", max(lit(1), chaMod), "long_rest"),
      {
        id: "archfey-free-misty-step",
        type: "spell",
        sourceKey: "warlock:archfey:steps",
        key: "spell:misty-step",
        catalogSlug: "misty-step",
        variantKey: "warlock-subclass:archfey:steps-of-the-fey",
        payload: {
          spell: { name: "Туманный шаг", level: 2, school: "Conjuration" },
          preparation: { mode: "always_prepared" },
          methods: [{ key: "steps-of-the-fey", kind: "class_feature", ability: "charisma", requiresPrepared: false, resourceOptions: [{ key: "free-step", castLevel: 2, costs: [{ key: "warlock_archfey_steps_of_the_fey", amount: 1 }] }] }],
        },
      } as StoredMechanic,
    ],
    5: archfeySpellLevels[5],
    6: [
      feature("archfey-misty-escape", "warlock:archfey:misty-escape", "warlock_archfey_misty_escape", "Туманный побег", "Получив урон, колдун может сотворить Туманный шаг Реакцией. К Шагам фей добавляются исчезновение до начала следующего хода (или до атаки, урона либо заклинания) и психический удар 2d10 по существам рядом с точкой ухода или появления.", { kind: "archfey_misty_escape", reactionTrigger: "takes_damage", disappearingStep: true, dreadfulStep: { radiusFeet: 5, damage: "2d10", damageType: "psychic", save: "wisdom" }, gm_trigger_gate: true }),
    ],
    7: archfeySpellLevels[7],
    9: archfeySpellLevels[9],
    10: [
      feature("archfey-beguiling-rules", "warlock:archfey:beguiling-defenses", "warlock_archfey_beguiling_defenses", "Фейская защита", "Колдун невосприимчив к Очарованию. После попадания видимой атакой Реакция может вдвое уменьшить получаемый урон; при провале спасброска Мудрости атакующий получает психический урон, равный фактически полученному колдуном. Бесплатное использование восстанавливается после долгого отдыха; его можно восстановить, потратив ячейку Магии договора.", { kind: "archfey_beguiling_defenses", reaction: true, halveDamage: true, retaliationSave: "wisdom", retaliationDamage: "damage_taken", gm_hit_gate: true }),
      grant("archfey-charmed-immunity", "warlock:archfey:beguiling-defenses", "immunity", "condition:charmed", "Невосприимчивость к Очарованию"),
      resource("archfey-beguiling-resource", "warlock:archfey:beguiling-defenses", "warlock_archfey_beguiling_defenses", "Фейская защита", 1, "long_rest"),
      semanticAction("archfey-beguiling-action", "warlock:archfey:beguiling-defenses", "warlock_archfey_beguiling_defenses", "Фейская защита", "reaction", "warlock_archfey_beguiling_defenses", "reduce_and_reflect_damage", { fraction: 0.5, save: "wisdom", reflectedType: "psychic", gm_hit_gate: true }),
      restoreByPactSlot("warlock_archfey_beguiling_defenses", "warlock:archfey:beguiling-defenses", "warlock_archfey_beguiling_defenses", "Восстановить Фейскую защиту ячейкой Магии договора"),
    ],
    14: [
      feature("archfey-bewitching", "warlock:archfey:bewitching-magic", "warlock_archfey_bewitching_magic", "Блуждающие чары", "Сразу после сотворения заклинания Очарования или Иллюзии действием и с расходом ячейки можно частью того же действия бесплатно сотворить Туманный шаг.", { kind: "archfey_bewitching_magic", triggerSchools: ["enchantment", "illusion"], requiresAction: true, requiresSpellSlot: true, freeSpell: "misty-step", gm_trigger_gate: true }),
    ],
  },
}

function healingLightActions(): StoredMechanics {
  return Array.from({ length: 5 }, (_, index) => {
    const dice = index + 1
    return semanticAction(
      `celestial-healing-light-${dice}`,
      "warlock:celestial:healing-light",
      `warlock_celestial_healing_light_${dice}d6`,
      `Лечащий свет: ${dice}d6`,
      "bonus_action",
      null,
      "healing",
      { dice: { count: dice, sides: 6 }, rangeFeet: 60, maximumDice: "charisma_modifier_min_1" },
      {
        resourceCosts: [{ key: "warlock_celestial_healing_light", amount: dice }],
        requirements: [{ kind: "condition", condition: { kind: "always" }, enforcement: "gm", label: `За один раз нельзя тратить больше модификатора Харизмы (минимум 1); выбран расход ${dice}.` }],
        tags: ["warlock", "subclass", "healing-light"],
      },
    )
  })
}

const celestial: RuntimeSubclass = {
  id: "celestial",
  catalogKey: "subclass:warlock:celestial",
  slug: "warlock-celestial",
  name: "Небожитель",
  description: "Покровительство Небожителя даёт собственный запас лечения и усиливает светлую и огненную магию.",
  summary: "Всегда подготовленные небесные заклинания, Лечащий свет, Сияющая душа, Небесная стойкость и Испепеляющая месть.",
  levels: {
    3: [
      ...celestialSpellLevels[3],
      feature("celestial-healing-light-rules", "warlock:celestial:healing-light", "warlock_celestial_healing_light", "Лечащий свет", "Запас d6 равен уровню Колдуна + 1. Бонусным действием можно исцелить себя или видимое существо в 60 футах, потратив от 1 до числа костей, равного модификатору Харизмы (минимум 1). Запас полностью восстанавливается после долгого отдыха.", { kind: "celestial_healing_light", die: "d6", pool: "warlock_level_plus_1", maxDicePerUse: "charisma_modifier_min_1", rangeFeet: 60 }),
      resource("celestial-healing-light-resource", "warlock:celestial:healing-light", "warlock_celestial_healing_light", "Кости Лечащего света", add(lit(1), sourceLevel), "long_rest"),
      ...healingLightActions(),
    ],
    5: celestialSpellLevels[5],
    6: [
      feature("celestial-radiant-soul-rules", "warlock:celestial:radiant-soul", "warlock_celestial_radiant_soul", "Сияющая душа", "Колдун получает сопротивление сияющему урону. Один раз за ход, когда его заклинание наносит сияющий или огненный урон, к урону по одной цели можно добавить модификатор Харизмы.", { kind: "celestial_radiant_soul", damageTypes: ["radiant", "fire"], bonus: "charisma_modifier", cadence: "once_per_turn", gm_turn_gate: true }),
      grant("celestial-radiant-resistance", "warlock:celestial:radiant-soul", "resistance", "damage:radiant", "Сопротивление сияющему урону"),
    ],
    7: celestialSpellLevels[7],
    9: celestialSpellLevels[9],
    10: [
      feature("celestial-resilience-rules", "warlock:celestial:resilience", "warlock_celestial_resilience", "Небесная стойкость", "После Магической хитрости, короткого или долгого отдыха колдун получает временные хиты, равные уровню Колдуна + модификатору Харизмы. До пяти видимых существ в этот момент получают временные хиты, равные половине уровня Колдуна + модификатору Харизмы.", { kind: "celestial_resilience", triggers: ["magical_cunning", "short_rest", "long_rest"], selfTempHp: "warlock_level_plus_charisma", allyCount: 5, allyTempHp: "floor_half_warlock_level_plus_charisma", gm_target_gate: true }),
    ],
    14: [
      feature("celestial-searing-rules", "warlock:celestial:searing-vengeance", "warlock_celestial_searing_vengeance", "Испепеляющая месть", "Когда колдун или союзник в 60 футах собирается сделать спасбросок от смерти, способность восстанавливает цели половину максимума хитов, позволяет прекратить состояние Лёжа и наносит выбранным существам в 30 футах от цели 2d8 + модификатор Харизмы сияющего урона с ослеплением до конца текущего хода. Использование восстанавливается после долгого отдыха.", { kind: "celestial_searing_vengeance", trigger: "about_to_make_death_save", rangeFeet: 60, heal: "half_max_hp", areaFeet: 30, damage: "2d8_plus_charisma", damageType: "radiant", blindedUntil: "end_of_current_turn", gm_trigger_gate: true }),
      resource("celestial-searing-resource", "warlock:celestial:searing-vengeance", "warlock_celestial_searing_vengeance", "Испепеляющая месть", 1, "long_rest"),
      semanticAction("celestial-searing-action", "warlock:celestial:searing-vengeance", "warlock_celestial_searing_vengeance", "Испепеляющая месть", "reaction", "warlock_celestial_searing_vengeance", "searing_vengeance", { rangeFeet: 60, heal: "half_max_hp", damage: "2d8_plus_charisma", damageType: "radiant", gm_trigger_gate: true }),
    ],
  },
}

const resilienceTypes = [
  ["acid", "Кислота"], ["bludgeoning", "Дробящий"], ["cold", "Холод"], ["fire", "Огонь"],
  ["lightning", "Электричество"], ["necrotic", "Некротический"], ["piercing", "Колющий"], ["poison", "Яд"],
  ["psychic", "Психический"], ["radiant", "Сияющий"], ["slashing", "Рубящий"], ["thunder", "Звук"],
] as const

const fiendResilienceChoice: RuleChoiceDefinition = {
  key: "warlock_fiend_fiendish_resilience",
  label: "Стойкость исчадия: тип урона",
  target: "trait",
  selection_mode: "player_once",
  refresh: "short_or_long_rest",
  count: 1,
  options: resilienceTypes.map(([key]) => key),
  option_labels: Object.fromEntries(resilienceTypes.map(([key, label]) => [key, label])),
  option_mechanics: Object.fromEntries(resilienceTypes.map(([key, label]) => [key, [grant(`fiend-resilience-${key}`, "warlock:fiend:fiendish-resilience", "resistance", `damage:${key}`, `Сопротивление: ${label}`)]])),
}

const fiend: RuntimeSubclass = {
  id: "fiend",
  catalogKey: "subclass:warlock:fiend",
  slug: "warlock-fiend",
  name: "Исчадие",
  description: "Покровительство Исчадия вознаграждает гибель врагов, искажает удачу и позволяет переживать выбранный тип урона.",
  summary: "Всегда подготовленные инфернальные заклинания, Благословение Тёмного, Удача Тёмного, Стойкость исчадия и Бросок сквозь Ад.",
  levels: {
    3: [
      ...fiendSpellLevels[3],
      feature("fiend-blessing-rules", "warlock:fiend:dark-ones-blessing", "warlock_fiend_dark_ones_blessing", "Благословение Тёмного", "Когда колдун снижает врага до 0 хитов или это делает кто-то другой с врагом в 10 футах от колдуна, колдун получает временные хиты, равные модификатору Харизмы + уровню Колдуна (минимум 1).", { kind: "fiend_dark_ones_blessing", trigger: "enemy_reduced_to_zero", allyTriggerRadiusFeet: 10, tempHp: "charisma_plus_warlock_level_min_1", gm_trigger_gate: true }),
    ],
    5: fiendSpellLevels[5],
    6: [
      feature("fiend-luck-rules", "warlock:fiend:dark-ones-own-luck", "warlock_fiend_dark_ones_own_luck", "Удача Тёмного", "После броска проверки характеристики или спасброска, но до применения результата, можно добавить 1d10. Использований за долгий отдых: модификатор Харизмы, минимум 1; не более одного использования на один бросок.", { kind: "fiend_dark_ones_own_luck", die: "1d10", triggers: ["ability_check", "saving_throw"], uses: "charisma_modifier_min_1", cadence: "once_per_roll", gm_trigger_gate: true }),
      resource("fiend-luck-resource", "warlock:fiend:dark-ones-own-luck", "warlock_fiend_dark_ones_own_luck", "Удача Тёмного", max(lit(1), chaMod), "long_rest"),
      semanticAction("fiend-luck-action", "warlock:fiend:dark-ones-own-luck", "warlock_fiend_dark_ones_own_luck", "Удача Тёмного", "reaction", "warlock_fiend_dark_ones_own_luck", "add_die_to_d20_test", { die: "1d10", timing: "after_roll_before_effect", gm_trigger_gate: true }),
    ],
    7: fiendSpellLevels[7],
    9: fiendSpellLevels[9],
    10: [
      feature("fiend-resilience-rules", "warlock:fiend:fiendish-resilience", "warlock_fiend_fiendish_resilience", "Стойкость исчадия", "После короткого или долгого отдыха выберите один тип урона, кроме силового. До следующего выбора колдун имеет сопротивление выбранному типу.", { kind: "fiend_fiendish_resilience", refresh: "short_or_long_rest", excludedDamageTypes: ["force"] }),
    ],
    14: [
      feature("fiend-hurl-rules", "warlock:fiend:hurl-through-hell", "warlock_fiend_hurl_through_hell", "Бросок сквозь Ад", "Один раз за ход после попадания атакой цель делает спасбросок Харизмы против Сл заклинаний. При провале цель исчезает до конца следующего хода колдуна, недеемон получает 8d10 психического урона и на это время становится Недееспособным. Одно бесплатное использование восстанавливается после долгого отдыха; его можно восстановить ячейкой Магии договора.", { kind: "fiend_hurl_through_hell", trigger: "attack_hit", save: "charisma", damage: "8d10", damageType: "psychic", excludesDamageFor: "fiend", condition: "incapacitated", return: "end_of_next_turn", cadence: "once_per_turn", gm_hit_gate: true, gm_turn_gate: true }),
      resource("fiend-hurl-resource", "warlock:fiend:hurl-through-hell", "warlock_fiend_hurl_through_hell", "Бросок сквозь Ад", 1, "long_rest"),
      semanticAction("fiend-hurl-action", "warlock:fiend:hurl-through-hell", "warlock_fiend_hurl_through_hell", "Бросок сквозь Ад", "no_action", "warlock_fiend_hurl_through_hell", "hurl_through_hell", { save: "charisma", damage: "8d10", damageType: "psychic", gm_hit_gate: true }),
      restoreByPactSlot("warlock_fiend_hurl_through_hell", "warlock:fiend:hurl-through-hell", "warlock_fiend_hurl_through_hell", "Восстановить Бросок сквозь Ад ячейкой Магии договора"),
    ],
  },
  choicesByLevel: { 10: [fiendResilienceChoice] },
}

const greatOldOne: RuntimeSubclass = {
  id: "great-old-one",
  catalogKey: "subclass:warlock:great-old-one",
  slug: "warlock-great-old-one",
  name: "Великий Древний",
  description: "Покровительство Великого Древнего строится на телепатической связи, психическом уроне, Сглазе и призванных аберрациях.",
  summary: "Всегда подготовленные чуждые заклинания, Пробуждённый разум, Психические заклинания, Ясновидящий боец, Потусторонний сглаз, Щит мыслей и Создание раба.",
  levels: {
    3: [
      ...gooSpellLevels[3],
      feature("goo-awakened-mind", "warlock:great-old-one:awakened-mind", "warlock_goo_awakened_mind", "Пробуждённый разум", "Бонусным действием можно связать разум с видимым существом в 30 футах. Пока оба находятся в пределах числа миль, равного модификатору Харизмы (минимум 1), они могут общаться телепатически на общем языке. Связь длится число минут, равное уровню Колдуна, и прекращается при создании новой связи.", { kind: "goo_awakened_mind", activation: "bonus_action", initialRangeFeet: 30, communicationRangeMiles: "charisma_modifier_min_1", durationMinutes: "warlock_level", requiresSharedLanguage: true, gm_target_gate: true }),
      semanticAction("goo-awakened-mind-action", "warlock:great-old-one:awakened-mind", "warlock_goo_awakened_mind", "Пробуждённый разум", "bonus_action", null, "create_telepathic_bond", { initialRangeFeet: 30, durationMinutes: "warlock_level", gm_target_gate: true }),
      feature("goo-psychic-spells", "warlock:great-old-one:psychic-spells", "warlock_goo_psychic_spells", "Психические заклинания", "Наносящее урон заклинание Колдуна может заменить тип урона на психический. Заклинания Колдуна школ Очарования и Иллюзии можно сотворять без вербальных и соматических компонентов.", { kind: "goo_psychic_spells", replaceDamageWith: "psychic", componentlessSchools: ["enchantment", "illusion"], removesComponents: ["verbal", "somatic"] }),
    ],
    5: gooSpellLevels[5],
    6: [
      feature("goo-clairvoyant-rules", "warlock:great-old-one:clairvoyant-combatant", "warlock_goo_clairvoyant_combatant", "Ясновидящий боец", "При создании связи Пробуждённого разума можно потребовать спасбросок Мудрости. При провале цель имеет помеху атакам против колдуна, а колдун имеет преимущество атакам против неё до конца телепатической связи. Использование восстанавливается после короткого или долгого отдыха; его можно восстановить ячейкой Магии договора.", { kind: "goo_clairvoyant_combatant", trigger: "awakened_mind_bond", save: "wisdom", targetAttackDisadvantage: true, selfAttackAdvantage: true, duration: "bond", gm_target_gate: true }),
      resource("goo-clairvoyant-resource", "warlock:great-old-one:clairvoyant-combatant", "warlock_goo_clairvoyant_combatant", "Ясновидящий боец", 1, ["short_rest", "long_rest"]),
      semanticAction("goo-clairvoyant-action", "warlock:great-old-one:clairvoyant-combatant", "warlock_goo_clairvoyant_combatant", "Ясновидящий боец", "no_action", "warlock_goo_clairvoyant_combatant", "clairvoyant_combatant", { save: "wisdom", duration: "awakened_mind_bond", gm_target_gate: true }),
      restoreByPactSlot("warlock_goo_clairvoyant_combatant", "warlock:great-old-one:clairvoyant-combatant", "warlock_goo_clairvoyant_combatant", "Восстановить Ясновидящего бойца ячейкой Магии договора"),
    ],
    7: gooSpellLevels[7],
    9: gooSpellLevels[9],
    10: [
      {
        id: "goo-hex-access",
        type: "spell",
        sourceKey: "warlock:great-old-one:eldritch-hex",
        key: "spell:hex",
        catalogSlug: "hex",
        variantKey: "warlock-subclass:great-old-one:eldritch-hex",
        payload: { spell: { name: "Сглаз", level: 1, school: "Enchantment" }, preparation: { mode: "always_prepared" }, methods: [pactMethod(1, 5)] },
      } as StoredMechanic,
      feature("goo-eldritch-hex", "warlock:great-old-one:eldritch-hex", "warlock_goo_eldritch_hex", "Потусторонний сглаз", "Сглаз всегда подготовлен. Когда при его сотворении выбирается характеристика, цель также получает помеху на спасброски этой характеристики на время действия Сглаза.", { kind: "goo_eldritch_hex", spell: "hex", savingThrowDisadvantageForChosenAbility: true }),
      feature("goo-thought-shield", "warlock:great-old-one:thought-shield", "warlock_goo_thought_shield", "Щит мыслей", "Мысли колдуна нельзя читать телепатией или иным способом без его разрешения. Колдун получает сопротивление психическому урону; существо, наносящее ему психический урон, получает столько же психического урона, сколько фактически получил колдун.", { kind: "goo_thought_shield", blocksMindReadingUnlessAllowed: true, reflectPsychicDamageTaken: true, gm_trigger_gate: true }),
      grant("goo-psychic-resistance", "warlock:great-old-one:thought-shield", "resistance", "damage:psychic", "Сопротивление психическому урону"),
    ],
    14: [
      feature("goo-create-thrall", "warlock:great-old-one:create-thrall", "warlock_goo_create_thrall", "Создание раба", "При сотворении Призыва аберрации можно убрать концентрацию; тогда длительность становится 1 минутой, а призванная аберрация получает временные хиты, равные уровню Колдуна + модификатору Харизмы. Первый раз за ход, когда эта аберрация попадает по существу под Сглазом колдуна, она наносит дополнительный психический урон, равный бонусному урону Сглаза.", { kind: "goo_create_thrall", spell: "summon-aberration", concentration: false, durationMinutes: 1, summonTempHp: "warlock_level_plus_charisma", hexRider: { cadence: "once_per_turn", damage: "hex_bonus_damage", damageType: "psychic" }, gm_turn_gate: true }),
    ],
  },
}

const runtimeSubclasses: RuntimeSubclass[] = [archfey, celestial, fiend, greatOldOne]

const warlockParentBundle: CharacterTemplateBundle = {
  assignment: {
    id: "warlock-subclass-runtime-parent-assignment",
    character_id: "warlock-subclass-runtime-character",
    template_id: warlockParentId,
    template_level: 14,
    selected_choices: {},
    assigned_at: now,
    updated_at: now,
  },
  template: {
    id: warlockParentId,
    campaign_id: "warlock-subclass-runtime-campaign",
    kind: "class",
    slug: "warlock-core",
    name: "Колдун",
    description: "Родительский runtime-источник Колдуна для проверки покровителей 2024.",
    version: 1,
    mechanics: [
      resource("warlock-subclass-fixture-pact", "warlock:runtime-parent", "warlock_pact_slots", "Ячейки Магии договора", 3, ["short_rest", "long_rest"]),
      feature("warlock-subclass-parent-rule", "warlock:runtime-parent", "class:warlock:subclass-level-source", "Уровень Колдуна", "Подкласс использует уровень родительского класса Колдуна. Покровитель открывается на 3 уровне; его основные особенности приходят на 3, 6, 10 и 14 уровнях.", { kind: "class_level_source", subclassLevels: [3, 6, 10, 14] }),
    ],
    choices: [],
    parent_template_id: null,
    unlock_level: null,
    catalog_key: "class:warlock",
    catalog_revision: "xphb-2024-warlock-base-runtime-v1",
    source_kind: "official",
    source_label: "Player's Handbook 2024",
    is_builtin: true,
    mechanical_summary: "Колдун использует уровень класса как источник прогрессии покровителя и общий запас Магии договора.",
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
  const templateId = `warlock-subclass-runtime-${entry.id}`
  const catalogEntry = WARLOCK_PHB2024_SUBCLASSES.find((candidate) => candidate.catalogKey === entry.catalogKey)
  if (!catalogEntry) throw new Error(`Missing Warlock subclass catalog metadata: ${entry.catalogKey}`)
  return {
    assignment: {
      id: `${templateId}-assignment`,
      character_id: "warlock-subclass-runtime-character",
      template_id: templateId,
      template_level: null,
      selected_choices: {},
      assigned_at: now,
      updated_at: now,
    },
    template: {
      id: templateId,
      campaign_id: "warlock-subclass-runtime-campaign",
      kind: "subclass",
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: warlockParentId,
      unlock_level: 3,
      catalog_key: entry.catalogKey,
      catalog_revision: WARLOCK_SUBCLASS_RUNTIME_REVISION,
      source_kind: "official",
      source_label: catalogEntry.sourceLabel,
      is_builtin: true,
      mechanical_summary: entry.summary,
      author_description: "",
      author_comment: "",
      rules_meta: {
        base_class: "class:warlock",
        rules_revision: "2024",
        mechanics_status: "READY",
        feature_levels: [3, 6, 10, 14],
        patron_spell_unlock_levels: [3, 5, 7, 9],
        chat_template_actions: true,
        chat_template_spells: true,
      },
      is_active: true,
      created_by: null,
      created_at: now,
      updated_at: now,
    },
    levels: WARLOCK_SUBCLASS_RUNTIME_LEVELS.map((level) => ({
      id: `${templateId}-level-${level}`,
      template_id: templateId,
      level,
      mechanics: entry.levels[level],
      choices: entry.choicesByLevel?.[level] ?? [],
    })),
  }
}

export const warlockSubclassRuntimeBundles: CharacterTemplateBundle[] = [
  warlockParentBundle,
  ...runtimeSubclasses.map(subclassBundle),
]
