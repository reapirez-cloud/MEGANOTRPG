import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  executeAction,
  resolveCharacterContract,
  type CharacterEngineInput,
  type FormulaExpression,
} from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync("supabase/migrations/20260904134000_monk_subclasses_batch1_runtime.sql", "utf8")
const audit = fs.readFileSync("supabase/migrations/20260904134500_monk_subclasses_batch1_audit.sql", "utf8")
const compatibility = fs.readFileSync("supabase/migrations/20260904133000_monk_runtime_completion_compat.sql", "utf8")

const wisUses: FormulaExpression = {
  kind: "max",
  values: [
    { kind: "literal", value: 1 },
    { kind: "reference", key: "abilities.wisdom.modifier" },
  ],
}

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", sourceKey, key, payload: { label, description } }
}

function action(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  economy: string,
  focusCost = 0,
  extraCosts: Array<{ key: string; amount: number }> = [],
): StoredMechanic {
  return {
    id,
    type: "action",
    sourceKey,
    key,
    label,
    economy,
    ...(focusCost || extraCosts.length
      ? { resourceCosts: [...(focusCost ? [{ key: "monk_focus", amount: focusCost }] : []), ...extraCosts] }
      : {}),
    tags: ["subclass"],
  }
}

function resource(id: string, sourceKey: string, key: string, label: string, max: number | FormulaExpression): StoredMechanic {
  return {
    id,
    type: "resource",
    sourceKey,
    key,
    label,
    max,
    recharge: ["long_rest"],
    initial: "full",
    grantOperation: "REPLACE",
  }
}

const baseFocus: StoredMechanics = [
  feature(
    "monk-focus-rules",
    "monk-focus",
    "monk_focus_rules",
    "Монашеская концентрация",
    "Запас Очков концентрации равен уровню монаха и полностью восстанавливается после короткого или долгого отдыха. Классовые и подклассовые приёмы расходуют этот общий конечный ресурс.",
  ),
  {
    id: "monk-focus-l20",
    type: "resource",
    sourceKey: "monk-focus",
    key: "monk_focus",
    label: "Очки концентрации",
    max: 20,
    recharge: ["short_rest", "long_rest"],
    initial: "full",
    grantOperation: "REPLACE",
    priority: 20,
  },
]

const subclassMechanics: Record<string, StoredMechanics> = {
  mercy: [
    feature("mercy-harm-rules", "monk:mercy:hand-of-harm", "mercy_hand_of_harm", "Рука вреда", "Один раз за ход после попадания Безоружным ударом монах может потратить 1 Очко концентрации и добавить один куб Боевых искусств + Мудрость некротического урона."),
    action("mercy-harm", "monk:mercy:hand-of-harm", "mercy_hand_of_harm", "Рука вреда", "free", 1),
    feature("mercy-flurry-rules", "monk:mercy:flurry-healing-harm", "mercy_flurry_healing_harm", "Шквал исцеления и вреда", "Преимущества Шквала исцеления и вреда можно использовать число раз, равное модификатору Мудрости (минимум 1); все использования восстанавливаются после долгого отдыха."),
    resource("mercy-l11-uses", "monk:mercy:flurry-healing-harm", "monk_mercy_flurry_healing_harm_uses", "Шквал исцеления и вреда", wisUses),
    action("mercy-flurry-use", "monk:mercy:flurry-healing-harm", "mercy_flurry_healing_harm", "Шквал исцеления и вреда: применить", "free", 0, [{ key: "monk_mercy_flurry_healing_harm_uses", amount: 1 }]),
    feature("mercy-ultimate-rules", "monk:mercy:ultimate", "mercy_hand_of_ultimate_mercy", "Высшее милосердие", "Монах тратит 5 Очков концентрации, чтобы вернуть к жизни существо, умершее не более 24 часов назад; способность можно использовать один раз и она восстанавливается после долгого отдыха."),
    resource("mercy-l17-use", "monk:mercy:ultimate", "monk_mercy_ultimate_mercy_use", "Высшее милосердие", 1),
    action("mercy-ultimate", "monk:mercy:ultimate", "mercy_hand_of_ultimate_mercy", "Высшее милосердие", "magic", 5, [{ key: "monk_mercy_ultimate_mercy_use", amount: 1 }]),
  ],
  shadow: [
    feature("shadow-arts-rules", "monk:shadow:arts", "shadow_arts", "Искусства тени", "Монах может потратить 1 Очко концентрации, чтобы наложить Тьму без компонентов; условия света и положение области определяются по сцене."),
    action("shadow-darkness", "monk:shadow:arts", "shadow_arts_darkness", "Искусства тени: Тьма", "magic", 1),
    feature("shadow-improved-rules", "monk:shadow:improved-step", "shadow_improved_step", "Улучшенный шаг сквозь тень", "При Шаге сквозь тень монах может потратить 1 Очко концентрации, игнорировать требование тусклого света или темноты и затем сделать Безоружный удар."),
    action("shadow-improved", "monk:shadow:improved-step", "shadow_improved_step", "Улучшенный шаг сквозь тень", "bonus_action", 1),
    feature("shadow-cloak-rules", "monk:shadow:cloak", "shadow_cloak", "Покров теней", "В тусклом свете или темноте монах тратит 3 Очка концентрации и на 1 минуту становится Невидимым, получает теневое перемещение и бесплатный Шквал ударов по правилам способности."),
    action("shadow-cloak", "monk:shadow:cloak", "shadow_cloak", "Покров теней", "magic", 3),
  ],
  elements: [
    feature("elements-attune-rules", "monk:elements:attunement", "elemental_attunement", "Единение со стихиями", "В начале хода монах может потратить 1 Очко концентрации и на 10 минут получить увеличенную дальность Безоружных ударов и элементальные свойства по правилам способности."),
    action("elements-attune", "monk:elements:attunement", "elemental_attunement", "Единение со стихиями", "free", 1),
    feature("elements-burst-rules", "monk:elements:burst", "elemental_burst", "Взрыв стихий", "Магическим действием монах тратит 2 Очка концентрации: существа в сфере радиусом 20 футов в точке до 120 футов делают спасбросок Ловкости и получают три куба Боевых искусств выбранного элементального урона, половину при успехе."),
    action("elements-burst", "monk:elements:burst", "elemental_burst", "Взрыв стихий", "magic", 2),
  ],
  "open-hand": [
    feature("open-technique-rules", "monk:open-hand:technique", "open_hand_technique", "Техника открытой ладони", "Каждое попадание атакой Шквала ударов может лишить цель атак по возможности, оттолкнуть её на 15 футов после спасброска Силы или опрокинуть после спасброска Ловкости."),
    feature("open-wholeness-rules", "monk:open-hand:wholeness", "wholeness_of_body", "Целостность тела", "Бонусным действием монах восстанавливает HP по кубу Боевых искусств + Мудрость. Использований столько, сколько модификатор Мудрости (минимум 1), и все они восстанавливаются после долгого отдыха."),
    resource("open-wholeness", "monk:open-hand:wholeness", "monk_open_hand_wholeness_uses", "Целостность тела", wisUses),
    action("open-wholeness-action", "monk:open-hand:wholeness", "wholeness_of_body", "Целостность тела", "bonus_action", 0, [{ key: "monk_open_hand_wholeness_uses", amount: 1 }]),
    feature("open-quivering-rules", "monk:open-hand:quivering", "quivering_palm", "Дрожащая ладонь", "После попадания Безоружным ударом монах может потратить 4 Очка концентрации и пометить одну цель; завершение вибраций требует спасброска Телосложения и наносит 10к12 Force урона при провале, половину при успехе."),
    action("open-quivering-mark", "monk:open-hand:quivering", "quivering_palm_mark", "Дрожащая ладонь: запустить вибрации", "free", 4),
    {
      id: "open-quivering-end",
      type: "action",
      sourceKey: "monk:open-hand:quivering",
      key: "quivering_palm_end",
      label: "Дрожащая ладонь: завершить вибрации",
      economy: "action",
      damage: [{ key: "quivering", damageType: "force", count: 10, sides: 12 }],
      tags: ["subclass"],
    },
  ],
}

const summaries: Record<string, string> = {
  mercy: "Монах милосердия лечит, усиливает Безоружные удары некротическим уроном и расходует общий Focus вместе с отдельными ресурсами долгого отдыха.",
  shadow: "Монах тени расходует Focus на Тьму, улучшенный телепорт и Покров теней, а условия освещения определяются фактической сценой.",
  elements: "Монах стихий расходует Focus на Единение со стихиями и Взрыв стихий, получая элементальные удары и мобильность по уровням.",
  "open-hand": "Монах открытой ладони усиливает Шквал ударов контролем, имеет конечный запас самоисцеления и тратит Focus на Дрожащую ладонь.",
}

function bundle(kind: "class" | "subclass", id: string, catalogKey: string, mechanics: StoredMechanics): CharacterTemplateBundle {
  const subclassId = catalogKey.split(":").at(-1) ?? id
  return {
    assignment: {
      id: `assignment-${id}`, character_id: "monk-character", template_id: id, template_level: 20,
      selected_choices: {}, assigned_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    template: {
      id, campaign_id: "campaign", kind, slug: id, name: id, description: `${id} runtime test fixture`, version: 1,
      mechanics: [], choices: [], ...(kind === "subclass" ? { parent_template_id: "monk-class", unlock_level: 3 } : {}),
      catalog_key: catalogKey, catalog_revision: "xphb-2024-monk-subclasses-batch1-v1", source_kind: "official",
      source_label: "Player's Handbook 2024", is_builtin: true,
      mechanical_summary: kind === "subclass" ? summaries[subclassId] : "Монах использует общий конечный запас Очков концентрации для классовых и подклассовых приёмов.",
      is_active: true, created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    levels: [{ id: `${id}-level`, template_id: id, level: kind === "class" ? 2 : 3, mechanics, choices: [] }],
  }
}

function parentBundle() {
  return bundle("class", "monk-class", "class:monk", baseFocus)
}

function subclassBundle(subclass: keyof typeof subclassMechanics) {
  return bundle("subclass", `monk-${subclass}`, `subclass:monk:${subclass}`, subclassMechanics[subclass])
}

function inputFor(subclass: keyof typeof subclassMechanics, resources: CharacterEngineInput["state"]["resources"] = {}): CharacterEngineInput {
  const parsed = resolveTemplateBundles([parentBundle(), subclassBundle(subclass)], 20)

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

function executeByKey(input: CharacterEngineInput, key: string) {
  const contract = resolveCharacterContract(input)
  const resolved = contract.actions.find((entry) => entry.key === key)
  assert.ok(resolved, `missing action ${key}`)
  assert.equal(resolved.available, true, `${key} should be affordable`)
  return executeAction(input.state, resolved)
}

test("batch 1 installs exactly the four 2024 Monk subclass catalog keys", () => {
  for (const key of ["subclass:monk:mercy", "subclass:monk:shadow", "subclass:monk:elements", "subclass:monk:open-hand"]) {
    assert.match(migration, new RegExp(key))
  }
  assert.match(migration, /subclass_supported_count',4/)
  assert.match(migration, /'feature_levels',jsonb_build_array\(3,6,11,17\)/)
  assert.match(migration, /'shared_resource','monk_focus'/)
  assert.match(migration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(migration, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
})

test("all four subclasses pass strict quality and resource policy together with parent Monk", () => {
  const bundles = [parentBundle(), ...(["mercy", "shadow", "elements", "open-hand"] as const).map(subclassBundle)]
  assert.doesNotThrow(() => assertClassPackageQuality(bundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(bundles))
})

test("batch installer can call the canonical base Monk completion function", () => {
  assert.match(compatibility, /complete_monk_runtime_v1/)
  assert.match(compatibility, /perform private\.complete_monk_base_runtime\(p_campaign_id\)/)
})

test("subclasses reuse base Focus rather than defining a second Focus pool", () => {
  assert.doesNotMatch(migration, /monk_subclass_resource\([^\n]*'monk_focus'/)
  for (const subclass of ["mercy", "shadow", "elements", "open-hand"] as const) {
    const contract = resolveCharacterContract(inputFor(subclass))
    assert.equal(contract.resources.filter((entry) => entry.key === "monk_focus").length, 1)
    assert.equal(contract.resources.find((entry) => entry.key === "monk_focus")?.max.value, 20)
  }
})

test("Mercy uses shared Focus and its own long-rest counters", () => {
  const harm = executeByKey(inputFor("mercy", {
    monk_focus: { current: 20 }, monk_mercy_flurry_healing_harm_uses: { current: 3 }, monk_mercy_ultimate_mercy_use: { current: 1 },
  }), "mercy_hand_of_harm")
  assert.equal(harm.resources?.monk_focus?.current, 19)

  const ultimate = executeByKey(inputFor("mercy", {
    monk_focus: { current: 20 }, monk_mercy_flurry_healing_harm_uses: { current: 3 }, monk_mercy_ultimate_mercy_use: { current: 1 },
  }), "mercy_hand_of_ultimate_mercy")
  assert.equal(ultimate.resources?.monk_focus?.current, 15)
  assert.equal(ultimate.resources?.monk_mercy_ultimate_mercy_use?.current, 0)

  const contract = resolveCharacterContract(inputFor("mercy"))
  assert.equal(contract.resources.find((entry) => entry.key === "monk_mercy_flurry_healing_harm_uses")?.max.value, 3)
})

test("Shadow Focus costs are 1 / 1 / 3", () => {
  for (const [key, expected] of [["shadow_arts_darkness", 19], ["shadow_improved_step", 19], ["shadow_cloak", 17]] as const) {
    const next = executeByKey(inputFor("shadow", { monk_focus: { current: 20 } }), key)
    assert.equal(next.resources?.monk_focus?.current, expected)
  }
})

test("Elements Focus costs are 1 for Attunement and 2 for Elemental Burst", () => {
  const attune = executeByKey(inputFor("elements", { monk_focus: { current: 20 } }), "elemental_attunement")
  assert.equal(attune.resources?.monk_focus?.current, 19)
  const burst = executeByKey(inputFor("elements", { monk_focus: { current: 20 } }), "elemental_burst")
  assert.equal(burst.resources?.monk_focus?.current, 18)
})

test("Open Hand tracks Wholeness uses and Quivering Palm costs 4 Focus with 10d12 Force payload", () => {
  const contract = resolveCharacterContract(inputFor("open-hand", {
    monk_focus: { current: 20 }, monk_open_hand_wholeness_uses: { current: 3 },
  }))
  assert.equal(contract.resources.find((entry) => entry.key === "monk_open_hand_wholeness_uses")?.max.value, 3)
  const finish = contract.actions.find((entry) => entry.key === "quivering_palm_end")
  assert.ok(finish)
  assert.equal(finish.damage[0]?.dice?.count, 10)
  assert.equal(finish.damage[0]?.dice?.sides, 12)
  assert.equal(finish.damage[0]?.type, "force")

  const marked = executeByKey(inputFor("open-hand", {
    monk_focus: { current: 20 }, monk_open_hand_wholeness_uses: { current: 3 },
  }), "quivering_palm_mark")
  assert.equal(marked.resources?.monk_focus?.current, 16)

  const healed = executeByKey(inputFor("open-hand", {
    monk_focus: { current: 20 }, monk_open_hand_wholeness_uses: { current: 3 },
  }), "wholeness_of_body")
  assert.equal(healed.resources?.monk_open_hand_wholeness_uses?.current, 2)
})

test("action range audit removes false self-target metadata", () => {
  assert.match(audit, /mercy-hand-healing-action'[\s\S]*kind.*touch/)
  assert.match(audit, /shadow-darkness-action'[\s\S]*normal.*60/)
  assert.match(audit, /elements-burst-action'[\s\S]*Точка в пределах 120 футов/)
  assert.match(audit, /open-hand-quivering-end'[\s\S]*Отмеченная цель на том же плане/)
})
