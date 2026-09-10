import type { FormulaExpression, SpellCastingMethodDefinition } from "../character-engine/index.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition, RuleTemplate } from "./types.ts"

export const SORCERER_STAGE7_RUNTIME_REVISION = "xphb-2024-sorcerer-stage7-subclass-runtime-v1" as const
export const SORCERER_STAGE7_RUNTIME_CATALOG_KEYS = [
  "subclass:sorcerer:aberrant-sorcery",
  "subclass:sorcerer:clockwork-sorcery",
  "subclass:sorcerer:draconic-sorcery",
  "subclass:sorcerer:wild-magic-sorcery",
  "subclass:sorcerer:divine-soul",
  "subclass:sorcerer:shadow-magic",
  "subclass:sorcerer:storm-sorcery",
  "subclass:sorcerer:lunar-sorcery",
  "subclass:sorcerer:pyromancer",
] as const
export const SORCERER_STAGE7_REFERENCE_ONLY = [
  "subclass:sorcerer:runechild",
  "subclass:sorcerer:phoenix-sorcery",
  "subclass:sorcerer:stone-sorcery",
] as const

const now = "2026-09-10T00:00:00Z"
const parentId = "sorcerer-stage7-parent"
const lit = (value: number): FormulaExpression => ({ kind: "literal", value })
const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })
const spellDc = add(lit(8), ref("core.proficiencyBonus"), ref("abilities.charisma.modifier"))
const spellAttack = add(ref("core.proficiencyBonus"), ref("abilities.charisma.modifier"))

function feature(id: string, sourceKey: string, key: string, label: string, description: string, mechanic: Record<string, unknown>): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description, mechanic } } as StoredMechanic
}
function resistance(id: string, sourceKey: string, type: string, label: string): StoredMechanic {
  return { id, type: "grant", target: "resistance", key: `damage:${type}`, sourceKey, payload: { label } } as StoredMechanic
}
function immunity(id: string, sourceKey: string, type: string, label: string): StoredMechanic {
  return { id, type: "grant", target: "immunity", key: `damage:${type}`, sourceKey, payload: { label } } as StoredMechanic
}
function resource(id: string, sourceKey: string, key: string, label: string, max: number | FormulaExpression, recharge: "long_rest" | "short_rest" | Array<"short_rest" | "long_rest">): StoredMechanic {
  return { id, type: "resource", key, label, max, recharge, initial: "full", sourceKey } as StoredMechanic
}
function action(id: string, sourceKey: string, key: string, label: string, economy: string, extra: Record<string, unknown> = {}): StoredMechanic {
  return { id, type: "action", sourceKey, key, label, economy, tags: ["sorcerer", "subclass"], ...extra } as StoredMechanic
}
function semanticAction(id: string, sourceKey: string, key: string, label: string, economy: string, payload: Record<string, unknown>, costs: Array<{ key: string; amount: number }> = []): StoredMechanic {
  return action(id, sourceKey, key, label, economy, { resourceCosts: costs, effects: [{ kind: "semantic", key, payload }] })
}
function slotOptions(spellLevel: number) {
  if (spellLevel === 0) return []
  return Array.from({ length: 10 - spellLevel }, (_, index) => {
    const castLevel = spellLevel + index
    return { key: `slot-${castLevel}`, castLevel, costs: [{ key: `spell_slot_${castLevel}`, amount: 1 }] }
  })
}
function spellMethod(spellLevel: number): SpellCastingMethodDefinition {
  return {
    key: "sorcerer-subclass",
    kind: "class_spell",
    ability: "charisma",
    saveDc: spellDc,
    attackBonus: spellAttack,
    requiresPrepared: false,
    ...(spellLevel === 0 ? {} : { resourceOptions: slotOptions(spellLevel) }),
  }
}
type BonusSpell = { slug: string; name: string; level: number; school: string; unlock: number }
function bonusSpell(subclass: string, sourceKey: string, spell: BonusSpell): StoredMechanic {
  return {
    id: `${subclass}-spell-${spell.slug}`,
    type: "spell",
    sourceKey,
    key: `spell:${spell.slug}`,
    catalogSlug: spell.slug,
    variantKey: `sorcerer-subclass:${subclass}:${spell.slug}`,
    payload: {
      spell: { name: spell.name, level: spell.level, school: spell.school },
      preparation: { mode: "always_prepared" },
      methods: [spellMethod(spell.level)],
    },
  } as StoredMechanic
}
function spellRows(subclass: string, spells: BonusSpell[]): Record<number, StoredMechanics> {
  const rows: Record<number, StoredMechanics> = {}
  for (const spell of spells) (rows[spell.unlock] ??= []).push(bonusSpell(subclass, `sorcerer:${subclass}:spells`, spell))
  return rows
}
function mergeRow(...rows: Array<StoredMechanics | undefined>): StoredMechanics {
  return rows.flatMap((entry) => entry ?? [])
}

type RuntimeSubclass = {
  id: string
  name: string
  sourceLabel: string
  summary: string
  levels: Record<number, StoredMechanics>
  choices?: Record<number, RuleChoiceDefinition[]>
}

const aberrantSpells = spellRows("aberrant-sorcery", [
  { slug: "arms-of-hadar", name: "Руки Хадара", level: 1, school: "Conjuration", unlock: 3 },
  { slug: "calm-emotions", name: "Умиротворение", level: 2, school: "Enchantment", unlock: 3 },
  { slug: "detect-thoughts", name: "Обнаружение мыслей", level: 2, school: "Divination", unlock: 3 },
  { slug: "dissonant-whispers", name: "Диссонирующий шёпот", level: 1, school: "Enchantment", unlock: 3 },
  { slug: "mind-sliver", name: "Осколок разума", level: 0, school: "Enchantment", unlock: 3 },
  { slug: "hunger-of-hadar", name: "Голод Хадара", level: 3, school: "Conjuration", unlock: 5 },
  { slug: "sending", name: "Послание", level: 3, school: "Divination", unlock: 5 },
  { slug: "black-tentacles", name: "Чёрные щупальца", level: 4, school: "Conjuration", unlock: 7 },
  { slug: "summon-aberration", name: "Призыв аберрации", level: 4, school: "Conjuration", unlock: 7 },
  { slug: "telepathic-bond", name: "Телепатическая связь", level: 5, school: "Divination", unlock: 9 },
  { slug: "telekinesis", name: "Телекинез", level: 5, school: "Transmutation", unlock: 9 },
])
const clockworkSpells = spellRows("clockwork-sorcery", [
  { slug: "aid", name: "Подмога", level: 2, school: "Abjuration", unlock: 3 },
  { slug: "alarm", name: "Сигнал тревоги", level: 1, school: "Abjuration", unlock: 3 },
  { slug: "lesser-restoration", name: "Малое восстановление", level: 2, school: "Abjuration", unlock: 3 },
  { slug: "protection-from-evil-and-good", name: "Защита от зла и добра", level: 1, school: "Abjuration", unlock: 3 },
  { slug: "dispel-magic", name: "Рассеивание магии", level: 3, school: "Abjuration", unlock: 5 },
  { slug: "protection-from-energy", name: "Защита от энергии", level: 3, school: "Abjuration", unlock: 5 },
  { slug: "freedom-of-movement", name: "Свобода передвижения", level: 4, school: "Abjuration", unlock: 7 },
  { slug: "summon-construct", name: "Призыв конструкта", level: 4, school: "Conjuration", unlock: 7 },
  { slug: "greater-restoration", name: "Высшее восстановление", level: 5, school: "Abjuration", unlock: 9 },
  { slug: "wall-of-force", name: "Стена силы", level: 5, school: "Evocation", unlock: 9 },
])
const draconicSpells = spellRows("draconic-sorcery", [
  { slug: "alter-self", name: "Изменение облика", level: 2, school: "Transmutation", unlock: 3 },
  { slug: "chromatic-orb", name: "Хроматическая сфера", level: 1, school: "Evocation", unlock: 3 },
  { slug: "command", name: "Приказ", level: 1, school: "Enchantment", unlock: 3 },
  { slug: "dragon-s-breath", name: "Драконье дыхание", level: 2, school: "Transmutation", unlock: 3 },
  { slug: "fear", name: "Страх", level: 3, school: "Illusion", unlock: 5 },
  { slug: "fly", name: "Полёт", level: 3, school: "Transmutation", unlock: 5 },
  { slug: "arcane-eye", name: "Магический глаз", level: 4, school: "Divination", unlock: 7 },
  { slug: "charm-monster", name: "Очарование монстра", level: 4, school: "Enchantment", unlock: 7 },
  { slug: "legend-lore", name: "Знание легенд", level: 5, school: "Divination", unlock: 9 },
  { slug: "summon-dragon", name: "Призыв дракона", level: 5, school: "Conjuration", unlock: 9 },
])
const lunarSpells = spellRows("lunar-sorcery", [
  { slug: "shield", name: "Щит", level: 1, school: "Abjuration", unlock: 3 },
  { slug: "ray-of-sickness", name: "Луч болезни", level: 1, school: "Necromancy", unlock: 3 },
  { slug: "color-spray", name: "Цветной всплеск", level: 1, school: "Illusion", unlock: 3 },
  { slug: "lesser-restoration", name: "Малое восстановление", level: 2, school: "Abjuration", unlock: 3 },
  { slug: "blindness-deafness", name: "Слепота/Глухота", level: 2, school: "Necromancy", unlock: 3 },
  { slug: "alter-self", name: "Изменение облика", level: 2, school: "Transmutation", unlock: 3 },
  { slug: "dispel-magic", name: "Рассеивание магии", level: 3, school: "Abjuration", unlock: 5 },
  { slug: "vampiric-touch", name: "Вампирическое касание", level: 3, school: "Necromancy", unlock: 5 },
  { slug: "phantom-steed", name: "Призрачный скакун", level: 3, school: "Illusion", unlock: 5 },
  { slug: "death-ward", name: "Оберег от смерти", level: 4, school: "Abjuration", unlock: 7 },
  { slug: "confusion", name: "Замешательство", level: 4, school: "Enchantment", unlock: 7 },
  { slug: "hallucinatory-terrain", name: "Галлюцинаторная местность", level: 4, school: "Illusion", unlock: 7 },
  { slug: "telepathic-bond", name: "Телепатическая связь", level: 5, school: "Divination", unlock: 9 },
  { slug: "hold-monster", name: "Удержание монстра", level: 5, school: "Enchantment", unlock: 9 },
  { slug: "mislead", name: "Ложный след", level: 5, school: "Illusion", unlock: 9 },
])

const subclasses: RuntimeSubclass[] = [
  {
    id: "aberrant-sorcery", name: "Аберрантное чародейство", sourceLabel: "Player's Handbook 2024",
    summary: "Фиксированный набор псионических заклинаний, телепатия, псионическое сотворение за Очки чародейства, психическая защита и пространственные способности.",
    levels: {
      3: mergeRow(aberrantSpells[3], [feature("aberrant-telepathy", "sorcerer:aberrant:telepathy", "sorcerer_aberrant_telepathic_speech", "Телепатическая речь", "Бонусным действием установите телепатическую связь с видимым существом; дальность и длительность зависят от уровня чародея, а общение возможно при общем языке.", { kind: "telepathic_speech", gmTargetGate: true })]),
      5: mergeRow(aberrantSpells[5]),
      6: [
        feature("aberrant-psionic-sorcery", "sorcerer:aberrant:psionic", "sorcerer_aberrant_psionic_sorcery", "Псионическое чародейство", "Псионические заклинания 1 уровня и выше можно сотворять, тратя Очки чародейства в количестве, равном уровню заклинания, вместо ячейки; при таком сотворении не нужны вербальные и соматические компоненты, а материальные нужны только если расходуются или имеют указанную стоимость.", { kind: "psionic_sorcery", sorceryPointCost: "spell_level" }),
        resistance("aberrant-psychic-resistance", "sorcerer:aberrant:psychic-defenses", "psychic", "Психическая защита"),
        feature("aberrant-psychic-defenses", "sorcerer:aberrant:psychic-defenses", "sorcerer_aberrant_psychic_defenses", "Психическая защита", "Вы получаете сопротивление психическому урону и преимущество на спасброски против состояний Очарован и Испуган.", { kind: "psychic_defenses", charmFearSaveAdvantage: true }),
      ],
      7: mergeRow(aberrantSpells[7]), 9: mergeRow(aberrantSpells[9]),
      14: [feature("aberrant-revelation", "sorcerer:aberrant:revelation", "sorcerer_aberrant_revelation_in_flesh", "Откровение во плоти", "Бонусным действием потратьте 1 Очко чародейства и выберите телесное изменение на 10 минут: видение невидимого, полёт, плавание с дыханием под водой или прохождение через узкие пространства; дополнительные варианты стоят по 1 очку каждый.", { kind: "revelation_in_flesh", durationMinutes: 10 }), semanticAction("aberrant-revelation-action", "sorcerer:aberrant:revelation", "sorcerer_aberrant_revelation_in_flesh", "Откровение во плоти", "bonus_action", { gmBenefitSelection: true, durationMinutes: 10 }, [{ key: "sorcery_points", amount: 1 }])],
      18: [feature("aberrant-implosion", "sorcerer:aberrant:implosion", "sorcerer_aberrant_warping_implosion", "Искривляющее схлопывание", "Действием телепортируйтесь на 120 футов и заставьте существ в оставленной точке совершить спасбросок Силы; провал наносит силовой урон и притягивает к центру. Одно применение бесплатно между долгими отдыхами; повторное применение стоит 5 Очков чародейства.", { kind: "warping_implosion", rangeFeet: 120, save: "strength" }), resource("aberrant-implosion-use", "sorcerer:aberrant:implosion", "sorcerer_aberrant_warping_implosion", "Искривляющее схлопывание", 1, "long_rest"), semanticAction("aberrant-implosion-free", "sorcerer:aberrant:implosion", "sorcerer_aberrant_warping_implosion_free", "Искривляющее схлопывание", "action", { rangeFeet: 120, gmSaveGate: true }, [{ key: "sorcerer_aberrant_warping_implosion", amount: 1 }]), semanticAction("aberrant-implosion-paid", "sorcerer:aberrant:implosion", "sorcerer_aberrant_warping_implosion_paid", "Искривляющее схлопывание за Очки чародейства", "action", { rangeFeet: 120, gmSaveGate: true }, [{ key: "sorcery_points", amount: 5 }])],
    },
  },
  {
    id: "clockwork-sorcery", name: "Заводное чародейство", sourceLabel: "Player's Handbook 2024",
    summary: "Фиксированные заводные заклинания, ограниченный запас Восстановления баланса и способности, расходующие Очки чародейства без отдельного дубля ресурсов.",
    levels: {
      3: mergeRow(clockworkSpells[3], [feature("clockwork-restore", "sorcerer:clockwork:restore-balance", "sorcerer_clockwork_restore_balance", "Восстановление баланса", "Реакцией, когда видимое существо в пределах 60 футов собирается бросить d20 с преимуществом или помехой, отмените преимущество или помеху. Число применений равно бонусу мастерства и восстанавливается после долгого отдыха.", { kind: "restore_balance", rangeFeet: 60, gmRollGate: true }), resource("clockwork-restore-resource", "sorcerer:clockwork:restore-balance", "sorcerer_clockwork_restore_balance", "Восстановление баланса", ref("core.proficiencyBonus"), "long_rest"), semanticAction("clockwork-restore-action", "sorcerer:clockwork:restore-balance", "sorcerer_clockwork_restore_balance", "Восстановление баланса", "reaction", { rangeFeet: 60, gmRollGate: true }, [{ key: "sorcerer_clockwork_restore_balance", amount: 1 }])]),
      5: mergeRow(clockworkSpells[5]),
      6: [feature("clockwork-bastion", "sorcerer:clockwork:bastion", "sorcerer_clockwork_bastion_of_law", "Бастион закона", "Действием потратьте от 1 до 5 Очков чародейства и создайте вокруг существа в 30 футах столько d8 защиты; когда цель получает урон, она может потратить любое число этих костей и уменьшить урон на выпавшую сумму. Запас действует до долгого отдыха или повторного использования.", { kind: "bastion_of_law", maxDice: 5, die: 8 }), ...[1,2,3,4,5].map((cost) => semanticAction(`clockwork-bastion-${cost}`, "sorcerer:clockwork:bastion", `sorcerer_clockwork_bastion_${cost}`, `Бастион закона: ${cost}d8`, "action", { dice: cost, die: 8, rangeFeet: 30 }, [{ key: "sorcery_points", amount: cost }]))],
      7: mergeRow(clockworkSpells[7]), 9: mergeRow(clockworkSpells[9]),
      14: [feature("clockwork-trance", "sorcerer:clockwork:trance", "sorcerer_clockwork_trance_of_order", "Транс порядка", "Бонусным действием на 1 минуту войдите в состояние порядка: броски атаки против вас не получают преимущества, а ваши проверки характеристики, атаки и спасброски с результатом d20 9 или меньше считаются результатом 10. Одно бесплатное применение между долгими отдыхами; повторное стоит 5 Очков чародейства.", { kind: "trance_of_order", durationMinutes: 1 }), resource("clockwork-trance-use", "sorcerer:clockwork:trance", "sorcerer_clockwork_trance_of_order", "Транс порядка", 1, "long_rest"), semanticAction("clockwork-trance-free", "sorcerer:clockwork:trance", "sorcerer_clockwork_trance_of_order_free", "Транс порядка", "bonus_action", { durationMinutes: 1 }, [{ key: "sorcerer_clockwork_trance_of_order", amount: 1 }]), semanticAction("clockwork-trance-paid", "sorcerer:clockwork:trance", "sorcerer_clockwork_trance_of_order_paid", "Транс порядка за Очки чародейства", "bonus_action", { durationMinutes: 1 }, [{ key: "sorcery_points", amount: 5 }])],
      18: [feature("clockwork-cavalcade", "sorcerer:clockwork:cavalcade", "sorcerer_clockwork_cavalcade", "Заводная кавалькада", "Действием призовите духов порядка в кубе 30 футов: распределите до 100 HP лечения, восстановите повреждённые предметы и завершите на выбранных существах или предметах заклинания 6 уровня и ниже. Одно бесплатное применение между долгими отдыхами; повторное стоит 7 Очков чародейства.", { kind: "clockwork_cavalcade", cubeFeet: 30, healingPool: 100 }), resource("clockwork-cavalcade-use", "sorcerer:clockwork:cavalcade", "sorcerer_clockwork_cavalcade", "Заводная кавалькада", 1, "long_rest"), semanticAction("clockwork-cavalcade-free", "sorcerer:clockwork:cavalcade", "sorcerer_clockwork_cavalcade_free", "Заводная кавалькада", "action", { cubeFeet: 30, healingPool: 100, gmEffectSelection: true }, [{ key: "sorcerer_clockwork_cavalcade", amount: 1 }]), semanticAction("clockwork-cavalcade-paid", "sorcerer:clockwork:cavalcade", "sorcerer_clockwork_cavalcade_paid", "Заводная кавалькада за Очки чародейства", "action", { cubeFeet: 30, healingPool: 100, gmEffectSelection: true }, [{ key: "sorcery_points", amount: 7 }])],
    },
  },
  {
    id: "draconic-sorcery", name: "Драконье чародейство", sourceLabel: "Player's Handbook 2024",
    summary: "Драконья стойкость, фиксированные заклинания, выбранное стихийное сродство, часовые крылья и отдельное бесплатное применение Призыва дракона.",
    levels: {
      3: mergeRow(draconicSpells[3], [feature("draconic-resilience", "sorcerer:draconic:resilience", "sorcerer_draconic_resilience", "Драконья стойкость", "Максимум HP увеличивается на уровень чародея. Пока вы без доспеха, базовая КД равна 10 + модификатор Ловкости + модификатор Харизмы.", { kind: "draconic_resilience", hpPerSorcererLevel: 1, armorClassFormula: "10+dex+cha", requiresUnarmored: true })]),
      5: mergeRow(draconicSpells[5]),
      6: [feature("draconic-affinity", "sorcerer:draconic:affinity", "sorcerer_draconic_elemental_affinity", "Стихийное сродство", "Выберите кислоту, холод, огонь, электричество или яд. Вы получаете сопротивление выбранному типу; когда заклинание наносит этот тип урона, один бросок урона может получить бонус, равный модификатору Харизмы.", { kind: "elemental_affinity", persistentChoice: true })],
      7: mergeRow(draconicSpells[7]), 9: mergeRow(draconicSpells[9]),
      14: [feature("draconic-wings", "sorcerer:draconic:wings", "sorcerer_draconic_wings", "Драконьи крылья", "Бонусным действием получите скорость полёта 60 футов на 1 час. Одно применение возвращается после долгого отдыха; потратив 3 Очка чародейства без действия, восстановите это применение.", { kind: "dragon_wings", flySpeed: 60, durationMinutes: 60 }), resource("draconic-wings-use", "sorcerer:draconic:wings", "sorcerer_draconic_wings", "Драконьи крылья", 1, "long_rest"), semanticAction("draconic-wings-action", "sorcerer:draconic:wings", "sorcerer_draconic_wings", "Драконьи крылья", "bonus_action", { flySpeed: 60, durationMinutes: 60 }, [{ key: "sorcerer_draconic_wings", amount: 1 }]), action("draconic-wings-restore", "sorcerer:draconic:wings", "sorcerer_draconic_wings_restore", "Восстановить Драконьи крылья", "no_action", { resourceCosts: [{ key: "sorcery_points", amount: 3 }], effects: [{ kind: "resource", key: "sorcerer_draconic_wings", operation: "RESTORE", amount: 1 }] })],
      18: [feature("draconic-companion", "sorcerer:draconic:companion", "sorcerer_draconic_companion", "Драконий спутник", "Призыв дракона не требует материального компонента. Один раз между долгими отдыхами сотворите его без ячейки; при сотворении можете убрать концентрацию, сократив длительность до 1 минуты.", { kind: "dragon_companion", freeCast: 1, concentrationOptional: true, modifiedDurationMinutes: 1 }), resource("draconic-companion-use", "sorcerer:draconic:companion", "sorcerer_draconic_companion", "Драконий спутник", 1, "long_rest"), semanticAction("draconic-companion-free", "sorcerer:draconic:companion", "sorcerer_draconic_companion", "Призвать драконьего спутника", "action", { spell: "summon-dragon", freeCast: true, ignoreMaterialComponent: true, concentrationOptional: true }, [{ key: "sorcerer_draconic_companion", amount: 1 }])],
    },
    choices: { 6: [{ key: "sorcerer_draconic_affinity", label: "Стихийное сродство", target: "trait", options: ["acid","cold","fire","lightning","poison"], count: 1, selection_mode: "player_once", replacement_policy: "locked", option_labels: { acid: "Кислота", cold: "Холод", fire: "Огонь", lightning: "Электричество", poison: "Яд" }, option_mechanics: Object.fromEntries(["acid","cold","fire","lightning","poison"].map((type) => [type, [resistance(`draconic-affinity-${type}`, "sorcerer:draconic:affinity", type, "Стихийное сродство")]])) }] },
  },
  {
    id: "wild-magic-sorcery", name: "Чародейство дикой магии", sourceLabel: "Player's Handbook 2024",
    summary: "Дикие всплески остаются серверно-нейтральным броском/GM-событием, а ограниченные применения и затраты Очков чародейства проходят через CE-ресурсы.",
    levels: {
      3: [feature("wild-surge", "sorcerer:wild:surge", "sorcerer_wild_magic_surge", "Дикий всплеск", "После сотворения заклинания чародея ячейкой Мастер может потребовать бросок по таблице Дикой магии; результат таблицы является внешним игровым событием и не хранится как постоянный флаг персонажа.", { kind: "wild_magic_surge", gmRandomTableGate: true }), feature("wild-tides", "sorcerer:wild:tides", "sorcerer_wild_tides_of_chaos", "Приливы хаоса", "До броска d20 получите преимущество на один бросок. После применения способность недоступна до долгого отдыха либо пока Мастер не запустит Дикий всплеск по правилам этой способности.", { kind: "tides_of_chaos", gmSurgeRechargeGate: true }), resource("wild-tides-use", "sorcerer:wild:tides", "sorcerer_wild_tides_of_chaos", "Приливы хаоса", 1, "long_rest"), semanticAction("wild-tides-action", "sorcerer:wild:tides", "sorcerer_wild_tides_of_chaos", "Приливы хаоса", "no_action", { gmD20Gate: true }, [{ key: "sorcerer_wild_tides_of_chaos", amount: 1 }]), action("wild-tides-surge-restore", "sorcerer:wild:tides", "sorcerer_wild_tides_of_chaos_restore_after_surge", "Восстановить Приливы хаоса после всплеска", "no_action", { effects: [{ kind: "resource", key: "sorcerer_wild_tides_of_chaos", operation: "RESTORE", amount: 1 }], requirements: [{ kind: "gm", key: "wild_magic_surge_occurred", label: "Мастер подтверждает, что произошёл Дикий всплеск" }] })],
      6: [feature("wild-bend-luck", "sorcerer:wild:bend-luck", "sorcerer_wild_bend_luck", "Изгиб удачи", "Реакцией, когда видимое существо в пределах 60 футов делает проверку d20, потратьте 1 Очко чародейства и бросьте 1d4; прибавьте или вычтите результат из броска существа.", { kind: "bend_luck", die: 4, rangeFeet: 60 }), semanticAction("wild-bend-luck-action", "sorcerer:wild:bend-luck", "sorcerer_wild_bend_luck", "Изгиб удачи", "reaction", { die: 4, rangeFeet: 60, gmRollGate: true }, [{ key: "sorcery_points", amount: 1 }])],
      14: [feature("wild-controlled", "sorcerer:wild:controlled", "sorcerer_wild_controlled_chaos", "Управляемый хаос", "Когда бросаете по таблице Дикой магии, бросьте два результата и выберите, какой из них применить.", { kind: "controlled_chaos", gmRandomTableGate: true, rolls: 2, choose: 1 })],
      18: [feature("wild-tamed", "sorcerer:wild:tamed", "sorcerer_wild_tamed_surge", "Укрощённый всплеск", "После сотворения заклинания чародея ячейкой можете выбрать результат таблицы Дикой магии вместо случайного броска, соблюдая ограничения способности. Одно применение возвращается после долгого отдыха.", { kind: "tamed_surge", gmRandomTableGate: true }), resource("wild-tamed-use", "sorcerer:wild:tamed", "sorcerer_wild_tamed_surge", "Укрощённый всплеск", 1, "long_rest"), semanticAction("wild-tamed-action", "sorcerer:wild:tamed", "sorcerer_wild_tamed_surge", "Укрощённый всплеск", "no_action", { gmRandomTableGate: true, chooseResult: true }, [{ key: "sorcerer_wild_tamed_surge", amount: 1 }])],
    },
  },
  {
    id: "divine-soul", name: "Божественная душа", sourceLabel: "Xanathar's Guide to Everything (2017)",
    summary: "Наследуемая механика 2014 перенесена на вход подкласса 3 уровня: Божественная магия, Благосклонность богов, усиление лечения, крылья и самоисцеление.",
    levels: {
      3: [feature("divine-magic", "sorcerer:divine-soul:divine-magic", "sorcerer_divine_soul_divine_magic", "Божественная магия", "При выборе или замене заклинания чародея вы можете выбирать подходящие заклинания также из списка Жреца; выбранное заклинание считается заклинанием чародея и использует Харизму. Мировоззренческое бонусное заклинание остаётся отдельным наследуемым выбором.", { kind: "divine_magic", extendsSpellList: "cleric", gmSpellSelectionGate: true }), feature("favored-gods", "sorcerer:divine-soul:favored", "sorcerer_divine_soul_favored_by_the_gods", "Благосклонность богов", "После промаха атакой или провала спасброска добавьте 2d4 к результату. Одно применение восстанавливается после короткого или долгого отдыха.", { kind: "favored_by_the_gods", dice: "2d4" }), resource("favored-gods-use", "sorcerer:divine-soul:favored", "sorcerer_divine_soul_favored_by_the_gods", "Благосклонность богов", 1, ["short_rest","long_rest"]), semanticAction("favored-gods-action", "sorcerer:divine-soul:favored", "sorcerer_divine_soul_favored_by_the_gods", "Благосклонность богов", "no_action", { dice: "2d4", gmFailedRollGate: true }, [{ key: "sorcerer_divine_soul_favored_by_the_gods", amount: 1 }])],
      6: [feature("divine-empowered", "sorcerer:divine-soul:healing", "sorcerer_divine_soul_empowered_healing", "Усиленное исцеление", "Когда вы или союзник в пределах 5 футов бросает кости лечения от заклинания, потратьте 1 Очко чародейства, чтобы один раз перебросить любое число этих костей; используйте новые результаты.", { kind: "empowered_healing", rangeFeet: 5 }), semanticAction("divine-empowered-action", "sorcerer:divine-soul:healing", "sorcerer_divine_soul_empowered_healing", "Усиленное исцеление", "no_action", { gmHealingRollGate: true, rangeFeet: 5 }, [{ key: "sorcery_points", amount: 1 }])],
      14: [feature("divine-wings", "sorcerer:divine-soul:wings", "sorcerer_divine_soul_otherworldly_wings", "Неземные крылья", "Бонусным действием проявите спектральные крылья и получите скорость полёта 30 футов, пока не уберёте их бонусным действием.", { kind: "otherworldly_wings", flySpeed: 30 }), semanticAction("divine-wings-action", "sorcerer:divine-soul:wings", "sorcerer_divine_soul_otherworldly_wings", "Неземные крылья", "bonus_action", { flySpeed: 30, toggle: true })],
      18: [feature("divine-recovery", "sorcerer:divine-soul:recovery", "sorcerer_divine_soul_unearthly_recovery", "Неземное восстановление", "Бонусным действием, когда у вас меньше половины максимума HP, восстановите HP в количестве половины максимума. Одно применение восстанавливается после долгого отдыха.", { kind: "unearthly_recovery", heal: "half_max_hp", requiresBelowHalfHp: true }), resource("divine-recovery-use", "sorcerer:divine-soul:recovery", "sorcerer_divine_soul_unearthly_recovery", "Неземное восстановление", 1, "long_rest"), semanticAction("divine-recovery-action", "sorcerer:divine-soul:recovery", "sorcerer_divine_soul_unearthly_recovery", "Неземное восстановление", "bonus_action", { heal: "half_max_hp", gmHpGate: true }, [{ key: "sorcerer_divine_soul_unearthly_recovery", amount: 1 }])],
    },
  },
  {
    id: "shadow-magic", name: "Теневая магия", sourceLabel: "Xanathar's Guide to Everything (2017)",
    summary: "Наследуемые способности тени перенесены на вход 3 уровня; ограниченные применения и затраты Очков чародейства учтены через общий CE ledger.",
    levels: {
      3: [feature("shadow-eyes", "sorcerer:shadow:eyes", "sorcerer_shadow_eyes_of_the_dark", "Глаза тьмы", "Вы получаете тёмное зрение 120 футов. С 3 уровня можете сотворить Тьму за 2 Очка чародейства и видеть сквозь созданную таким образом Тьму.", { kind: "eyes_of_the_dark", darkvisionFeet: 120 }), semanticAction("shadow-darkness", "sorcerer:shadow:eyes", "sorcerer_shadow_darkness", "Тьма через Глаза тьмы", "action", { spell: "darkness", seeThroughOwnDarkness: true }, [{ key: "sorcery_points", amount: 2 }]), feature("shadow-grave", "sorcerer:shadow:grave", "sorcerer_shadow_strength_of_the_grave", "Сила могилы", "Когда урон снижает вас до 0 HP и не убивает мгновенно, совершите спасбросок Харизмы Сл 5 + полученный урон; при успехе остаётесь на 1 HP. Не работает против критического или сияющего урона. Одно применение восстанавливается после долгого отдыха.", { kind: "strength_of_the_grave", save: "charisma", dc: "5+damage", exclusions: ["critical","radiant"] }), resource("shadow-grave-use", "sorcerer:shadow:grave", "sorcerer_shadow_strength_of_the_grave", "Сила могилы", 1, "long_rest"), semanticAction("shadow-grave-action", "sorcerer:shadow:grave", "sorcerer_shadow_strength_of_the_grave", "Сила могилы", "reaction", { gmZeroHpGate: true, save: "charisma", dc: "5+damage" }, [{ key: "sorcerer_shadow_strength_of_the_grave", amount: 1 }])],
      6: [feature("shadow-hound", "sorcerer:shadow:hound", "sorcerer_shadow_hound_of_ill_omen", "Пёс дурного предзнаменования", "Бонусным действием потратьте 3 Очка чародейства и призовите пса, выбирая видимую цель в пределах 120 футов. Пёс преследует цель и даёт ей помеху на спасброски против ваших заклинаний, пока находится рядом.", { kind: "hound_of_ill_omen", rangeFeet: 120 }), semanticAction("shadow-hound-action", "sorcerer:shadow:hound", "sorcerer_shadow_hound_of_ill_omen", "Пёс дурного предзнаменования", "bonus_action", { rangeFeet: 120, gmTargetGate: true }, [{ key: "sorcery_points", amount: 3 }])],
      14: [feature("shadow-walk", "sorcerer:shadow:walk", "sorcerer_shadow_walk", "Теневой шаг", "Бонусным действием, находясь в тусклом свете или тьме, телепортируйтесь на расстояние до 120 футов в другое видимое место тусклого света или тьмы.", { kind: "shadow_walk", rangeFeet: 120, gmLightGate: true }), semanticAction("shadow-walk-action", "sorcerer:shadow:walk", "sorcerer_shadow_walk", "Теневой шаг", "bonus_action", { rangeFeet: 120, gmLightGate: true })],
      18: [feature("shadow-umbral", "sorcerer:shadow:umbral", "sorcerer_shadow_umbral_form", "Теневая форма", "Бонусным действием потратьте 6 Очков чародейства и на 1 минуту примите теневую форму: проходите сквозь существ и предметы как по труднопроходимой местности и получаете сопротивление всему урону, кроме силового и сияющего.", { kind: "umbral_form", durationMinutes: 1 }), semanticAction("shadow-umbral-action", "sorcerer:shadow:umbral", "sorcerer_shadow_umbral_form", "Теневая форма", "bonus_action", { durationMinutes: 1, gmMovementGate: true }, [{ key: "sorcery_points", amount: 6 }])],
    },
  },
  {
    id: "storm-sorcery", name: "Штормовое чародейство", sourceLabel: "Xanathar's Guide to Everything (2017)",
    summary: "Наследуемая штормовая механика начинает работать с 3 уровня: мобильность после заклинаний, сопротивления, ответный удар и постоянный полёт высокого уровня.",
    levels: {
      3: [feature("storm-speaker", "sorcerer:storm:speaker", "sorcerer_storm_wind_speaker", "Вестник ветра", "Вы умеете говорить, читать и писать на Первичном и его диалектах, связанных с воздухом.", { kind: "wind_speaker" }), feature("storm-tempestuous", "sorcerer:storm:tempestuous", "sorcerer_storm_tempestuous_magic", "Бурная магия", "Бонусным действием непосредственно до или после сотворения заклинания 1 уровня и выше получите полёт 10 футов без провоцирования атак по возможности.", { kind: "tempestuous_magic", flyFeet: 10, gmSpellCastGate: true }), semanticAction("storm-tempestuous-action", "sorcerer:storm:tempestuous", "sorcerer_storm_tempestuous_magic", "Бурная магия", "bonus_action", { flyFeet: 10, gmSpellCastGate: true })],
      6: [resistance("storm-lightning-resistance", "sorcerer:storm:heart", "lightning", "Сердце бури"), resistance("storm-thunder-resistance", "sorcerer:storm:heart", "thunder", "Сердце бури"), feature("storm-heart", "sorcerer:storm:heart", "sorcerer_storm_heart_of_the_storm", "Сердце бури", "Вы получаете сопротивление электрическому и звуковому урону. Когда начинаете сотворять заклинание 1 уровня и выше с таким уроном, выбранные существа в пределах 10 футов получают урон, равный половине уровня чародея.", { kind: "heart_of_the_storm", radiusFeet: 10, damage: "half_sorcerer_level", gmSpellDamageTypeGate: true }), feature("storm-guide", "sorcerer:storm:guide", "sorcerer_storm_guide", "Проводник шторма", "Действием прекращайте дождь в сфере радиусом 20 футов либо бонусным действием меняйте направление ветра вокруг себя; эффект сохраняется до конца вашего следующего хода.", { kind: "storm_guide", gmWeatherGate: true })],
      14: [feature("storm-fury", "sorcerer:storm:fury", "sorcerer_storm_fury", "Ярость шторма", "Реакцией после попадания по вам рукопашной атакой нанесите атакующему электрический урон, равный уровню чародея; затем цель делает спасбросок Силы против Сл ваших заклинаний и при провале отталкивается на 20 футов.", { kind: "storms_fury", damage: "sorcerer_level", save: "strength", pushFeet: 20 }), semanticAction("storm-fury-action", "sorcerer:storm:fury", "sorcerer_storm_fury", "Ярость шторма", "reaction", { gmMeleeHitGate: true, damage: "sorcerer_level", save: "strength", pushFeet: 20 })],
      18: [immunity("storm-lightning-immunity", "sorcerer:storm:wind-soul", "lightning", "Душа ветра"), immunity("storm-thunder-immunity", "sorcerer:storm:wind-soul", "thunder", "Душа ветра"), feature("storm-wind-soul", "sorcerer:storm:wind-soul", "sorcerer_storm_wind_soul", "Душа ветра", "Вы получаете иммунитет к электрическому и звуковому урону и скорость полёта 60 футов. Действием можете на 1 час дать выбранным существам скорость полёта 30 футов, временно снизив свою до 30; одно групповое применение восстанавливается после короткого или долгого отдыха.", { kind: "wind_soul", flySpeed: 60, sharedFlySpeed: 30, durationMinutes: 60 }), resource("storm-wind-soul-use", "sorcerer:storm:wind-soul", "sorcerer_storm_wind_soul_share", "Душа ветра: общий полёт", 1, ["short_rest","long_rest"]), semanticAction("storm-wind-soul-share", "sorcerer:storm:wind-soul", "sorcerer_storm_wind_soul_share", "Душа ветра: общий полёт", "action", { sharedFlySpeed: 30, durationMinutes: 60, gmTargetCountGate: true }, [{ key: "sorcerer_storm_wind_soul_share", amount: 1 }])],
    },
  },
  {
    id: "lunar-sorcery", name: "Лунное чародейство", sourceLabel: "Dragonlance: Shadow of the Dragon Queen (2022)",
    summary: "Пятнадцать лунных заклинаний всегда подготовлены; текущая фаза хранится как выбор, а бесплатное заклинание, снижение стоимости Метамагии и смена фазы описаны отдельными runtime-действиями.",
    levels: {
      3: mergeRow(lunarSpells[3], [feature("lunar-embodiment", "sorcerer:lunar:embodiment", "sorcerer_lunar_embodiment", "Лунное воплощение", "Вы знаете все заклинания трёх лунных фаз из таблицы подкласса. После долгого отдыха выберите активную фазу. Заклинание 1 уровня активной фазы можно один раз сотворить без ячейки; бесплатное применение возвращается после долгого отдыха.", { kind: "lunar_embodiment", persistentPhaseChoice: true, freeFirstLevelCastPerLongRest: true }), resource("lunar-free-cast", "sorcerer:lunar:embodiment", "sorcerer_lunar_free_phase_cast", "Бесплатное лунное заклинание", 1, "long_rest"), feature("lunar-moon-fire", "sorcerer:lunar:moon-fire", "sorcerer_lunar_moon_fire", "Лунный огонь", "Вы изучаете заговор Священное пламя; когда сотворяете его, можете выбрать две цели в пределах 5 футов друг от друга.", { kind: "moon_fire", secondTargetDistanceFeet: 5 })]),
      5: mergeRow(lunarSpells[5]), 7: mergeRow(lunarSpells[7]), 9: mergeRow(lunarSpells[9]),
      6: [feature("lunar-boons", "sorcerer:lunar:boons", "sorcerer_lunar_boons", "Лунные дары", "Когда применяете Метамагию к заклинанию школы, связанной с активной фазой, уменьшите стоимость Метамагии на 1 Очко чародейства (минимум 0). Это снижение можно применить число раз, равное бонусу мастерства, и все применения возвращаются после долгого отдыха.", { kind: "lunar_boons", activePhaseSchoolGate: true, metamagicDiscount: 1 }), resource("lunar-boons-use", "sorcerer:lunar:boons", "sorcerer_lunar_boons", "Лунные дары", ref("core.proficiencyBonus"), "long_rest"), feature("lunar-waxing", "sorcerer:lunar:waxing", "sorcerer_lunar_waxing_and_waning", "Прибывание и убывание", "Бонусным действием потратьте 1 Очко чародейства, чтобы сменить текущую лунную фазу. После долгого отдыха фазу можно выбрать бесплатно.", { kind: "waxing_and_waning", phaseChangeCost: 1 }), semanticAction("lunar-waxing-action", "sorcerer:lunar:waxing", "sorcerer_lunar_waxing_and_waning", "Сменить лунную фазу", "bonus_action", { gmPhaseSelectionGate: true }, [{ key: "sorcery_points", amount: 1 }])],
      14: [feature("lunar-empowerment", "sorcerer:lunar:empowerment", "sorcerer_lunar_empowerment", "Лунное усиление", "Активная фаза даёт постоянное преимущество: Полная луна усиливает проверки расследования и восприятия, Новолуние даёт преимущество на скрытность и помеху атакам по вам в тусклом свете или тьме, Серп даёт сопротивление некротическому и сияющему урону.", { kind: "lunar_empowerment", phaseDependent: true, gmLightGate: true })],
      18: [feature("lunar-phenomenon", "sorcerer:lunar:phenomenon", "sorcerer_lunar_phenomenon", "Лунное явление", "Бонусным действием проявите эффект активной фазы: Полная луна ослепляет и лечит, Новолуние наносит некротический урон и снижает скорость, Серп телепортирует вас и союзника. После использования конкретной фазы она недоступна до долгого отдыха, если не потратить 5 Очков чародейства для восстановления её применения.", { kind: "lunar_phenomenon", perPhaseUses: 1, restoreCost: 5 }), ...["full","new","crescent"].flatMap((phase) => [resource(`lunar-phenomenon-${phase}`, "sorcerer:lunar:phenomenon", `sorcerer_lunar_phenomenon_${phase}`, `Лунное явление: ${phase}`, 1, "long_rest"), semanticAction(`lunar-phenomenon-${phase}-action`, "sorcerer:lunar:phenomenon", `sorcerer_lunar_phenomenon_${phase}`, `Лунное явление: ${phase}`, "bonus_action", { phase, gmEffectGate: true }, [{ key: `sorcerer_lunar_phenomenon_${phase}`, amount: 1 }])])],
    },
    choices: { 3: [{ key: "sorcerer_lunar_phase", label: "Лунная фаза", target: "trait", options: ["full","new","crescent"], option_labels: { full: "Полная луна", new: "Новолуние", crescent: "Серп луны" }, count: 1, selection_mode: "player_once", refresh: "long_rest", replacement_policy: "preparation", replacement_limit: 1 }] },
  },
  {
    id: "pyromancer", name: "Пиромант", sourceLabel: "Plane Shift: Kaladesh (2017)",
    summary: "Официальный WotC Plane Shift-вариант: огненная аура при огненных заклинаниях, сопротивление и обход сопротивления, ответный огонь и огненный иммунитет высокого уровня.",
    levels: {
      3: [feature("pyro-heart", "sorcerer:pyromancer:heart", "sorcerer_pyromancer_heart_of_fire", "Сердце огня", "Когда начинаете сотворять заклинание 1 уровня и выше, наносящее огненный урон, выбранные видимые существа в пределах 10 футов получают огненный урон, равный половине уровня чародея (минимум 1).", { kind: "heart_of_fire", radiusFeet: 10, damage: "half_sorcerer_level_min_1", gmFireSpellGate: true })],
      6: [resistance("pyro-fire-resistance", "sorcerer:pyromancer:veins", "fire", "Огонь в венах"), feature("pyro-veins", "sorcerer:pyromancer:veins", "sorcerer_pyromancer_fire_in_the_veins", "Огонь в венах", "Вы получаете сопротивление огненному урону; сотворённые вами заклинания игнорируют сопротивление огненному урону.", { kind: "fire_in_the_veins", ignoreFireResistance: true })],
      14: [feature("pyro-fury", "sorcerer:pyromancer:fury", "sorcerer_pyromancer_fury", "Ярость пироманта", "Реакцией после попадания по вам рукопашной атакой нанесите атакующему огненный урон, равный уровню чародея; этот урон игнорирует сопротивление огню.", { kind: "pyromancers_fury", damage: "sorcerer_level", ignoreFireResistance: true }), semanticAction("pyro-fury-action", "sorcerer:pyromancer:fury", "sorcerer_pyromancer_fury", "Ярость пироманта", "reaction", { gmMeleeHitGate: true, damage: "sorcerer_level", ignoreFireResistance: true })],
      18: [immunity("pyro-fire-immunity", "sorcerer:pyromancer:soul", "fire", "Огненная душа"), feature("pyro-soul", "sorcerer:pyromancer:soul", "sorcerer_pyromancer_fiery_soul", "Огненная душа", "Вы получаете иммунитет к огненному урону. Ваши заклинания и эффекты игнорируют сопротивление огню, а иммунитет цели к огню считается сопротивлением для созданного вами урона.", { kind: "fiery_soul", ignoreFireResistance: true, treatFireImmunityAsResistance: true })],
    },
  },
]

function parentTemplate(): RuleTemplate {
  return {
    id: parentId, campaign_id: "campaign", kind: "class", slug: "sorcerer-stage7-parent", name: "Чародей",
    description: "Тестовый родитель Stage 7 с общим ресурсом Очков чародейства и ячейками полного заклинателя.", version: 1,
    mechanics: [], choices: [], catalog_key: "class:sorcerer", catalog_revision: "stage7-fixture-parent", source_kind: "official", source_label: "Player's Handbook 2024", is_builtin: true,
    mechanical_summary: "Харизматический полный заклинатель с Очками чародейства; подклассы используют этот общий ресурс и общий реестр ячеек.", rules_meta: {}, is_active: true, created_by: null, created_at: now, updated_at: now,
  }
}
function parentBundle(): CharacterTemplateBundle {
  const slotResources: StoredMechanics = Array.from({ length: 9 }, (_, index) => resource(`slot-${index + 1}`, "sorcerer:spellcasting", `spell_slot_${index + 1}`, `Ячейки ${index + 1} уровня`, 1, "long_rest"))
  return {
    template: parentTemplate(),
    assignment: { id: "sorcerer-stage7-parent-assignment", character_id: "hero", template_id: parentId, template_level: 20, selected_choices: {}, assigned_at: now, updated_at: now },
    levels: [
      { id: "sorcerer-stage7-parent-l1", template_id: parentId, level: 1, mechanics: slotResources, choices: [] },
      { id: "sorcerer-stage7-parent-l2", template_id: parentId, level: 2, mechanics: [resource("sorcery-points", "sorcerer:font-of-magic", "sorcery_points", "Очки чародейства", ref("source.level"), "long_rest")], choices: [] },
    ],
  }
}
function subclassBundle(definition: RuntimeSubclass, index: number): CharacterTemplateBundle {
  const id = `sorcerer-stage7-${definition.id}`
  const template: RuleTemplate = {
    id, campaign_id: "campaign", kind: "subclass", slug: `sorcerer-${definition.id}`, name: definition.name,
    description: definition.summary, version: 1, mechanics: [], choices: [], parent_template_id: parentId, unlock_level: 3,
    catalog_key: `subclass:sorcerer:${definition.id}`, catalog_revision: SORCERER_STAGE7_RUNTIME_REVISION, source_kind: "official", source_label: definition.sourceLabel, is_builtin: true,
    mechanical_summary: definition.summary, rules_meta: { runtime_status: "READY_STAGE7", parent_level_source: "class:sorcerer", legacy_entry_level_shift: definition.sourceLabel.includes("2024") || definition.id === "lunar-sorcery" || definition.id === "pyromancer" ? null : "1_to_3" },
    is_active: true, created_by: null, created_at: now, updated_at: now,
  }
  return {
    template,
    assignment: { id: `sorcerer-stage7-subclass-assignment-${index}`, character_id: "hero", template_id: id, template_level: null, selected_choices: {}, assigned_at: now, updated_at: now },
    levels: Object.keys(definition.levels).map(Number).sort((a,b) => a-b).map((level) => ({ id: `${id}-l${level}`, template_id: id, level, mechanics: definition.levels[level] ?? [], choices: definition.choices?.[level] ?? [] })),
  }
}

export const sorcererStage7RuntimeBundles: CharacterTemplateBundle[] = [parentBundle(), ...subclasses.map(subclassBundle)]
