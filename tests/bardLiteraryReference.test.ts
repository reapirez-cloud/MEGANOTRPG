import assert from "node:assert/strict"
import test from "node:test"

import { bardReferenceCurrent } from "../src/data/classes/bardReferenceCurrent.ts"

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
    assert.ok(subclass.explanation?.trim(), `${subclass.id} is missing authored explanation`)
    assert.ok(subclass.voss?.trim(), `${subclass.id} is missing authored Voss comment`)
    assert.ok(subclass.features?.length, `${subclass.id} is missing authored feature stories`)
  }
})

test("Bard literary colleges do not pretend supplied rules are implemented mechanics", () => {
  for (const subclass of bardReferenceCurrent.subclasses) {
    for (const feature of subclass.features ?? []) {
      assert.equal(feature.mechanics, "", `${subclass.id}/${feature.name} unexpectedly exposes runtime mechanics`)
      assert.deepEqual(feature.details ?? [], [], `${subclass.id}/${feature.name} unexpectedly exposes rule details`)
    }
  }
})

test("Tragedy stays explicitly outside official Wizards college labeling", () => {
  const tragedy = bardReferenceCurrent.subclasses.find((subclass) => subclass.id === "tragedy")
  assert.ok(tragedy)
  assert.match(bardReferenceCurrent.description, /девяти коллегий/i)
})
