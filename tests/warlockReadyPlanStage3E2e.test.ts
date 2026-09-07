import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { classReference, WARLOCK_RUNTIME_REFERENCE_SUBCLASS_IDS } from "../src/data/classReference.ts"
import { warlockSubclassRuntimeBundles } from "../src/rule-templates/warlockSubclassMechanics.ts"
import {
  WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS,
  WARLOCK_SUBCLASS_RUNTIME_LEVELS,
} from "../src/rule-templates/warlockSubclasses.ts"
import {
  WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS,
  WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS,
  warlockSupplementalRuntimeBundles,
} from "../src/rule-templates/warlockSupplementalSubclasses.ts"

const baseRuntimeMigration = readFileSync(
  "supabase/migrations/20260906182100_warlock_base_runtime_v1.sql",
  "utf8",
)

const expectedRuntimeIds = [
  "archfey",
  "celestial",
  "fiend",
  "great-old-one",
  "hexblade",
  "fathomless",
  "genie",
  "undead",
  "undying",
].sort()

const expectedReferenceOnlyIds = ["raven-queen", "seeker", "great-wyrm"].sort()

function runtimeSubclassBundles() {
  return [
    ...warlockSubclassRuntimeBundles.filter((bundle) => bundle.template.kind === "subclass"),
    ...warlockSupplementalRuntimeBundles.filter((bundle) => bundle.template.kind === "subclass"),
  ]
}

test("Ready-plan Stage 3 exposes exactly nine runtime Warlock patrons in player reference", () => {
  const warlock = classReference.find((entry) => entry.id === "warlock")
  assert.ok(warlock)
  assert.equal(warlock.referenceOnly, false)

  const runtimeIds = warlock.subclasses.filter((entry) => entry.referenceOnly === false).map((entry) => entry.id).sort()
  const referenceOnlyIds = warlock.subclasses.filter((entry) => entry.referenceOnly === true).map((entry) => entry.id).sort()

  assert.deepEqual(runtimeIds, expectedRuntimeIds)
  assert.deepEqual(referenceOnlyIds, expectedReferenceOnlyIds)
  assert.deepEqual([...WARLOCK_RUNTIME_REFERENCE_SUBCLASS_IDS].sort(), expectedRuntimeIds)
  assert.equal(new Set(warlock.subclasses.map((entry) => entry.id)).size, warlock.subclasses.length)
})

test("player-facing runtime roster is derived from the same nine CE catalog keys", () => {
  const catalogIds = [
    ...WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS,
    ...WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS,
  ].map((key) => key.replace("subclass:warlock:", "")).sort()

  assert.deepEqual(catalogIds, expectedRuntimeIds)

  const bundleKeys = runtimeSubclassBundles().map((bundle) => bundle.template.catalog_key).sort()
  assert.deepEqual(bundleKeys, [
    ...WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS,
    ...WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS,
  ].sort())
  assert.equal(new Set(bundleKeys).size, 9)
})

test("all nine patron bundles unlock at 3 and carry the certified runtime level shape", () => {
  assert.deepEqual([...WARLOCK_SUBCLASS_RUNTIME_LEVELS], [3, 5, 6, 7, 9, 10, 14])
  assert.deepEqual([...WARLOCK_SUPPLEMENTAL_RUNTIME_LEVELS], [3, 5, 6, 7, 9, 10, 14])

  for (const bundle of runtimeSubclassBundles()) {
    assert.equal(bundle.template.unlock_level, 3, bundle.template.catalog_key ?? bundle.template.name)
    assert.deepEqual(bundle.levels.map((entry) => entry.level), [3, 5, 6, 7, 9, 10, 14], bundle.template.catalog_key ?? bundle.template.name)
  }
})

test("base Warlock migration owns a complete 1-20 Pact Magic progression", () => {
  assert.match(baseRuntimeMigration, /for v_level in 1\.\.20 loop/)
  assert.match(baseRuntimeMigration, /warlock_pact_slots/)
  assert.match(baseRuntimeMigration, /short_rest/)
  assert.match(baseRuntimeMigration, /long_rest/)
  assert.match(baseRuntimeMigration, /v_level in \(11,13,15,17\)/)
  assert.match(baseRuntimeMigration, /warlock_mystic_arcanum_/)
})

test("reference-only Warlock cards never advertise Character Engine runtime", () => {
  const warlock = classReference.find((entry) => entry.id === "warlock")
  assert.ok(warlock)

  for (const subclass of warlock.subclasses) {
    if (subclass.referenceOnly) {
      assert.match(subclass.summary, /не входит в поддерживаемый Warlock runtime/)
    } else {
      assert.match(subclass.summary, /Character Engine/)
    }
  }
})
