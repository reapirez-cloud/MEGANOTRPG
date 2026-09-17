import assert from "node:assert/strict"
import test from "node:test"

import type { ResolvedResource } from "../src/character-engine/index.ts"
import type { CharacterSpell } from "../src/types/characterSheet.ts"
import { buildSpellbookRenderModel } from "../src/components/characters/spellbookRender.ts"

function resource(stateKey: string, current: number, maximum: number): ResolvedResource {
  return {
    key: stateKey,
    stateKey,
    current,
    max: { value: maximum },
  } as unknown as ResolvedResource
}

function spell(id: string, level: number): CharacterSpell {
  return {
    id,
    spell_level: level,
    prepared: false,
  } as unknown as CharacterSpell
}

test("stage 2 spell rail always exposes circles one through nine in order", () => {
  const model = buildSpellbookRenderModel({
    resources: [
      resource("spell_slot_1", 4, 4),
      resource("spell_slot_2", 2, 3),
      resource("spell_slot_4", 1, 1),
    ],
    spells: [spell("cantrip", 0), spell("level-two", 2)],
    mode: "known",
    selectedLevel: null,
  })

  assert.deepEqual(model.slotRail.map((slot) => slot.level), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(model.slotRail.filter((slot) => slot.available).map((slot) => slot.level), [1, 2, 4])
})

test("stage 2 spell rail carries the same current and max values as runtime resources", () => {
  const model = buildSpellbookRenderModel({
    resources: [
      resource("spell_slot_1", 3, 4),
      resource("spell_slot_2", 1, 3),
    ],
    spells: [],
    mode: "known",
    selectedLevel: null,
  })

  assert.deepEqual(
    model.slotRail.slice(0, 3).map(({ level, available, current, maximum }) => ({ level, available, current, maximum })),
    [
      { level: 1, available: true, current: 3, maximum: 4 },
      { level: 2, available: true, current: 1, maximum: 3 },
      { level: 3, available: false, current: 0, maximum: 0 },
    ],
  )
})

test("stage 2 spell rail clamps corrupted runtime counters before rendering", () => {
  const model = buildSpellbookRenderModel({
    resources: [
      resource("spell_slot_1", 9, 4),
      resource("spell_slot_2", -2, 3),
    ],
    spells: [],
    mode: "known",
    selectedLevel: null,
  })

  assert.equal(model.slotRail[0]?.current, 4)
  assert.equal(model.slotRail[1]?.current, 0)
})
