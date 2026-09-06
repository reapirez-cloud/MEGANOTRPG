import type { FormulaExpression, SpellCastingMethodDefinition } from "../character-engine/index.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"
import {
  WARLOCK_STAGE6_SUPPLEMENTAL_SUBCLASSES,
  WARLOCK_STAGE6_SUPPLEMENTAL_CATALOG_KEYS,
  WARLOCK_SUPPLEMENTAL_SUBCLASS_RUNTIME_LEVELS,
  type WarlockStage6SupplementalCatalogKey,
} from "./warlockSupplementalSubclasses.ts"

export const WARLOCK_STAGE6_RUNTIME_REVISION = "xphb-2024-warlock-supplemental-subclasses-runtime-v1" as const
export const WARLOCK_STAGE6_RUNTIME_CATALOG_KEYS = WARLOCK_STAGE6_SUPPLEMENTAL_CATALOG_KEYS

const now = "2026-09-07T00:00:00Z"
const warlockParentId = "warlock-stage6-parent"
const lit = (value: number): FormulaExpression => ({ kind: "literal", value })
const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })
const spellDc = add(lit(8), ref("core.proficiencyBonus"), ref("abilities.charisma.modifier"))
const spellAttack = add(ref("core.proficiencyBonus"), ref("abilities.charisma.modifier"))

type RuntimeLevel = (typeof WARLOCK_SUPPLEMENTAL_SUBCLASS_RUNTIME_LEVELS)[number]
type RuntimeSubclass = {
  id: "hexblade" | "fathomless" | "genie" | "undead"
  catalogKey: WarlockStage6SupplementalCatalogKey
  slug: string
  name: string
  description: string
  summary: string
  levels: Record<RuntimeLevel, StoredMechanics>
  choicesByLevel?: Partial<Record<RuntimeLevel, RuleChoiceDefinition[]>>
}

function feature(id: string, sourceKey: string, key: string, label: string, description: string, mechanic: Record<string, unknown>): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description, mechanic } } as StoredMechanic
}

function grant(id: string, sourceKey: string, target: "resistance" | "immunity" | "proficiency", key: string, label: string): StoredMechanic {
  return { id, type: "grant", sourceKey, target, key, payload: target === "proficiency" ? { label, rank: 1 } : { label } } as StoredMechanic
}

function resource(id: string, sourceKey: string, key: string, label: string, maximum: number | FormulaExpression, recharge: "long_rest" | Array<"short_rest" | "long_rest">): StoredMechanic {
  return { id, type: "resource", sourceKey, key, label, max: maximum, recharge, initial: "full", presentation: { tone: "violet", display: "pips" } } as StoredMechanic
}

function action(id: string, sourceKey: string, key: string, label: string, economy: string, extra: Record<string, unknown> = {}): StoredMechanic {
  return { id, type: "action", sourceKey, key, label, economy, tags: ["warlock", "subclass", "stage6"], ...extra } as StoredMechanic
}

function semanticAction(id: string, sourceKey: string, key: string, label: string, economy: string, resourceKey: string | null, semanticKey: string, payload: Record<string, unknown>): StoredMechanic {
  return action(id, sourceKey, key, label, economy, {
    ...(resourceKey ? { resourceCosts: [{ key: resourceKey, amount: 1 }] } : {}),
    effects: [{ kind: "semantic", key: semanticKey, payload }],
  })
}

function pactMethod(castLevel: number): SpellCastingMethodDefinition {
  return {
    key: `pact-${castLevel}`,
    kind: "pact_magic",
    ability: "charisma",
    saveDc: spellDc,
    attackBonus: spellAttack,
    requiresPrepared: false,
    resourceOptions: [{ key: `pact-${castLevel}`, castLevel, costs: [{ key: "warlock_pact_slots", amount: 1 }] }],
  }
}

function featureMethod(key: string, castLevel: number, resourceKey: string): SpellCastingMethodDefinition {
  return {
    key,
    kind: "class_feature",
    ability: "charisma",
    saveDc: spellDc,
    attackBonus: spellAttack,
    requiresPrepared: false,
    resourceOptions: [{ key, castLevel, costs: [{ key: resourceKey, amount: 1 }] }],
  }
}

function automaticSpell(id: string, sourceKey: string, slug: string, name: string, level: number, school: string, castLevel: number, freeResourceKey: string): StoredMechanic {
  return {
    id,
    type: "spell",
    sourceKey,
    key: `spell:${slug}`,
    catalogSlug: slug,
    variantKey: `warlock-stage6:${slug}`,
    payload: {
      spell: { name, level, school },
      preparation: { mode: "not_required" },
      methods: [pactMethod(castLevel), featureMethod(`feature-${slug}`, level, freeResourceKey)],
    },
  } as StoredMechanic
}

function expandedList(id: string, sourceKey: string, label: string, spellLevel: number, spells: string[], extra: Record<string, unknown> = {}): StoredMechanic {
  return feature(
    id,
    sourceKey,
    `${sourceKey}:expanded:${spellLevel}`,
    label,
    `Эти заклинания ${spellLevel} уровня добавляются к списку заклинаний Колдуна для этого покровителя. Они становятся допустимыми вариантами при выборе или замене заклинаний Колдуна, но сами по себе не изучаются и не подготавливаются автоматически.`,
    { kind: "legacy_expanded_spell_list", spellLevel, spells, automatic: false, acquisition: "warlock_spell_selection", ...extra },
  )
}

const hexblade: RuntimeSubclass = {
  id: "hexblade",
  catalogKey: "subclass:warlock:hexblade",
  slug: "warlock-hexblade",
  name: "Ведьмовской клинок",
  description: "Покровитель Ведьмовского клинка связывает проклятие с оружием и ближним боем.",
  summary: "Ведьмовской клинок получает боевые владения, проклинает одну цель с восстановлением на коротком отдыхе и развивает защиту и власть над проклятой добычей.",
  levels: {
    3: [
      expandedList("hexblade-expanded-l12", "warlock:hexblade:expanded-spells", "Расширенный список Ведьмовского клинка", 1, ["shield", "wrathful-smite"]),
      expandedList("hexblade-expanded-l22", "warlock:hexblade:expanded-spells", "Расширенный список Ведьмовского клинка", 2, ["blur", "branding-smite"]),
      feature("hexblade-curse-feature", "warlock:hexblade:hexblades-curse", "warlock_hexblades_curse", "Проклятие Ведьмовского клинка", "Бонусным действием выберите видимое существо в пределах 30 футов и прокляните его на 1 минуту. Вы добавляете бонус мастерства к броскам урона по цели, ваши атаки по ней наносят критический удар при 19–20, а когда она умирает, вы восстанавливаете хиты, равные уровню Колдуна + модификатор Харизмы, минимум 1. Использование восстанавливается после короткого или долгого отдыха.", { kind: "hexblades_curse", rangeFeet: 30, durationMinutes: 1, damageBonus: "proficiency_bonus", criticalRange: [19, 20], healOnDeath: "warlock_level_plus_charisma_min_1", gm_target_gate: true }),
      resource("hexblade-curse-uses", "warlock:hexblade:hexblades-curse", "warlock_hexblades_curse_uses", "Проклятие Ведьмовского клинка", 1, ["short_rest", "long_rest"]),
      semanticAction("hexblade-curse-action", "warlock:hexblade:hexblades-curse", "warlock_hexblades_curse", "Наложить проклятие", "bonus_action", "warlock_hexblades_curse_uses", "hexblades_curse", { rangeFeet: 30, durationMinutes: 1 }),
      feature("hexblade-warrior-feature", "warlock:hexblade:hex-warrior", "warlock_hex_warrior", "Воин проклятого клинка", "Вы получаете владение средними доспехами, щитами и воинским оружием. После каждого долгого отдыха можно коснуться одного оружия, которым вы владеете и у которого нет свойства Двуручное; до следующего долгого отдыха для бросков атаки и урона этим оружием можно использовать Харизму вместо Силы или Ловкости. Для оружия Договора клинка это преимущество действует независимо от типа оружия.", { kind: "hex_warrior", longRestWeaponChoice: true, excludesTwoHanded: true, attackAbility: "charisma", damageAbility: "charisma", pactBladeExtends: true, gm_inventory_choice: true }),
      grant("hexblade-medium-armor", "warlock:hexblade:hex-warrior", "proficiency", "armor:medium", "Средние доспехи"),
      grant("hexblade-shields", "warlock:hexblade:hex-warrior", "proficiency", "armor:shield", "Щиты"),
      grant("hexblade-martial-weapons", "warlock:hexblade:hex-warrior", "proficiency", "weapon:martial", "Воинское оружие"),
    ],
    5: [expandedList("hexblade-expanded-l3", "warlock:hexblade:expanded-spells", "Расширенный список Ведьмовского клинка", 3, ["blink", "elemental-weapon"])],
    6: [
      feature("hexblade-specter-feature", "warlock:hexblade:accursed-specter", "warlock_accursed_specter", "Проклятый призрак", "Когда вы убиваете гуманоида, можно поднять его дух как спектра до конца следующего долгого отдыха. Спектр получает временные хиты, равные половине уровня Колдуна, и бонус к броскам атаки, равный модификатору Харизмы, минимум +0; он действует на собственной инициативе и подчиняется устным командам. После использования способность восстанавливается после долгого отдыха.", { kind: "accursed_specter", trigger: "humanoid_slain", duration: "until_next_long_rest", tempHp: "half_warlock_level", attackBonus: "charisma_min_0", gm_creature_gate: true }),
      resource("hexblade-specter-uses", "warlock:hexblade:accursed-specter", "warlock_accursed_specter_uses", "Проклятый призрак", 1, "long_rest"),
      semanticAction("hexblade-specter-action", "warlock:hexblade:accursed-specter", "warlock_accursed_specter", "Поднять проклятого призрака", "no_action", "warlock_accursed_specter_uses", "accursed_specter", { duration: "until_next_long_rest" }),
    ],
    7: [expandedList("hexblade-expanded-l4", "warlock:hexblade:expanded-spells", "Расширенный список Ведьмовского клинка", 4, ["phantasmal-killer", "staggering-smite"])],
    9: [expandedList("hexblade-expanded-l5", "warlock:hexblade:expanded-spells", "Расширенный список Ведьмовского клинка", 5, ["banishing-smite", "cone-of-cold"])],
    10: [feature("hexblade-armor-feature", "warlock:hexblade:armor-of-hexes", "warlock_armor_of_hexes", "Доспех проклятий", "Когда цель вашего Проклятия Ведьмовского клинка попадает по вам броском атаки, вы можете реакцией бросить d6. При результате 4 или выше атака вместо этого промахивается независимо от её исходного броска. Реакция и наличие действующего проклятия проверяются ведущим в сцене.", { kind: "armor_of_hexes", die: "1d6", missOn: [4, 5, 6], gm_reaction_gate: true })],
    14: [feature("hexblade-master-feature", "warlock:hexblade:master-of-hexes", "warlock_master_of_hexes", "Мастер проклятий", "Когда существо под вашим Проклятием Ведьмовского клинка умирает, вы можете перенести проклятие на другое видимое существо в пределах 30 футов, если не недееспособны. При таком переносе вы не восстанавливаете хиты за смерть предыдущей цели; оставшаяся длительность проклятия продолжается.", { kind: "master_of_hexes", rangeFeet: 30, transfersExistingCurse: true, suppressPreviousDeathHealing: true, gm_target_gate: true })],
  },
}

const fathomless: RuntimeSubclass = {
  id: "fathomless",
  catalogKey: "subclass:warlock:fathomless",
  slug: "warlock-fathomless",
  name: "Непостижимый",
  description: "Непостижимый связывает колдуна с глубинами, холодом и призванными щупальцами.",
  summary: "Непостижимый получает щупальце с числом применений по бонусу мастерства, морские свойства, защитную реакцию, особое Чёрное щупальце и телепортацию между водоёмами.",
  levels: {
    3: [
      expandedList("fathomless-expanded-l12", "warlock:fathomless:expanded-spells", "Расширенный список Непостижимого", 1, ["create-or-destroy-water", "thunderwave"]),
      expandedList("fathomless-expanded-l22", "warlock:fathomless:expanded-spells", "Расширенный список Непостижимого", 2, ["gust-of-wind", "silence"]),
      feature("fathomless-tentacle-feature", "warlock:fathomless:tentacle", "warlock_fathomless_tentacle", "Щупальце глубин", "Бонусным действием создайте щупальце в видимой точке в пределах 60 футов на 1 минуту и сразу выполните им рукопашную атаку заклинанием по существу в пределах 10 футов от щупальца. При попадании оно наносит 1d8 урона холодом и уменьшает Скорость цели на 10 футов до начала вашего следующего хода; с 10 уровня урон становится 2d8. В последующие ходы бонусным действием можно переместить щупальце до 30 футов и повторить атаку. Число призывов равно бонусу мастерства и восстанавливается после долгого отдыха.", { kind: "tentacle_of_the_deeps", rangeFeet: 60, reachFeet: 10, durationMinutes: 1, damageByLevel: { "3": "1d8", "10": "2d8" }, damageType: "cold", speedPenaltyFeet: 10, moveFeet: 30, gm_attack_gate: true }),
      resource("fathomless-tentacle-uses", "warlock:fathomless:tentacle", "warlock_fathomless_tentacle_uses", "Щупальце глубин", ref("core.proficiencyBonus"), "long_rest"),
      semanticAction("fathomless-tentacle-action", "warlock:fathomless:tentacle", "warlock_fathomless_tentacle", "Призвать щупальце", "bonus_action", "warlock_fathomless_tentacle_uses", "tentacle_of_the_deeps", { rangeFeet: 60, durationMinutes: 1 }),
      feature("fathomless-gift-sea", "warlock:fathomless:gift-of-the-sea", "warlock_gift_of_the_sea", "Дар моря", "Вы можете дышать под водой и получаете скорость плавания 40 футов. Эти свойства действуют постоянно, пока источник подкласса активен, и не требуют отдельного ресурса или действия.", { kind: "gift_of_the_sea", underwaterBreathing: true, swimSpeedFeet: 40 }),
    ],
    5: [expandedList("fathomless-expanded-l3", "warlock:fathomless:expanded-spells", "Расширенный список Непостижимого", 3, ["lightning-bolt", "sleet-storm"])],
    6: [
      feature("fathomless-oceanic-soul", "warlock:fathomless:oceanic-soul", "warlock_oceanic_soul", "Океаническая душа", "Вы получаете сопротивление урону холодом. Пока вы полностью погружены под воду, вы и любое также полностью погружённое существо можете взаимно понимать речь друг друга независимо от общего языка; это не даёт способности говорить там, где существо иначе говорить не может.", { kind: "oceanic_soul", underwaterMutualUnderstanding: true }),
      grant("fathomless-cold-resistance", "warlock:fathomless:oceanic-soul", "resistance", "damage:cold", "Сопротивление урону холодом"),
      feature("fathomless-guardian-coil", "warlock:fathomless:guardian-coil", "warlock_guardian_coil", "Защитное щупальце", "Когда вы или видимое вами существо в пределах 10 футов от Щупальца глубин получает урон, вы можете реакцией уменьшить этот урон на 1d8. С 10 уровня уменьшение становится 2d8. Наличие щупальца, расстояние и реакция остаются сценическими условиями и проверяются ведущим.", { kind: "guardian_coil", rangeFromTentacleFeet: 10, reductionByLevel: { "6": "1d8", "10": "2d8" }, gm_reaction_gate: true }),
    ],
    7: [expandedList("fathomless-expanded-l4", "warlock:fathomless:expanded-spells", "Расширенный список Непостижимого", 4, ["control-water", "summon-elemental"])],
    9: [expandedList("fathomless-expanded-l5", "warlock:fathomless:expanded-spells", "Расширенный список Непостижимого", 5, ["bigbys-hand", "cone-of-cold"])],
    10: [
      feature("fathomless-grasping-feature", "warlock:fathomless:grasping-tentacles", "warlock_grasping_tentacles", "Хватающие щупальца", "Вы изучаете заклинание Чёрные щупальца, и оно не уменьшает число других заклинаний Колдуна, которые вы можете иметь. Один раз за долгий отдых его можно сотворить этой особенностью без траты ячейки; обычное сотворение через Магию договора остаётся доступно. Когда вы сотворяете его, вы получаете временные хиты, равные уровню Колдуна, а полученный урон не заставляет совершать спасброски для поддержания концентрации на этом заклинании.", { kind: "grasping_tentacles", spell: "black-tentacles", freeCastPerLongRest: 1, tempHp: "warlock_level", concentrationDamageChecksIgnored: true }),
      resource("fathomless-grasping-uses", "warlock:fathomless:grasping-tentacles", "warlock_fathomless_grasping_tentacles_uses", "Хватающие щупальца: бесплатное сотворение", 1, "long_rest"),
      automaticSpell("fathomless-black-tentacles", "warlock:fathomless:grasping-tentacles", "black-tentacles", "Чёрные щупальца", 4, "Conjuration", 5, "warlock_fathomless_grasping_tentacles_uses"),
    ],
    14: [
      feature("fathomless-plunge-feature", "warlock:fathomless:fathomless-plunge", "warlock_fathomless_plunge", "Погружение в бездну", "Действием выберите себя и до пяти согласных существ, которых видите в пределах 30 футов. Вы телепортируетесь к водоёму, который видели ранее, в пределах 1 мили, либо в пределах 30 миль, если ведущий допускает указанное место по правилу особенности. После использования способность восстанавливается после короткого или долгого отдыха.", { kind: "fathomless_plunge", targets: 5, targetRangeFeet: 30, destination: "body_of_water_seen", distanceMiles: 1, gm_destination_gate: true }),
      resource("fathomless-plunge-uses", "warlock:fathomless:fathomless-plunge", "warlock_fathomless_plunge_uses", "Погружение в бездну", 1, ["short_rest", "long_rest"]),
      semanticAction("fathomless-plunge-action", "warlock:fathomless:fathomless-plunge", "warlock_fathomless_plunge", "Погружение в бездну", "action", "warlock_fathomless_plunge_uses", "fathomless_plunge", { targets: 5, rangeFeet: 30 }),
    ],
  },
}

const genieKindChoice: RuleChoiceDefinition = {
  key: "warlock_genie_kind",
  label: "Род покровителя-джинна",
  target: "trait",
  selection_mode: "player_once",
  count: 1,
  required: true,
  options: ["dao", "djinni", "efreeti", "marid"],
  option_labels: { dao: "Дао", djinni: "Джинни", efreeti: "Ифрит", marid: "Марид" },
  option_mechanics: {
    dao: [feature("genie-dao-kind", "warlock:genie:kind", "warlock_genie_dao", "Покровитель: Дао", "Ваш покровитель относится к дао. Дополнительный урон Ярости джинна имеет дробящий тип; вариант покровителя также определяет дополнительные заклинания и сопротивление, получаемое на 6 уровне.", { kind: "genie_kind", patron: "dao", wrathDamageType: "bludgeoning" })],
    djinni: [feature("genie-djinni-kind", "warlock:genie:kind", "warlock_genie_djinni", "Покровитель: Джинни", "Ваш покровитель относится к джинни. Дополнительный урон Ярости джинна имеет тип грома; вариант покровителя также определяет дополнительные заклинания и сопротивление, получаемое на 6 уровне.", { kind: "genie_kind", patron: "djinni", wrathDamageType: "thunder" })],
    efreeti: [feature("genie-efreeti-kind", "warlock:genie:kind", "warlock_genie_efreeti", "Покровитель: Ифрит", "Ваш покровитель относится к ифритам. Дополнительный урон Ярости джинна имеет тип огня; вариант покровителя также определяет дополнительные заклинания и сопротивление, получаемое на 6 уровне.", { kind: "genie_kind", patron: "efreeti", wrathDamageType: "fire" })],
    marid: [feature("genie-marid-kind", "warlock:genie:kind", "warlock_genie_marid", "Покровитель: Марид", "Ваш покровитель относится к маридам. Дополнительный урон Ярости джинна имеет тип холода; вариант покровителя также определяет дополнительные заклинания и сопротивление, получаемое на 6 уровне.", { kind: "genie_kind", patron: "marid", wrathDamageType: "cold" })],
  },
  option_mechanics_by_level: {
    dao: { "6": [grant("genie-dao-resistance", "warlock:genie:elemental-gift", "resistance", "damage:bludgeoning", "Сопротивление дробящему урону")] },
    djinni: { "6": [grant("genie-djinni-resistance", "warlock:genie:elemental-gift", "resistance", "damage:thunder", "Сопротивление урону громом")] },
    efreeti: { "6": [grant("genie-efreeti-resistance", "warlock:genie:elemental-gift", "resistance", "damage:fire", "Сопротивление урону огнём")] },
    marid: { "6": [grant("genie-marid-resistance", "warlock:genie:elemental-gift", "resistance", "damage:cold", "Сопротивление урону холодом")] },
  },
}

function genieKindSpellFeature(level: 3 | 5 | 7 | 9): StoredMechanic {
  const byLevel: Record<number, Record<string, string[]>> = {
    3: { dao: ["sanctuary", "spike-growth"], djinni: ["thunderwave", "gust-of-wind"], efreeti: ["burning-hands", "scorching-ray"], marid: ["fog-cloud", "blur"] },
    5: { dao: ["meld-into-stone"], djinni: ["wind-wall"], efreeti: ["fireball"], marid: ["sleet-storm"] },
    7: { dao: ["stone-shape"], djinni: ["greater-invisibility"], efreeti: ["fire-shield"], marid: ["control-water"] },
    9: { dao: ["wall-of-stone"], djinni: ["seeming"], efreeti: ["flame-strike"], marid: ["cone-of-cold"] },
  }
  return feature(`genie-kind-spells-${level}`, "warlock:genie:expanded-spells", `warlock_genie_kind_spells_${level}`, "Заклинания рода джинна", `Выбранный род покровителя добавляет к списку Колдуна свои заклинания, доступные на этом пороге уровня. Эти заклинания становятся допустимыми вариантами при выборе или замене заклинаний Колдуна, но не изучаются автоматически; конкретный набор определяется вашим постоянным выбором рода джинна.`, { kind: "genie_expanded_spell_list", sourceLevel: level, byPatron: byLevel[level], automatic: false })
}

const genie: RuntimeSubclass = {
  id: "genie",
  catalogKey: "subclass:warlock:genie",
  slug: "warlock-genie",
  name: "Джинн",
  description: "Покровитель-джинн даёт сосуд, стихийную силу, убежище и ограниченное исполнение желаний.",
  summary: "Джинн выбирает род покровителя, получает сосуд и стихийный урон, затем сопротивление и полёт, усиленное убежище и Ограниченное желание с исходным случайным восстановлением.",
  choicesByLevel: { 3: [genieKindChoice] },
  levels: {
    3: [
      expandedList("genie-common-l12", "warlock:genie:expanded-spells", "Общие заклинания Джинна", 1, ["detect-evil-and-good"]),
      expandedList("genie-common-l22", "warlock:genie:expanded-spells", "Общие заклинания Джинна", 2, ["phantasmal-force"]),
      genieKindSpellFeature(3),
      feature("genie-vessel-feature", "warlock:genie:genies-vessel", "warlock_genies_vessel", "Сосуд джинна", "Покровитель дарует Крошечный сосуд, который служит фокусировкой заклинаний Колдуна. Действием можно исчезнуть внутрь сосуда; вход доступен один раз за долгий отдых, а время внутри ограничено правилом особенности. Первый раз в каждый ваш ход, когда вы попадаете атакой, Ярость джинна добавляет урон, равный бонусу мастерства, типа, определённого выбранным родом покровителя.", { kind: "genies_vessel", bottledRespite: true, wrathDamage: "proficiency_bonus", wrathCadence: "once_per_turn", damageTypeFromChoice: "warlock_genie_kind", gm_turn_gate: true }),
      resource("genie-vessel-uses", "warlock:genie:genies-vessel", "warlock_genies_vessel_uses", "Сосуд джинна: вход", 1, "long_rest"),
      semanticAction("genie-vessel-action", "warlock:genie:genies-vessel", "warlock_bottled_respite", "Войти в сосуд", "action", "warlock_genies_vessel_uses", "bottled_respite", { vessel: true }),
    ],
    5: [expandedList("genie-common-l3", "warlock:genie:expanded-spells", "Общие заклинания Джинна", 3, ["create-food-and-water"]), genieKindSpellFeature(5)],
    6: [
      feature("genie-elemental-gift", "warlock:genie:elemental-gift", "warlock_elemental_gift", "Стихийный дар", "Вы получаете сопротивление типу урона, связанному с выбранным родом покровителя. Бонусным действием можно получить скорость полёта 30 футов с зависанием на 10 минут; число таких активаций равно бонусу мастерства и полностью восстанавливается после долгого отдыха.", { kind: "elemental_gift", resistanceFromChoice: "warlock_genie_kind", flySpeedFeet: 30, hover: true, durationMinutes: 10 }),
      resource("genie-flight-uses", "warlock:genie:elemental-gift", "warlock_genie_elemental_gift_uses", "Стихийный дар: полёт", ref("core.proficiencyBonus"), "long_rest"),
      semanticAction("genie-flight-action", "warlock:genie:elemental-gift", "warlock_genie_elemental_flight", "Стихийный полёт", "bonus_action", "warlock_genie_elemental_gift_uses", "genie_flight", { speedFeet: 30, hover: true, durationMinutes: 10 }),
    ],
    7: [expandedList("genie-common-l4", "warlock:genie:expanded-spells", "Общие заклинания Джинна", 4, ["phantasmal-killer"]), genieKindSpellFeature(7)],
    9: [expandedList("genie-common-l5", "warlock:genie:expanded-spells", "Общие заклинания Джинна", 5, ["creation"]), genieKindSpellFeature(9)],
    10: [feature("genie-sanctuary-vessel", "warlock:genie:sanctuary-vessel", "warlock_sanctuary_vessel", "Сосуд-убежище", "Когда вы входите в сосуд, можно взять с собой до пяти согласных существ, видимых в пределах 30 футов. Если вы проводите внутри не менее 10 минут, это считается коротким отдыхом; существо, тратя Кость Хитов для лечения во время этого отдыха, добавляет ваш бонус мастерства к восстановленным хитам. Выход, разрушение сосуда и согласие существ определяются сценой.", { kind: "sanctuary_vessel", companions: 5, rangeFeet: 30, shortRestMinutes: 10, hitDieHealingBonus: "proficiency_bonus", gm_target_gate: true })],
    14: [
      feature("genie-limited-wish", "warlock:genie:limited-wish", "warlock_limited_wish", "Ограниченное желание", "Действием попросите покровителя воспроизвести эффект одного заклинания 6 уровня или ниже с временем сотворения 1 действие из списка любого класса. Требования этого заклинания, включая дорогостоящие компоненты, не нужны: эффект просто возникает как часть способности. После использования способность нельзя применить снова, пока вы не завершите 1d4 долгих отдыха; результат 1d4 отслеживает ведущий, потому что приложение не хранит случайный многодневный счётчик отдыха.", { kind: "limited_wish", maxSpellLevel: 6, castingTime: "action", anyClass: true, ignoresRequirements: true, cooldown: "1d4_long_rests", gm_random_cooldown: true }),
      semanticAction("genie-limited-wish-action", "warlock:genie:limited-wish", "warlock_limited_wish", "Ограниченное желание", "action", null, "limited_wish", { maxSpellLevel: 6, cooldown: "1d4_long_rests", gmRandomCooldown: true }),
    ],
  },
}

const undead: RuntimeSubclass = {
  id: "undead",
  catalogKey: "subclass:warlock:undead",
  slug: "warlock-undead",
  name: "Нежить",
  description: "Покровитель-нежить меняет тело колдуна и позволяет проявлять ужасающую мёртвую форму.",
  summary: "Нежить даёт Форму ужаса по бонусу мастерства, некротические свойства, стойкость на грани смерти и проекцию духа с отдельным долгим восстановлением.",
  levels: {
    3: [
      expandedList("undead-expanded-l12", "warlock:undead:expanded-spells", "Расширенный список Нежити", 1, ["bane", "false-life"]),
      expandedList("undead-expanded-l22", "warlock:undead:expanded-spells", "Расширенный список Нежити", 2, ["blindness-deafness", "phantasmal-force"]),
      feature("undead-form-feature", "warlock:undead:form-of-dread", "warlock_form_of_dread", "Форма ужаса", "Бонусным действием преобразитесь на 1 минуту. При преобразовании вы получаете временные хиты 1d10 + уровень Колдуна; пока форма действует, вы иммунны к Испугу, а один раз в каждый свой ход после попадания атакой можете заставить цель совершить спасбросок Мудрости против Сл ваших заклинаний, при провале она Испугана вами до конца вашего следующего хода. Число преобразований равно бонусу мастерства и восстанавливается после долгого отдыха.", { kind: "form_of_dread", durationMinutes: 1, tempHp: "1d10_plus_warlock_level", frightenedImmunity: true, fearSave: "wisdom_vs_spell_dc", fearDuration: "until_end_of_next_turn", gm_turn_hit_gate: true }),
      resource("undead-form-uses", "warlock:undead:form-of-dread", "warlock_form_of_dread_uses", "Форма ужаса", ref("core.proficiencyBonus"), "long_rest"),
      semanticAction("undead-form-action", "warlock:undead:form-of-dread", "warlock_form_of_dread", "Принять Форму ужаса", "bonus_action", "warlock_form_of_dread_uses", "form_of_dread", { durationMinutes: 1, tempHp: "1d10_plus_warlock_level" }),
    ],
    5: [expandedList("undead-expanded-l3", "warlock:undead:expanded-spells", "Расширенный список Нежити", 3, ["phantom-steed", "speak-with-dead"])],
    6: [feature("undead-grave-touched", "warlock:undead:grave-touched", "warlock_grave_touched", "Касание могилы", "Вам больше не нужно есть, пить или дышать. Один раз в каждый свой ход, когда вы попадаете атакой и определяете её урон, можно заменить тип этого урона на некротический; пока действует Форма ужаса, при таком некротическом уроне бросается одна дополнительная кость урона атаки. Попадание и ограничение один раз за ход проверяются ведущим.", { kind: "grave_touched", noFoodDrinkBreath: true, damageTypeReplacement: "necrotic", formExtraDamageDie: 1, gm_turn_hit_gate: true })],
    7: [expandedList("undead-expanded-l4", "warlock:undead:expanded-spells", "Расширенный список Нежити", 4, ["death-ward", "greater-invisibility"])],
    9: [expandedList("undead-expanded-l5", "warlock:undead:expanded-spells", "Расширенный список Нежити", 5, ["antilife-shell", "cloudkill"])],
    10: [
      feature("undead-necrotic-husk", "warlock:undead:necrotic-husk", "warlock_necrotic_husk", "Некротическая оболочка", "Вы получаете сопротивление некротическому урону; пока действует Форма ужаса, это сопротивление становится иммунитетом. Когда ваши хиты падают до 0 и вы не погибли мгновенно, можно вместо падения остаться с 1 хитом и выпустить некротическую энергию по существам в пределах 30 футов по точному правилу способности. После такого спасения эту часть способности нельзя использовать снова до завершения 1d4 долгих отдыхов; случайный срок отслеживает ведущий.", { kind: "necrotic_husk", conditionalImmunityDuringForm: true, zeroHpSurvival: true, burstRangeFeet: 30, cooldown: "1d4_long_rests", gm_random_cooldown: true }),
      grant("undead-necrotic-resistance", "warlock:undead:necrotic-husk", "resistance", "damage:necrotic", "Сопротивление некротическому урону"),
    ],
    14: [
      feature("undead-spirit-projection", "warlock:undead:spirit-projection", "warlock_spirit_projection", "Проекция духа", "Действием отделите дух от тела на срок до 1 часа с концентрацией. Дух и тело разделяют хиты; дух получает полёт, может проходить сквозь существ и предметы по правилу особенности, а атаки против него получают предусмотренные сопротивления. Сотворение заклинаний меняет требования к компонентам, а нанесённый духом некротический урон может восстанавливать вам хиты по правилу особенности. После использования способность восстанавливается после долгого отдыха.", { kind: "spirit_projection", durationHours: 1, concentration: true, sharedHp: true, flight: true, incorporealMovement: true, conditionalResistances: true, necroticHealing: true, gm_scene_gate: true }),
      resource("undead-spirit-projection-uses", "warlock:undead:spirit-projection", "warlock_spirit_projection_uses", "Проекция духа", 1, "long_rest"),
      semanticAction("undead-spirit-projection-action", "warlock:undead:spirit-projection", "warlock_spirit_projection", "Проекция духа", "action", "warlock_spirit_projection_uses", "spirit_projection", { durationHours: 1, concentration: true }),
    ],
  },
}

const runtimeSubclasses: RuntimeSubclass[] = [hexblade, fathomless, genie, undead]

const warlockParentBundle: CharacterTemplateBundle = {
  assignment: {
    id: "warlock-stage6-parent-assignment",
    character_id: "warlock-stage6-character",
    template_id: warlockParentId,
    template_level: 17,
    selected_choices: {},
    assigned_at: now,
    updated_at: now,
  },
  template: {
    id: warlockParentId,
    campaign_id: "warlock-stage6-campaign",
    kind: "class",
    slug: "warlock-core-stage6",
    name: "Колдун",
    description: "Родительский источник Колдуна 2024 для проверки совместимых дополнительных покровителей.",
    version: 1,
    mechanics: [
      resource("warlock-stage6-pact", "warlock:stage6-parent", "warlock_pact_slots", "Ячейки Магии договора", 4, ["short_rest", "long_rest"]),
      feature("warlock-stage6-parent-feature", "warlock:stage6-parent", "class:warlock:stage6-level-source", "Уровень Колдуна", "Дополнительные покровители используют уровень родительского класса Колдуна. Точка получения подкласса совместимо перенесена на 3 уровень, а последующие исходные особенности сохраняют уровни 6, 10 и 14.", { kind: "class_level_source", subclassLevels: [3, 6, 10, 14] }),
    ],
    choices: [],
    parent_template_id: null,
    unlock_level: null,
    catalog_key: "class:warlock",
    catalog_revision: "xphb-2024-warlock-ui-qa-v1",
    source_kind: "official",
    source_label: "Player's Handbook 2024",
    is_builtin: true,
    mechanical_summary: "Колдун 2024 остаётся родительским источником уровня и общего запаса Магии договора для совместимых дополнительных покровителей.",
    author_description: "",
    author_comment: "",
    rules_meta: { rules_revision: "2024", mechanics_status: "READY", stage6_parent: true },
    is_active: true,
    created_by: null,
    created_at: now,
    updated_at: now,
  },
  levels: [],
}

function subclassBundle(entry: RuntimeSubclass): CharacterTemplateBundle {
  const templateId = `warlock-stage6-${entry.id}`
  const catalogEntry = WARLOCK_STAGE6_SUPPLEMENTAL_SUBCLASSES.find((candidate) => candidate.catalogKey === entry.catalogKey)
  if (!catalogEntry) throw new Error(`Missing Stage 6 Warlock catalog metadata: ${entry.catalogKey}`)
  return {
    assignment: {
      id: `${templateId}-assignment`,
      character_id: "warlock-stage6-character",
      template_id: templateId,
      template_level: null,
      selected_choices: entry.id === "genie" ? { warlock_genie_kind: "dao" } : {},
      assigned_at: now,
      updated_at: now,
    },
    template: {
      id: templateId,
      campaign_id: "warlock-stage6-campaign",
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
      catalog_revision: WARLOCK_STAGE6_RUNTIME_REVISION,
      source_kind: "official",
      source_label: catalogEntry.sourceLabel,
      is_builtin: true,
      mechanical_summary: entry.summary,
      author_description: "",
      author_comment: "",
      rules_meta: {
        base_class: "class:warlock",
        rules_revision: catalogEntry.rulesRevision,
        compatibility_target: "xphb-2024-warlock",
        mechanics_status: "READY",
        feature_levels: [3, 6, 10, 14],
        expanded_spell_unlock_levels: [3, 5, 7, 9],
      },
      is_active: true,
      created_by: null,
      created_at: now,
      updated_at: now,
    },
    levels: WARLOCK_SUPPLEMENTAL_SUBCLASS_RUNTIME_LEVELS.map((level) => ({
      id: `${templateId}-level-${level}`,
      template_id: templateId,
      level,
      mechanics: entry.levels[level],
      choices: entry.choicesByLevel?.[level] ?? [],
    })),
  }
}

export const warlockSupplementalSubclassRuntimeBundles: CharacterTemplateBundle[] = [
  warlockParentBundle,
  ...runtimeSubclasses.map(subclassBundle),
]
