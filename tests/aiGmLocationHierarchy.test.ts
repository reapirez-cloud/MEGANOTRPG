import assert from "node:assert/strict"
import test from "node:test"

import { canContainLocation } from "../supabase/functions/voss-agent/location-hierarchy.ts"

test("a road cannot contain the city reached from it", () => {
  assert.equal(canContainLocation("site", "settlement"), false)
  assert.equal(canContainLocation("region", "settlement"), true)
})

test("a city contains districts, while equal-scale cities and districts are peers", () => {
  assert.equal(canContainLocation("settlement", "district"), true)
  assert.equal(canContainLocation("settlement", "settlement"), false)
  assert.equal(canContainLocation("district", "district"), false)
})

test("an entered small site can still be a genuine child of another site", () => {
  assert.equal(canContainLocation("site", "site"), true)
  assert.equal(canContainLocation("building", "room"), true)
  assert.equal(canContainLocation("room", "building"), false)
})
