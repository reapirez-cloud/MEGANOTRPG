import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { executeAction, resolveCharacterContract, type CharacterEngineInput, type FormulaExpression } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync("supabase/migrations/20260904142000_monk_subclasses_batch2_runtime.sql", "utf8")

const proficiencyBonus: FormulaExpression = { kind: "reference", key: "core.proficiencyBonus" }

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", sourceKey, key, payload: { label, description } }
}

function resource(id: string, sourceKey: string, key: string, label: string, max: number | FormulaExpression): StoredMechanic {
  return { id, type: "resource", sourceKey, key, label, max, recharge: ["long_rest"], initial: "full", grantOperation: "REPLACE" }
}

function action(id: string, sourceKey: string, key: string, label: string, economy: string, focus = 0, extra: Array<{ key: string; amount: number }> = []): StoredMechanic {
  return {
    id, type: "action", sourceKey, key, label, economy,
    ...(focus || extra.length ? { resourceCosts: [...(focus ? [{ key: "monk_focus", amount: focus }] : []), ...extra] } : {}),
    tags: ["subclass"],
  }
}

function value(id: string, sourceKey: string, key: string, label: string, amount: number): StoredMechanic {
  return { id, type: "grant", target: "value", sourceKey, key, grantOperation: "REPLACE", payload: { label, value: amount } }
}

const baseFocus: StoredMechanics = [{
  id: "monk-focus-l20", type: "resource", sourceKey: "monk-focus", key: "monk_focus", label: "Очки концентрации",
  max: 20, recharge: ["short_rest", "long_rest"], initial: "full", grantOperation: "REPLACE", priority: 20,
}]

const kenseiChoices: RuleChoiceDefinition[] = [
  { key: "kensei_melee_weapon", label: "Рукопашное оружие кэнсэя", target: "proficiency", options: ["weapon:longsword", "weapon:rapier"], count: 1, selection_mode: "player_once" },
  { key: "kensei_ranged_weapon", label: "Дальнобойное оружие кэнсэя", target: "proficiency", options: ["weapon:longbow", "weapon:shortbow"], count: 1, selection_mode: "player_once" },
  { key: "kensei_extra_weapon", label: "Дополнительное оружие кэнсэя", target: "proficiency", options: ["weapon:warhammer", "weapon:whip", "weapon:hand_crossbow"], count_by_level: { "6": 1, "11": 2, "17": 3 }, selection_mode: "player_once" },
]

const mechanics: Record<string, StoredMechanics> = {
  "drunken-master": [
    feature("drunken-tipsy-rules", "monk:drunken-master:tipsy-sway", "tipsy_sway", "Пьяное покачивание", "Когда рукопашная атака промахивается по монаху, он реакцией может потратить 1 Очко концентрации и перенаправить её в другую допустимую цель."),
    action("drunken-redirect", "monk:drunken-master:tipsy-sway", "tipsy_sway_redirect_attack", "Перенаправить атаку", "reaction", 1),
    feature("drunken-luck-rules", "monk:drunken-master:luck", "drunkards_luck", "Удача пьяницы", "Когда проверка характеристики, атака или спасбросок совершается с помехой, монах может потратить 2 Очка концентрации и отменить помеху для этого броска."),
    action("drunken-luck", "monk:drunken-master:luck", "drunkards_luck", "Удача пьяницы", "free", 2),
    feature("drunken-frenzy-rules", "monk:drunken-master:frenzy", "intoxicated_frenzy", "Хмельное безумие", "При Шквале ударов монах может сделать до трёх дополнительных атак по разным существам, но исходный максимум способности равен пяти атакам Шквала за ход."),
    value("drunken-frenzy-cap", "monk:drunken-master:frenzy", "drunken_flurry_max_attacks", "Максимум атак Шквала", 5),
  ],
  kensei: [
    feature("kensei-deft-rules", "monk:kensei:one-with-blade", "one_with_the_blade", "Единство с клинком", "Один раз за ход при попадании оружием кэнсэя монах может потратить 1 Очко концентрации и добавить один куб Боевых искусств урона."),
    action("kensei-deft", "monk:kensei:one-with-blade", "deft_strike", "Точный удар", "free", 1),
    feature("kensei-sharpen-rules", "monk:kensei:sharpen", "sharpen_the_blade", "Заточка клинка", "Бонусным действием монах тратит от 1 до 3 Очков концентрации и на 1 минуту даёт оружию кэнсэя такой же бонус к атаке и урону."),
    action("kensei-sharpen-1", "monk:kensei:sharpen", "sharpen_the_blade_1", "Заточка +1", "bonus_action", 1),
    action("kensei-sharpen-2", "monk:kensei:sharpen", "sharpen_the_blade_2", "Заточка +2", "bonus_action", 2),
    action("kensei-sharpen-3", "monk:kensei:sharpen", "sharpen_the_blade_3", "Заточка +3", "bonus_action", 3),
  ],
  "ascendant-dragon": [
    feature("dragon-presence-rules", "monk:ascendant-dragon:disciple", "draconic_disciple", "Ученик дракона", "После проваленной проверки Запугивания или Убеждения монах может один раз перебросить её; использование восстанавливается после долгого отдыха."),
    resource("dragon-presence-use", "monk:ascendant-dragon:disciple", "monk_draconic_presence_use", "Драконье присутствие", 1),
    action("dragon-presence-action", "monk:ascendant-dragon:disciple", "draconic_presence_reroll", "Драконье присутствие", "reaction", 0, [{ key: "monk_draconic_presence_use", amount: 1 }]),
    feature("dragon-breath-rules", "monk:ascendant-dragon:breath", "breath_of_the_dragon", "Дыхание дракона", "Дыхание дракона имеет число бесплатных применений, равное бонусу мастерства, которые восстанавливаются после долгого отдыха; после их исчерпания применение стоит 2 Очка концентрации."),
    resource("dragon-breath-uses", "monk:ascendant-dragon:breath", "monk_dragon_breath_uses", "Дыхание дракона", proficiencyBonus),
    action("dragon-breath-free", "monk:ascendant-dragon:breath", "breath_of_the_dragon_free", "Дыхание: бесплатное", "free", 0, [{ key: "monk_dragon_breath_uses", amount: 1 }]),
    action("dragon-breath-focus", "monk:ascendant-dragon:breath", "breath_of_the_dragon_focus", "Дыхание: за концентрацию", "free", 2),
    feature("dragon-wings-rules", "monk:ascendant-dragon:wings", "wings_unfurled", "Расправленные крылья", "При Шаге ветра монах может использовать одно из применений крыльев; число применений равно бонусу мастерства и восстанавливается после долгого отдыха."),
    resource("dragon-wings-uses", "monk:ascendant-dragon:wings", "monk_dragon_wings_uses", "Расправленные крылья", proficiencyBonus),
    action("dragon-wings", "monk:ascendant-dragon:wings", "wings_unfurled", "Расправленные крылья", "free", 0, [{ key: "monk_dragon_wings_uses", amount: 1 }]),
    feature("dragon-aspect-rules", "monk:ascendant-dragon:aspect", "aspect_of_the_wyrm", "Аспект змея", "Одно создание ауры доступно после каждого долгого отдыха; дополнительные создания стоят 3 Очка концентрации."),
    resource("dragon-aspect-use", "monk:ascendant-dragon:aspect", "monk_dragon_aspect_free_use", "Аспект змея", 1),
    action("dragon-aspect-free", "monk:ascendant-dragon:aspect", "aspect_of_the_wyrm_free", "Аспект: бесплатно", "bonus_action", 0, [{ key: "monk_dragon_aspect_free_use", amount: 1 }]),
    action("dragon-aspect-focus", "monk:ascendant-dragon:aspect", "aspect_of_the_wyrm_focus", "Аспект: за концентрацию", "bonus_action", 3),
  ],
  "astral-self": [
    feature("astral-arms-rules", "monk:astral-self:arms", "arms_of_the_astral_self", "Руки астрального я", "Бонусным действием монах тратит 1 Очко концентрации и призывает астральные руки на 10 минут."),
    action("astral-arms", "monk:astral-self:arms", "arms_of_the_astral_self", "Руки астрального я", "bonus_action", 1),
    feature("astral-visage-rules", "monk:astral-self:visage", "visage_of_the_astral_self", "Лик астрального я", "Бонусным действием монах тратит 1 Очко концентрации и призывает астральный лик на 10 минут."),
    action("astral-visage", "monk:astral-self:visage", "visage_of_the_astral_self", "Лик астрального я", "bonus_action", 1),
    feature("astral-awakened-rules", "monk:astral-self:awakened", "awakened_astral_self", "Пробуждённое астральное я", "Бонусным действием монах тратит 5 Очков концентрации и на 10 минут пробуждает полную астральную форму."),
    action("astral-awakened", "monk:astral-self:awakened", "awakened_astral_self", "Пробуждённое астральное я", "bonus_action", 5),
    value("astral-ac", "monk:astral-self:awakened", "awakened_astral_self_ac_bonus", "Бонус КД", 2),
    value("astral-attacks", "monk:astral-self:awakened", "awakened_astral_self_extra_attack_count", "Атак астральными руками", 3),
  ],
}

const summaries: Record<string, string> = {
  "drunken-master": "Пьяный мастер усиливает мобильность Шквала, перенаправляет промахи и тратит Focus на отмену помехи.",
  kensei: "Кэнсэй хранит постоянный выбор оружия и тратит Focus на Deft Strike и Sharpen the Blade.",
  "ascendant-dragon": "Драконий монах имеет отдельные long-rest применения Breath, Wings и Aspect и использует общий Focus для платных повторов.",
  "astral-self": "Астральный монах тратит общий Focus на Arms, Visage и Awakened Self и получает точные структурированные свойства форм.",
}

function bundle(kind: "class" | "subclass", id: string, catalogKey: string, subclassMechanics: StoredMechanics, choices: RuleChoiceDefinition[] = []): CharacterTemplateBundle {
  const subclassId = catalogKey.split(":").at(-1) ?? id
  return {
    assignment: {
      id: `assignment-${id}`, character_id: "monk-character", template_id: id, template_level: 20,
      selected_choices: kind === "subclass" && subclassId === "kensei" ? {
        kensei_melee_weapon: "weapon:longsword",
        kensei_ranged_weapon: "weapon:longbow",
        kensei_extra_weapon: ["weapon:warhammer", "weapon:whip", "weapon:hand_crossbow"],
      } : {},
      assigned_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    template: {
      id, campaign_id: "campaign", kind, slug: id, name: id, description: `${id} runtime test fixture`, version: 1,
      mechanics: [], choices: [], ...(kind === "subclass" ? { parent_template_id: "monk-class", unlock_level: 3 } : {}),
      catalog_key: catalogKey, catalog_revision: "monk-subclasses-batch2-runtime-v1", source_kind: "official",
      source_label: "official source", is_builtin: true,
      mechanical_summary: kind === "subclass" ? summaries[subclassId] : "Монах использует общий конечный запас Очков концентрации для классовых и подклассовых приёмов.",
      is_active: true, created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    levels: [{ id: `${id}-level`, template_id: id, level: kind === "class" ? 2 : 3, mechanics: subclassMechanics, choices }],
  }
}

function subclassBundle(subclass: keyof typeof mechanics): CharacterTemplateBundle {
  return bundle("subclass", `monk-${subclass}`, `subclass:monk:${subclass}`, mechanics[subclass], subclass === "kensei" ? kenseiChoices : [])
}

function inputFor(subclass: keyof typeof mechanics, resources: CharacterEngineInput["state"]["resources"] = {}): CharacterEngineInput {
  const parsed = resolveTemplateBundles([
    bundle("class", "monk-class", "class:monk", baseFocus),
    subclassBundle(subclass),
  ], 20)
  return {
    base: {
      id: "monk-character", name: "Монах", level: 20,
      abilities: { strength: 10, dexterity: 20, constitution: 14, intelligence: 10, wisdom: 16, charisma: 8 },
      baseMaxHp: 120, baseSpeed: 30,
    },
    state: { currentHp: 120, tempHp: 0, resources },
    contributions: parsed.contributions,
  }
}

function execute(input: CharacterEngineInput, key: string) {
  const contract = resolveCharacterContract(input)
  const found = contract.actions.find((entry) => entry.key === key)
  assert.ok(found, `missing action ${key}`)
  assert.equal(found.available, true, `${key} should be available`)
  return executeAction(input.state, found)
}

function resolvedValue(subclass: keyof typeof mechanics, key: string): number | undefined {
  return resolveCharacterContract(inputFor(subclass)).values.find((entry) => entry.key === key)?.value.value
}

test("batch 2 installs exactly the next four Monk subclasses and keeps the canonical resource policy", () => {
  for (const key of ["subclass:monk:drunken-master", "subclass:monk:kensei", "subclass:monk:ascendant-dragon", "subclass:monk:astral-self"]) assert.match(migration, new RegExp(key))
  assert.match(migration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(migration, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(migration, /subclass_supported_count',8/)
  assert.match(migration, /shared_resource','monk_focus'/)
})

test("all four batch-2 fixtures pass strict quality and resource policy with parent Monk", () => {
  const parent = bundle("class", "monk-class", "class:monk", baseFocus)
  const bundles = [parent, ...(["drunken-master", "kensei", "ascendant-dragon", "astral-self"] as const).map(subclassBundle)]
  assert.doesNotThrow(() => assertClassPackageQuality(bundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(bundles))
})

test("Drunken Master spends Focus and preserves the original five-attack Intoxicated Frenzy cap", () => {
  const redirect = execute(inputFor("drunken-master", { monk_focus: { current: 20 } }), "tipsy_sway_redirect_attack")
  assert.equal(redirect.resources?.monk_focus?.current, 19)
  const luck = execute(inputFor("drunken-master", { monk_focus: { current: 20 } }), "drunkards_luck")
  assert.equal(luck.resources?.monk_focus?.current, 18)
  assert.equal(resolvedValue("drunken-master", "drunken_flurry_max_attacks"), 5)
})

test("Kensei selections resolve as persistent proficiencies and Focus costs are 1/2/3", () => {
  const contract = resolveCharacterContract(inputFor("kensei"))
  assert.equal(contract.proficiencies.some((entry) => entry.key === "weapon:longsword"), true)
  assert.equal(contract.proficiencies.some((entry) => entry.key === "weapon:longbow"), true)
  assert.equal(contract.proficiencies.some((entry) => entry.key === "weapon:hand_crossbow"), true)

  const deft = execute(inputFor("kensei", { monk_focus: { current: 20 } }), "deft_strike")
  assert.equal(deft.resources?.monk_focus?.current, 19)
  const sharpen2 = execute(inputFor("kensei", { monk_focus: { current: 20 } }), "sharpen_the_blade_2")
  assert.equal(sharpen2.resources?.monk_focus?.current, 18)
  const sharpen3 = execute(inputFor("kensei", { monk_focus: { current: 20 } }), "sharpen_the_blade_3")
  assert.equal(sharpen3.resources?.monk_focus?.current, 17)
})

test("Ascendant Dragon uses PB-scaled free pools and paid Focus fallbacks", () => {
  const contract = resolveCharacterContract(inputFor("ascendant-dragon"))
  assert.equal(contract.resources.find((entry) => entry.key === "monk_dragon_breath_uses")?.max.value, 6)
  assert.equal(contract.resources.find((entry) => entry.key === "monk_dragon_wings_uses")?.max.value, 6)
  assert.equal(contract.resources.find((entry) => entry.key === "monk_dragon_aspect_free_use")?.max.value, 1)

  const freeBreath = execute(inputFor("ascendant-dragon", { monk_focus: { current: 20 }, monk_dragon_breath_uses: { current: 6 } }), "breath_of_the_dragon_free")
  assert.equal(freeBreath.resources?.monk_dragon_breath_uses?.current, 5)
  assert.equal(freeBreath.resources?.monk_focus?.current, 20)
  const paidBreath = execute(inputFor("ascendant-dragon", { monk_focus: { current: 20 }, monk_dragon_breath_uses: { current: 0 } }), "breath_of_the_dragon_focus")
  assert.equal(paidBreath.resources?.monk_focus?.current, 18)
  const paidAspect = execute(inputFor("ascendant-dragon", { monk_focus: { current: 20 }, monk_dragon_aspect_free_use: { current: 0 } }), "aspect_of_the_wyrm_focus")
  assert.equal(paidAspect.resources?.monk_focus?.current, 17)
})

test("Astral Self spends shared Focus and exposes awakened form values", () => {
  const arms = execute(inputFor("astral-self", { monk_focus: { current: 20 } }), "arms_of_the_astral_self")
  assert.equal(arms.resources?.monk_focus?.current, 19)
  const visage = execute(inputFor("astral-self", { monk_focus: { current: 20 } }), "visage_of_the_astral_self")
  assert.equal(visage.resources?.monk_focus?.current, 19)
  const awakened = execute(inputFor("astral-self", { monk_focus: { current: 20 } }), "awakened_astral_self")
  assert.equal(awakened.resources?.monk_focus?.current, 15)
  assert.equal(resolvedValue("astral-self", "awakened_astral_self_ac_bonus"), 2)
  assert.equal(resolvedValue("astral-self", "awakened_astral_self_extra_attack_count"), 3)
})

test("migration keeps scene cadence explicit instead of inventing turn state", () => {
  assert.doesNotMatch(migration, /'kind','state'/)
  assert.doesNotMatch(migration, /"enforcement"\s*:\s*"gm"/)
  assert.match(migration, /no_fake_scene_state/)
})
