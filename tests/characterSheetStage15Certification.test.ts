import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"

const features = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetFeatures.tsx",
  "utf8",
)
const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpells.tsx",
  "utf8",
)
const runtime = fs.readFileSync(
  "src/engine-runtime/characterRuntimeResolver.ts",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)

test("template source nodes preserve real feature unlock levels", () => {
  const bundle = {
    assignment: {
      id: "assignment-1",
      character_id: "hero-1",
      template_id: "class-1",
      template_level: 5,
      selected_choices: {},
      assigned_at: "",
      updated_at: "",
    },
    template: {
      id: "class-1",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "test-class",
      name: "Тестовый класс",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      is_active: true,
      created_by: null,
      created_at: "",
      updated_at: "",
    },
    levels: [
      {
        id: "level-3",
        template_id: "class-1",
        level: 3,
        choices: [],
        mechanics: [
          {
            id: "feature-3",
            type: "grant",
            target: "feature",
            key: "test-feature",
            payload: { label: "Тестовая способность" },
            sourceKey: "test-feature",
          },
        ],
      },
    ],
  } as any

  const resolved = resolveTemplateBundles([bundle], 5)
  const source = resolved.sources.find(
    (node) => node.id.endsWith(":source:test-feature"),
  )

  assert.ok(source)
  assert.equal(source?.unlockLevel, 3)
})

test("features consume source-node provenance and sort timing then unlock level then name", () => {
  assert.match(runtime, /sourceNodes:\s*TemplateSourceNode\[\]/)
  assert.match(view, /sourceNodes=\{runtime\.snapshot\?\.sourceNodes \|\| \[\]\}/)
  assert.match(features, /sourceNodesById/)
  assert.match(features, /left\.unlockLevel/)
  assert.match(features, /Number\.MAX_SAFE_INTEGER/)
  assert.match(features, /left\.label\.localeCompare\(right\.label, "ru"\)/)
  assert.match(features, /category:\s*"other"/)
  assert.match(features, /sourceNames/)
})

test("multiclass spell preparation never labels a spontaneous access as unprepared", () => {
  const notRequired = spells.indexOf(
    'access.preparationMode === "not_required"',
  )
  const unprepared = spells.indexOf(
    'if (accesses.some((access) => access.preparationMode === "prepared"))',
  )

  assert.ok(notRequired >= 0)
  assert.ok(unprepared > notRequired)
  assert.match(spells, /hasPreparationWorkflow &&/)
  assert.match(
    spells,
    /value === "always_prepared" \|\| value === "prepared" \? 0 : 1/,
  )
})

test("spell levels are not silently clamped into the D&D 0-9 groups", () => {
  assert.doesNotMatch(
    spells,
    /Math\.max\(0, Math\.min\(9, spell\.identity\.level\)\)/,
  )
  assert.match(spells, /data-level="other"/)
  assert.match(spells, />ПРОЧЕЕ</)
  assert.match(spells, /spell\.level < 0 \|\| spell\.level > 9/)
})

test("spell schools and multiclass source labels are normalized for dirty data", () => {
  assert.match(spells, /function normalizeSchool/)
  assert.match(spells, /sourceNames\.sort/)
  assert.match(spells, /function sourceSummary/)
})
