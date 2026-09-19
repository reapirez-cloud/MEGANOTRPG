import assert from "node:assert/strict"
import test from "node:test"

import {
  canonicalCapabilityGrantKey,
} from "../src/lib/proficiencyIdentity.ts"

test("stage 4 canonicalizes historical armor and weapon category aliases", () => {
  assert.equal(
    canonicalCapabilityGrantKey("proficiency", "category:heavy_armor"),
    "armor:heavy",
  )
  assert.equal(
    canonicalCapabilityGrantKey("proficiency", "category:martial_weapons"),
    "weapon:martial",
  )
})

test("stage 4 canonicalizes open-catalog separators without corrupting skill ids", () => {
  assert.equal(
    canonicalCapabilityGrantKey("proficiency", "weapon:war_pick"),
    "weapon:war-pick",
  )
  assert.equal(
    canonicalCapabilityGrantKey("proficiency", "tool:herbalism_kit"),
    "tool:herbalism-kit",
  )
  assert.equal(
    canonicalCapabilityGrantKey("proficiency", "tool:brewers_supplies"),
    "tool:brewer-supplies",
  )
  assert.equal(
    canonicalCapabilityGrantKey("proficiency", "skill:animal_handling"),
    "skill:animal_handling",
  )
})

test("stage 4 canonicalizes language prefixes and separators", () => {
  assert.equal(
    canonicalCapabilityGrantKey("language", "language:common"),
    "common",
  )
  assert.equal(
    canonicalCapabilityGrantKey("language", "deep_speech"),
    "deep-speech",
  )
})
