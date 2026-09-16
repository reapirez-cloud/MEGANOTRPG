import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import {
  compareFeatureEntries,
  compareFeatureSourceCandidates,
  earliestKnownUnlockLevel,
  hasMutablePreparationWorkflow,
  isStandardSpellLevel,
  normalizeSpellSchool,
  resolveSpellPreparationState,
  spellPreparationRank,
  stableProvenanceSignature,
  stableUniqueSortedStrings,
  summarizeSourceNames,
} from "../src/ui-v1-isolated/characterSheetDataCertification.ts"

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
  assert.match(spells, /\[\.\.\.names\]\.sort/)
  assert.match(spells, /function sourceSummary/)
})


test("spell preparation semantics are behavioral across mixed multiclass accesses", () => {
  assert.equal(
    resolveSpellPreparationState([
      { preparationMode: "prepared", prepared: false },
      { preparationMode: "not_required", prepared: true },
    ]),
    "not_required",
  )

  assert.equal(
    resolveSpellPreparationState([
      { preparationMode: "not_required", prepared: true },
      { preparationMode: "prepared", prepared: true },
    ]),
    "prepared",
  )

  assert.equal(
    resolveSpellPreparationState([
      { preparationMode: "prepared", prepared: true },
      { preparationMode: "always_prepared", prepared: true },
    ]),
    "always_prepared",
  )

  assert.equal(
    resolveSpellPreparationState([
      { preparationMode: "prepared", prepared: false },
    ]),
    "unprepared",
  )
})

test("prepared-first rank is binary and does not invent a spontaneous sub-order", () => {
  assert.equal(spellPreparationRank("always_prepared"), 0)
  assert.equal(spellPreparationRank("prepared"), 0)
  assert.equal(spellPreparationRank("not_required"), 1)
  assert.equal(spellPreparationRank("unprepared"), 1)
})

test("mutable preparation workflow only exists when a prepared access exists", () => {
  assert.equal(
    hasMutablePreparationWorkflow([
      {
        accesses: [
          { preparationMode: "not_required", prepared: true },
          { preparationMode: "always_prepared", prepared: true },
        ],
      },
    ]),
    false,
  )

  assert.equal(
    hasMutablePreparationWorkflow([
      {
        accesses: [
          { preparationMode: "not_required", prepared: true },
          { preparationMode: "prepared", prepared: false },
        ],
      },
    ]),
    true,
  )
})

test("spell school normalization collapses dirty casing without inventing translations", () => {
  assert.equal(normalizeSpellSchool(" evOCation "), "Evocation")
  assert.equal(normalizeSpellSchool("NECROMANCY"), "Necromancy")
  assert.equal(normalizeSpellSchool("  "), "")
  assert.equal(normalizeSpellSchool("Хрономантия"), "Хрономантия")
})

test("source summaries are deterministic, deduplicated and compact", () => {
  const names = ["Колдун", "Воин", "Колдун", "Артефакт"]

  assert.deepEqual(
    stableUniqueSortedStrings(names),
    ["Артефакт", "Воин", "Колдун"],
  )
  assert.equal(
    summarizeSourceNames(names),
    "Артефакт · Воин · +1",
  )
})

test("standard spell levels accept exactly integer 0 through 9", () => {
  for (let level = 0; level <= 9; level += 1) {
    assert.equal(isStandardSpellLevel(level), true)
  }

  for (const level of [-1, 10, 3.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(isStandardSpellLevel(level), false)
  }
})

test("provenance signature is stable under source-order changes and duplicates", () => {
  const first = stableProvenanceSignature([
    "source:z",
    "source:a",
    "source:z",
    "",
  ])
  const second = stableProvenanceSignature([
    "unknown",
    "source:z",
    "source:a",
  ])

  assert.equal(first, "source:a|source:z|unknown")
  assert.equal(second, first)
})

test("source candidate selection is stable when CE provenance order changes", () => {
  const candidates = [
    {
      category: "other" as const,
      sourceName: "Неизвестное",
      originId: "unknown:1",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      originId: "class:1",
    },
    {
      category: "item" as const,
      sourceName: "Кольцо",
      originId: "item:1",
    },
  ]

  const forward = [...candidates].sort(compareFeatureSourceCandidates)
  const reversed = [...candidates].reverse().sort(compareFeatureSourceCandidates)

  assert.deepEqual(forward, reversed)
  assert.equal(forward[0]?.category, "class")
  assert.equal(forward.at(-1)?.category, "other")
})

test("feature comparator enforces category, source, timing, unlock level, then name", () => {
  const entries = [
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "passive" as const,
      unlockLevel: 1,
      label: "Б",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: 5,
      label: "А",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: 3,
      label: "Я",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: 3,
      label: "А",
    },
    {
      category: "subclass" as const,
      sourceName: "Чемпион",
      timing: "action" as const,
      unlockLevel: 1,
      label: "0",
    },
  ].sort(compareFeatureEntries)

  assert.deepEqual(
    entries.map((entry) => [
      entry.category,
      entry.timing,
      entry.unlockLevel,
      entry.label,
    ]),
    [
      ["class", "action", 3, "А"],
      ["class", "action", 3, "Я"],
      ["class", "action", 5, "А"],
      ["class", "passive", 1, "Б"],
      ["subclass", "action", 1, "0"],
    ],
  )
})

test("unknown feature unlock levels sort after known levels and are never fabricated", () => {
  assert.equal(earliestKnownUnlockLevel([null, undefined]), null)
  assert.equal(earliestKnownUnlockLevel([7, null, 3, undefined]), 3)

  const entries = [
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: null,
      label: "Неизвестно",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: 20,
      label: "Двадцать",
    },
  ].sort(compareFeatureEntries)

  assert.equal(entries[0]?.unlockLevel, 20)
  assert.equal(entries[1]?.unlockLevel, null)
})
