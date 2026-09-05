import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacter, type BaseCharacter, type CharacterState } from "../src/character-engine/index.ts"
import { inventoryMechanicContributions } from "../src/lib/characterMechanics.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const characterId = "e1b23a38-7191-436f-a138-f3a9f4c928a4"

const gary: BaseCharacter = {
  id: characterId,
  name: "Гэри Похерр",
  level: 5,
  abilities: {
    strength: 18,
    dexterity: 12,
    constitution: 16,
    intelligence: 8,
    wisdom: 10,
    charisma: 14,
  },
  baseMaxHp: 49,
  baseSpeed: 30,
  skillProficiencies: {
    athletics: 1,
    intimidation: 1,
  },
  savingThrowProficiencies: {
    strength: 1,
    constitution: 1,
  },
}

const state: CharacterState = { currentHp: 49, tempHp: 0 }

function item(overrides: Pick<InventoryItem, "id" | "name" | "equipment_slot" | "mechanics"> & Partial<InventoryItem>): InventoryItem {
  return {
    id: overrides.id,
    character_id: characterId,
    name: overrides.name,
    quantity: 1,
    weight: null,
    equipped: true,
    category: "equipment",
    equipment_slot: overrides.equipment_slot,
    image_url: null,
    description: "",
    mechanics: overrides.mechanics,
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    item_state: {},
    version: 0,
    sort_order: 0,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    ...overrides,
  }
}

const sword = item({
  id: "gary-sword",
  name: "Меч, который должен был быть палочкой",
  equipment_slot: "main_hand",
  mechanics: [{
    id: "gary-longsword-attack",
    type: "action",
    key: "gary-longsword",
    label: "Атака длинным мечом",
    economy: "action",
    activation: "equipped",
    range: { kind: "melee", reach: 5, unit: "ft" },
    attackAbility: "strength",
    proficient: true,
    attackFlat: 0,
    damage: [{ key: "slashing", label: "Рубящий урон", damageType: "slashing", count: 1, sides: 8, ability: "strength", flat: 0 }],
    tags: ["weapon", "martial", "longsword"],
  }],
})

const chainMail = item({
  id: "gary-chainmail",
  name: "Кольчуга факультета Стальных Нервов",
  equipment_slot: "chest",
  mechanics: [{
    id: "gary-chainmail-ac",
    type: "formula",
    label: "Кольчуга: КД 16",
    activation: "equipped",
    target: "combat.ac",
    operation: "SET_FORMULA",
    formula: { kind: "literal", value: 16 },
  }],
})

const shield = item({
  id: "gary-shield",
  name: "Крышка от волшебного котла",
  equipment_slot: "off_hand",
  mechanics: [{
    id: "gary-shield-ac",
    type: "numeric",
    label: "Щит: +2 КД",
    activation: "equipped",
    target: "combat.ac",
    operation: "ADD",
    value: 2,
  }],
})

function resolveWith(items: InventoryItem[]) {
  return resolveCharacter(gary, state, inventoryMechanicContributions(items))
}

test("Gary fighter equipment resolves armor, shield and longsword attack end to end", () => {
  const resolved = resolveWith([sword, chainMail, shield])

  assert.equal(resolved.proficiencyBonus.value, 3)
  assert.equal(resolved.abilities.strength.modifier, 4)
  assert.equal(resolved.combat.ac.value, 18)
  assert.equal(resolved.savingThrows.strength.bonus.value, 7)
  assert.equal(resolved.savingThrows.constitution.bonus.value, 6)
  assert.equal(resolved.skills.athletics.bonus.value, 7)
  assert.equal(resolved.skills.intimidation.bonus.value, 5)

  const attack = resolved.actions.find((action) => action.key === "gary-longsword")
  assert.ok(attack)
  assert.equal(attack.economy, "action")
  assert.deepEqual(attack.range, { kind: "melee", reach: 5, unit: "ft" })
  assert.equal(attack.attack?.bonus.value, 7)
  assert.equal(attack.damage.length, 1)
  assert.deepEqual(attack.damage[0]?.dice, { count: 1, sides: 8 })
  assert.equal(attack.damage[0]?.modifier.value, 4)
  assert.equal(attack.damage[0]?.type, "slashing")
})

test("unequipping Gary's shield immediately removes its AC bonus", () => {
  const withoutShield = resolveWith([sword, chainMail, { ...shield, equipped: false }])
  assert.equal(withoutShield.combat.ac.value, 16)
})

test("unequipping Gary's sword removes its attack action", () => {
  const withoutSword = resolveWith([{ ...sword, equipped: false }, chainMail, shield])
  assert.equal(withoutSword.actions.some((action) => action.key === "gary-longsword"), false)
  assert.equal(withoutSword.combat.ac.value, 18)
})
