import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { executeAction, resolveCharacterContract, type CharacterEngineInput, type FormulaExpression } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const runtime = fs.readFileSync("supabase/migrations/20260904142000_monk_subclasses_batch2_runtime.sql", "utf8")
const precision = fs.readFileSync("supabase/migrations/20260904142500_monk_subclasses_batch2_precision.sql", "utf8")
const pb: FormulaExpression = { kind: "reference", key: "core.proficiencyBonus" }

const feature = (id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic => ({
  id, type: "grant", target: "feature", sourceKey, key, payload: { label, description },
})
const resource = (id: string, sourceKey: string, key: string, label: string, max: number | FormulaExpression): StoredMechanic => ({
  id, type: "resource", sourceKey, key, label, max, recharge: ["long_rest"], initial: "full", grantOperation: "REPLACE",
})
const action = (id: string, sourceKey: string, key: string, label: string, economy: string, focus = 0, extra: Array<{ key: string; amount: number }> = []): StoredMechanic => ({
  id, type: "action", sourceKey, key, label, economy,
  ...(focus || extra.length ? { resourceCosts: [...(focus ? [{ key: "monk_focus", amount: focus }] : []), ...extra] } : {}),
})
const value = (id: string, sourceKey: string, key: string, label: string, amount: number): StoredMechanic => ({
  id, type: "grant", target: "value", sourceKey, key, grantOperation: "REPLACE", payload: { label, value: amount },
})

const focus: StoredMechanics = [{
  id: "focus", type: "resource", sourceKey: "monk-focus", key: "monk_focus", label: "Очки концентрации",
  max: 20, recharge: ["short_rest", "long_rest"], initial: "full", grantOperation: "REPLACE", priority: 20,
}]

const kenseiChoices: RuleChoiceDefinition[] = [
  { key: "kensei_melee_weapon", label: "Рукопашное оружие кэнсэя", target: "proficiency", options: ["weapon:longsword", "weapon:rapier"], count: 1, selection_mode: "player_once" },
  { key: "kensei_ranged_weapon", label: "Дальнобойное оружие кэнсэя", target: "proficiency", options: ["weapon:longbow", "weapon:shortbow"], count: 1, selection_mode: "player_once" },
  { key: "kensei_extra_weapon", label: "Дополнительное оружие кэнсэя", target: "proficiency", options: ["weapon:warhammer", "weapon:whip", "weapon:hand_crossbow"], count_by_level: { "6": 1, "11": 2, "17": 3 }, selection_mode: "player_once" },
]

const subclassMechanics: Record<string, StoredMechanics> = {
  "drunken-master": [
    feature("tipsy-rules", "monk:drunken-master:tipsy-sway", "tipsy_sway", "Пьяное покачивание", "После промаха рукопашной атакой монах может реакцией потратить 1 Очко концентрации и перенаправить атаку в другую допустимую цель."),
    action("tipsy-action", "monk:drunken-master:tipsy-sway", "tipsy_sway_redirect_attack", "Перенаправить атаку", "reaction", 1),
    feature("luck-rules", "monk:drunken-master:luck", "drunkards_luck", "Удача пьяницы", "При броске с помехой монах может потратить 2 Очка концентрации и отменить помеху для этого броска."),
    action("luck-action", "monk:drunken-master:luck", "drunkards_luck", "Удача пьяницы", "free", 2),
    feature("frenzy-rules", "monk:drunken-master:frenzy", "intoxicated_frenzy", "Хмельное безумие", "Шквал может сделать до трёх дополнительных атак по разным существам, но максимум способности равен пяти атакам Шквала за ход."),
    value("frenzy-cap", "monk:drunken-master:frenzy", "drunken_flurry_max_attacks", "Максимум атак Шквала", 5),
  ],
  kensei: [
    feature("deft-rules", "monk:kensei:one-with-blade", "one_with_the_blade", "Единство с клинком", "Один раз за ход при попадании оружием кэнсэя монах может потратить 1 Очко концентрации и добавить один куб Боевых искусств урона."),
    action("deft-action", "monk:kensei:one-with-blade", "deft_strike", "Точный удар", "free", 1),
    feature("sharpen-rules", "monk:kensei:sharpen", "sharpen_the_blade", "Заточка клинка", "Бонусным действием монах тратит от 1 до 3 Очков концентрации и на 1 минуту даёт оружию кэнсэя такой же бонус к атаке и урону."),
    action("sharpen-1", "monk:kensei:sharpen", "sharpen_the_blade_1", "Заточка +1", "bonus_action", 1),
    action("sharpen-2", "monk:kensei:sharpen", "sharpen_the_blade_2", "Заточка +2", "bonus_action", 2),
    action("sharpen-3", "monk:kensei:sharpen", "sharpen_the_blade_3", "Заточка +3", "bonus_action", 3),
  ],
  "ascendant-dragon": [
    feature("presence-rules", "monk:ascendant-dragon:disciple", "draconic_disciple", "Ученик дракона", "После проваленной проверки Запугивания или Убеждения монах может один раз перебросить её; применение восстанавливается после долгого отдыха."),
    resource("presence-use", "monk:ascendant-dragon:disciple", "monk_draconic_presence_use", "Драконье присутствие", 1),
    action("presence-action", "monk:ascendant-dragon:disciple", "draconic_presence_reroll", "Драконье присутствие", "reaction", 0, [{ key: "monk_draconic_presence_use", amount: 1 }]),
    feature("breath-rules", "monk:ascendant-dragon:breath", "breath_of_the_dragon", "Дыхание дракона", "Бесплатных применений Дыхания столько, сколько бонус мастерства; они возвращаются после долгого отдыха. После их исчерпания применение стоит 2 Очка концентрации."),
    resource("breath-uses", "monk:ascendant-dragon:breath", "monk_dragon_breath_uses", "Дыхание дракона", pb),
    action("breath-free", "monk:ascendant-dragon:breath", "breath_of_the_dragon_free", "Дыхание бесплатно", "free", 0, [{ key: "monk_dragon_breath_uses", amount: 1 }]),
    action("breath-focus", "monk:ascendant-dragon:breath", "breath_of_the_dragon_focus", "Дыхание за концентрацию", "free", 2),
    feature("wings-rules", "monk:ascendant-dragon:wings", "wings_unfurled", "Расправленные крылья", "Крылья имеют число применений, равное бонусу мастерства, и все применения восстанавливаются после долгого отдыха."),
    resource("wings-uses", "monk:ascendant-dragon:wings", "monk_dragon_wings_uses", "Расправленные крылья", pb),
    action("wings-action", "monk:ascendant-dragon:wings", "wings_unfurled", "Расправленные крылья", "free", 0, [{ key: "monk_dragon_wings_uses", amount: 1 }]),
    feature("aspect-rules", "monk:ascendant-dragon:aspect", "aspect_of_the_wyrm", "Аспект змея", "Одно создание ауры доступно после долгого отдыха; дополнительные создания стоят 3 Очка концентрации."),
    resource("aspect-use", "monk:ascendant-dragon:aspect", "monk_dragon_aspect_free_use", "Аспект змея", 1),
    action("aspect-free", "monk:ascendant-dragon:aspect", "aspect_of_the_wyrm_free", "Аспект бесплатно", "bonus_action", 0, [{ key: "monk_dragon_aspect_free_use", amount: 1 }]),
    action("aspect-focus", "monk:ascendant-dragon:aspect", "aspect_of_the_wyrm_focus", "Аспект за концентрацию", "bonus_action", 3),
    feature("augment-rules", "monk:ascendant-dragon:ascendant", "ascendant_aspect", "Восходящий аспект", "При Дыхании дракона монах может потратить 1 Очко концентрации и усилить выдох до четырёх кубов Боевых искусств с увеличенной областью."),
    action("augment-action", "monk:ascendant-dragon:ascendant", "ascendant_aspect_augment_breath", "Усилить Дыхание", "free", 1),
  ],
  "astral-self": [
    feature("arms-rules", "monk:astral-self:arms", "arms_of_the_astral_self", "Руки астрального я", "Бонусным действием монах тратит 1 Очко концентрации и призывает астральные руки на 10 минут."),
    action("arms-action", "monk:astral-self:arms", "arms_of_the_astral_self", "Руки астрального я", "bonus_action", 1),
    feature("visage-rules", "monk:astral-self:visage", "visage_of_the_astral_self", "Лик астрального я", "Бонусным действием монах тратит 1 Очко концентрации и призывает астральный лик на 10 минут."),
    action("visage-action", "monk:astral-self:visage", "visage_of_the_astral_self", "Лик астрального я", "bonus_action", 1),
    feature("awakened-rules", "monk:astral-self:awakened", "awakened_astral_self", "Пробуждённое астральное я", "Бонусным действием монах тратит 5 Очков концентрации и на 10 минут пробуждает полную астральную форму."),
    action("awakened-action", "monk:astral-self:awakened", "awakened_astral_self", "Пробуждённое астральное я", "bonus_action", 5),
    value("awakened-ac", "monk:astral-self:awakened", "awakened_astral_self_ac_bonus", "Бонус КД", 2),
    value("awakened-attacks", "monk:astral-self:awakened", "awakened_astral_self_extra_attack_count", "Атак астральными руками", 3),
  ],
}

const summaries: Record<string, string> = {
  "drunken-master": "Пьяный мастер усиливает мобильность Шквала, перенаправляет промахи и тратит Focus на отмену помехи.",
  kensei: "Кэнсэй хранит постоянный выбор оружия и тратит Focus на Deft Strike и Sharpen the Blade.",
  "ascendant-dragon": "Драконий монах имеет отдельные long-rest применения Breath, Wings и Aspect и использует общий Focus для платных повторов.",
  "astral-self": "Астральный монах тратит общий Focus на Arms, Visage и Awakened Self и получает структурированные свойства форм.",
}

function bundle(kind: "class" | "subclass", id: string, catalogKey: string, mechanics: StoredMechanics, choices: RuleChoiceDefinition[] = []): CharacterTemplateBundle {
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
      catalog_key: catalogKey, catalog_revision: "monk-subclasses-batch2-runtime-v1", source_kind: "official", source_label: "official source",
      is_builtin: true, mechanical_summary: kind === "subclass" ? summaries[subclassId] : "Монах использует общий конечный запас Очков концентрации для классовых и подклассовых приёмов.",
      is_active: true, created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    levels: [{ id: `${id}-level`, template_id: id, level: kind === "class" ? 2 : 3, mechanics, choices }],
  }
}

const subclassBundle = (id: keyof typeof subclassMechanics) => bundle("subclass", `monk-${id}`, `subclass:monk:${id}`, subclassMechanics[id], id === "kensei" ? kenseiChoices : [])

function inputFor(id: keyof typeof subclassMechanics, resources: CharacterEngineInput["state"]["resources"] = {}): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundle("class", "monk-class", "class:monk", focus), subclassBundle(id)], 20)
  return {
    base: { id: "monk-character", name: "Монах", level: 20, abilities: { strength: 10, dexterity: 20, constitution: 14, intelligence: 10, wisdom: 16, charisma: 8 }, baseMaxHp: 120, baseSpeed: 30 },
    state: { currentHp: 120, tempHp: 0, resources }, contributions: parsed.contributions,
  }
}

function execute(input: CharacterEngineInput, key: string) {
  const found = resolveCharacterContract(input).actions.find((entry) => entry.key === key)
  assert.ok(found, `missing action ${key}`)
  assert.equal(found.available, true)
  return executeAction(input.state, found)
}

const resolvedValue = (id: keyof typeof subclassMechanics, key: string) => resolveCharacterContract(inputFor(id)).values.find((entry) => entry.key === key)?.value.value

test("batch 2 installs exactly the next four subclasses with project integration headers", () => {
  for (const key of ["subclass:monk:drunken-master", "subclass:monk:kensei", "subclass:monk:ascendant-dragon", "subclass:monk:astral-self"]) assert.match(runtime, new RegExp(key))
  assert.match(runtime, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(runtime, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(runtime, /subclass_supported_count',8/)
})

test("all four fixtures pass strict package and resource gates together with parent Monk", () => {
  const bundles = [bundle("class", "monk-class", "class:monk", focus), ...(["drunken-master", "kensei", "ascendant-dragon", "astral-self"] as const).map(subclassBundle)]
  assert.doesNotThrow(() => assertClassPackageQuality(bundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(bundles))
})

test("Drunken Master spends shared Focus and keeps Intoxicated Frenzy at five attacks", () => {
  assert.equal(execute(inputFor("drunken-master", { monk_focus: { current: 20 } }), "tipsy_sway_redirect_attack").resources?.monk_focus?.current, 19)
  assert.equal(execute(inputFor("drunken-master", { monk_focus: { current: 20 } }), "drunkards_luck").resources?.monk_focus?.current, 18)
  assert.equal(resolvedValue("drunken-master", "drunken_flurry_max_attacks"), 5)
})

test("Kensei choices become persistent weapon proficiencies and Sharpen costs match the selected bonus", () => {
  const contract = resolveCharacterContract(inputFor("kensei"))
  for (const key of ["weapon:longsword", "weapon:longbow", "weapon:hand_crossbow"]) assert.equal(contract.capabilities.proficiencies.some((entry) => entry.key === key), true)
  assert.equal(execute(inputFor("kensei", { monk_focus: { current: 20 } }), "deft_strike").resources?.monk_focus?.current, 19)
  assert.equal(execute(inputFor("kensei", { monk_focus: { current: 20 } }), "sharpen_the_blade_2").resources?.monk_focus?.current, 18)
  assert.equal(execute(inputFor("kensei", { monk_focus: { current: 20 } }), "sharpen_the_blade_3").resources?.monk_focus?.current, 17)
})

test("Ascendant Dragon tracks free pools and paid Focus fallbacks", () => {
  const contract = resolveCharacterContract(inputFor("ascendant-dragon"))
  assert.equal(contract.resources.find((entry) => entry.key === "monk_dragon_breath_uses")?.max.value, 6)
  assert.equal(contract.resources.find((entry) => entry.key === "monk_dragon_wings_uses")?.max.value, 6)
  assert.equal(contract.resources.find((entry) => entry.key === "monk_dragon_aspect_free_use")?.max.value, 1)
  assert.equal(execute(inputFor("ascendant-dragon", { monk_focus: { current: 20 }, monk_dragon_breath_uses: { current: 6 } }), "breath_of_the_dragon_free").resources?.monk_dragon_breath_uses?.current, 5)
  assert.equal(execute(inputFor("ascendant-dragon", { monk_focus: { current: 20 }, monk_dragon_breath_uses: { current: 0 } }), "breath_of_the_dragon_focus").resources?.monk_focus?.current, 18)
  assert.equal(execute(inputFor("ascendant-dragon", { monk_focus: { current: 20 }, monk_dragon_aspect_free_use: { current: 0 } }), "aspect_of_the_wyrm_focus").resources?.monk_focus?.current, 17)
  assert.equal(execute(inputFor("ascendant-dragon", { monk_focus: { current: 20 } }), "ascendant_aspect_augment_breath").resources?.monk_focus?.current, 19)
})

test("Ascendant precision uses the current Martial Arts die and correct success damage", () => {
  assert.match(precision, /damage_dice','4 martial_arts_dice'/)
  assert.match(precision, /при успехе — половину/)
  assert.match(precision, /ascendant_breath_upgrade_focus_cost',1/)
})

test("Astral Self spends shared Focus and exposes awakened form scalars", () => {
  assert.equal(execute(inputFor("astral-self", { monk_focus: { current: 20 } }), "arms_of_the_astral_self").resources?.monk_focus?.current, 19)
  assert.equal(execute(inputFor("astral-self", { monk_focus: { current: 20 } }), "visage_of_the_astral_self").resources?.monk_focus?.current, 19)
  assert.equal(execute(inputFor("astral-self", { monk_focus: { current: 20 } }), "awakened_astral_self").resources?.monk_focus?.current, 15)
  assert.equal(resolvedValue("astral-self", "awakened_astral_self_ac_bonus"), 2)
  assert.equal(resolvedValue("astral-self", "awakened_astral_self_extra_attack_count"), 3)
})

test("batch 2 does not fake turn or scene state", () => {
  const combined = `${runtime}\n${precision}`
  assert.doesNotMatch(combined, /'kind','state'/)
  assert.doesNotMatch(combined, /"enforcement"\s*:\s*"gm"/)
  assert.match(combined, /no_fake_scene_state/)
})
