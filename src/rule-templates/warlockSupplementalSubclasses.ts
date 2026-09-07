import type { StoredMechanic } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"
import { warlockSubclassRuntimeBundles } from "./warlockSubclassMechanics.ts"

export const WARLOCK_SUPPLEMENTAL_RUNTIME_REVISION = "warlock-supplemental-runtime-v1"
export const WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS = [
  "subclass:warlock:hexblade",
  "subclass:warlock:fathomless",
  "subclass:warlock:genie",
  "subclass:warlock:undead",
  "subclass:warlock:undying",
] as const

export type WarlockSupplementalCatalogKey = typeof WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS[number]
export const WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS = [3, 5, 6, 7, 9, 10, 14] as const

type SupplementalId = "hexblade" | "fathomless" | "genie" | "undead" | "undying"
type SupplementalLevel = typeof WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS[number]
type Patron = {
  id: SupplementalId
  catalogKey: WarlockSupplementalCatalogKey
  name: string
  description: string
  mechanics: Partial<Record<SupplementalLevel, StoredMechanic[]>>
  choices?: Partial<Record<SupplementalLevel, RuleChoiceDefinition[]>>
}

const ref = (key: string) => ({ kind: "reference", key }) as const
const lit = (value: number) => ({ kind: "literal", value }) as const
const add = (...terms: unknown[]) => ({ kind: "add", terms }) as const

const feature = (id: string, sourceKey: string, key: string, label: string, description: string, mechanic: Record<string, unknown>): StoredMechanic => ({
  id, type: "grant", target: "feature", key, sourceKey, payload: { label, description, mechanic },
} as StoredMechanic)

const grant = (id: string, sourceKey: string, target: "proficiency" | "resistance" | "immunity" | "sense" | "trait", key: string, label: string): StoredMechanic => ({
  id, type: "grant", sourceKey, target, key, payload: { label },
} as StoredMechanic)

const resource = (id: string, sourceKey: string, key: string, label: string, max: unknown, recharge: "long_rest" | Array<"short_rest" | "long_rest">): StoredMechanic => ({
  id, type: "resource", sourceKey, key, label, max, recharge, initial: "full", presentation: { tone: "violet", display: "pips" },
} as StoredMechanic)

const action = (id: string, sourceKey: string, key: string, label: string, economy: string, resourceKey?: string, effects: Record<string, unknown>[] = []): StoredMechanic => ({
  id, type: "action", sourceKey, key, label, economy,
  ...(resourceKey ? { resourceCosts: [{ key: resourceKey, amount: 1 }] } : {}),
  ...(effects.length ? { effects } : {}),
  tags: ["warlock", "subclass", "supplemental"],
} as StoredMechanic)

const pb = ref("core.proficiencyBonus")
const warlockLevel = ref("source.level")
const chaMod = ref("abilities.charisma.modifier")

const hexblade: Patron = {
  id: "hexblade",
  catalogKey: "subclass:warlock:hexblade",
  name: "Клинок-проклятие",
  description: "Покровитель, связанный с разумным оружием, проклятиями и теневой сталью.",
  mechanics: {
    3: [
      resource("hexblade-curse-resource", "warlock:hexblade:hexblades-curse", "warlock_hexblade_curse", "Проклятие Клинка", 1, ["short_rest", "long_rest"]),
      action("hexblade-curse-action", "warlock:hexblade:hexblades-curse", "warlock_hexblade_curse_action", "Проклятие Клинка", "bonus_action", "warlock_hexblade_curse", [
        { kind: "semantic", key: "hexblades_curse", payload: { rangeFeet: 30, durationMinutes: 1, bonusDamage: "proficiency_bonus", criticalThreshold: 19, healingOnTargetDeath: "warlock_level_plus_charisma", gm_target_gate: true, gm_death_gate: true } },
      ]),
      grant("hexblade-medium-armor", "warlock:hexblade:hex-warrior", "proficiency", "armor:medium", "Средние доспехи"),
      grant("hexblade-shields", "warlock:hexblade:hex-warrior", "proficiency", "armor:shield", "Щиты"),
      grant("hexblade-martial", "warlock:hexblade:hex-warrior", "proficiency", "weapon:martial", "Воинское оружие"),
      feature("hexblade-hex-warrior", "warlock:hexblade:hex-warrior", "warlock_hexblade_hex_warrior", "Воин-проклинатель", "После продолжительного отдыха можно выбрать подходящее оружие и использовать Харизму вместо Силы или Ловкости для его атак и урона; оружие Пакта клинка также получает это свойство.", { kind: "hex_warrior_weapon_choice", refresh: "long_rest", ability: "charisma", pactWeaponAlwaysQualifies: true, gm_equipment_gate: true }),
      feature("hexblade-expanded-spells-3", "warlock:hexblade:expanded-spells", "warlock_hexblade_expanded_spells", "Расширенные заклинания", "Покровитель расширяет список заклинаний Клинка-проклятия.", { kind: "expanded_spell_list", casting: "pact_magic", spellSlugs: ["shield", "wrathful-smite", "blur", "branding-smite", "blink", "elemental-weapon", "phantasmal-killer", "staggering-smite", "banishing-smite", "cone-of-cold"] }),
    ],
    6: [
      resource("hexblade-specter-resource", "warlock:hexblade:accursed-specter", "warlock_hexblade_accursed_specter", "Проклятый призрак", 1, "long_rest"),
      action("hexblade-specter-action", "warlock:hexblade:accursed-specter", "warlock_hexblade_accursed_specter_action", "Поднять проклятого призрака", "special", "warlock_hexblade_accursed_specter", [
        { kind: "semantic", key: "accursed_specter", payload: { trigger: "humanoid_killed_by_you", duration: "until_next_long_rest", gm_trigger_gate: true, summonState: "gm_adjudicated" } },
      ]),
    ],
    10: [feature("hexblade-armor-of-hexes", "warlock:hexblade:armor-of-hexes", "warlock_hexblade_armor_of_hexes", "Доспехи проклятий", "Когда проклятая цель попадает по вам атакой, реакцией бросьте d6; на 4+ атака промахивается независимо от результата броска атаки.", { kind: "armor_of_hexes", economy: "reaction", die: "1d6", succeedsOn: [4,5,6], gm_target_hit_gate: true })],
    14: [feature("hexblade-master-of-hexes", "warlock:hexblade:master-of-hexes", "warlock_hexblade_master_of_hexes", "Мастер проклятий", "После смерти проклятой цели можно перенести Проклятие Клинка на другое существо в пределах 30 футов вместо получения лечения.", { kind: "master_of_hexes", rangeFeet: 30, gm_target_death_gate: true })],
  },
}

const fathomless: Patron = {
  id: "fathomless",
  catalogKey: "subclass:warlock:fathomless",
  name: "Бездонный",
  description: "Покровитель из глубин, дающий власть над холодом, водой и хваткой бездны.",
  mechanics: {
    3: [
      resource("fathomless-tentacle-resource", "warlock:fathomless:tentacle", "warlock_fathomless_tentacle", "Щупальце глубин", pb, "long_rest"),
      action("fathomless-tentacle-action", "warlock:fathomless:tentacle", "warlock_fathomless_tentacle_action", "Щупальце глубин", "bonus_action", "warlock_fathomless_tentacle", [{ kind: "semantic", key: "tentacle_of_the_deeps", payload: { summonRangeFeet: 60, attackRangeFeet: 10, damage: "1d8_cold", speedReductionFeet: 10, durationMinutes: 1, moveFeetOnBonusAction: 30, gm_target_gate: true, gm_scene_position_gate: true } }]),
      feature("fathomless-sea-gift", "warlock:fathomless:gift-of-sea", "warlock_fathomless_gift_of_sea", "Дар моря", "Вы можете дышать под водой и получаете скорость плавания 40 футов.", { kind: "aquatic_adaptation", swimSpeedFeet: 40, breatheUnderwater: true }),
      feature("fathomless-expanded-spells", "warlock:fathomless:expanded-spells", "warlock_fathomless_expanded_spells", "Расширенные заклинания", "Покровитель расширяет список заклинаний Бездонного.", { kind: "expanded_spell_list", casting: "pact_magic", spellSlugs: ["create-or-destroy-water", "thunderwave", "gust-of-wind", "silence", "lightning-bolt", "sleet-storm", "control-water", "summon-elemental", "bigbys-hand", "cone-of-cold"] }),
    ],
    6: [
      grant("fathomless-cold-resistance", "warlock:fathomless:oceanic-soul", "resistance", "damage:cold", "Сопротивление холоду"),
      feature("fathomless-oceanic-soul", "warlock:fathomless:oceanic-soul", "warlock_fathomless_oceanic_soul", "Океаническая душа", "Вы можете общаться под водой с любым погружённым существом, понимающим хотя бы один язык.", { kind: "underwater_communication", gm_environment_gate: true }),
      feature("fathomless-guardian-coil", "warlock:fathomless:guardian-coil", "warlock_fathomless_guardian_coil", "Защитная спираль", "Реакцией щупальце уменьшает урон существу рядом с ним на 1d8; с 10 уровня Колдуна на 2d8.", { kind: "guardian_coil", economy: "reaction", rangeFromTentacleFeet: 10, reductionDiceByLevel: { "6": "1d8", "10": "2d8" }, gm_scene_position_gate: true, gm_reaction_gate: true }),
    ],
    10: [
      resource("fathomless-grasping-resource", "warlock:fathomless:grasping-tentacles", "warlock_fathomless_grasping_tentacles", "Хваткие щупальца: бесплатное сотворение", 1, "long_rest"),
      action("fathomless-grasping-action", "warlock:fathomless:grasping-tentacles", "warlock_fathomless_grasping_tentacles_action", "Хваткие щупальца", "action", "warlock_fathomless_grasping_tentacles", [{ kind: "semantic", key: "free_spell_cast", payload: { spellSlug: "evards-black-tentacles", tempHp: "warlock_level", concentrationCannotBreakFromDamage: true } }]),
      feature("fathomless-tentacle-damage", "warlock:fathomless:tentacle", "warlock_fathomless_tentacle_upgrade", "Щупальце глубин: усиление", "Урон щупальца становится 2d8 холодом.", { kind: "tentacle_damage_upgrade", damage: "2d8_cold" }),
    ],
    14: [
      resource("fathomless-plunge-resource", "warlock:fathomless:fathomless-plunge", "warlock_fathomless_plunge", "Бездонное погружение", 1, ["short_rest", "long_rest"]),
      action("fathomless-plunge-action", "warlock:fathomless:fathomless-plunge", "warlock_fathomless_plunge_action", "Бездонное погружение", "action", "warlock_fathomless_plunge", [{ kind: "semantic", key: "fathomless_plunge", payload: { willingCreatures: 5, selectionRangeFeet: 30, destinationWaterWithinMiles: 1, gm_destination_gate: true } }]),
    ],
  },
}

const genieChoice: RuleChoiceDefinition = {
  key: "warlock_genie_patron_kind", label: "Род покровителя-джинна", target: "trait", options: ["dao", "djinni", "efreeti", "marid"], count: 1,
  option_labels: { dao: "Дао", djinni: "Джинни", efreeti: "Ифрити", marid: "Марид" }, selection_mode: "player_once", replacement_policy: "locked",
  option_mechanics: {
    dao: [grant("genie-dao-resistance", "warlock:genie:elemental-gift", "resistance", "damage:bludgeoning", "Сопротивление дробящему урону")],
    djinni: [grant("genie-djinni-resistance", "warlock:genie:elemental-gift", "resistance", "damage:thunder", "Сопротивление звуковому урону")],
    efreeti: [grant("genie-efreeti-resistance", "warlock:genie:elemental-gift", "resistance", "damage:fire", "Сопротивление огню")],
    marid: [grant("genie-marid-resistance", "warlock:genie:elemental-gift", "resistance", "damage:cold", "Сопротивление холоду")],
  },
}

const genie: Patron = {
  id: "genie", catalogKey: "subclass:warlock:genie", name: "Джинн", description: "Покровитель из рода дао, джинни, ифрити или маридов.",
  choices: { 3: [genieChoice] },
  mechanics: {
    3: [
      resource("genie-respite-resource", "warlock:genie:genies-vessel", "warlock_genie_bottled_respite", "Уединение в сосуде", 1, "long_rest"),
      action("genie-respite-action", "warlock:genie:genies-vessel", "warlock_genie_bottled_respite_action", "Уединение в сосуде", "action", "warlock_genie_bottled_respite", [{ kind: "semantic", key: "bottled_respite", payload: { maxHours: "2_x_proficiency_bonus", vesselState: "gm_adjudicated" } }]),
      feature("genie-wrath", "warlock:genie:genies-vessel", "warlock_genie_wrath", "Гнев джинна", "Первый раз за ваш ход при попадании атакой можно нанести дополнительный урон, равный бонусу мастерства; тип зависит от рода покровителя.", { kind: "genies_wrath", cadence: "once_per_turn", damage: "proficiency_bonus", damageTypeByPatron: { dao: "bludgeoning", djinni: "thunder", efreeti: "fire", marid: "cold" }, gm_hit_turn_gate: true }),
      feature("genie-expanded-spells", "warlock:genie:expanded-spells", "warlock_genie_expanded_spells", "Расширенные заклинания", "Род джинна расширяет доступные заклинания.", { kind: "expanded_spell_list_by_choice", choice: "warlock_genie_patron_kind", common: ["detect-evil-and-good", "phantasmal-force", "create-food-and-water", "phantasmal-killer", "creation", "wish"], dao: ["sanctuary", "spike-growth", "meld-into-stone", "stone-shape", "wall-of-stone"], djinni: ["thunderwave", "gust-of-wind", "wind-wall", "greater-invisibility", "seeming"], efreeti: ["burning-hands", "scorching-ray", "fireball", "fire-shield", "flame-strike"], marid: ["fog-cloud", "blur", "sleet-storm", "control-water", "cone-of-cold"] }),
    ],
    6: [
      resource("genie-flight-resource", "warlock:genie:elemental-gift", "warlock_genie_elemental_flight", "Стихийный дар: полёт", pb, "long_rest"),
      action("genie-flight-action", "warlock:genie:elemental-gift", "warlock_genie_elemental_flight_action", "Стихийный полёт", "bonus_action", "warlock_genie_elemental_flight", [{ kind: "semantic", key: "elemental_flight", payload: { flySpeedFeet: 30, durationMinutes: 10 } }]),
    ],
    10: [feature("genie-sanctuary-vessel", "warlock:genie:sanctuary-vessel", "warlock_genie_sanctuary_vessel", "Сосуд-святилище", "До пяти согласных существ могут войти в сосуд; десять минут внутри дают преимущества короткого отдыха, а потраченные Кости Хитов дополнительно восстанавливают хиты, равные бонусу мастерства.", { kind: "sanctuary_vessel", creatures: 5, minutesForShortRest: 10, extraHealingPerHitDie: "proficiency_bonus", gm_rest_gate: true })],
    14: [
      resource("genie-limited-wish-resource", "warlock:genie:limited-wish", "warlock_genie_limited_wish", "Ограниченное желание", 1, "long_rest"),
      action("genie-limited-wish-action", "warlock:genie:limited-wish", "warlock_genie_limited_wish_action", "Ограниченное желание", "action", "warlock_genie_limited_wish", [{ kind: "semantic", key: "limited_wish", payload: { maximumSpellLevel: 6, maximumCastingTime: "1_action", ignoresComponents: true, cooldown: "1d4_long_rests", gm_spell_gate: true, gm_cooldown_gate: true } }]),
    ],
  },
}

const undead: Patron = {
  id: "undead", catalogKey: "subclass:warlock:undead", name: "Нежить", description: "Покровитель, чья сила превращает страх, смерть и некротическую энергию в оружие.",
  mechanics: {
    3: [
      resource("undead-dread-resource", "warlock:undead:form-of-dread", "warlock_undead_form_of_dread", "Облик ужаса", pb, "long_rest"),
      action("undead-dread-action", "warlock:undead:form-of-dread", "warlock_undead_form_of_dread_action", "Облик ужаса", "bonus_action", "warlock_undead_form_of_dread", [{ kind: "semantic", key: "form_of_dread", payload: { durationMinutes: 1, tempHp: "1d10_plus_warlock_level", frightenedImmunity: true, fearOnHit: { cadence: "once_per_turn", save: "wisdom", dc: "warlock_spell_dc", duration: "until_end_of_next_turn" }, gm_hit_turn_gate: true } }]),
      feature("undead-expanded-spells", "warlock:undead:expanded-spells", "warlock_undead_expanded_spells", "Расширенные заклинания", "Покровитель расширяет список заклинаний Нежити.", { kind: "expanded_spell_list", casting: "pact_magic", spellSlugs: ["bane", "false-life", "blindness-deafness", "phantasmal-force", "phantom-steed", "speak-with-dead", "death-ward", "greater-invisibility", "antilife-shell", "cloudkill"] }),
    ],
    6: [feature("undead-grave-touched", "warlock:undead:grave-touched", "warlock_undead_grave_touched", "Касание могилы", "Вам не нужно есть, пить или дышать. Первый раз за ход при попадании можно заменить тип урона на некротический; в Облике ужаса некротическая атака получает один дополнительный куб урона оружия или заклинания.", { kind: "grave_touched", needsFoodDrinkBreath: false, damageConversion: "necrotic", extraDamageDieWhileDread: true, cadence: "once_per_turn", gm_hit_turn_gate: true })],
    10: [
      grant("undead-necrotic-resistance", "warlock:undead:necrotic-husk", "resistance", "damage:necrotic", "Сопротивление некротическому урону"),
      feature("undead-necrotic-husk", "warlock:undead:necrotic-husk", "warlock_undead_necrotic_husk", "Некротическая оболочка", "В Облике ужаса сопротивление некротическому урону становится иммунитетом. При падении до 0 хитов реакцией можно остаться на 1 хите и взорваться некротической энергией; после этого способность недоступна 1d4 продолжительных отдыха.", { kind: "necrotic_husk", economy: "reaction", trigger: "reduced_to_zero_hp", remainHp: 1, burstDamage: "2d10_plus_warlock_level", burstType: "necrotic", exhaustion: 1, cooldown: "1d4_long_rests", gm_trigger_gate: true, gm_cooldown_gate: true })
    ],
    14: [
      resource("undead-projection-resource", "warlock:undead:spirit-projection", "warlock_undead_spirit_projection", "Проекция духа", 1, "long_rest"),
      action("undead-projection-action", "warlock:undead:spirit-projection", "warlock_undead_spirit_projection_action", "Проекция духа", "action", "warlock_undead_spirit_projection", [{ kind: "semantic", key: "spirit_projection", payload: { durationHours: 1, moveThroughCreaturesAndObjects: true, hoverFlyEqualsWalk: true, verbalSomaticMaterialComponentsIgnored: true, graveTouchedLifeDrain: true, projectionState: "gm_adjudicated" } }]),
    ],
  },
}

const undying: Patron = {
  id: "undying", catalogKey: "subclass:warlock:undying", name: "Бессмертный", description: "Покровитель, который учит цепляться за жизнь там, где смерть уже считает дело закрытым.",
  mechanics: {
    3: [
      feature("undying-among-dead", "warlock:undying:among-the-dead", "warlock_undying_among_the_dead", "Среди мёртвых", "Вы изучаете Заговор умирающего, получаете преимущество на спасброски против болезней, а нежить должна преодолеть спасбросок Мудрости, чтобы впервые выбрать вас целью атаки или вредоносного заклинания.", { kind: "among_the_dead", cantrip: "spare-the-dying", advantageAgainstDisease: true, undeadTargetSave: "wisdom", gm_target_gate: true }),
      feature("undying-expanded-spells", "warlock:undying:expanded-spells", "warlock_undying_expanded_spells", "Расширенные заклинания", "Покровитель расширяет список заклинаний Бессмертного.", { kind: "expanded_spell_list", casting: "pact_magic", spellSlugs: ["false-life", "ray-of-sickness", "blindness-deafness", "silence", "feign-death", "speak-with-dead", "aura-of-life", "death-ward", "contagion", "legend-lore"] }),
    ],
    6: [
      resource("undying-defy-death-resource", "warlock:undying:defy-death", "warlock_undying_defy_death", "Бросить вызов смерти", 1, "long_rest"),
      action("undying-defy-death-action", "warlock:undying:defy-death", "warlock_undying_defy_death_action", "Бросить вызов смерти", "special", "warlock_undying_defy_death", [{ kind: "semantic", key: "defy_death", payload: { healing: "1d8_plus_constitution_modifier", triggers: ["successful_death_save", "stabilize_with_spare_the_dying"], gm_trigger_gate: true } }]),
    ],
    10: [feature("undying-nature", "warlock:undying:undying-nature", "warlock_undying_nature", "Неумирающая природа", "Вам не нужно дышать, есть, пить или спать; отдых всё ещё требуется. Вы стареете в десять раз медленнее и не можете быть состарены магией.", { kind: "undying_nature", holdBreathIndefinitely: true, needsFoodDrinkSleep: false, agingRateDivisor: 10, immuneMagicalAging: true })],
    14: [
      resource("undying-life-resource", "warlock:undying:indestructible-life", "warlock_undying_indestructible_life", "Несокрушимая жизнь", 1, ["short_rest", "long_rest"]),
      action("undying-life-action", "warlock:undying:indestructible-life", "warlock_undying_indestructible_life_action", "Несокрушимая жизнь", "bonus_action", "warlock_undying_indestructible_life", [{ kind: "semantic", key: "indestructible_life", payload: { healing: "1d8_plus_warlock_level", reattachSeveredPart: true } }]),
    ],
  },
}

const patrons: Patron[] = [hexblade, fathomless, genie, undead, undying]
const parent = warlockSubclassRuntimeBundles.find((bundle) => bundle.template.catalog_key === "class:warlock")
if (!parent) throw new Error("Warlock parent runtime bundle is missing")
const parentTemplateId = parent.template.id
const now = "2026-09-07T10:06:00.000Z"

function bundleFor(patron: Patron): CharacterTemplateBundle {
  const templateId = `warlock-supplemental-runtime-${patron.id}`
  return {
    assignment: { id: `${templateId}-assignment`, character_id: "warlock-supplemental-runtime-character", template_id: templateId, template_level: null, selected_choices: {}, assigned_at: now, updated_at: now },
    template: {
      id: templateId, campaign_id: "warlock-supplemental-runtime-campaign", kind: "subclass", slug: patron.id, name: patron.name, description: patron.description,
      version: 1, mechanics: [], choices: [], parent_template_id: parentTemplateId, unlock_level: 3, catalog_key: patron.catalogKey,
      catalog_revision: WARLOCK_SUPPLEMENTAL_RUNTIME_REVISION, source_kind: "official", source_label: "Official supplemental Warlock patron",
      is_builtin: true, mechanical_summary: "Полный supplemental runtime: CE-пулы, действия, пассивы и явно семантические условия сцены.",
      rules_meta: { base_class: "class:warlock", mechanics_status: "READY", runtime_scope: "WARLOCK_SUPPLEMENTAL_5", feature_levels: [3,6,10,14], gm_adjudication_boundary: true },
      is_active: true, created_by: null, created_at: now, updated_at: now,
    },
    levels: WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS.map((level) => ({
      id: `${templateId}-level-${level}`, template_id: templateId, level,
      mechanics: patron.mechanics[level] ?? [], choices: patron.choices?.[level] ?? [],
    })),
  }
}

export const warlockSupplementalRuntimeBundles: CharacterTemplateBundle[] = [parent, ...patrons.map(bundleFor)]

export function assertWarlockSupplementalRuntime(): void {
  const subclasses = warlockSupplementalRuntimeBundles.filter((bundle) => bundle.template.kind === "subclass")
  if (subclasses.length !== 5) throw new Error(`WARLOCK_SUPPLEMENTAL_COUNT:${subclasses.length}`)
  for (const bundle of subclasses) {
    if (!WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS.includes(bundle.template.catalog_key as WarlockSupplementalCatalogKey)) throw new Error(`WARLOCK_SUPPLEMENTAL_KEY:${bundle.template.catalog_key}`)
    if (bundle.template.parent_template_id !== parentTemplateId || bundle.template.unlock_level !== 3) throw new Error(`WARLOCK_SUPPLEMENTAL_PARENT:${bundle.template.catalog_key}`)
    const levels = bundle.levels.map((entry) => entry.level)
    if (levels.join(",") !== WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS.join(",")) throw new Error(`WARLOCK_SUPPLEMENTAL_LEVELS:${bundle.template.catalog_key}`)
  }
}