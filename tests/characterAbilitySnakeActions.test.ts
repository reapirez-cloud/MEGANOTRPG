import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  characterAbilityDetailSurface,
  characterAbilityEntity,
  createCharacterAbilitySnakeActions,
} from "../src/ui-v1-isolated/characterAbilitySnakeActions.ts"
import type { CharacterAbilityRow } from "../src/ui-v1-isolated/characterAbilitiesReadModel.ts"

function abilityRow(
  status: CharacterAbilityRow["status"] = "active",
): CharacterAbilityRow {
  return {
    id: "subclass:riposte",
    group: "subclass",
    sourceId: "template:subclass:battle-master:v1:source:riposte",
    sourceIds: ["template:subclass:battle-master:v1:source:riposte"],
    sourceName: "Мастер битвы",
    sourceNames: ["Мастер битвы"],
    sourceType: "subclass_template",
    label: "Контратака",
    shortDescription: "Ответный удар по промахнувшемуся врагу.",
    unlockLevel: 3,
    icon: "ability:subclass",
    status,
    runtimeAvailable: false,
    mechanics: [{
      key: "riposte",
      variantKey: "",
      label: "Контратака",
      description: "Использует реакцию.",
      mechanic: {
        kind: "reaction",
        trigger: "enemy_misses",
      },
      integration: "structured",
      sources: [],
    }],
    voss: {
      explanation: "Не размахивай этим как бесплатной атакой.",
      nuances: ["Нужна реакция."],
      comment: "Жди хороший момент.",
    },
    capabilities: {
      inspect: true,
      suppress: true,
    },
  }
}

test("ability detail surface exposes source, unlock level, exact mechanics and Voss text", () => {
  const surface = characterAbilityDetailSurface(abilityRow())

  assert.equal(surface.kind, "detail")
  if (surface.kind !== "detail") return

  assert.equal(surface.eyebrow, "Мастер битвы")
  assert.equal(surface.title, "Контратака")
  assert.match(surface.body || "", /Источник: Мастер битвы/)
  assert.match(surface.body || "", /Уровень открытия: 3/)
  assert.match(surface.body || "", /ПРАВИЛО \/ МЕХАНИКА/)
  assert.match(surface.body || "", /"kind": "reaction"/)
  assert.match(surface.body || "", /ВОСС/)
  assert.match(surface.body || "", /Жди хороший момент/)
})

test("suppressed ability remains inspectable and detail states that it is muted by the GM", () => {
  const surface = characterAbilityDetailSurface(
    abilityRow("suppressed"),
  )

  assert.equal(surface.kind, "detail")
  if (surface.kind !== "detail") return
  assert.match(surface.body || "", /Состояние: заглушено ведущим/)
})

test("player ability actions expose inspect only", () => {
  const row = abilityRow()
  const actions = createCharacterAbilitySnakeActions(row, {
    canManage: false,
  })

  assert.deepEqual(
    actions.map((action) => action.id),
    ["inspect-character-ability"],
  )
  assert.equal(actions[0].label, "Подробнее")
  assert.deepEqual(
    characterAbilityEntity("character-7", row),
    {
      type: "character-ability",
      id: "character-7:subclass:riposte",
    },
  )
})

test("manager ability actions expose granular suppress and enable commands", async () => {
  const calls: Array<{ sourceId: string; suppressed: boolean }> = []
  const setSuppressed = async (
    sourceId: string,
    suppressed: boolean,
  ) => {
    calls.push({ sourceId, suppressed })
    return { ok: true }
  }

  const activeActions = createCharacterAbilitySnakeActions(
    abilityRow("active"),
    { canManage: true, setSuppressed },
  )
  assert.deepEqual(
    activeActions.map((action) => action.id),
    ["inspect-character-ability", "suppress-character-ability"],
  )
  assert.equal(activeActions[1].label, "Заглушить")

  const suppressResult = await activeActions[1].execute?.({
    entity: { type: "character-ability", id: "test" },
    input: undefined,
    path: [],
  })
  assert.equal(suppressResult?.type, "success")
  assert.deepEqual(calls[0], {
    sourceId: "template:subclass:battle-master:v1:source:riposte",
    suppressed: true,
  })

  const suppressedActions = createCharacterAbilitySnakeActions(
    abilityRow("suppressed"),
    { canManage: true, setSuppressed },
  )
  assert.equal(suppressedActions[1].id, "enable-character-ability")
  assert.equal(suppressedActions[1].label, "Включить")

  await suppressedActions[1].execute?.({
    entity: { type: "character-ability", id: "test" },
    input: undefined,
    path: [],
  })
  assert.deepEqual(calls[1], {
    sourceId: "template:subclass:battle-master:v1:source:riposte",
    suppressed: false,
  })
})

test("manager action is omitted when the row has no safe granular suppression source", () => {
  const row = abilityRow()
  row.sourceId = null
  row.capabilities.suppress = false

  const actions = createCharacterAbilitySnakeActions(row, {
    canManage: true,
    setSuppressed: async () => ({ ok: true }),
  })

  assert.deepEqual(
    actions.map((action) => action.id),
    ["inspect-character-ability"],
  )
})

test("manager suppression failures are returned through Snake instead of pretending success", async () => {
  const actions = createCharacterAbilitySnakeActions(
    abilityRow(),
    {
      canManage: true,
      setSuppressed: async () => ({
        ok: false,
        error: "RLS denied",
      }),
    },
  )

  const result = await actions[1].execute?.({
    entity: { type: "character-ability", id: "test" },
    input: undefined,
    path: [],
  })

  assert.deepEqual(result, {
    type: "error",
    message: "RLS denied",
  })
})

const features = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetFeatures.tsx",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)

test("both collapsed previews and expanded ability rows register through the same SnakeTrigger provider", () => {
  assert.match(
    features,
    /const actions = createCharacterAbilitySnakeActions\(row, \{[\s\S]*?canManage,[\s\S]*?setSuppressed: onSetSuppressed/,
  )
  assert.match(
    features,
    /<SnakeTrigger entity=\{entity\} actions=\{actions\}>/,
  )
  assert.match(
    features,
    /compact \? \([\s\S]*?className="u1-character-features__preview-row"/,
  )
  assert.match(
    features,
    /className="u1-character-features__ability-row"/,
  )
  assert.match(features, /snake\.openSurface\(detail\)/)
})

test("abilities tab uses Snake instead of resurrecting a local long-press/context-menu runtime", () => {
  assert.doesNotMatch(
    features,
    /ContextActionSheet|useLongPressItem|onContextMenu|setContextMenu|bottom-sheet/i,
  )
  assert.match(features, /SnakeTrigger, useSnake/)
  assert.match(features, /canManage=\{canManage\}/)
  assert.match(features, /onSetSuppressed=\{onSetSuppressed\}/)
})

test("normal ability taps update character-sheet selection context before opening detail", () => {
  assert.match(
    view,
    /<CharacterSheetFeatures[\s\S]*?characterId=\{characterId\}[\s\S]*?onSelect=\{\(abilityId\) => \{[\s\S]*?setSelectedFeatureId\(abilityId\)/,
  )
})

test("character view passes canonical manager authority and suppression runtime into the ability provider", () => {
  assert.match(
    view,
    /<CharacterSheetFeatures[\s\S]*?canManage=\{control\.canManage\}/,
  )
  assert.match(
    view,
    /onSetSuppressed=\{runtime\.templates\.suppressions\.setSuppressed\}/,
  )
})
