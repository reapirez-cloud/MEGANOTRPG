import assert from "node:assert/strict"
import test from "node:test"

import {
  WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS,
  wizardSubclassRuntimeBundles,
} from "../src/rule-templates/wizardSubclassMechanics.ts"
import {
  WIZARD_SUBCLASS_RUNTIME_READY_CATALOG_KEYS,
  WIZARD_SUBCLASSES,
} from "../src/rule-templates/wizardSubclasses.ts"

const implementedRuntimeKeys = [...WIZARD_SUBCLASS_RUNTIME_CATALOG_KEYS].sort()

test("Wizard runtime-ready catalog flags match implemented subclass runtime packages", () => {
  assert.deepEqual(
    [...WIZARD_SUBCLASS_RUNTIME_READY_CATALOG_KEYS].sort(),
    implementedRuntimeKeys,
  )

  assert.deepEqual(
    WIZARD_SUBCLASSES
      .filter((entry) => entry.runtimeReady)
      .map((entry) => entry.catalogKey)
      .sort(),
    implementedRuntimeKeys,
  )
})

test("every implemented Wizard subclass has exactly one runtime bundle with 3/6/10/14 feature rows", () => {
  const subclassBundles = wizardSubclassRuntimeBundles.filter((bundle) => bundle.template.kind === "subclass")

  assert.equal(subclassBundles.length, implementedRuntimeKeys.length)

  for (const catalogKey of implementedRuntimeKeys) {
    const matches = subclassBundles.filter((bundle) => bundle.template.catalog_key === catalogKey)
    assert.equal(matches.length, 1, `${catalogKey} must have exactly one runtime bundle`)

    const [bundle] = matches
    assert.deepEqual(bundle.levels.map((row) => row.level), [3, 6, 10, 14])
    assert.equal(bundle.template.unlock_level, 3)
    assert.equal(bundle.template.rules_meta.mechanics_status, "READY")
  }
})

test("Wizard subclass spell runtime exposes named casting methods instead of untyped method records", () => {
  const spellMechanics = wizardSubclassRuntimeBundles
    .flatMap((bundle) => bundle.levels)
    .flatMap((row) => row.mechanics)
    .filter((mechanic) => mechanic.type === "spell")

  assert.ok(spellMechanics.length > 0)

  for (const mechanic of spellMechanics) {
    assert.ok(mechanic.payload.methods.length > 0, `${mechanic.key} must expose at least one casting method`)
    for (const method of mechanic.payload.methods) {
      assert.ok(method.key.length > 0, `${mechanic.key} has a casting method without a key`)
      assert.ok(method.kind.length > 0, `${mechanic.key} has a casting method without a kind`)
    }
  }
})
