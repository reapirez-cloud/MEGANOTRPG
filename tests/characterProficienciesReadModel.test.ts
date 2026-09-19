import assert from "node:assert/strict"
import test from "node:test"

import type {
  AbilityKey,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedSourceRef,
} from "../src/character-engine/index.ts"
import {
  CHARACTER_PROFICIENCY_GROUP_ORDER,
  characterProficiencyCatalogCount,
} from "../src/ui-v1-isolated/characterProficienciesCatalog.ts"
import {
  buildCharacterProficienciesReadModel,
} from "../src/ui-v1-isolated/characterProficienciesReadModel.ts"

function source(
  contributionId: string,
  sourceId: string,
  name: string,
): ResolvedSourceRef {
  return {
    contributionId,
    source: {
      id: sourceId,
      name,
      sourceType: "test_template",
      visibility: "campaign",
    },
  }
}

function grant(
  target: "proficiency" | "language",
  key: string,
  label: string,
  sources: ResolvedSourceRef[],
  rank: 1 | 2 = 1,
): ResolvedGrant {
  return {
    target,
    key,
    variantKey: "",
    payload:
      target === "proficiency"
        ? { rank, label }
        : { label },
    sources,
  }
}

function contract(args?: {
  proficiencies?: ResolvedGrant[]
  languages?: ResolvedGrant[]
  savingThrows?: Partial<
    Record<
      AbilityKey,
      {
        proficiencyRank: 0 | 1 | 2
        proficiencySources: ResolvedSourceRef[]
      }
    >
  >
}): ResolvedCharacterContract {
  const abilities: AbilityKey[] = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ]

  const savingThrows = Object.fromEntries(
    abilities.map((ability) => [
      ability,
      {
        ability,
        proficiencyRank:
          args?.savingThrows?.[ability]?.proficiencyRank || 0,
        proficiencySources:
          args?.savingThrows?.[ability]?.proficiencySources || [],
        bonus: {
          value: 0,
          baseValue: 0,
          sources: [],
        },
      },
    ]),
  )

  return {
    capabilities: {
      resistances: [],
      immunities: [],
      languages: args?.languages || [],
      proficiencies: args?.proficiencies || [],
      senses: [],
      features: [],
      traits: [],
    },
    savingThrows,
  } as unknown as ResolvedCharacterContract
}

test("stage 1 freezes the five reference groups in the intended order", () => {
  const model = buildCharacterProficienciesReadModel({
    contract: contract(),
  })

  assert.deepEqual(
    model.groups.map((group) => group.key),
    CHARACTER_PROFICIENCY_GROUP_ORDER,
  )
  assert.deepEqual(
    model.groups.map((group) => group.label),
    ["Оружие", "Доспехи", "Инструменты", "Языки", "Спасброски"],
  )
  assert.ok(model.groups.every((group) => group.currentCount === 0))
})

test("only closed catalogs expose a trustworthy denominator", () => {
  assert.equal(characterProficiencyCatalogCount("armor"), 4)
  assert.equal(characterProficiencyCatalogCount("saving_throws"), 6)

  assert.equal(characterProficiencyCatalogCount("weapons"), null)
  assert.equal(characterProficiencyCatalogCount("tools"), null)
  assert.equal(characterProficiencyCatalogCount("languages"), null)
})

test("runtime grants are categorized, deduplicated and keep provenance", () => {
  const fighter = source(
    "fighter-simple",
    "template:class:fighter:simple",
    "Воин",
  )
  const elf = source(
    "elf-simple",
    "template:race:elf:simple",
    "Эльф",
  )
  const druid = source(
    "druidic",
    "template:class:druid:druidic",
    "Друид",
  )

  const model = buildCharacterProficienciesReadModel({
    contract: contract({
      proficiencies: [
        grant(
          "proficiency",
          "weapon:simple",
          "Простое оружие",
          [fighter],
        ),
        grant(
          "proficiency",
          "weapon:simple",
          "Простое оружие",
          [elf],
        ),
        grant(
          "proficiency",
          "armor:light",
          "Лёгкие доспехи",
          [fighter],
        ),
        grant(
          "proficiency",
          "tool:herbalism-kit",
          "Набор травника",
          [druid],
        ),
      ],
      languages: [
        grant(
          "language",
          "druidic",
          "Друидический",
          [druid],
        ),
      ],
      savingThrows: {
        strength: {
          proficiencyRank: 1,
          proficiencySources: [fighter],
        },
        constitution: {
          proficiencyRank: 1,
          proficiencySources: [fighter],
        },
      },
    }),
  })

  const weapons = model.groups.find(
    (group) => group.key === "weapons",
  )!
  const armor = model.groups.find(
    (group) => group.key === "armor",
  )!
  const tools = model.groups.find(
    (group) => group.key === "tools",
  )!
  const languages = model.groups.find(
    (group) => group.key === "languages",
  )!
  const saves = model.groups.find(
    (group) => group.key === "saving_throws",
  )!

  assert.equal(weapons.currentCount, 1)
  assert.equal(weapons.rows[0].key, "weapon:simple")
  assert.deepEqual(
    weapons.rows[0].sources.map((entry) => entry.name).sort(),
    ["Воин", "Эльф"].sort(),
  )

  assert.deepEqual(
    armor.rows.map((row) => row.label),
    ["Лёгкие доспехи"],
  )
  assert.deepEqual(
    tools.rows.map((row) => row.label),
    ["Набор травника"],
  )
  assert.deepEqual(
    languages.rows.map((row) => row.label),
    ["Друидический"],
  )
  assert.deepEqual(
    saves.rows.map((row) => row.label),
    ["Сила", "Телосложение"],
  )
  assert.ok(
    [...weapons.rows, ...armor.rows, ...tools.rows, ...languages.rows, ...saves.rows]
      .every((row) => row.origin === "character-engine"),
  )
})

test("legacy data fills gaps but never replaces a runtime-owned row", () => {
  const fighter = source(
    "fighter-simple",
    "template:class:fighter:simple",
    "Воин",
  )

  const model = buildCharacterProficienciesReadModel({
    contract: contract({
      proficiencies: [
        grant(
          "proficiency",
          "weapon:simple",
          "Простое оружие",
          [fighter],
        ),
      ],
    }),
    legacy: {
      proficiencies:
        "Лёгкие, средние и тяжёлые доспехи; щиты; простое и воинское оружие",
      languages: "Общий; Друидический",
      saving_throw_proficiencies: ["strength", "constitution"],
    },
  })

  const weapons = model.groups.find(
    (group) => group.key === "weapons",
  )!
  const armor = model.groups.find(
    (group) => group.key === "armor",
  )!
  const languages = model.groups.find(
    (group) => group.key === "languages",
  )!
  const saves = model.groups.find(
    (group) => group.key === "saving_throws",
  )!

  assert.deepEqual(
    weapons.rows.map((row) => [row.key, row.origin]),
    [
      ["weapon:simple", "character-engine"],
      ["weapon:martial", "legacy"],
    ],
  )
  assert.deepEqual(
    armor.rows.map((row) => row.key),
    [
      "armor:light",
      "armor:medium",
      "armor:heavy",
      "armor:shield",
    ],
  )
  assert.deepEqual(
    languages.rows.map((row) => row.label),
    ["Общий", "Друидический"],
  )
  assert.deepEqual(
    saves.rows.map((row) => row.label),
    ["Сила", "Телосложение"],
  )
})

test("legacy parser does not turn explicit absence into ownership", () => {
  const model = buildCharacterProficienciesReadModel({
    contract: contract(),
    legacy: {
      proficiencies:
        "Без доспехов и щита. Акробатика — экспертиза.",
      languages: "",
      saving_throw_proficiencies: [],
    },
  })

  const armor = model.groups.find(
    (group) => group.key === "armor",
  )!

  assert.equal(armor.currentCount, 0)
  assert.deepEqual(
    model.unclassifiedLegacyTokens,
    ["Акробатика — экспертиза"],
  )
})

test("unknown proficiency keys stay explicit instead of leaking into the five panels", () => {
  const skillSource = source(
    "skill-perception",
    "template:race:elf:perception",
    "Эльф",
  )

  const model = buildCharacterProficienciesReadModel({
    contract: contract({
      proficiencies: [
        grant(
          "proficiency",
          "skill:perception",
          "Внимательность",
          [skillSource],
        ),
      ],
    }),
    legacy: {
      proficiencies:
        "Ключевой исходный навык: Внимательность",
      languages: "",
      saving_throw_proficiencies: [],
    },
  })

  assert.deepEqual(
    model.unclassifiedRuntimeKeys,
    ["skill:perception"],
  )
  assert.deepEqual(
    model.unclassifiedLegacyTokens,
    ["Ключевой исходный навык: Внимательность"],
  )
  assert.equal(
    model.groups.reduce(
      (total, group) => total + group.currentCount,
      0,
    ),
    0,
  )
})
