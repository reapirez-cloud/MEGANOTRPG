import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  CHARACTER_ABILITY_PREVIEW_LIMIT,
  characterAbilityCollapsedPreview,
  nextExpandedAbilityGroup,
} from "../src/ui-v1-isolated/characterAbilitiesAccordion.ts"
import type {
  CharacterAbilityGroup,
  CharacterAbilityRow,
} from "../src/ui-v1-isolated/characterAbilitiesReadModel.ts"

function row(index: number): CharacterAbilityRow {
  return {
    id: "class:ability-" + index,
    group: "class",
    sourceId: "source:" + index,
    sourceIds: ["source:" + index],
    sourceName: "Воин",
    sourceNames: ["Воин"],
    sourceType: "class_template",
    label: "Умение " + index,
    shortDescription: "Описание " + index,
    unlockLevel: index,
    icon: "ability:class",
    status: "active",
    runtimeAvailable: null,
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
  const rows = Array.from({ length: count }, (_, index) => row(index + 1))
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

test("collapsed abilities preview uses a fixed compact limit and computes hidden count from real rows", () => {
  assert.equal(CHARACTER_ABILITY_PREVIEW_LIMIT, 3)

  const preview = characterAbilityCollapsedPreview(group(7))

  assert.deepEqual(
    preview.rows.map((entry) => entry.label),
    ["Умение 1", "Умение 2", "Умение 3"],
  )
  assert.equal(preview.hiddenCount, 4)
})

test("collapsed preview never reports a negative hidden count", () => {
  const preview = characterAbilityCollapsedPreview(group(2))

  assert.equal(preview.rows.length, 2)
  assert.equal(preview.hiddenCount, 0)
})

test("accordion state permits only one expanded group and toggles the current group closed", () => {
  assert.equal(
    nextExpandedAbilityGroup(null, "class", 3),
    "class",
  )
  assert.equal(
    nextExpandedAbilityGroup("class", "subclass", 2),
    "subclass",
  )
  assert.equal(
    nextExpandedAbilityGroup("subclass", "subclass", 2),
    null,
  )
})

test("empty groups do not steal accordion expansion from the currently open group", () => {
  assert.equal(
    nextExpandedAbilityGroup("class", "background", 0),
    "class",
  )
  assert.equal(
    nextExpandedAbilityGroup("background", "background", 0),
    null,
  )
})

const features = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetFeatures.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-features.css",
  "utf8",
)

test("stage 3 renders real collapsed previews, computed more count and in-place expanded rows", () => {
  assert.match(features, /characterAbilityCollapsedPreview\(group\)/)
  assert.match(features, /ещё \{preview\.hiddenCount\}/)
  assert.match(features, /aria-expanded=\{expanded\}/)
  assert.match(features, /aria-controls=\{contentId\}/)
  assert.match(features, /hidden=\{!expanded\}/)
  assert.match(features, /group\.rows\.map\(\(row\) =>/)
  assert.match(features, /Открыто: \{group\.totalCount\} из \{group\.totalCount\}/)
})

test("stage 3 rows remain presentation-only until the Snake/detail stage", () => {
  assert.doesNotMatch(features, /SnakeTrigger|useSnake/)
  assert.doesNotMatch(features, /openSurface|inspect-feature|Заглушить|Включить/)
  assert.match(features, /data-suppressed=\{row\.status === "suppressed"/)
})

test("stage 3 keeps the reference hierarchy responsive without switching to a different mobile structure", () => {
  assert.match(
    styles,
    /\.u1-character-features__panel-toggle\s*\{[\s\S]*?grid-template-columns:/,
  )
  assert.match(
    styles,
    /\.u1-character-features__expanded\s*\{[\s\S]*?border-top:/,
  )
  assert.match(
    styles,
    /@media \(max-width: 359px\)[\s\S]*?\.u1-character-features__panel-toggle[\s\S]*?grid-template-columns:/,
  )
  assert.match(
    styles,
    /\.u1-character-features__ability-row\s*\{[\s\S]*?grid-template-columns:/,
  )
})
