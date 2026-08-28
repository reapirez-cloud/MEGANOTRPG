import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  executeAction,
  resolveCharacterContract,
  type CharacterEngineInput,
  type CharacterSource,
} from "../src/character-engine/index.ts"
import { contributionForStoredMechanic } from "../src/lib/characterMechanics.ts"
import type { StoredActionMechanic, StoredResourceMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260828180500_druid_native_runtime_completion.sql",
  "utf8",
)

const source: CharacterSource = {
  id: "template:class:druid:v3:source:wild-shape",
  name: "Дикая форма",
  sourceType: "class_template",
}

const resource: StoredResourceMechanic = {
  id: "wild-shape-resource",
  type: "resource",
  key: "wild_shape",
  label: "Дикая форма",
  max: 2,
  recharge: ["short_rest", "long_rest"],
}

const action: StoredActionMechanic = {
  id: "wild-shape-action",
  type: "action",
  key: "wild_shape",
  label: "Дикая форма",
  economy: "action",
  resourceCosts: [{ key: "wild_shape", amount: 1 }],
  effects: [
    { kind: "state", key: "wild_shape_active", operation: "SET", value: true },
    { kind: "semantic", key: "transformation", payload: { profile: "beast" } },
  ],
}

function input(): CharacterEngineInput {
  return {
    base: {
      id: "druid",
      name: "Друид",
      level: 5,
      abilities: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 8 },
      baseMaxHp: 34,
      baseSpeed: 30,
    },
    state: { currentHp: 34, tempHp: 0, resources: { wild_shape: { current: 2 } } },
    contributions: [
      contributionForStoredMechanic(resource, source),
      contributionForStoredMechanic(action, source),
    ],
  }
}

test("stored Druid action reaches CE with costs and mode effects", () => {
  const initial = input()
  const contract = resolveCharacterContract(initial)
  const wildShape = contract.actions.find((entry) => entry.key === "wild_shape")
  assert.ok(wildShape)
  assert.equal(wildShape.available, true)
  assert.equal(wildShape.resourceCosts[0]!.stateKey, "wild_shape")
  assert.equal(wildShape.effects[0]!.kind, "state")
  assert.equal(wildShape.effects[1]!.kind, "semantic")
  assert.equal(wildShape.effects[1]!.kind === "semantic" ? wildShape.effects[1]!.key : "", "transformation")

  const nextState = executeAction(initial.state, wildShape)
  assert.equal(nextState.resources?.wild_shape?.current, 1)
  assert.equal(nextState.facts?.wild_shape_active, true)
})

test("Druid runtime migration declares native mode, conversions, and Beast Spells permission", () => {
  assert.match(migration, /"key":"wild_shape_active","operation":"SET"/)
  assert.match(migration, /"key":"wild_shape_active","operation":"UNSET"/)
  assert.match(migration, /"costOptions"/)
  assert.match(migration, /"operation":"RESTORE","amount":1/)
  assert.match(migration, /"target":"permission"/)
  assert.match(migration, /spellcasting:while_transformed/)
  assert.match(migration, /class_spell_access_by_source/)
})
