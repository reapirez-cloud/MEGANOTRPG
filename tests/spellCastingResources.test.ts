import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
} from "../src/character-engine/index.ts"
import { spellCastingResources } from "../src/components/characters/spellSlots.ts"

const warlockSource = {
  id: "template:class:warlock:v1",
  name: "Колдун",
  sourceType: "class_template",
}

test("CE casting resources expose Pact Magic without spell_slot_N aliases", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "pact-slots",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "warlock_pact_slots",
      payload: {
        max: 3,
        label: "Ячейки Магии договора",
        recharge: { triggers: ["short_rest", "long_rest"], restore: "full" },
      },
      source: warlockSource,
    },
    {
      id: "pact-spell",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "spell:hex",
      variantKey: "warlock:pact:hex",
      payload: {
        spell: { name: "Сглаз", level: 1 },
        preparation: { mode: "always_prepared" },
        methods: [{
          key: "pact-5",
          kind: "pact_magic",
          ability: "charisma",
          requiresPrepared: false,
          resourceOptions: [{
            key: "warlock-pact-5",
            castLevel: 5,
            costs: [{ key: "warlock_pact_slots", amount: 1 }],
          }],
        }],
      },
      source: warlockSource,
    },
  ]

  const contract = resolveCharacterContract({
    base: {
      id: "warlock",
      name: "Кевин",
      level: 14,
      abilities: {
        strength: 8,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 20,
      },
      baseMaxHp: 90,
      baseSpeed: 30,
    },
    state: {
      currentHp: 90,
      tempHp: 0,
      resources: { warlock_pact_slots: { current: 3 } },
    },
    contributions,
  })

  const channels = spellCastingResources(contract.resources, contract.spells)

  assert.equal(channels.length, 1)
  assert.equal(channels[0]?.resource.stateKey, "warlock_pact_slots")
  assert.equal(channels[0]?.resource.current, 3)
  assert.equal(channels[0]?.resource.max.value, 3)
  assert.equal(channels[0]?.level, 5)
})
