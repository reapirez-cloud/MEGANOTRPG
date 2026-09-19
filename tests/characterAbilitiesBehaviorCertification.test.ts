import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  characterAbilityCollapsedPreview,
  nextExpandedAbilityGroup,
} from "../src/ui-v1-isolated/characterAbilitiesAccordion.ts"
import {
  createCharacterAbilitySnakeActions,
} from "../src/ui-v1-isolated/characterAbilitySnakeActions.ts"
import type {
  CharacterAbilityGroup,
  CharacterAbilityRow,
} from "../src/ui-v1-isolated/characterAbilitiesReadModel.ts"

function abilityRow(
  status: CharacterAbilityRow["status"] = "active",
): CharacterAbilityRow {
  return {
    id: "class:second-wind",
    group: "class",
    sourceId: "template:class:fighter:v1:source:second-wind",
    sourceIds: ["template:class:fighter:v1:source:second-wind"],
    sourceName: "Воин",
    sourceNames: ["Воин"],
    sourceType: "class_template",
    label: "Второе дыхание",
    shortDescription: "Восстановление в бою.",
    unlockLevel: 1,
    icon: "feature:second-wind",
    status,
    runtimeAvailable: true,
    mechanics: [],
    voss: {
      explanation: "",
      nuances: [],
      comment: "",
    },
    capabilities: {
      inspect: true,
      suppress: true,
    },
  }
}

function group(count: number): CharacterAbilityGroup {
  const rows = Array.from({ length: count }, (_, index) => ({
    ...abilityRow(),
    id: "class:ability-" + index,
    label: "Умение " + index,
  }))

  return {
    key: "class",
    label: "Класс",
    sourceNames: ["Воин"],
    rows,
    totalCount: rows.length,
    activeCount: rows.length,
    suppressedCount: 0,
  }
}

const features = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetFeatures.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-features.css",
  "utf8",
)
const suppressionHook = fs.readFileSync(
  "src/hooks/useCharacterSourceSuppressions.ts",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const campaignScope = fs.readFileSync(
  "src/ui-v1-isolated/useUiV1SectionData.ts",
  "utf8",
)
const contract = fs.readFileSync(
  "docs/ABILITIES_VISUAL_REWORK_CONTRACT.md",
  "utf8",
)

test("stage 7 certifies one-at-a-time accordion and empty-group stability", () => {
  assert.equal(nextExpandedAbilityGroup(null, "class", 3), "class")
  assert.equal(
    nextExpandedAbilityGroup("class", "subclass", 2),
    "subclass",
  )
  assert.equal(
    nextExpandedAbilityGroup("subclass", "subclass", 2),
    null,
  )
  assert.equal(
    nextExpandedAbilityGroup("class", "background", 0),
    "class",
  )

  const preview = characterAbilityCollapsedPreview(group(6))
  assert.equal(preview.rows.length, 3)
  assert.equal(preview.hiddenCount, 3)
})

test("stage 7 certifies player and manager Snake authority without UI-owned permission logic", async () => {
  const playerActions = createCharacterAbilitySnakeActions(
    abilityRow(),
    { canManage: false },
  )
  assert.deepEqual(
    playerActions.map((action) => action.id),
    ["inspect-character-ability"],
  )

  const calls: Array<[string, boolean]> = []
  const managerActions = createCharacterAbilitySnakeActions(
    abilityRow(),
    {
      canManage: true,
      setSuppressed: async (sourceId, suppressed) => {
        calls.push([sourceId, suppressed])
        return { ok: true }
      },
    },
  )

  assert.deepEqual(
    managerActions.map((action) => action.id),
    ["inspect-character-ability", "suppress-character-ability"],
  )

  const result = await managerActions[1].execute?.({
    entity: { type: "character-ability", id: "character-1:second-wind" },
    input: undefined,
    path: [],
  })

  assert.equal(result?.type, "success")
  assert.deepEqual(calls, [[
    "template:class:fighter:v1:source:second-wind",
    true,
  ]])

  const enableActions = createCharacterAbilitySnakeActions(
    abilityRow("suppressed"),
    {
      canManage: true,
      setSuppressed: async (sourceId, suppressed) => {
        calls.push([sourceId, suppressed])
        return { ok: true }
      },
    },
  )
  assert.equal(enableActions[1].id, "enable-character-ability")
})

test("stage 7 certifies collapsed and expanded rows use the same interaction provider", () => {
  assert.match(
    features,
    /function AbilityInteractiveRow\([\s\S]*?createCharacterAbilitySnakeActions\(row, \{[\s\S]*?canManage,[\s\S]*?setSuppressed: onSetSuppressed/,
  )
  assert.match(
    features,
    /<SnakeTrigger entity=\{entity\} actions=\{actions\}>/,
  )
  assert.match(
    features,
    /preview\.rows\.map\(\(row\) => \([\s\S]*?<AbilityInteractiveRow[\s\S]*?compact/,
  )
  assert.match(
    features,
    /group\.rows\.map\(\(row\) => \([\s\S]*?<AbilityInteractiveRow/,
  )
  assert.match(
    features,
    /onClick=\{\(\) => \{[\s\S]*?onSelect\?\.\(row\.id\)[\s\S]*?snake\.openSurface\(detail\)/,
  )
  assert.doesNotMatch(
    features,
    /ContextActionSheet|useLongPressItem|onContextMenu|setContextMenu|bottom-sheet/i,
  )
})

test("stage 7 certifies suppressed abilities stay visible and muted rather than moving to another bucket", () => {
  assert.match(
    features,
    /data-suppressed=\{row\.status === "suppressed" \|\| undefined\}/,
  )
  assert.match(
    features,
    /row\.status === "suppressed"[\s\S]*?Заглушено/,
  )
  assert.match(
    styles,
    /\.u1-character-features__preview-row\[data-suppressed\],[\s\S]*?\.u1-character-features__ability-row\[data-suppressed\][\s\S]*?opacity:\s*\.46[\s\S]*?filter:\s*grayscale\(\.82\) saturate\(\.2\)/,
  )
  assert.doesNotMatch(
    styles,
    /(?:preview-row|ability-row)\[data-suppressed\][^{]*\{[^}]*(?:display:\s*none|visibility:\s*hidden)/s,
  )
  assert.doesNotMatch(features, /Отключено ведущим/)
})

test("stage 7 certifies canonical suppression path and manager authority survived the visual rewrite", () => {
  assert.match(
    view,
    /canManage=\{control\.canManage\}/,
  )
  assert.match(
    view,
    /onSetSuppressed=\{runtime\.templates\.suppressions\.setSuppressed\}/,
  )
  assert.match(
    campaignScope,
    /canManage:\s*membership\.role === "gm" \|\| membership\.is_owner === true/,
  )
  assert.match(
    suppressionHook,
    /oracle\.characters\.setSourceSuppressed\(/,
  )
  assert.match(
    suppressionHook,
    /await oracle\.characters\.setSourceSuppressed[\s\S]*?await load\(\)/,
  )
})

test("stage 7 contract is behavior-only and leaves final visual certification for stage 8", () => {
  assert.match(contract, /Status: \*\*ACTIVE — Stage 7 locked\*\*/)
  assert.match(contract, /## Stage 7 acceptance/)
  assert.match(contract, /8\. \*\*Visual certification\*\*/)
})
