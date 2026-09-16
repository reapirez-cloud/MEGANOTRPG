import assert from "node:assert/strict"
import test from "node:test"

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

test("empty spell access list is treated as no-preparation instead of unprepared", () => {
  assert.equal(resolveSpellPreparationState([]), "not_required")
})

test("always-prepared mode wins even when dirty input carries prepared=false", () => {
  assert.equal(
    resolveSpellPreparationState([
      { preparationMode: "always_prepared", prepared: false },
      { preparationMode: "prepared", prepared: false },
    ]),
    "always_prepared",
  )
})

test("prepared access wins over simultaneous spontaneous access when actually prepared", () => {
  assert.equal(
    resolveSpellPreparationState([
      { preparationMode: "not_required", prepared: true },
      { preparationMode: "prepared", prepared: true },
    ]),
    "prepared",
  )
})

test("spontaneous access wins over an unprepared prepared-access in multiclass data", () => {
  assert.equal(
    resolveSpellPreparationState([
      { preparationMode: "prepared", prepared: false },
      { preparationMode: "not_required", prepared: true },
    ]),
    "not_required",
  )
})

test("prepared-first ranking only has two buckets", () => {
  const ranks = [
    spellPreparationRank("always_prepared"),
    spellPreparationRank("prepared"),
    spellPreparationRank("not_required"),
    spellPreparationRank("unprepared"),
  ]
  assert.deepEqual(ranks, [0, 0, 1, 1])
})

test("preparation workflow detection ignores always-prepared and spontaneous-only casters", () => {
  assert.equal(hasMutablePreparationWorkflow([]), false)
  assert.equal(
    hasMutablePreparationWorkflow([
      {
        accesses: [
          { preparationMode: "always_prepared", prepared: true },
          { preparationMode: "not_required", prepared: true },
        ],
      },
    ]),
    false,
  )
  assert.equal(
    hasMutablePreparationWorkflow([
      {
        accesses: [
          { preparationMode: "prepared", prepared: false },
        ],
      },
    ]),
    true,
  )
})

test("school normalization collapses official school casing but preserves custom schools", () => {
  assert.equal(normalizeSpellSchool(" evOCation "), "Evocation")
  assert.equal(normalizeSpellSchool("NECROMANCY"), "Necromancy")
  assert.equal(normalizeSpellSchool(" Хрономантия "), "Хрономантия")
  assert.equal(normalizeSpellSchool("   "), "")
})

test("source name normalization trims, deduplicates and sorts deterministically", () => {
  assert.deepEqual(
    stableUniqueSortedStrings([
      " Колдун ",
      "Воин",
      "",
      "Колдун",
      "Артефакт",
    ]),
    ["Артефакт", "Воин", "Колдун"],
  )
})

test("compact source summary remains valid for hostile maxVisible values", () => {
  const names = ["Колдун", "Воин", "Артефакт"]

  assert.equal(
    summarizeSourceNames(names, 2),
    "Артефакт · Воин · +1",
  )
  assert.equal(
    summarizeSourceNames(names, 0),
    "Артефакт · +2",
  )
  assert.equal(
    summarizeSourceNames(names, -7),
    "Артефакт · +2",
  )
})

test("spell level certification accepts only integer levels 0 through 9", () => {
  for (let level = 0; level <= 9; level += 1) {
    assert.equal(isStandardSpellLevel(level), true)
  }

  for (const level of [
    -1,
    10,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.equal(isStandardSpellLevel(level), false)
  }
})

test("provenance signatures are order-independent, duplicate-safe and trim source ids", () => {
  assert.equal(
    stableProvenanceSignature([
      " source:z ",
      "source:a",
      "source:z",
      "",
    ]),
    "source:a|source:z|unknown",
  )
  assert.equal(
    stableProvenanceSignature([
      "unknown",
      "source:z",
      "source:a",
    ]),
    "source:a|source:z|unknown",
  )
})

test("feature source selection stays deterministic under arbitrary CE source order", () => {
  const sourceSet = [
    {
      category: "item" as const,
      sourceName: "Кольцо",
      originId: "item:1",
    },
    {
      category: "other" as const,
      sourceName: "Неизвестно",
      originId: "unknown:1",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      originId: "class:1",
    },
  ]

  const forward = [...sourceSet].sort(compareFeatureSourceCandidates)
  const reverse = [...sourceSet].reverse().sort(compareFeatureSourceCandidates)

  assert.deepEqual(forward, reverse)
  assert.equal(forward[0]?.category, "class")
  assert.equal(forward[1]?.category, "item")
  assert.equal(forward[2]?.category, "other")
})

test("feature source comparator uses stable name and origin tie breakers", () => {
  const rows = [
    {
      category: "class" as const,
      sourceName: "Воин",
      originId: "b",
    },
    {
      category: "class" as const,
      sourceName: "Бард",
      originId: "z",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      originId: "a",
    },
  ].sort(compareFeatureSourceCandidates)

  assert.deepEqual(
    rows.map((row) => [row.sourceName, row.originId]),
    [
      ["Бард", "z"],
      ["Воин", "a"],
      ["Воин", "b"],
    ],
  )
})

test("feature comparator obeys category then source then timing then unlock then name", () => {
  const rows = [
    {
      category: "subclass" as const,
      sourceName: "Чемпион",
      timing: "action" as const,
      unlockLevel: 1,
      label: "Ноль",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "passive" as const,
      unlockLevel: 1,
      label: "Пассив",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: 5,
      label: "Позже",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: 3,
      label: "Б",
    },
    {
      category: "class" as const,
      sourceName: "Воин",
      timing: "action" as const,
      unlockLevel: 3,
      label: "А",
    },
  ].sort(compareFeatureEntries)

  assert.deepEqual(
    rows.map((row) => [
      row.category,
      row.timing,
      row.unlockLevel,
      row.label,
    ]),
    [
      ["class", "action", 3, "А"],
      ["class", "action", 3, "Б"],
      ["class", "action", 5, "Позже"],
      ["class", "passive", 1, "Пассив"],
      ["subclass", "action", 1, "Ноль"],
    ],
  )
})

test("unlock-level cleanup rejects invalid dirty levels instead of sorting them first", () => {
  assert.equal(
    earliestKnownUnlockLevel([
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      0,
      2.5,
    ]),
    null,
  )

  assert.equal(
    earliestKnownUnlockLevel([
      9,
      -3,
      4,
      2.5,
      1,
    ]),
    1,
  )
})

test("unknown unlock level sorts after every known valid unlock level", () => {
  const rows = [
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

  assert.equal(rows[0]?.unlockLevel, 20)
  assert.equal(rows[1]?.unlockLevel, null)
})
