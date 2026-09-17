import assert from "node:assert/strict"
import test from "node:test"

import type { ResolvedResource } from "../src/character-engine/index.ts"
import type { CharacterSpell } from "../src/types/characterSheet.ts"
import { buildSpellbookRenderModel } from "../src/components/characters/spellbookRender.ts"
import { spellSlotLevel, spellSlotResources } from "../src/components/characters/spellSlots.ts"

function resource(key: string, stateKey: string, current = 1, maximum = 2): ResolvedResource {
  return {
    key,
    stateKey,
    current,
    max: { value: maximum },
  } as unknown as ResolvedResource
}

function spell(id: string, level: number, prepared: boolean): CharacterSpell {
  return {
    id,
    spell_level: level,
    prepared,
  } as unknown as CharacterSpell
}

test("spell slot rendering uses canonical runtime state keys for resolved levels", () => {
  const slots = spellSlotResources([
    resource("spell_slot_1", "spell_slot_1", 3, 4),
    resource("spell_slot_1", "spell_slot_2", 2, 3),
  ])

  assert.deepEqual(slots.map((slot) => slot.level), [1, 2])
  assert.equal(slots[0]?.resource.current, 3)
  assert.equal(slots[1]?.resource.current, 2)
})

test("spell slot level keeps source key as a legacy fallback", () => {
  assert.equal(spellSlotLevel(resource("spell_slot_3", "legacy_resource_state")), 3)
  assert.equal(spellSlotLevel(resource("other_resource", "other_state")), null)
})

test("spell tab render model derives filters, counts and levels from one projection", () => {
  const model = buildSpellbookRenderModel({
    resources: [
      resource("spell_slot_1", "spell_slot_1", 4, 4),
      resource("spell_slot_1", "spell_slot_2", 2, 3),
    ],
    spells: [
      spell("cantrip", 0, true),
      spell("level-one", 1, false),
      spell("level-two-prepared", 2, true),
      spell("level-two-known", 2, false),
    ],
    mode: "prepared",
    selectedLevel: 2,
  })

  assert.equal(model.preparedCount, 2)
  assert.equal(model.knownCount, 4)
  assert.deepEqual(model.levels, [0, 1, 2])
  assert.deepEqual(model.slotLevels, [1, 2])
  assert.deepEqual(model.visibleSpells.map((entry) => entry.id), ["level-two-prepared"])
})

test("known mode preserves every known spell at the selected level", () => {
  const model = buildSpellbookRenderModel({
    resources: [resource("spell_slot_1", "spell_slot_2", 1, 2)],
    spells: [
      spell("prepared", 2, true),
      spell("known", 2, false),
      spell("other-level", 1, true),
    ],
    mode: "known",
    selectedLevel: 2,
  })

  assert.deepEqual(model.visibleSpells.map((entry) => entry.id), ["prepared", "known"])
})
