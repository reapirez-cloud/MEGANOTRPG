import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
} from "../src/character-engine/index.ts"
import { sourceSuppressionContributions } from "../src/lib/suppressionRuntime.ts"
import {
  buildCharacterProficienciesReadModel,
} from "../src/ui-v1-isolated/characterProficienciesReadModel.ts"
import {
  createCharacterProficiencySnakeActions,
} from "../src/ui-v1-isolated/characterProficiencySnakeActions.ts"

const sourceId =
  "template:class:fighter:v1:source:weapon-simple"

const base = {
  id: "character-stage6",
  name: "Stage 6",
  level: 5,
  abilities: {
    strength: 14,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  baseMaxHp: 40,
  baseSpeed: 30,
}

const grant: CharacterContribution = {
  id: "fighter-simple-weapons",
  kind: "grant",
  operation: "GRANT",
  target: "proficiency",
  key: "weapon:simple",
  payload: {
    rank: 1,
    label: "Простое оружие",
  },
  source: {
    id: sourceId,
    name: "Воин",
    sourceType: "class_template",
    parentSourceId: "template:class:fighter:v1",
  },
}

function suppressedModel() {
  const suppressions = sourceSuppressionContributions(
    base.id,
    [sourceId],
  )
  const contract = resolveCharacterContract({
    base,
    state: {
      currentHp: 40,
      tempHp: 0,
      resources: {},
    },
    contributions: [grant, ...suppressions],
  })

  return buildCharacterProficienciesReadModel({
    contract,
    contributions: [grant, ...suppressions],
    suppressedSourceIds: [sourceId],
    managerSuppressedSourceIds: [sourceId],
    legacy: {
      proficiencies: "Простое оружие",
      languages: "",
      saving_throw_proficiencies: [],
    },
  })
}

test("stage 6 keeps a fully suppressed CE proficiency visible and excludes it from the effective counter", () => {
  const model = suppressedModel()
  const weapons = model.groups.find(
    (group) => group.key === "weapons",
  )!
  const row = weapons.rows.find(
    (entry) => entry.key === "weapon:simple",
  )!

  assert.ok(row)
  assert.equal(row.origin, "character-engine")
  assert.equal(row.status, "suppressed")
  assert.equal(weapons.currentCount, 0)
  assert.equal(row.sources.length, 1)
  assert.equal(row.sources[0].suppressed, true)
  assert.equal(row.sources[0].directlyManagedSuppressed, true)
  assert.equal(
    row.sources[0].suppressedBySourceId,
    sourceId,
  )
})

test("legacy fallback never resurrects a suppressed CE-owned proficiency", () => {
  const row = suppressedModel()
    .groups.find((group) => group.key === "weapons")!
    .rows.find((entry) => entry.key === "weapon:simple")!

  assert.equal(row.origin, "character-engine")
  assert.equal(
    row.sources.some(
      (source) => source.sourceId === "legacy:character-sheet",
    ),
    false,
  )
})

test("manager Snake source branch can re-enable a directly suppressed source", async () => {
  const row = suppressedModel()
    .groups.find((group) => group.key === "weapons")!
    .rows[0]
  const calls: Array<{ sourceId: string; suppressed: boolean }> = []

  const actions = createCharacterProficiencySnakeActions(row, {
    canManage: true,
    setSuppressed: async (candidate, suppressed) => {
      calls.push({ sourceId: candidate, suppressed })
      return { ok: true }
    },
  })

  assert.deepEqual(
    actions.map((action) => action.id),
    [
      "inspect-character-proficiency",
      "character-proficiency-sources",
    ],
  )

  const sources = actions[1]
  assert.ok(Array.isArray(sources.children))
  const sourceBranch = Array.isArray(sources.children)
    ? sources.children[0]
    : null
  assert.ok(sourceBranch)
  assert.ok(Array.isArray(sourceBranch?.children))
  const controls = Array.isArray(sourceBranch?.children)
    ? sourceBranch.children
    : []
  assert.deepEqual(
    controls.map((action) => action.id),
    [
      "inspect-proficiency-source:0",
      "enable-proficiency-source",
    ],
  )

  const result = await controls[1].execute?.({
    entity: { type: "character-proficiency", id: "test" },
    input: undefined,
    path: [],
  })

  assert.equal(result?.type, "success")
  assert.deepEqual(calls, [{
    sourceId,
    suppressed: false,
  }])
})

test("players can inspect provenance but never receive source mutation actions", () => {
  const row = suppressedModel()
    .groups.find((group) => group.key === "weapons")!
    .rows[0]
  const actions = createCharacterProficiencySnakeActions(row, {
    canManage: false,
  })

  const sources = actions[1]
  assert.ok(Array.isArray(sources.children))
  const sourceBranch = Array.isArray(sources.children)
    ? sources.children[0]
    : null
  assert.ok(Array.isArray(sourceBranch?.children))

  assert.deepEqual(
    Array.isArray(sourceBranch?.children)
      ? sourceBranch.children.map((action) => action.id)
      : [],
    ["inspect-proficiency-source:0"],
  )
})

test("inherited suppression is visible but cannot unsafely enable a parent from one proficiency", () => {
  const parent = "template:class:fighter:v1"
  const contract = resolveCharacterContract({
    base,
    state: {
      currentHp: 40,
      tempHp: 0,
      resources: {},
    },
    contributions: [
      grant,
      ...sourceSuppressionContributions(base.id, [parent]),
    ],
  })
  const model = buildCharacterProficienciesReadModel({
    contract,
    contributions: [grant],
    sourceNodes: [{
      id: sourceId,
      parentSourceId: parent,
      name: "Простое оружие",
      sourceType: "class_template",
      nodeKind: "mechanic",
      templateId: "fighter",
      templateKind: "class",
      unlockLevel: 1,
      mechanicIds: ["fighter-simple-weapons"],
    }],
    suppressedSourceIds: [parent],
    managerSuppressedSourceIds: [parent],
  })

  const row = model.groups
    .find((group) => group.key === "weapons")!
    .rows[0]
  assert.equal(row.status, "suppressed")
  assert.equal(row.sources[0].directlyManagedSuppressed, false)
  assert.equal(row.sources[0].suppressedBySourceId, parent)

  const actions = createCharacterProficiencySnakeActions(row, {
    canManage: true,
    setSuppressed: async () => ({ ok: true }),
  })
  const sources = actions[1]
  const branch = Array.isArray(sources.children)
    ? sources.children[0]
    : null
  const children = Array.isArray(branch?.children)
    ? branch.children
    : []
  assert.equal(
    children[1]?.id,
    "inherited-proficiency-source-suppression",
  )
  assert.equal(children[1]?.enabled, false)
})

const component = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetProficiencies.tsx",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const hook = fs.readFileSync(
  "src/hooks/useCharacterSourceSuppressions.ts",
  "utf8",
)

test("the proficiencies UI reuses SnakeTrigger and the existing Oracle suppression path", () => {
  assert.match(component, /<SnakeTrigger entity=\{entity\} actions=\{actions\}>/)
  assert.doesNotMatch(
    component,
    /useLongPressItem|ContextActionSheet|onContextMenu|setContextMenu|bottom-sheet/i,
  )
  assert.match(
    view,
    /<CharacterSheetProficiencies[\s\S]*?canManage=\{control\.canManage\}[\s\S]*?onSetSuppressed=\{runtime\.templates\.suppressions\.setSuppressed\}/,
  )
  assert.match(
    view,
    /buildCharacterProficienciesReadModel\(\{[\s\S]*?contributions: snapshot\.input\.contributions[\s\S]*?sourceNodes: snapshot\.sourceNodes[\s\S]*?managerSuppressedSourceIds:/,
  )
  assert.match(
    hook,
    /oracle\.characters\.setSourceSuppressed\(/,
  )
})
