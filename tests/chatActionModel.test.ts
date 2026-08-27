import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract, type CharacterContribution, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { buildChatActionModel } from "../src/components/chat/chatActionModel.ts"

const classSource = { id: "template:class:monk:v1:base", name: "Монах", sourceType: "class_template" }
const staffSource = { id: "item:fire-staff", name: "Посох Огня", sourceType: "inventory_item" }
const swordSource = { id: "item:sword", name: "Меч", sourceType: "inventory_item" }

function contract() {
  const contributions: CharacterContribution[] = [
    { id: "ki", kind: "grant", operation: "GRANT", target: "resource", key: "ki", payload: { max: 5, label: "Ци", recharge: { triggers: ["short_rest"], restore: "full" } }, source: classSource },
    { id: "flurry", kind: "grant", operation: "GRANT", target: "action", key: "flurry", payload: { label: "Шквал ударов", economy: "bonus_action", resourceCosts: [{ key: "ki", amount: 1 }] }, source: classSource },
    { id: "sword", kind: "grant", operation: "GRANT", target: "action", key: "sword", payload: { label: "Меч", economy: "action", attack: { bonus: { kind: "reference", key: "core.proficiencyBonus" } }, damage: [{ key: "slash", type: "slashing", dice: { count: 1, sides: 8 } }] }, source: swordSource },
    { id: "charges", kind: "grant", operation: "GRANT", target: "resource", key: "staff_charges", payload: { max: 10, label: "Заряды посоха", recharge: { triggers: ["dawn"], restore: "amount", amount: 2 } }, source: staffSource },
    { id: "staff-action", kind: "grant", operation: "GRANT", target: "action", key: "fire-wave", payload: { label: "Огненная волна", economy: "action", damage: [{ key: "fire", type: "fire", dice: { count: 3, sides: 6 } }], resourceCosts: [{ key: "staff_charges", amount: 2 }] }, source: staffSource },
    { id: "staff-spell", kind: "grant", operation: "GRANT", target: "spell", key: "fireball", variantKey: "staff", payload: { spell: { name: "Огненный шар", level: 3 }, preparation: { mode: "not_required" }, methods: [{ key: "staff", kind: "item", requiresPrepared: false, resourceOptions: [{ key: "cast", castLevel: 3, costs: [{ key: "staff_charges", amount: 3 }] }] }] }, source: staffSource },
  ]
  const input: CharacterEngineInput = {
    base: { id: "hero", name: "Ниель", level: 5, abilities: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 }, baseMaxHp: 30, baseSpeed: 30 },
    state: { currentHp: 30, tempHp: 0, resources: { ki: { current: 3 }, staff_charges: { current: 4 } } },
    contributions,
  }
  return resolveCharacterContract(input)
}

test("chat action model separates ordinary attacks from class and unique source groups", () => {
  const model = buildChatActionModel(contract())

  assert.deepEqual(model.attacks.map((action) => action.key), ["sword"])
  assert.equal(model.classGroups.length, 1)
  assert.equal(model.classGroups[0]?.name, "Монах")
  assert.deepEqual(model.classGroups[0]?.resources.map((resource) => resource.key), ["ki"])
  assert.deepEqual(model.classGroups[0]?.actions.map((action) => action.key), ["flurry"])

  assert.equal(model.uniqueGroups.length, 1)
  assert.equal(model.uniqueGroups[0]?.name, "Посох Огня")
  assert.deepEqual(model.uniqueGroups[0]?.resources.map((resource) => resource.key), ["staff_charges"])
  assert.deepEqual(model.uniqueGroups[0]?.actions.map((action) => action.key), ["fire-wave"])
  assert.deepEqual(model.uniqueGroups[0]?.spells.map((spell) => spell.key), ["fireball"])
})

test("powered item actions stay unique while an ordinary weapon stays in attacks", () => {
  const resolved = contract()
  const model = buildChatActionModel(resolved)
  const staff = model.uniqueGroups.find((group) => group.name === "Посох Огня")
  assert.equal(staff?.resources[0]?.current, 4)
  assert.equal(staff?.resources[0]?.max.value, 10)
  assert.equal(staff?.actions[0]?.available, true)
  assert.equal(model.attacks.some((action) => action.key === "fire-wave"), false)
})
