import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { executeAction, resolveCharacterContract, type CharacterEngineInput, type FormulaExpression } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync("supabase/migrations/20260904145500_monk_subclasses_batch3_runtime.sql", "utf8")
const compat = fs.readFileSync("supabase/migrations/20260904145400_monk_subclass_value_integer_compat.sql", "utf8")

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", sourceKey, key, payload: { label, description } }
}

function action(id: string, sourceKey: string, key: string, label: string, economy: string, focus = 0): StoredMechanic {
  return {
    id, type: "action", sourceKey, key, label, economy,
    ...(focus ? { resourceCosts: [{ key: "monk_focus", amount: focus }] } : {}),
    tags: ["subclass"],
  }
}

function value(id: string, sourceKey: string, key: string, label: string, amount: number | FormulaExpression): StoredMechanic {
  return { id, type: "grant", target: "value", sourceKey, key, grantOperation: "REPLACE", payload: { label, value: amount } }
}

const baseFocus: StoredMechanics = [{
  id: "monk-focus-l20", type: "resource", sourceKey: "monk-focus", key: "monk_focus", label: "Очки концентрации",
  max: 20, recharge: ["short_rest", "long_rest"], initial: "full", grantOperation: "REPLACE", priority: 20,
}]

const livingDie: FormulaExpression = {
  kind: "min",
  values: [
    { kind: "literal", value: 12 },
    { kind: "add", terms: [
      { kind: "reference", key: "values.value:martial_arts_die_sides:default" },
      { kind: "literal", value: 2 },
    ] },
  ],
}

const mechanics: Record<string, StoredMechanics> = {
  "sun-soul": [
    feature("sun-bolt-rules", "monk:sun-soul:bolt", "radiant_sun_bolt", "Луч сияющего солнца", "Дальнобойная атака использует текущий куб Боевых искусств и Ловкость; бонусная пара лучей стоит 1 Очко концентрации."),
    action("sun-bolt-pair", "monk:sun-soul:bolt", "radiant_sun_bolt_bonus_pair", "Два дополнительных луча", "bonus_action", 1),
    feature("sun-arc-rules", "monk:sun-soul:searing-arc", "searing_arc_strike", "Пылающий дуговой удар", "После действия Атака Burning Hands стоит от 2 Focus; допустимый максимум равен половине уровня монаха."),
    action("sun-arc-3", "monk:sun-soul:searing-arc", "searing_arc_strike_3", "Burning Hands 2 уровня", "bonus_action", 3),
    feature("sunburst-rules", "monk:sun-soul:sunburst", "searing_sunburst", "Солнечный взрыв", "Базовый Солнечный взрыв бесплатен, а усиление тратит до 3 Focus."),
    action("sunburst-3", "monk:sun-soul:sunburst", "searing_sunburst_3", "Солнечный взрыв 8к6", "action", 3),
  ],
  "long-death": [
    feature("long-mastery-rules", "monk:long-death:mastery", "mastery_of_death", "Владение смертью", "Когда HP падают до 0, монах может потратить 1 Focus и остаться с 1 HP."),
    action("long-mastery", "monk:long-death:mastery", "mastery_of_death", "Владение смертью", "free", 1),
    feature("long-touch-rules", "monk:long-death:touch", "touch_of_the_long_death", "Прикосновение долгой смерти", "Действием монах тратит от 1 до 10 Focus и наносит 2к10 некротического урона за каждое очко, половину при успешном спасброске."),
    action("long-touch-10", "monk:long-death:touch", "touch_of_the_long_death_10", "Прикосновение: 10 Focus", "action", 10),
  ],
  "cobalt-soul": [
    feature("cobalt-extort-rules", "monk:cobalt-soul:extort", "extort_truth", "Выбить правду", "После Безоружного удара монах тратит 1 Focus и заставляет цель пройти спасбросок Харизмы."),
    action("cobalt-extort", "monk:cobalt-soul:extort", "extort_truth", "Выбить правду", "free", 1),
    feature("cobalt-mercury-rules", "monk:cobalt-soul:mercury", "mind_of_mercury", "Разум Меркурия", "Один раз за ход после использованной реакции монах тратит 1 Focus и получает дополнительную реакцию."),
    action("cobalt-mercury", "monk:cobalt-soul:mercury", "mind_of_mercury", "Разум Меркурия", "free", 1),
    feature("cobalt-barrage-rules", "monk:cobalt-soul:barrage", "debilitating_barrage", "Ослабляющий шквал", "После Безоружного удара монах тратит 3 Focus, чтобы создать уязвимость или подавить сопротивление выбранному типу урона."),
    action("cobalt-barrage", "monk:cobalt-soul:barrage", "debilitating_barrage", "Ослабляющий шквал", "free", 3),
  ],
  "living-weapon": [
    feature("living-fists-rules", "monk:living-weapon:fists", "fists_of_bone_and_steel", "Кулаки из кости и стали", "Куб Безоружного удара на одну ступень выше куба Боевых искусств, максимум d12."),
    value("living-die", "monk:living-weapon:fists", "living_weapon_unarmed_die_sides", "Куб Безоружного удара", livingDie),
    feature("living-reflex-rules", "monk:living-weapon:reflex", "reflexive_adaptation", "Рефлекторная адаптация", "Проверка Athletics или Acrobatics может получить дополнительный d20 за 1 Focus."),
    action("living-reflex", "monk:living-weapon:reflex", "reflexive_adaptation", "Рефлекторная адаптация", "free", 1),
    value("living-manifest-dice", "monk:living-weapon:manifest", "living_manifest_blow_dice_count", "Кубы Проявленного удара", 2),
  ],
}

const cobaltChoices: RuleChoiceDefinition[] = [
  { key: "cobalt_erudition_skill", label: "Навык эрудиции", target: "proficiency", options: ["skill:arcana", "skill:history", "skill:investigation", "skill:nature", "skill:religion"], count_by_level: { "6": 1, "11": 2, "17": 3 }, selection_mode: "player_once" },
]

const livingChoices: RuleChoiceDefinition[] = [
  { key: "living_weapon_discipline", label: "Боевая дисциплина", target: "trait", options: ["forged_heart", "nightmare_shroud", "travelers_blade", "weretouched"], count: 1, selection_mode: "player_once" },
  { key: "living_manifest_damage_type", label: "Тип Manifest Blow", target: "trait", options: ["damage:bludgeoning", "damage:piercing", "damage:slashing", "damage:cold", "damage:lightning", "damage:necrotic", "damage:psychic", "damage:thunder"], count: 1, selection_mode: "player_once", refresh: "long_rest" },
  { key: "living_weapon_perfect_form", label: "Совершенная форма", target: "trait", options: ["forged_heart", "nightmare_shroud", "travelers_blade", "weretouched"], count: 1, selection_mode: "player_once" },
]

const summaries: Record<string, string> = {
  "sun-soul": "Солнечная душа получает дальнюю radiant-атаку и тратит Focus на дополнительные лучи, Burning Hands и усиленный Sunburst.",
  "long-death": "Долгая смерть использует общий Focus для отказа падать до 0 HP и регулируемого некротического прикосновения.",
  "cobalt-soul": "Кобальтовая душа анализирует цели и тратит Focus на Extort Truth, дополнительную реакцию и Debilitating Barrage.",
  "living-weapon": "Живое оружие хранит дисциплину и формы как choices и использует Focus для приёмов выбранной дисциплины и Reflexive Adaptation.",
}

function bundle(kind: "class" | "subclass", id: string, catalogKey: string, stored: StoredMechanics, choices: RuleChoiceDefinition[] = [], sourceKind: "official" | "third_party" = "official"): CharacterTemplateBundle {
  const subclassId = catalogKey.split(":").at(-1) ?? id
  const selected = subclassId === "cobalt-soul"
    ? { cobalt_erudition_skill: ["skill:arcana", "skill:history", "skill:investigation"] }
    : subclassId === "living-weapon"
      ? { living_weapon_discipline: "forged_heart", living_manifest_damage_type: "damage:psychic", living_weapon_perfect_form: "travelers_blade" }
      : {}
  return {
    assignment: { id: `assignment-${id}`, character_id: "monk-character", template_id: id, template_level: 20, selected_choices: selected, assigned_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z" },
    template: {
      id, campaign_id: "campaign", kind, slug: id, name: id, description: `${id} runtime test fixture`, version: 1,
      mechanics: [], choices: [], ...(kind === "subclass" ? { parent_template_id: "monk-class", unlock_level: 3 } : {}),
      catalog_key: catalogKey, catalog_revision: "monk-subclasses-batch3-runtime-v1", source_kind: sourceKind, source_label: "test source", is_builtin: true,
      mechanical_summary: kind === "subclass" ? summaries[subclassId] : "Монах использует общий конечный запас Очков концентрации.",
      is_active: true, created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    levels: [{ id: `${id}-level`, template_id: id, level: kind === "class" ? 2 : 3, mechanics: stored, choices }],
  }
}

function subclassBundle(id: keyof typeof mechanics) {
  const choices = id === "cobalt-soul" ? cobaltChoices : id === "living-weapon" ? livingChoices : []
  const sourceKind = id === "cobalt-soul" || id === "living-weapon" ? "third_party" : "official"
  return bundle("subclass", `monk-${id}`, `subclass:monk:${id}`, mechanics[id], choices, sourceKind)
}

function inputFor(id: keyof typeof mechanics, resources: CharacterEngineInput["state"]["resources"] = {}): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundle("class", "monk-class", "class:monk", baseFocus), subclassBundle(id)], 20)
  return {
    base: { id: "monk-character", name: "Монах", level: 20, abilities: { strength: 10, dexterity: 20, constitution: 14, intelligence: 10, wisdom: 16, charisma: 8 }, baseMaxHp: 120, baseSpeed: 30 },
    state: { currentHp: 120, tempHp: 0, resources },
    contributions: parsed.contributions,
  }
}

function spend(id: keyof typeof mechanics, key: string, current = 20) {
  const input = inputFor(id, { monk_focus: { current } })
  const contract = resolveCharacterContract(input)
  const resolved = contract.actions.find((entry) => entry.key === key)
  assert.ok(resolved, `missing action ${key}`)
  assert.equal(resolved.available, true)
  return executeAction(input.state, resolved)
}

test("batch 3 declares two official and two third-party Monk subclasses", () => {
  for (const key of ["subclass:monk:sun-soul", "subclass:monk:long-death", "subclass:monk:cobalt-soul", "subclass:monk:living-weapon"]) assert.match(migration, new RegExp(key))
  assert.match(migration, /'wotc_subclass_supported_count',10/)
  assert.match(migration, /'additional_subclass_supported_count',2/)
  assert.match(migration, /'third_party','Critical Role \/ Tal''Dorei Campaign Setting Reborn'/)
  assert.match(migration, /'third_party','Exploring Eberron — Keith Baker'/)
})

test("batch 3 fixtures pass package quality with parent Monk", () => {
  for (const id of ["sun-soul", "long-death", "cobalt-soul", "living-weapon"] as const) {
    const bundles = [bundle("class", "monk-class", "class:monk", baseFocus), subclassBundle(id)]
    assert.doesNotThrow(() => assertClassPackageQuality(bundles))
    assert.doesNotThrow(() => assertClassResourcePolicy(bundles))
  }
})

test("Sun Soul spends shared Focus for its paid attacks", () => {
  assert.equal(spend("sun-soul", "radiant_sun_bolt_bonus_pair").resources?.monk_focus?.current, 19)
  assert.equal(spend("sun-soul", "searing_arc_strike_3").resources?.monk_focus?.current, 17)
  assert.equal(spend("sun-soul", "searing_sunburst_3").resources?.monk_focus?.current, 17)
  assert.match(migration, /values\.value:martial_arts_die_sides:default/)
})

test("Long Death exposes 1 Focus survival and 10 Focus maximum touch", () => {
  assert.equal(spend("long-death", "mastery_of_death").resources?.monk_focus?.current, 19)
  assert.equal(spend("long-death", "touch_of_the_long_death_10").resources?.monk_focus?.current, 10)
  assert.match(migration, /for v_i in 1\.\.10 loop/)
})

test("Cobalt Soul spends 1 / 1 / 3 Focus and is third-party", () => {
  assert.equal(spend("cobalt-soul", "extort_truth").resources?.monk_focus?.current, 19)
  assert.equal(spend("cobalt-soul", "mind_of_mercury").resources?.monk_focus?.current, 19)
  assert.equal(spend("cobalt-soul", "debilitating_barrage").resources?.monk_focus?.current, 17)
  assert.equal(subclassBundle("cobalt-soul").template.source_kind, "third_party")
})

test("Living Weapon keeps choices and raises the 2024 unarmed die one step to d12 cap", () => {
  const contract = resolveCharacterContract(inputFor("living-weapon"))
  assert.equal(contract.values.find((entry) => entry.key === "living_weapon_unarmed_die_sides")?.value.value, 12)
  const profiled = resolveTemplateBundles([bundle("class", "monk-class", "class:monk", baseFocus), subclassBundle("living-weapon")], 20)
  assert.ok(profiled.contributions.some((entry) => entry.kind === "grant" && entry.target === "trait" && entry.key === "forged_heart"))
  assert.ok(profiled.contributions.some((entry) => entry.kind === "grant" && entry.target === "trait" && entry.key === "damage:psychic"))
  assert.ok(profiled.contributions.some((entry) => entry.kind === "grant" && entry.target === "trait" && entry.key === "travelers_blade"))
  assert.equal(spend("living-weapon", "reflexive_adaptation").resources?.monk_focus?.current, 19)
})

test("integer overload exists before batch 3 migration", () => {
  assert.match(compat, /p_value integer/)
  assert.match(compat, /to_jsonb\(p_value\)/)
})
