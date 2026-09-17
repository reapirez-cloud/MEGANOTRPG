import assert from "node:assert/strict"
import test from "node:test"

import type { ResolvedResource } from "../src/character-engine/index.ts"
import { buildSpellbookRenderModel } from "../src/components/characters/spellbookRender.ts"

function resource(stateKey: string, current: number, maximum: number): ResolvedResource {
  return {
    key: stateKey,
    stateKey,
    current,
    max: { value: maximum },
  } as unknown as ResolvedResource
}

test("stage 3 expands every slot level into individual render cells", () => {
  const model = buildSpellbookRenderModel({
    resources: [resource("spell_slot_1", 3, 4)],
    spells: [],
    mode: "known",
    selectedLevel: null,
  })

  const first = model.slotRail[0]
  assert.ok(first)
  assert.equal(first.maximum, 4)
  assert.equal(first.cells.length, 4)
  assert.deepEqual(first.cells.map((cell) => cell.filled), [true, true, true, false])
})

test("stage 3 marks a real unlocked level as depleted without locking it", () => {
  const model = buildSpellbookRenderModel({
    resources: [resource("spell_slot_2", 0, 3)],
    spells: [],
    mode: "known",
    selectedLevel: 2,
  })

  const second = model.slotRail[1]
  assert.ok(second)
  assert.equal(second.available, true)
  assert.equal(second.depleted, true)
  assert.deepEqual(second.cells.map((cell) => cell.filled), [false, false, false])
})

test("stage 3 keeps unavailable levels visibly different from spent levels", () => {
  const model = buildSpellbookRenderModel({
    resources: [resource("spell_slot_1", 0, 2)],
    spells: [],
    mode: "known",
    selectedLevel: null,
  })

  const spent = model.slotRail[0]
  const locked = model.slotRail[1]
  assert.equal(spent?.available, true)
  assert.equal(spent?.depleted, true)
  assert.equal(spent?.cells.length, 2)
  assert.equal(locked?.available, false)
  assert.equal(locked?.depleted, false)
  assert.equal(locked?.cells.length, 0)
})

test("stage 3 cell projection follows clamped runtime current values", () => {
  const model = buildSpellbookRenderModel({
    resources: [
      resource("spell_slot_1", 99, 4),
      resource("spell_slot_2", -4, 3),
    ],
    spells: [],
    mode: "known",
    selectedLevel: null,
  })

  assert.deepEqual(model.slotRail[0]?.cells.map((cell) => cell.filled), [true, true, true, true])
  assert.deepEqual(model.slotRail[1]?.cells.map((cell) => cell.filled), [false, false, false])
})
