import assert from "node:assert/strict"
import test from "node:test"

import {
  ActionEngineError,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "critical-threshold-test",
  name: "Critical Threshold Test",
  level: 15,
  abilities: {
    strength: 18,
    dexterity: 12,
    constitution: 16,
    intelligence: 8,
    wisdom: 10,
    charisma: 14,
  },
  baseMaxHp: 60,
  baseSpeed: 30,
}

const source = { id: "critical-source", name: "Critical Source" }

function attackAction(criticalThreshold?: number): CharacterContribution {
  return {
    id: "weapon-attack",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "weapon_attack",
    payload: {
      label: "Weapon attack",
      economy: "action",
      attack: {
        bonus: { kind: "literal", value: 7 },
        ...(criticalThreshold === undefined ? {} : { criticalThreshold }),
      },
    },
    source,
  }
}

function criticalValue(value: number, priority: number): CharacterContribution {
  return {
    id: `critical-threshold-${value}`,
    kind: "grant",
    operation: "REPLACE",
    target: "value",
    key: "attack_critical_threshold",
    priority,
    payload: { value, label: "Attack critical threshold" },
    source,
  }
}

function resolve(contributions: CharacterContribution[]) {
  return resolveCharacter(base, { currentHp: 60, tempHp: 0 }, contributions)
}

test("attack actions default to critical threshold 20", () => {
  const action = resolve([attackAction()]).actions[0]
  assert.equal(action?.attack?.criticalThreshold, 20)
})

test("global attack_critical_threshold value applies to attacks without an explicit threshold", () => {
  const action = resolve([attackAction(), criticalValue(19, 3)]).actions[0]
  assert.equal(action?.attack?.criticalThreshold, 19)
})

test("higher-priority replacement supports Champion 18-20 progression", () => {
  const action = resolve([
    attackAction(),
    criticalValue(19, 3),
    criticalValue(18, 15),
  ]).actions[0]
  assert.equal(action?.attack?.criticalThreshold, 18)
})

test("explicit per-action critical threshold overrides the global value", () => {
  const action = resolve([attackAction(17), criticalValue(18, 15)]).actions[0]
  assert.equal(action?.attack?.criticalThreshold, 17)
})

test("invalid global critical threshold is rejected", () => {
  assert.throws(
    () => resolve([attackAction(), criticalValue(21, 3)]),
    (error: unknown) =>
      error instanceof ActionEngineError &&
      /attack_critical_threshold resolved to 21/.test(error.message),
  )
})
