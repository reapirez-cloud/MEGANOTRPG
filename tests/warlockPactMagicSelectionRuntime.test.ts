import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterEngineInput,
  type FormulaExpression,
  type SpellCastingMethodDefinition,
} from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migrationPath = "supabase/migrations/20260907013219_warlock_pact_magic_selection_runtime_v2.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

const lit = (value: number): FormulaExpression => ({ kind: "literal", value })
const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })
const spellDc = add(lit(8), ref("core.proficiencyBonus"), ref("abilities.charisma.modifier"))
const spellAttack = add(ref("core.proficiencyBonus"), ref("abilities.charisma.modifier"))

function pactMethod(spellLevel: number, castLevel: number): SpellCastingMethodDefinition {
  return {
    key: spellLevel === 0 ? "warlock-cantrip" : `warlock-pact-${castLevel}`,
    kind: "pact_magic",
    ability: "charisma",
    saveDc: spellDc,
    attackBonus: spellAttack,
    requiresPrepared: false,
    ...(spellLevel === 0 ? {} : {
      resourceOptions: [{
        key: `warlock-pact-${castLevel}`,
        castLevel,
        costs: [{ key: "warlock_pact_slots", amount: 1 }],
      }],
    }),
  }
}

function pactSpell(
  slug: string,
  name: string,
  spellLevel: number,
  school: string,
  castLevel: number,
  priority: number,
  operation: "GRANT" | "REPLACE" = "GRANT",
): StoredMechanic {
  return {
    id: `warlock-test-pact-${slug}-l${priority}`,
    type: "spell",
    sourceKey: "warlock-base:pact-magic",
    key: `spell:${slug}`,
    catalogSlug: slug,
    variantKey: `warlock-base:pact-magic:${slug}`,
    grantOperation: operation,
    priority,
    payload: {
      spell: { name, level: spellLevel, school },
      preparation: { mode: "always_prepared" },
      methods: [pactMethod(spellLevel, castLevel)],
    },
  } as StoredMechanic
}

function feature(id: string, key: string, label: string, description: string): StoredMechanic {
  return {
    id,
    type: "grant",
    target: "feature",
    key,
    sourceKey: "warlock-base:pact-magic",
    payload: { label, description },
  } as StoredMechanic
}

function resource(max: number, priority: number): StoredMechanic {
  return {
    id: `warlock-test-pact-slots-l${priority}`,
    type: "resource",
    sourceKey: "warlock-base:pact-magic",
    key: "warlock_pact_slots",
    label: "Ячейки Магии договора",
    max,
    recharge: ["short_rest", "long_rest"],
    initial: "full",
    grantOperation: "REPLACE",
    priority,
  } as StoredMechanic
}

function value(key: string, label: string, amount: number, priority: number): StoredMechanic {
  return {
    id: `warlock-test-${key}-l${priority}`,
    type: "grant",
    target: "value",
    key,
    sourceKey: "warlock-base:pact-magic",
    grantOperation: "REPLACE",
    priority,
    payload: { label, value: amount },
  } as StoredMechanic
}

const cantripData = {
  "eldritch-blast": ["Мистический заряд", "Evocation"],
  "mage-hand": ["Волшебная рука", "Conjuration"],
  "minor-illusion": ["Малая иллюзия", "Illusion"],
} as const

const spellData = {
  hex: ["Сглаз", 1, "Enchantment", 1],
  "armor-of-agathys": ["Доспех Агатиса", 1, "Abjuration", 1],
  "misty-step": ["Туманный шаг", 2, "Conjuration", 3],
  "hold-person": ["Удержание личности", 2, "Enchantment", 3],
  counterspell: ["Контрзаклинание", 3, "Abjuration", 5],
  "hunger-of-hadar": ["Голод Хадара", 3, "Conjuration", 5],
} as const

const cantripChoice = {
  key: "warlock_pact_magic_cantrips",
  label: "Магия договора: кантрипы",
  target: "trait",
  count: 2,
  count_by_level: { 1: 2, 4: 3, 10: 4 },
  options: Object.keys(cantripData),
  option_labels: Object.fromEntries(Object.entries(cantripData).map(([slug, [name]]) => [slug, name])),
  option_mechanics: Object.fromEntries(Object.entries(cantripData).map(([slug, [name, school]]) => [
    slug,
    [pactSpell(slug, name, 0, school, 0, 1)],
  ])),
  selection_mode: "player_once",
  replacement_policy: "on_level_change",
  replacement_limit: 1,
  required: true,
  resolved_as: "class_spell",
} as unknown as RuleChoiceDefinition

const preparedChoice = {
  key: "warlock_pact_magic_spells",
  label: "Магия договора: подготовленные заклинания",
  target: "trait",
  count: 2,
  count_by_level: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 },
  options: Object.keys(spellData),
  option_labels: Object.fromEntries(Object.entries(spellData).map(([slug, [name]]) => [slug, name])),
  option_unlock_level: Object.fromEntries(Object.entries(spellData).map(([slug, [, , , unlock]]) => [slug, unlock])),
  option_mechanics: Object.fromEntries(Object.entries(spellData).map(([slug, [name, level, school]]) => [
    slug,
    [pactSpell(slug, name, level, school, level, 1)],
  ])),
  option_mechanics_by_level: Object.fromEntries(Object.entries(spellData).map(([slug, [name, level, school]]) => [
    slug,
    {
      3: [pactSpell(slug, name, level, school, Math.max(level, 2), 3, "REPLACE")],
      5: [pactSpell(slug, name, level, school, 3, 5, "REPLACE")],
    },
  ])),
  selection_mode: "player_once",
  replacement_policy: "on_level_change",
  replacement_limit: 1,
  required: true,
  resolved_as: "class_spell",
} as unknown as RuleChoiceDefinition

const levels: Array<{ level: number; mechanics: StoredMechanics; choices: RuleChoiceDefinition[] }> = [
  {
    level: 1,
    mechanics: [
      feature(
        "warlock-test-pact-magic-rules",
        "pact_magic",
        "Магия договора",
        "Харизма — характеристика заклинаний колдуна. Заклинания 1–5 уровня расходуют одну ячейку Магии договора текущего уровня; все ячейки восстанавливаются после короткого или долгого отдыха.",
      ),
      resource(1, 1),
      value("warlock_pact_slot_level", "Уровень ячейки Магии договора", 1, 1),
      value("warlock_cantrip_count", "Кантрипы колдуна", 2, 1),
      value("warlock_prepared_spell_limit", "Подготовленные заклинания колдуна", 2, 1),
    ],
    choices: [cantripChoice, preparedChoice],
  },
  {
    level: 2,
    mechanics: [
      resource(2, 2),
      value("warlock_prepared_spell_limit", "Подготовленные заклинания колдуна", 3, 2),
    ],
    choices: [],
  },
  {
    level: 3,
    mechanics: [
      value("warlock_pact_slot_level", "Уровень ячейки Магии договора", 2, 3),
      value("warlock_prepared_spell_limit", "Подготовленные заклинания колдуна", 4, 3),
    ],
    choices: [],
  },
  {
    level: 4,
    mechanics: [
      value("warlock_cantrip_count", "Кантрипы колдуна", 3, 4),
      value("warlock_prepared_spell_limit", "Подготовленные заклинания колдуна", 5, 4),
    ],
    choices: [],
  },
  {
    level: 5,
    mechanics: [
      value("warlock_pact_slot_level", "Уровень ячейки Магии договора", 3, 5),
      value("warlock_prepared_spell_limit", "Подготовленные заклинания колдуна", 6, 5),
    ],
    choices: [],
  },
]

function bundleAt(level: number): CharacterTemplateBundle {
  const selectedCantrips = Object.keys(cantripData).slice(0, level >= 4 ? 3 : 2)
  const preparedCount = level >= 5 ? 6 : level === 4 ? 5 : level === 3 ? 4 : level === 2 ? 3 : 2
  const selectedSpells = Object.entries(spellData)
    .filter(([, [, , , unlock]]) => unlock <= level)
    .slice(0, preparedCount)
    .map(([slug]) => slug)

  return {
    assignment: {
      id: "assignment-warlock-stage2-selection",
      character_id: "character-warlock-stage2-selection",
      template_id: "class-warlock-stage2-selection",
      template_level: level,
      selected_choices: {
        warlock_pact_magic_cantrips: selectedCantrips,
        warlock_pact_magic_spells: selectedSpells,
      } as never,
      assigned_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    template: {
      id: "class-warlock-stage2-selection",
      campaign_id: "campaign",
      kind: "class",
      slug: "warlock-stage2-selection",
      name: "Колдун",
      description: "Базовый Колдун 2024 с выбором заклинаний Магии договора.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:warlock",
      catalog_revision: "xphb-2024-warlock-pact-selection-v2",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Магия договора использует постоянный выбор кантрипов и подготовленных заклинаний, отдельные ячейки и текущий уровень ячейки.",
      is_active: true,
      created_by: null,
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    levels: levels
      .filter((entry) => entry.level <= level)
      .map((entry) => ({
        id: `warlock-stage2-selection-l${entry.level}`,
        template_id: "class-warlock-stage2-selection",
        level: entry.level,
        mechanics: entry.mechanics,
        choices: entry.choices,
      })),
  }
}

function contractAt(level: number) {
  const source = bundleAt(level)
  const parsed = resolveTemplateBundles([source], level)
  const input: CharacterEngineInput = {
    base: {
      id: "warlock-stage2-selection",
      name: "Колдун",
      level,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 40,
      baseSpeed: 30,
    },
    state: { currentHp: 40, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  }
  return { source, parsed, contract: resolveCharacterContract(input) }
}

test("Stage 2 migration installs persistent Pact Magic cantrip and prepared-spell choices", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:warlock/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/warlockPactMagicSelectionRuntime\.test\.ts/i)
  assert.match(migration, /warlock_pact_magic_cantrips/)
  assert.match(migration, /warlock_pact_magic_spells/)
  assert.match(migration, /'replacement_policy','on_level_change'/)
  assert.match(migration, /'replacement_limit',1/)
  assert.match(migration, /'1',2,'4',3,'10',4/)
  assert.match(migration, /'17',14,'19',15/)
})

test("Stage 2 package passes strict class quality and resource policy through parser and CE", () => {
  const { source, parsed, contract } = contractAt(5)
  assert.doesNotThrow(() => assertClassPackageQuality([source]))
  assert.doesNotThrow(() => assertClassResourcePolicy([source]))
  assert.ok(parsed.contributions.length > 0)
  assert.equal(contract.resources.find((entry) => entry.key === "warlock_pact_slots")?.max.value, 2)
  assert.equal(contract.values.find((entry) => entry.key === "warlock_pact_slot_level")?.value.value, 3)
})

test("selected Pact Magic spells become real CE spell access and spend only pact slots", () => {
  const { contract } = contractAt(5)
  const hex = contract.spells.find((entry) => entry.key === "spell:hex")
  assert.ok(hex)
  const access = hex.accesses.find((entry) => entry.key.includes("warlock-base:pact-magic"))
  assert.ok(access)
  assert.equal(access.preparationMode, "always_prepared")
  const method = access.methods.find((entry) => entry.kind === "pact_magic")
  assert.ok(method)
  assert.equal(method.resourceOptions[0]?.castLevel, 3)
  assert.deepEqual(method.resourceOptions[0]?.costs, [{ key: "warlock_pact_slots", amount: 1, variantKey: "default" }])
  assert.equal(method.resourceOptions.some((option) => option.costs.some((cost) => cost.key.startsWith("spell_slot_"))), false)
})

test("Warlock cantrips are real Charisma spell access with no slot payment", () => {
  const { contract } = contractAt(5)
  const blast = contract.spells.find((entry) => entry.key === "spell:eldritch-blast")
  assert.ok(blast)
  const access = blast.accesses.find((entry) => entry.key.includes("warlock-base:pact-magic"))
  assert.ok(access)
  const method = access.methods.find((entry) => entry.kind === "pact_magic")
  assert.ok(method)
  assert.equal(method.ability, "charisma")
  assert.equal(method.resourceOptions.length, 0)
})

test("Pact cast RPC authorizes the Warlock choice and reads current runtime slot level", () => {
  assert.match(migration, /selected_choices->'warlock_pact_magic_spells'/)
  assert.match(migration, /character_runtime_value_snapshot\(p_character_id,'warlock_pact_slot_level'\)/)
  assert.match(migration, /state_key='warlock_pact_slots'/)
  assert.doesNotMatch(migration, /from\s+public\.character_spells\s+cs/i)
  assert.match(migration, /Warlock spell is not selected by Pact Magic/)
})

test("Pact selection installer covers existing and future campaigns", () => {
  assert.match(migration, /install_warlock_pact_magic_selection_v2/)
  assert.match(migration, /create trigger zzzzzzzb2_campaigns_apply_warlock_pact_magic_selection_v2/)
  assert.match(migration, /for r in select id from public\.campaigns loop/)
  assert.match(migration, /xphb-2024-warlock-pact-selection-v2/)
})
