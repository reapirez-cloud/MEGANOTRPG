import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import {
  featureMechanicContributions,
} from "../src/lib/characterMechanics.ts"
import {
  resolveTemplateBundles,
} from "../src/rule-templates/resolver.ts"
import type {
  CharacterTemplateBundle,
  RuleChoiceDefinition,
  RuleTemplateKind,
} from "../src/rule-templates/types.ts"
import type {
  CharacterFeature,
} from "../src/types/characterSheet.ts"
import type {
  StoredMechanic,
} from "../src/types/characterMechanics.ts"
import {
  buildCharacterProficienciesReadModel,
} from "../src/ui-v1-isolated/characterProficienciesReadModel.ts"

const createdAt = "2026-09-19T00:00:00Z"

function grant(
  id: string,
  target: "proficiency" | "language",
  key: string,
  label: string,
): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey: id,
    target,
    key,
    payload:
      target === "proficiency"
        ? { rank: 1, label }
        : { label },
  }
}

function bundle(args: {
  id: string
  kind: RuleTemplateKind
  name: string
  mechanics?: StoredMechanic[]
  choices?: RuleChoiceDefinition[]
  selectedChoices?: Record<string, string | string[]>
  parentTemplateId?: string
}): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment:" + args.id,
      character_id: "character-stage4",
      template_id: args.id,
      template_level: 5,
      selected_choices: args.selectedChoices || {},
      assigned_at: createdAt,
      updated_at: createdAt,
    },
    template: {
      id: args.id,
      campaign_id: "campaign-stage4",
      kind: args.kind,
      slug: args.id,
      name: args.name,
      description: args.name,
      version: 1,
      mechanics: args.mechanics || [],
      choices: args.choices || [],
      parent_template_id: args.parentTemplateId || null,
      unlock_level: args.kind === "subclass" ? 3 : null,
      catalog_key: args.kind + ":" + args.id,
      is_active: true,
      created_by: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    levels: [],
  }
}

function feature(
  id: string,
  kind: CharacterFeature["kind"],
  mechanic: StoredMechanic,
): CharacterFeature {
  return {
    id,
    character_id: "character-stage4",
    kind,
    name: id,
    description: id,
    mechanics: [mechanic],
    sort_order: 0,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

test("stage 4 resolves templates, choices and feature sources into canonical five-panel data", () => {
  const classBundle = bundle({
    id: "class-fighter",
    kind: "class",
    name: "Воин",
    mechanics: [
      grant(
        "fighter-heavy",
        "proficiency",
        "category:heavy_armor",
        "Тяжёлая броня",
      ),
      grant(
        "fighter-save",
        "proficiency",
        "savingThrow:strength",
        "Спасбросок: Сила",
      ),
    ],
    choices: [
      {
        key: "class-tool",
        label: "Инструмент",
        target: "proficiency",
        count: 1,
        options: ["tool:brewers_supplies"],
        option_labels: {
          "tool:brewers_supplies": "Инструменты пивовара",
        },
      },
      {
        key: "class-skill",
        label: "Навык",
        target: "proficiency",
        count: 1,
        options: ["skill:performance"],
        option_labels: {
          "skill:performance": "Выступление",
        },
      },
    ],
    selectedChoices: {
      "class-tool": "tool:brewers_supplies",
      "class-skill": "skill:performance",
    },
  })

  const subclassBundle = bundle({
    id: "subclass-forge",
    kind: "subclass",
    name: "Кузнец",
    parentTemplateId: classBundle.template.id,
    mechanics: [
      grant(
        "forge-smith",
        "proficiency",
        "tool:smith_tools",
        "Инструменты кузнеца",
      ),
    ],
  })

  const raceBundle = bundle({
    id: "race-test",
    kind: "race",
    name: "Народ",
    mechanics: [
      grant(
        "race-common",
        "language",
        "language:common",
        "Общий",
      ),
    ],
  })

  const features = [
    feature(
      "Предыстория",
      "background_feature",
      grant(
        "background-goblin",
        "language",
        "language:goblin",
        "Гоблинский",
      ),
    ),
    feature(
      "Талант",
      "feat",
      grant(
        "feat-war-pick",
        "proficiency",
        "weapon:war_pick",
        "Боевая кирка",
      ),
    ),
    feature(
      "Эффект",
      "effect",
      grant(
        "effect-herbalism",
        "proficiency",
        "tool:herbalism_kit",
        "Набор травника",
      ),
    ),
  ]

  const parsed = resolveTemplateBundles(
    [classBundle, subclassBundle, raceBundle],
    5,
  )
  const input: CharacterEngineInput = {
    base: {
      id: "character-stage4",
      name: "Stage 4",
      level: 5,
      abilities: {
        strength: 16,
        dexterity: 12,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      baseMaxHp: 40,
      baseSpeed: 30,
    },
    state: {
      currentHp: 40,
      tempHp: 0,
      resources: {},
    },
    contributions: [
      ...parsed.contributions,
      ...featureMechanicContributions(features),
    ],
  }

  const contract = resolveCharacterContract(input)
  const model = buildCharacterProficienciesReadModel({ contract })

  assert.ok(
    contract.capabilities.proficiencies.some(
      (entry) =>
        entry.key === "armor:heavy" &&
        (entry.payload as Record<string, unknown>).label === "Тяжёлая броня",
    ),
  )
  assert.ok(
    contract.capabilities.proficiencies.some(
      (entry) =>
        entry.key === "tool:brewer-supplies" &&
        (entry.payload as Record<string, unknown>).label ===
          "Инструменты пивовара",
    ),
  )

  assert.deepEqual(
    model.groups.find((group) => group.key === "armor")!.rows.map(
      (row) => row.key,
    ),
    ["armor:heavy"],
  )
  assert.deepEqual(
    model.groups.find((group) => group.key === "weapons")!.rows.map(
      (row) => row.key,
    ),
    ["weapon:war-pick"],
  )
  assert.deepEqual(
    new Set(
      model.groups.find((group) => group.key === "tools")!.rows.map(
        (row) => row.key,
      ),
    ),
    new Set([
      "tool:brewer-supplies",
      "tool:herbalism-kit",
      "tool:smith-tools",
    ]),
  )
  assert.deepEqual(
    new Set(
      model.groups.find((group) => group.key === "languages")!.rows.map(
        (row) => row.key,
      ),
    ),
    new Set(["common", "goblin"]),
  )
  assert.deepEqual(
    model.groups.find((group) => group.key === "saving_throws")!.rows.map(
      (row) => row.key,
    ),
    ["savingThrow:strength"],
  )

  assert.deepEqual(model.unclassifiedRuntimeKeys, [])
  assert.equal(
    contract.skills.performance.proficiencyRank,
    1,
    "skill choice still resolves in CE while remaining outside this screen",
  )

  const provenanceNames = new Set(
    model.groups.flatMap((group) =>
      group.rows.flatMap((row) =>
        row.sources.map((source) => source.name),
      ),
    ),
  )
  for (const name of [
    "Тяжёлая броня",
    "Инструменты кузнеца",
    "Инструмент: Инструменты пивовара",
    "Народ",
    "Предыстория",
    "Талант",
    "Эффект",
  ]) {
    assert.ok(provenanceNames.has(name), "missing provenance: " + name)
  }
})
