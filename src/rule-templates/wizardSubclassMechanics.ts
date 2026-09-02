import type { FormulaExpression, SpellCastingMethodDefinition } from "../character-engine/index.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle } from "./types.ts"

export const WIZARD_SUBCLASS_RUNTIME_REVISION = "phb-2024-wizard-subclasses-runtime@1" as const
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
const sub = (left: FormulaExpression, right: FormulaExpression): FormulaExpression => ({ kind: "subtract", left, right })
const mul = (...factors: FormulaExpression[]): FormulaExpression => ({ kind: "multiply", factors })
const clamp = (value: FormulaExpression, min?: number, max?: number): FormulaExpression => ({
  kind: "clamp",
  value,
  ...(min === undefined ? {} : { min }),
  ...(max === undefined ? {} : { max }),
})

const sourceLevel = ref("source.level")
const intMod = ref("abilities.intelligence.modifier")
const spellDc = add(lit(8), ref("core.proficiencyBonus"), intMod)
const spellAttack = add(ref("core.proficiencyBonus"), intMod)

type School = "abjuration" | "divination" | "evocation" | "illusion"

type RuntimeSubclass = {
  id: "abjurer" | "diviner" | "evoker" | "illusionist"
  slug: string
  catalogKey: (typeof WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS)[number]
  name: string
  description: string
  summary: string
  levels: Record<3 | 6 | 10 | 14, StoredMechanics>
}

function feature(id: string, sourceKey: string, key: string, label: string, description: string, mechanic: Record<string, unknown>): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey,
    target: "feature",
    key,
    payload: { label, description, mechanic },
  } as StoredMechanic
}

function permission(id: string, sourceKey: string, key: string, label: string, school: School): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey,
    target: "permission",
    key,
    payload: { label, school, destination: "spellbook", initialSpells: 2, initialMaxSpellLevel: 2, additionalSpellOnNewSlotLevel: 1 },
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
      `Когда подкласс открыт, добавьте в книгу два заклинания Волшебника школы ${ru} не выше 2 уровня. Каждый раз, когда уровень Волшебника впервые даёт доступ к новому уровню ячеек, добавьте в книгу ещё одно заклинание Волшебника этой школы доступного уровня; эти добавления не занимают обычные два заклинания за уровень.`,
      { kind: "wizard_school_savant", school, addsToSpellbook: true, initialSpells: 2, initialMaxSpellLevel: 2, additionalSpellOnNewSlotLevel: 1 },
    ),
    permission(`${prefix}-savant-permission`, sourceKey, `wizard.school_savant.${school}`, `Бесплатные заклинания: ${ru}`, school),
  ]
}

function resource(id: string, sourceKey: string, key: string, label: string, max: number | FormulaExpression, recharge: "long_rest" | Array<"short_rest" | "long_rest">, initial: "full" | "empty" = "full"): StoredMechanic {
  return { id, type: "resource", sourceKey, key, label, max, recharge, restore: "full", initial, presentation: { tone: "violet", display: "pips" } } as StoredMechanic
}

function action(id: string, sourceKey: string, key: string, label: string, economy: string, extra: Record<string, unknown> = {}): StoredMechanic {
  return { id, type: "action", sourceKey, key, label, economy, ...extra } as StoredMechanic
}

function slotOptions(from: number, to = 9) {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const level = from + index
    return { key: `slot-${level}`, castLevel: level, label: `Ячейка ${level} уровня`, costs: [{ key: `spell_slot_${level}`, amount: 1 }] }
  })
}

function wardRestoreActions(sourceKey: string): StoredMechanics {
  return Array.from({ length: 9 }, (_, index) => {
    const level = index + 1
    return action(`abjurer-ward-restore-slot-${level}`, sourceKey, `abjurer_ward_restore_slot_${level}`, `Подпитать Тайный заслон ячейкой ${level} уровня`, "bonus_action", {
      resourceCosts: [{ key: `spell_slot_${level}`, amount: 1 }],
      effects: [{ kind: "resource", key: "wizard_abjurer_arcane_ward", operation: "RESTORE", amount: level * 2 }],
      tags: ["wizard", "subclass", "resource-conversion", `slot:${level}`],
    })
  })
}

function restoreSlotActions(prefix: string, sourceKey: string, from: number, to: number, label: string): StoredMechanics {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const level = from + index
    return action(`${prefix}-slot-${level}`, sourceKey, `${prefix}_slot_${level}`, `${label} ${level} уровня`, "special", {
      effects: [{ kind: "resource", key: `spell_slot_${level}`, operation: "RESTORE", amount: 1 }],
      tags: ["wizard", "subclass", "slot-restore", `slot:${level}`],
    })
  })
}

function restoreBySlotActions(prefix: string, sourceKey: string, from: number, to: number, target: string, label: string): StoredMechanics {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const level = from + index
    return action(`${prefix}-slot-${level}`, sourceKey, `${prefix}_slot_${level}`, `${label} ${level} уровня`, "special", {
      resourceCosts: [{ key: `spell_slot_${level}`, amount: 1 }],
      effects: [{ kind: "resource", key: target, operation: "RESTORE", amount: 1 }],
      tags: ["wizard", "subclass", "resource-conversion", `slot:${level}`],
    })
  })
}

function spell(id: string, sourceKey: string, slug: string, name: string, level: number, school: string, preparation: "always_prepared" | "not_required", methods: SpellCastingMethodDefinition[]): StoredMechanic {
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

function slotMethod(from: number, kind = "spell"): SpellCastingMethodDefinition {
  return { key: "slot", kind, ability: "intelligence", saveDc: spellDc, attackBonus: spellAttack, requiresPrepared: false, resourceOptions: slotOptions(from) }
}

const abjurerWardKey = "wizard:abjurer:arcane-ward"
const abjurer: RuntimeSubclass = {
  id: "abjurer",
  slug: "wizard-abjurer",
  catalogKey: "subclass:wizard:abjurer",
  name: "Абьюратор",
  description: "Абьюратор превращает Ограждение в рабочую защиту: книгу защитных заклинаний, запас HP Тайного заслона, реакцию защиты союзника, подготовленные контрчары и сопротивление заклинаниям.",
  summary: "Тайный заслон как отдельный запас HP, реакция защиты союзника, Контрзаклинание и Рассеивание магии как всегда подготовленные инструменты, финальная устойчивость к заклинаниям.",
  levels: {
    3: [
      ...schoolSavant("abjurer", "abjuration", "Знаток Ограждения"),
      resource("abjurer-arcane-ward-hp", abjurerWardKey, "wizard_abjurer_arcane_ward", "HP Тайного заслона", add(mul(lit(2), sourceLevel), intMod), "long_rest"),
      feature("abjurer-arcane-ward-rules", abjurerWardKey, "subclass:wizard:abjurer:arcane-ward", "Тайный заслон", "Пока действует Тайный заслон, отдельный запас HP принимает урон до HP Волшебника. Максимум запаса равен удвоенному уровню Волшебника + модификатор Интеллекта. При сотворении заклинания Ограждения ячейкой заслон восстанавливает HP на удвоенный уровень потраченной ячейки; бонусным действием можно потратить ячейку и восстановить тот же запас без сотворения заклинания.", { kind: "damage_buffer", resource: "wizard_abjurer_arcane_ward", maximum: "2 * wizard_level + intelligence_modifier", restoreOnAbjurationSlotCast: "2 * slot_level", bonusActionSlotRestore: true }),
      ...wardRestoreActions(abjurerWardKey),
    ],
    6: [
      feature("abjurer-projected-ward-rules", "wizard:abjurer:projected-ward", "subclass:wizard:abjurer:projected-ward", "Переданный заслон", "Когда видимое существо в пределах 30 футов получает урон, реакцией направьте свой Тайный заслон на эту цель. Урон сначала уменьшает HP заслона; если их не хватает, оставшийся урон получает защищаемое существо.", { kind: "reaction_damage_buffer", resource: "wizard_abjurer_arcane_ward", rangeFeet: 30, usesReaction: true }),
      action("abjurer-projected-ward-action", "wizard:abjurer:projected-ward", "wizard_abjurer_projected_ward", "Передать Тайный заслон", "reaction", { range: { kind: "ranged", normal: 30, unit: "ft" }, requirements: [{ kind: "resource", key: "wizard_abjurer_arcane_ward", minimum: 1, label: "Тайный заслон должен иметь HP" }], effects: [{ kind: "semantic", key: "damage_buffer_redirect", payload: { resource: "wizard_abjurer_arcane_ward", rangeFeet: 30 } }], tags: ["wizard", "subclass", "reaction"] }),
    ],
    10: [
      feature("abjurer-spell-breaker-rules", "wizard:abjurer:spell-breaker", "subclass:wizard:abjurer:spell-breaker", "Разрушитель чар", "Контрзаклинание и Рассеивание магии всегда подготовлены и не занимают лимит подготовки. Рассеивание магии можно сотворить бонусным действием. Если одно из этих заклинаний, сотворённое ячейкой, не останавливает чужое заклинание, потраченная ячейка возвращается тем же уровнем.", { kind: "spell_breaker", alwaysPrepared: ["counterspell", "dispel-magic"], dispelMagicBonusAction: true, addProficiencyToDispelCheck: true, refundSlotOnFailedBreak: true }),
      spell("abjurer-counterspell-access", "wizard:abjurer:spell-breaker", "counterspell", "Контрзаклинание", 3, "abjuration", "always_prepared", [slotMethod(3, "reaction")]),
      spell("abjurer-dispel-magic-access", "wizard:abjurer:spell-breaker", "dispel-magic", "Рассеивание магии", 3, "abjuration", "always_prepared", [slotMethod(3), { ...slotMethod(3, "bonus_action"), key: "spell-breaker-bonus-action" }]),
      ...restoreSlotActions("abjurer_spell_breaker_refund", "wizard:abjurer:spell-breaker", 3, 9, "Вернуть ячейку Разрушителя чар"),
    ],
    14: [
      feature("abjurer-spell-resistance-rules", "wizard:abjurer:spell-resistance", "subclass:wizard:abjurer:spell-resistance", "Сопротивление заклинаниям", "Вы получаете преимущество на спасброски против заклинаний. Урон, источником которого является заклинание, наносится вам с сопротивлением; немагические способности и эффекты не получают это ограничение автоматически.", { kind: "spell_resistance", advantageOnSpellSavingThrows: true, resistanceToSpellDamage: true }),
      { id: "abjurer-spell-damage-resistance", type: "grant", sourceKey: "wizard:abjurer:spell-resistance", target: "resistance", key: "damage:spell", payload: { label: "Сопротивление урону заклинаний" } } as StoredMechanic,
    ],
  },
}

const diviner: RuntimeSubclass = {
  id: "diviner",
  slug: "wizard-diviner",
  catalogKey: "subclass:wizard:diviner",
  name: "Прорицатель",
  description: "Прорицатель играет через заранее записанные d20, восстановление ячеек после магии Прорицания и режимы Третьего глаза, которые открываются как реальные ресурсы и действия.",
  summary: "Знамения как расходуемые d20 после долгого отдыха, возврат ячеек за Прорицание, режимы Третьего глаза и увеличение запаса знамений на 14 уровне.",
  levels: {
    3: [
      ...schoolSavant("diviner", "divination", "Знаток Прорицания"),
      resource("diviner-portent-dice", "wizard:diviner:portent", "wizard_diviner_portent", "Знамения", add(lit(2), clamp(sub(sourceLevel, lit(13)), 0, 1)), "long_rest"),
      feature("diviner-portent-rules", "wizard:diviner:portent", "subclass:wizard:diviner:portent", "Знамение", "После долгого отдыха бросьте d20 за каждое доступное Знамение и запишите значения. До следующего долгого отдыха, до броска d20 видимого существа, потратьте одно Знамение и замените этот бросок записанным значением. Каждое записанное значение используется один раз.", { kind: "portent", resource: "wizard_diviner_portent", die: "d20", replaceBeforeRoll: true, perTurnLimit: 1 }),
      action("diviner-portent-action", "wizard:diviner:portent", "wizard_diviner_use_portent", "Использовать Знамение", "special", { resourceKey: "wizard_diviner_portent", resourceCost: 1, effects: [{ kind: "semantic", key: "replace_d20_before_roll", payload: { source: "recorded_portent_value" } }], tags: ["wizard", "subclass", "d20"] }),
    ],
    6: [
      feature("diviner-expert-divination-rules", "wizard:diviner:expert-divination", "subclass:wizard:diviner:expert-divination", "Опытное прорицание", "Когда вы тратите ячейку 2 уровня или выше на заклинание Прорицания, восстановите одну потраченную ячейку ниже уровня потраченной ячейки. Восстановленная ячейка не может быть выше 5 уровня и не может превысить максимум ячеек персонажа.", { kind: "expert_divination", trigger: "cast_divination_spell_with_slot_2_plus", maximumRestoredSlotLevel: 5 }),
      ...restoreSlotActions("diviner_expert_restore", "wizard:diviner:expert-divination", 1, 5, "Вернуть ячейку Опытным прорицанием"),
    ],
    10: [
      resource("diviner-third-eye-use", "wizard:diviner:third-eye", "wizard_diviner_third_eye", "Третий глаз", 1, ["short_rest", "long_rest"]),
      feature("diviner-third-eye-rules", "wizard:diviner:third-eye", "subclass:wizard:diviner:third-eye", "Третий глаз", "Бонусным действием выберите один режим Третьего глаза до начала короткого или долгого отдыха: тёмное зрение 120 футов, чтение любых языков или Видение невидимого без траты ячейки. Запас использования восстанавливается после короткого или долгого отдыха.", { kind: "third_eye", resource: "wizard_diviner_third_eye", options: ["darkvision", "read_languages", "see_invisibility"] }),
      action("diviner-third-eye-darkvision", "wizard:diviner:third-eye", "wizard_diviner_third_eye_darkvision", "Третий глаз: тёмное зрение", "bonus_action", { resourceKey: "wizard_diviner_third_eye", resourceCost: 1, effects: [{ kind: "semantic", key: "third_eye_mode", payload: { mode: "darkvision", rangeFeet: 120 } }] }),
      action("diviner-third-eye-read-languages", "wizard:diviner:third-eye", "wizard_diviner_third_eye_read_languages", "Третий глаз: читать языки", "bonus_action", { resourceKey: "wizard_diviner_third_eye", resourceCost: 1, effects: [{ kind: "semantic", key: "third_eye_mode", payload: { mode: "read_languages" } }] }),
      action("diviner-third-eye-see-invisibility", "wizard:diviner:third-eye", "wizard_diviner_third_eye_see_invisibility", "Третий глаз: видеть невидимое", "bonus_action", { resourceKey: "wizard_diviner_third_eye", resourceCost: 1, effects: [{ kind: "semantic", key: "third_eye_mode", payload: { mode: "see_invisibility" } }] }),
    ],
    14: [feature("diviner-greater-portent-rules", "wizard:diviner:portent", "subclass:wizard:diviner:greater-portent", "Великое знамение", "После достижения 14 уровня Волшебника запас Знамений после долгого отдыха становится равен трём d20 вместо двух. Все правила записи, траты и замены броска остаются теми же.", { kind: "portent_upgrade", resource: "wizard_diviner_portent", newMaximum: 3 })],
  },
}

const evoker: RuntimeSubclass = {
  id: "evoker",
  slug: "wizard-evoker",
  catalogKey: "subclass:wizard:evoker",
  name: "Воплотитель",
  description: "Воплотитель усиливает прямой урон: половина урона заговоров при неудачном попадании, безопасные зоны в массовых Воплощениях, Интеллект к урону и Перегрузка.",
  summary: "Частичный урон заговоров, защита союзников от собственных областей, модификатор Интеллекта к Воплощению и разовая безопасная Перегрузка после долгого отдыха.",
  levels: {
    3: [
      ...schoolSavant("evoker", "evocation", "Знаток Воплощения"),
      feature("evoker-potent-cantrip-rules", "wizard:evoker:potent-cantrip", "subclass:wizard:evoker:potent-cantrip", "Мощный заговор", "Когда заговор Волшебника наносит урон существу, промах атакой заклинанием или успешный спасбросок цели не отменяет урон полностью: цель получает половину урона заговора. Дополнительные эффекты этого заговора при таком частичном результате не применяются.", { kind: "potent_cantrip", appliesTo: "wizard_cantrip_damage", missOrSuccessfulSave: "half_damage", noAdditionalEffects: true }),
    ],
    6: [feature("evoker-sculpt-spells-rules", "wizard:evoker:sculpt-spells", "subclass:wizard:evoker:sculpt-spells", "Ваяние заклинаний", "Когда вы накладываете заклинание Воплощения, которое затрагивает видимых существ, выберите до 1 + уровень заклинания таких существ. Выбранные существа автоматически успешно проходят спасброски против этого заклинания и не получают урон, если при успехе обычно получили бы половину.", { kind: "sculpt_spells", school: "evocation", protectedCreaturesFormula: "1 + spell_level", autoSaveSuccess: true, negatesHalfDamageOnSuccessfulSave: true })],
    10: [feature("evoker-empowered-evocation-rules", "wizard:evoker:empowered-evocation", "subclass:wizard:evoker:empowered-evocation", "Усиленное воплощение", "Когда вы накладываете заклинание Волшебника школы Воплощения, добавьте модификатор Интеллекта к одному броску урона этого заклинания. Бонус применяется один раз на заклинание, даже если урон распределён по нескольким целям.", { kind: "spell_damage_modifier", appliesTo: "wizard_evocation_spell", modifier: "intelligence_modifier", oncePerSpell: true })],
    14: [
      resource("evoker-overchannel-safe-use", "wizard:evoker:overchannel", "wizard_evoker_overchannel_safe", "Безопасная перегрузка", 1, "long_rest"),
      feature("evoker-overchannel-rules", "wizard:evoker:overchannel", "subclass:wizard:evoker:overchannel", "Перегрузка", "Когда вы накладываете заклинание Волшебника ячейкой 1–5 уровня и оно наносит урон в ход сотворения, можно назначить максимальный урон вместо броска. Первое использование после долгого отдыха тратит запас Безопасной перегрузки; повторные использования до долгого отдыха требуют ручного учёта отдачи: сначала 2d12 некротического урона за уровень ячейки, затем на 1d12 за уровень ячейки больше за каждую следующую перегрузку.", { kind: "overchannel", resource: "wizard_evoker_overchannel_safe", spellSlotMin: 1, spellSlotMax: 5, maximizeDamageThisTurn: true, repeatNecroticBacklash: { firstRepeatDicePerSlotLevel: "2d12", additionalRepeatDicePerSlotLevel: "1d12", ignoresResistanceAndImmunity: true } }),
      action("evoker-overchannel-safe-action", "wizard:evoker:overchannel", "wizard_evoker_overchannel_safe", "Перегрузить заклинание без отдачи", "special", { resourceKey: "wizard_evoker_overchannel_safe", resourceCost: 1, effects: [{ kind: "semantic", key: "maximize_spell_damage", payload: { slotMin: 1, slotMax: 5 } }] }),
    ],
  },
}

const illusionist: RuntimeSubclass = {
  id: "illusionist",
  slug: "wizard-illusionist",
  catalogKey: "subclass:wizard:illusionist",
  name: "Иллюзионист",
  description: "Иллюзионист получает бессловесные и дальние иллюзии, улучшенную Малую иллюзию, подготовленные призывы-фантомы, защитного двойника и временно реальный объект.",
  summary: "Улучшенная Малая иллюзия, бесплатные призрачные призывы через ресурсы, реакция Иллюзорного я с восстановлением ячейкой и Иллюзорная реальность как бонусное действие.",
  levels: {
    3: [
      ...schoolSavant("illusionist", "illusion", "Знаток Иллюзии"),
      feature("illusionist-improved-illusions-rules", "wizard:illusionist:improved-illusions", "subclass:wizard:illusionist:improved-illusions", "Улучшенные иллюзии", "Заклинания Иллюзии можно накладывать без словесных компонентов; жестовые и материальные компоненты остаются. Дальность ваших заклинаний Иллюзии с базовой дальностью 10 футов или больше увеличивается на 60 футов. Вы знаете Малую иллюзию сверх лимита заговоров; при её сотворении можно создать звук и изображение вместе, а также использовать бонусное действие.", { kind: "improved_illusions", removeVerbalComponentsFromIllusionSpells: true, rangeBonusFeet: 60, minorIllusion: { granted: true, soundAndImageTogether: true, canCastAsBonusAction: true } }),
      spell("illusionist-minor-illusion-access", "wizard:illusionist:improved-illusions", "minor-illusion", "Малая иллюзия", 0, "illusion", "not_required", [{ key: "cantrip", kind: "cantrip", ability: "intelligence", saveDc: spellDc, requiresPrepared: false }]),
    ],
    6: [
      resource("illusionist-free-summon-beast-resource", "wizard:illusionist:phantasmal-creatures", "wizard_illusionist_free_summon_beast", "Призрачный зверь без ячейки", 1, "long_rest"),
      resource("illusionist-free-summon-fey-resource", "wizard:illusionist:phantasmal-creatures", "wizard_illusionist_free_summon_fey", "Призрачная фея без ячейки", 1, "long_rest"),
      feature("illusionist-phantasmal-creatures-rules", "wizard:illusionist:phantasmal-creatures", "subclass:wizard:illusionist:phantasmal-creatures", "Фантомные существа", "Призыв зверя и Призыв феи всегда подготовлены и не занимают лимит подготовки. Когда вы накладываете одно из этих заклинаний, оно может считаться Иллюзией, а призванное существо выглядит призрачным. Каждое из двух заклинаний можно сотворить без ячейки один раз до долгого отдыха; существо от бесплатного сотворения получает половину обычных HP.", { kind: "phantasmal_creatures", alwaysPrepared: ["summon-beast", "summon-fey"], canTreatAsIllusion: true, freeCastEachPerLongRest: true, freeCastSummonHpMultiplier: 0.5 }),
      spell("illusionist-summon-beast-access", "wizard:illusionist:phantasmal-creatures", "summon-beast", "Призыв зверя", 2, "conjuration", "always_prepared", [slotMethod(2), { key: "phantom-free", kind: "spell", ability: "intelligence", saveDc: spellDc, requiresPrepared: false, resourceOptions: [{ key: "free", costs: [{ key: "wizard_illusionist_free_summon_beast", amount: 1 }] }] }]),
      spell("illusionist-summon-fey-access", "wizard:illusionist:phantasmal-creatures", "summon-fey", "Призыв феи", 3, "conjuration", "always_prepared", [slotMethod(3), { key: "phantom-free", kind: "spell", ability: "intelligence", saveDc: spellDc, requiresPrepared: false, resourceOptions: [{ key: "free", costs: [{ key: "wizard_illusionist_free_summon_fey", amount: 1 }] }] }]),
    ],
    10: [
      resource("illusionist-illusory-self-resource", "wizard:illusionist:illusory-self", "wizard_illusionist_illusory_self", "Иллюзорное я", 1, ["short_rest", "long_rest"]),
      feature("illusionist-illusory-self-rules", "wizard:illusionist:illusory-self", "subclass:wizard:illusionist:illusory-self", "Иллюзорное я", "Когда существо попадает по вам броском атаки, реакцией потратьте запас Иллюзорного я: эта атака автоматически промахивается, затем иллюзия исчезает. Запас восстанавливается после короткого или долгого отдыха; его также можно восстановить без действия, потратив ячейку 2 уровня или выше.", { kind: "illusory_self", resource: "wizard_illusionist_illusory_self", trigger: "hit_by_attack_roll", effect: "attack_misses", restoreBySlotMinLevel: 2 }),
      action("illusionist-illusory-self-action", "wizard:illusionist:illusory-self", "wizard_illusionist_illusory_self", "Подставить Иллюзорное я", "reaction", { resourceKey: "wizard_illusionist_illusory_self", resourceCost: 1, effects: [{ kind: "semantic", key: "force_attack_miss", payload: { trigger: "hit_by_attack_roll" } }] }),
      ...restoreBySlotActions("illusionist_restore_illusory_self", "wizard:illusionist:illusory-self", 2, 9, "wizard_illusionist_illusory_self", "Восстановить Иллюзорное я ячейкой"),
    ],
    14: [
      feature("illusionist-illusory-reality-rules", "wizard:illusionist:illusory-reality", "subclass:wizard:illusionist:illusory-reality", "Иллюзорная реальность", "Когда вы накладываете заклинание Иллюзии ячейкой, выберите один немагический неодушевлённый объект, являющийся частью иллюзии, и сделайте его реальным на 1 минуту. Пока заклинание продолжается, на своём ходу можно сделать это бонусным действием. Такой объект не наносит урон и не накладывает состояния.", { kind: "illusory_reality", duration: "1_minute", object: "nonmagical_inanimate_part_of_illusion", cannotDealDamage: true, cannotApplyConditions: true }),
      action("illusionist-illusory-reality-action", "wizard:illusionist:illusory-reality", "wizard_illusionist_illusory_reality", "Сделать иллюзию реальной", "bonus_action", { effects: [{ kind: "semantic", key: "make_illusion_object_real", payload: { duration: "1_minute", cannotDealDamage: true, cannotApplyConditions: true } }] }),
    ],
  },
}

const runtimeSubclasses: RuntimeSubclass[] = [abjurer, diviner, evoker, illusionist]

const wizardParentBundle: CharacterTemplateBundle = {
  assignment: { id: "wizard-subclass-runtime-parent-assignment", character_id: "wizard-subclass-runtime-character", template_id: wizardParentId, template_level: 14, selected_choices: {}, assigned_at: now, updated_at: now },
  template: {
    id: wizardParentId,
    campaign_id: "wizard-subclass-runtime-campaign",
    kind: "class",
    slug: "wizard-core",
    name: "Волшебник",
    description: "Родительская запись Волшебника для проверки подклассов: уровень класса задаёт доступные особенности подкласса, а не общий уровень персонажа.",
    version: 1,
    mechanics: [feature("wizard-runtime-parent-rules", "wizard:runtime-parent", "class:wizard:runtime-parent", "Уровень Волшебника", "Уровень Волшебника является источником прогрессии для выбранного подкласса. Особенности подкласса открываются на 3, 6, 10 и 14 уровнях именно этого класса.", { kind: "class_level_source", subclassLevels: [3, 6, 10, 14] })],
    choices: [],
    parent_template_id: null,
    unlock_level: null,
    catalog_key: "class:wizard",
    catalog_revision: "phb-2024-runtime-parent@1",
    source_kind: "official",
    source_label: "Player's Handbook 2024",
    is_builtin: true,
    mechanical_summary: "Волшебник использует уровень класса как источник прогрессии подкласса: особенности выбранной школы открываются на 3, 6, 10 и 14 уровнях Волшебника.",
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
    assignment: { id: `${templateId}-assignment`, character_id: "wizard-subclass-runtime-character", template_id: templateId, template_level: null, selected_choices: {}, assigned_at: now, updated_at: now },
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
      rules_meta: { base_class: "class:wizard", rules_revision: "2024", mechanics_status: "READY", feature_levels: [3, 6, 10, 14], chat_template_actions: true, chat_template_spells: true },
      is_active: true,
      created_by: null,
      created_at: now,
      updated_at: now,
    },
    levels: ([3, 6, 10, 14] as const).map((level) => ({ id: `${templateId}-level-${level}`, template_id: templateId, level, mechanics: entry.levels[level], choices: [] })),
  }
}

export const wizardSubclassRuntimeBundles: CharacterTemplateBundle[] = [
  wizardParentBundle,
  ...runtimeSubclasses.map(subclassBundle),
]
