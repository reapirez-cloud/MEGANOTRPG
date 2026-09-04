import assert from "node:assert/strict"
import test from "node:test"

import { bardReferenceCurrent } from "../src/data/classes/bardReferenceCurrent.ts"
import { bardSubclassReferenceDraftWave3 } from "../src/data/classes/bardSubclassReferenceDraftWave3.ts"

const expectedCollegeIds = [
  "lore",
  "glamour",
  "valor",
  "eloquence",
  "swords",
  "whispers",
  "creation",
  "spirits",
  "tragedy",
]

test("Bard literary reference covers the full nine-college roster", () => {
  assert.equal(bardReferenceCurrent.referenceOnly, true)
  assert.deepEqual(
    bardReferenceCurrent.subclasses.map((subclass) => subclass.id),
    expectedCollegeIds,
  )

  for (const subclass of bardReferenceCurrent.subclasses) {
    assert.ok("explanation" in subclass && subclass.explanation.trim(), `${subclass.id} is missing authored explanation`)
    assert.ok("voss" in subclass && subclass.voss.trim(), `${subclass.id} is missing authored Voss comment`)
    assert.ok("features" in subclass && subclass.features.length, `${subclass.id} is missing authored feature stories`)
  }
})

test("Bard literary colleges expose exact reference rules without claiming runtime mechanics", () => {
  for (const subclass of bardReferenceCurrent.subclasses) {
    assert.ok("features" in subclass, `${subclass.id} unexpectedly stayed a roster placeholder`)
    for (const feature of subclass.features) {
      assert.ok(feature.mechanics.trim(), `${subclass.id}/${feature.name} is missing its exact reference rule`)
    }
  }
})

test("Tragedy stays explicitly outside official Wizards college labeling", () => {
  const tragedy = bardSubclassReferenceDraftWave3.find((subclass) => subclass.id === "tragedy")
  assert.ok(tragedy)
  assert.match(tragedy.sourceHint, /partner\/third-party/i)
  assert.match(bardReferenceCurrent.description, /девяти коллегий/i)
})
