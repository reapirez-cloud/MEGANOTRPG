import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"

const artificer = classReference.find((entry) => entry.id === "artificer")
const matrix = readFileSync(
  new URL("../src/data/classes/artificerRuntimeFeatureMatrix.md", import.meta.url),
  "utf8",
)
const audit = readFileSync(
  new URL("../src/data/classes/artificerRuntimeReuseAudit.md", import.meta.url),
  "utf8",
)
const plan = readFileSync(
  new URL("../src/data/classes/artificerRuntimePlan.md", import.meta.url),
  "utf8",
)
const ledger = readFileSync(
  new URL("../src/rule-templates/CLASS_WORK_STATUS.md", import.meta.url),
  "utf8",
)
const queue = readFileSync(
  new URL("../docs/WORK_QUEUE.md", import.meta.url),
  "utf8",
)

const supportedSubclasses = [
  "alchemist",
  "armorer",
  "artillerist",
  "battle-smith",
  "cartographer",
] as const

test("Artificer Stage 1 freezes the 2025 five-subclass roster as reference-only", () => {
  assert.ok(artificer, "Artificer is absent from class reference")
  assert.equal(artificer.referenceOnly, true)
  assert.equal(artificer.features?.length, 10)
  assert.deepEqual(
    artificer.subclasses.map((entry) => entry.id),
    supportedSubclasses,
  )
  assert.ok(artificer.subclasses.every((entry) => entry.referenceOnly === true))

  const subclassFeatureCount = artificer.subclasses.reduce(
    (sum, entry) => sum + (entry.features?.length ?? 0),
    0,
  )
  assert.equal(subclassFeatureCount, 33)
  assert.equal((artificer.features?.length ?? 0) + subclassFeatureCount, 43)
})

test("Artificer Stage 1 deliberately leaves the literary layer blank for later user translation", () => {
  assert.ok(artificer)
  assert.equal(artificer.tagline, "")
  assert.equal(artificer.description, "")
  assert.equal(artificer.explanation, "")
  assert.equal(artificer.voss, "")

  for (const feature of artificer.features ?? []) {
    assert.equal(feature.explanation, "", feature.name)
    assert.equal(feature.voss, "", feature.name)
    assert.ok(feature.mechanics.trim(), feature.name + " lacks mechanical specification")
  }

  for (const subclass of artificer.subclasses) {
    assert.equal(subclass.explanation, "", subclass.id)
    assert.equal(subclass.voss, "", subclass.id)
    for (const feature of subclass.features ?? []) {
      assert.equal(feature.explanation, "", subclass.id + "/" + feature.name)
      assert.equal(feature.voss, "", subclass.id + "/" + feature.name)
      assert.ok(feature.mechanics.trim(), subclass.id + "/" + feature.name + " lacks mechanics")
    }
  }
})

test("Artificer Stage 1 locks the current base-class feature topology", () => {
  assert.ok(artificer)

  const expected = new Map([
    ["Spellcasting", 1],
    ["Tinker's Magic", 1],
    ["Replicate Magic Item", 2],
    ["Magic Item Tinker", 6],
    ["Flash of Genius", 7],
    ["Magic Item Adept", 10],
    ["Spell-Storing Item", 11],
    ["Advanced Artifice", 14],
    ["Magic Item Master", 18],
    ["Soul of Artifice", 20],
  ])

  assert.deepEqual(
    new Map((artificer.features ?? []).map((entry) => [entry.name, entry.level])),
    expected,
  )

  const soul = artificer.features?.find((entry) => entry.name === "Soul of Artifice")
  assert.ok(soul)
  assert.match(soul.mechanics, /20 HP/i)
  assert.match(soul.mechanics, /все использования Flash of Genius/i)

  const tinker = artificer.features?.find((entry) => entry.name === "Tinker's Magic")
  assert.ok(tinker)
  assert.match(tinker.mechanics, /модификатор Интеллекта/i)
  assert.match(tinker.mechanics, /Long Rest|долгого отдыха/i)
})

test("Artificer Stage 1 matrix gives every frozen feature one stable runtime identity", () => {
  const rowKeys = [...matrix.matchAll(/^\| \`(artificer:[^\`]+)\` \|/gm)].map(
    (match) => match[1],
  )

  assert.equal(rowKeys.length, 43)
  assert.equal(new Set(rowKeys).size, 43)

  for (const catalogKey of [
    "class:artificer",
    "subclass:artificer:alchemist",
    "subclass:artificer:armorer",
    "subclass:artificer:artillerist",
    "subclass:artificer:battle-smith",
    "subclass:artificer:cartographer",
  ]) {
    assert.ok(matrix.includes("\`" + catalogKey + "\`"), catalogKey)
  }

  assert.match(matrix, /Missing generic primitives discovered by Stage 1/)
  assert.match(matrix, /Transactional item-charge ↔ spell-slot exchange/)
  assert.match(matrix, /Cross-owner zero-HP rescue orchestration/)
})

test("Stage 1 rejects the retired historical Reanimator and stale spell links as runtime truth", () => {
  assert.ok(artificer)
  assert.equal(
    artificer.subclasses.some((entry) => entry.id === "reanimator"),
    false,
  )
  assert.match(audit, /artificer-reanimator/)
  assert.match(audit, /DISCARD FROM ROSTER/)
  assert.match(audit, /current Artificer spell links: \*\*29\*\*/)
  assert.match(audit, /clearly incomplete/i)
  assert.match(audit, /ADAPT, DO NOT RESTORE/)
})

test("Artificer Stage 1 source freeze remains intact after Stage 4 base completion", () => {
  assert.match(
    plan,
    /Stage 1 — source freeze\/specification:\s*COMPLETE_2026_09_21/,
  )
  assert.match(
    plan,
    /Stage 2 — class foundation 1–20 \+ spellcasting:\s*COMPLETE_2026_09_21/,
  )
  assert.match(plan, /Stage 3 — core item\/replication runtime:\s*COMPLETE_2026_09_21/)
  assert.match(plan, /Stage 7 — final certification:\s*GATE_INSTALLED_BLOCKED/)

  assert.match(ledger, /stage_1_source_freeze_and_executable_spec: COMPLETE_2026_09_21/)
  assert.match(ledger, /stage_2_foundation_1_20_and_spellcasting: COMPLETE_2026_09_21/)
  assert.match(ledger, /Text:\*\* `DEFERRED_USER_TRANSLATION`/)
  assert.match(ledger, /Mechanics\/runtime:\*\* `IN_PROGRESS_STAGE_4_COMPLETE`/)
  assert.match(ledger, /stage_4_remaining_base_runtime: COMPLETE_2026_09_22/)

  assert.match(queue, /Artificer runtime work/)
  assert.match(queue, /STAGES_1_4_COMPLETE_STAGE_5_NEXT/)
})
