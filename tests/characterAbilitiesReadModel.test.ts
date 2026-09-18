import assert from "node:assert/strict"
import test from "node:test"

import type {
  CharacterContribution,
  ResolvedCharacterContract,
} from "../src/character-engine/index.ts"
import type { TemplateSourceNode } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import {
  buildCharacterAbilitiesReadModel,
  CHARACTER_ABILITY_GROUP_ORDER,
} from "../src/ui-v1-isolated/characterAbilitiesReadModel.ts"

const classRoot = "template:class:class-fighter:v1"
const classFeature = classRoot + ":source:second-wind"
const subclassRoot = "template:subclass:sub-battle-master:v1"
const subclassFeature = subclassRoot + ":source:riposte"
const raceRoot = "template:race:race-elf:v1"
const raceFeature = raceRoot + ":source:fey-ancestry"
const subraceRoot = "template:subrace:subrace-high-elf:v1"
const subraceFeature = subraceRoot + ":source:magic-sense"

function source(
  id: string,
  name: string,
  sourceType: string,
  parentSourceId?: string,
) {
  return {
    id,
    name,
    sourceType,
    visibility: "campaign" as const,
    ...(parentSourceId ? { parentSourceId } : {}),
  }
}

function grant(
  id: string,
  sourceId: string,
  sourceName: string,
  sourceType: string,
  target: "feature" | "trait" | "action",
  key: string,
  payload: Record<string, unknown>,
  parentSourceId?: string,
): CharacterContribution {
  return {
    id,
    kind: "grant",
    operation: "GRANT",
    target,
    key,
    payload,
    source: source(
      sourceId,
      sourceName,
      sourceType,
      parentSourceId,
    ),
  } as CharacterContribution
}

function sourceNodes(): TemplateSourceNode[] {
  return [
    {
      id: classRoot,
      name: "Воин",
      sourceType: "class_template",
      nodeKind: "template",
      templateId: "class-fighter",
      templateKind: "class",
      unlockLevel: 1,
      mechanicIds: [],
    },
    {
      id: classFeature,
      parentSourceId: classRoot,
      name: "Второе дыхание",
      sourceType: "class_template",
      nodeKind: "mechanic",
      templateId: "class-fighter",
      templateKind: "class",
      unlockLevel: 1,
      mechanicIds: ["second-wind-feature"],
    },
    {
      id: subclassRoot,
      name: "Мастер битвы",
      sourceType: "subclass_template",
      nodeKind: "template",
      templateId: "sub-battle-master",
      templateKind: "subclass",
      unlockLevel: 3,
      mechanicIds: [],
    },
    {
      id: subclassFeature,
      parentSourceId: subclassRoot,
      name: "Контратака",
      sourceType: "subclass_template",
      nodeKind: "mechanic",
      templateId: "sub-battle-master",
      templateKind: "subclass",
      unlockLevel: 3,
      mechanicIds: ["riposte-feature"],
    },
    {
      id: raceRoot,
      name: "Эльф",
      sourceType: "race_template",
      nodeKind: "template",
      templateId: "race-elf",
      templateKind: "race",
      unlockLevel: 1,
      mechanicIds: [],
    },
    {
      id: raceFeature,
      parentSourceId: raceRoot,
      name: "Эльфийская кровь",
      sourceType: "race_template",
      nodeKind: "mechanic",
      templateId: "race-elf",
      templateKind: "race",
      unlockLevel: 1,
      mechanicIds: ["fey-ancestry"],
    },
    {
      id: subraceRoot,
      name: "Высший эльф",
      sourceType: "subrace_template",
      nodeKind: "template",
      templateId: "subrace-high-elf",
      templateKind: "subrace",
      unlockLevel: 1,
      mechanicIds: [],
    },
    {
      id: subraceFeature,
      parentSourceId: subraceRoot,
      name: "Чувство магии",
      sourceType: "subrace_template",
      nodeKind: "mechanic",
      templateId: "subrace-high-elf",
      templateKind: "subrace",
      unlockLevel: 1,
      mechanicIds: ["magic-sense"],
    },
  ]
}

function fighterBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-fighter",
      character_id: "character-1",
      template_id: "class-fighter",
      template_level: 5,
      selected_choices: {},
      assigned_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    template: {
      id: "class-fighter",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "fighter",
      name: "Воин",
      description: "",
      version: 1,
      mechanics: [{
        id: "second-wind-feature",
        type: "grant",
        target: "feature",
        key: "second-wind",
        sourceKey: "second-wind",
        payload: {
          label: "Второе дыхание",
          description: "Восстанавливает силы в бою.",
        },
        presentation: {
          icon: "feature:second-wind",
          authorExplanation: "Даже мясу иногда разрешают не умирать.",
          authorNuances: ["Не заменяет отдых."],
          authorComment: "Береги до тех пор, пока действительно не понадобится.",
        },
      }],
      choices: [],
      parent_template_id: null,
      unlock_level: 1,
      catalog_key: "class:fighter",
      catalog_revision: "test",
      source_kind: "official",
      source_label: "test",
      is_builtin: true,
      mechanical_summary: "",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    levels: [],
  }
}

function contract(): ResolvedCharacterContract {
  return {
    actions: [{
      key: "riposte",
      variantKey: "",
      stateKey: "riposte",
      label: "Контратака",
      economy: "reaction",
      damage: [],
      resourceCosts: [],
      costOptions: [],
      requirements: [],
      effects: [],
      tags: [],
      available: false,
      sources: [{
        contributionId: "riposte-action",
        source: source(
          subclassFeature,
          "Контратака",
          "subclass_template",
          subclassRoot,
        ),
      }],
    }],
    rules: [{
      key: "riposte",
      variantKey: "",
      label: "Контратака",
      description: "Ответный удар.",
      mechanic: { kind: "reaction" },
      integration: "structured",
      sources: [{
        contributionId: "riposte-feature",
        source: source(
          subclassFeature,
          "Контратака",
          "subclass_template",
          subclassRoot,
        ),
      }],
    }],
  } as unknown as ResolvedCharacterContract
}

test("abilities read-model always exposes the five approved groups in reference order", () => {
  const model = buildCharacterAbilitiesReadModel({
    contract: contract(),
    contributions: [],
    sourceNodes: [],
  })

  assert.deepEqual(
    model.groups.map((group) => group.key),
    CHARACTER_ABILITY_GROUP_ORDER,
  )
  assert.deepEqual(
    model.groups.map((group) => group.label),
    ["Класс", "Подкласс", "Раса", "Предыстория", "Эффекты"],
  )
  assert.ok(model.groups.every((group) => group.rows.length === 0))
})

test("read-model separates class, subclass and ancestry while merging race + subrace into one player group", () => {
  const contributions: CharacterContribution[] = [
    grant(
      "second-wind",
      classFeature,
      "Второе дыхание",
      "class_template",
      "feature",
      "second-wind",
      {
        label: "Второе дыхание",
        description: "Восстанавливает силы в бою.",
      },
      classRoot,
    ),
    grant(
      "riposte-feature",
      subclassFeature,
      "Контратака",
      "subclass_template",
      "feature",
      "riposte",
      {
        label: "Контратака",
        description: "Ответный удар.",
      },
      subclassRoot,
    ),
    grant(
      "fey-ancestry",
      raceFeature,
      "Эльфийская кровь",
      "race_template",
      "trait",
      "fey-ancestry",
      { label: "Эльфийская кровь" },
      raceRoot,
    ),
    grant(
      "magic-sense",
      subraceFeature,
      "Чувство магии",
      "subrace_template",
      "trait",
      "magic-sense",
      { label: "Чувство магии" },
      subraceRoot,
    ),
    grant(
      "background-contact",
      "background:sellsword:contacts",
      "Связи в подполье",
      "background_feature",
      "feature",
      "contacts",
      { label: "Связи в подполье" },
    ),
    grant(
      "effect-blessing",
      "effect:shadow-blessing",
      "Благословение Тени",
      "status_effect",
      "feature",
      "shadow-blessing",
      { label: "Благословение Тени" },
    ),
    grant(
      "item-feature",
      "item:sword-1",
      "Старый меч",
      "inventory_item",
      "trait",
      "sharp",
      { label: "Острое лезвие" },
    ),
  ]

  const model = buildCharacterAbilitiesReadModel({
    contract: contract(),
    contributions,
    sourceNodes: sourceNodes(),
    suppressedSourceIds: [classFeature],
    templateBundles: [fighterBundle()],
  })

  const classGroup = model.groups.find((group) => group.key === "class")!
  const subclassGroup = model.groups.find((group) => group.key === "subclass")!
  const raceGroup = model.groups.find((group) => group.key === "race")!
  const backgroundGroup = model.groups.find((group) => group.key === "background")!
  const effectGroup = model.groups.find((group) => group.key === "effect")!

  assert.equal(classGroup.rows.length, 1)
  assert.equal(classGroup.rows[0].label, "Второе дыхание")
  assert.equal(classGroup.rows[0].sourceName, "Воин")
  assert.equal(classGroup.rows[0].sourceId, classFeature)
  assert.equal(classGroup.rows[0].status, "suppressed")
  assert.equal(classGroup.rows[0].icon, "feature:second-wind")
  assert.equal(
    classGroup.rows[0].voss.explanation,
    "Даже мясу иногда разрешают не умирать.",
  )
  assert.deepEqual(
    classGroup.rows[0].voss.nuances,
    ["Не заменяет отдых."],
  )
  assert.equal(classGroup.rows[0].capabilities.suppress, true)
  assert.equal(classGroup.activeCount, 0)
  assert.equal(classGroup.suppressedCount, 1)

  assert.equal(subclassGroup.rows.length, 1)
  assert.equal(subclassGroup.rows[0].sourceName, "Мастер битвы")
  assert.equal(subclassGroup.rows[0].runtimeAvailable, false)
  assert.equal(subclassGroup.rows[0].mechanics.length, 1)

  assert.deepEqual(
    raceGroup.rows.map((row) => row.label).sort(),
    ["Чувство магии", "Эльфийская кровь"].sort(),
  )
  assert.deepEqual(
    raceGroup.sourceNames.sort(),
    ["Высший эльф", "Эльф"].sort(),
  )

  assert.equal(backgroundGroup.rows[0].label, "Связи в подполье")
  assert.equal(effectGroup.rows[0].label, "Благословение Тени")
  assert.deepEqual(model.unclassifiedSourceIds, ["item:sword-1"])
})

test("root suppression keeps earned child ability visible but marks it suppressed", () => {
  const model = buildCharacterAbilitiesReadModel({
    contract: contract(),
    contributions: [
      grant(
        "riposte-feature",
        subclassFeature,
        "Контратака",
        "subclass_template",
        "feature",
        "riposte",
        { label: "Контратака" },
        subclassRoot,
      ),
    ],
    sourceNodes: sourceNodes(),
    suppressedSourceIds: [subclassRoot],
  })

  const row = model.groups
    .find((group) => group.key === "subclass")!
    .rows[0]

  assert.ok(row)
  assert.equal(row.status, "suppressed")
  assert.equal(row.sourceId, subclassFeature)
})

test("legacy manual feature aliases dedupe without inventing an unsafe suppression target", () => {
  const legacySource = source(
    "legacy-feature:manual-1",
    "Ручная особенность",
    "legacy_feature",
  )
  const mechanicsSource = source(
    "feature:manual-1",
    "Ручная особенность",
    "character_feature",
  )

  const model = buildCharacterAbilitiesReadModel({
    contract: contract(),
    contributions: [
      {
        id: "legacy-feature-row",
        kind: "grant",
        operation: "GRANT",
        target: "feature",
        key: "manual-1",
        payload: {
          label: "Ручная особенность",
          kind: "class_feature",
          legacyFeatureId: "manual-1",
        },
        source: legacySource,
      },
      {
        id: "manual-bonus",
        kind: "numeric",
        target: "combat.ac",
        operation: "ADD",
        value: 1,
        source: mechanicsSource,
      },
    ],
    sourceNodes: [],
  })

  const rows = model.groups.find((group) => group.key === "class")!.rows

  assert.equal(rows.length, 1)
  assert.deepEqual(
    rows[0].sourceIds,
    ["feature:manual-1", "legacy-feature:manual-1"],
  )
  assert.equal(rows[0].sourceId, null)
  assert.equal(rows[0].capabilities.suppress, false)
})
