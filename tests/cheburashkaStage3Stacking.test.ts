import assert from "node:assert/strict"
import test from "node:test"

import {
  createEngineCommandContext,
  EngineCommandError,
} from "../src/engine-contracts/index.ts"
import { CheburashkaEngine } from "../src/inventory-engine/engine.ts"
import { MemoryCheburashkaStorage } from "../src/inventory-engine/memory.ts"
import { inventoryStackMode } from "../src/inventory-engine/stacking.ts"
import type {
  InventoryInput,
  InventoryItem,
} from "../src/types/characterSheet.ts"

const campaignId = "00000000-0000-4000-8000-000000000301"
const characterId = "00000000-0000-4000-8000-000000000302"
const otherCharacterId = "00000000-0000-4000-8000-000000000303"
const userId = "00000000-0000-4000-8000-000000000304"

function context(commandId: string) {
  return createEngineCommandContext({
    commandId,
    occurredAt: "2026-09-15T16:45:00.000Z",
    campaignId,
    requestedBy: userId,
    authority: "gm",
    actorCharacterId: characterId,
  })
}

function input(overrides: Partial<InventoryInput> = {}): InventoryInput {
  return {
    name: "Стрелы",
    quantity: 10,
    weight: 0.05,
    equipped: false,
    category: "material",
    equipment_slot: null,
    image_url: null,
    description: "",
    mechanics: [],
    usage_mode: "quantity",
    charges_current: null,
    charges_max: null,
    stack_mode: "stack",
    item_state: {},
    ...overrides,
  }
}

function item(id: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    character_id: characterId,
    name: "Стрелы",
    quantity: 10,
    weight: 0.05,
    equipped: false,
    category: "material",
    equipment_slot: null,
    image_url: null,
    description: "",
    mechanics: [],
    usage_mode: "quantity",
    charges_current: null,
    charges_max: null,
    stack_mode: "stack",
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-15T16:00:00.000Z",
    updated_at: "2026-09-15T16:00:00.000Z",
    ...overrides,
  }
}

test("forced stateful categories resolve to independent instances", () => {
  assert.equal(inventoryStackMode(input({ category: "equipment", usage_mode: "none" })), "instance")
  assert.equal(inventoryStackMode(input({ category: "container", usage_mode: "none" })), "instance")
  assert.equal(inventoryStackMode(input({ category: "quest", usage_mode: "none" })), "instance")
  assert.equal(inventoryStackMode(input({ category: "other", usage_mode: "charges" })), "instance")
  assert.equal(inventoryStackMode(input({ category: "material", usage_mode: "quantity" })), "stack")
})

test("unspecified stack mode defaults to an independent instance", () => {
  const candidate = input({ quantity: 1 })
  delete candidate.stack_mode
  assert.equal(inventoryStackMode(candidate), "instance")
})

test("forced instances cannot be created with quantity above one", async () => {
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage())

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.create",
      context: context("00000000-0000-4000-8000-000000000311"),
      characterId,
      input: input({
        name: "Два меча в одном объекте",
        category: "equipment",
        equipment_slot: "main_hand",
        usage_mode: "none",
        quantity: 2,
      }),
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.instance_quantity",
  )
})

test("GM can mark an otherwise stackable item as an independent instance", async () => {
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage())

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.create",
      context: context("00000000-0000-4000-8000-000000000312"),
      characterId,
      input: input({
        name: "Именная стрела",
        stack_mode: "instance",
        quantity: 2,
      }),
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.instance_quantity",
  )
})

test("partial transfer splits a normal stack and preserves stack mode", async () => {
  const storage = new MemoryCheburashkaStorage([
    item("arrows", { quantity: 10, version: 4 }),
  ])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.transfer",
    context: context("00000000-0000-4000-8000-000000000313"),
    fromCharacterId: characterId,
    toCharacterId: otherCharacterId,
    itemId: "arrows",
    amount: 3,
    expectedVersion: 4,
  })

  assert.equal(result.value.after?.quantity, 7)
  assert.equal(result.value.destinationItem?.quantity, 3)
  assert.equal(result.value.after?.stack_mode, "stack")
  assert.equal(result.value.destinationItem?.stack_mode, "stack")
})

test("defensive legacy instance stacks cannot be split", async () => {
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([
    item("legacy-wand-stack", {
      name: "Невозможная стопка жезлов",
      quantity: 2,
      usage_mode: "charges",
      charges_current: 3,
      charges_max: 3,
      stack_mode: "instance",
    }),
  ]))

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.transfer",
      context: context("00000000-0000-4000-8000-000000000314"),
      fromCharacterId: characterId,
      toCharacterId: otherCharacterId,
      itemId: "legacy-wand-stack",
      amount: 1,
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.instance_split_forbidden",
  )
})

test("whole instance transfer moves state instead of cloning it", async () => {
  const storage = new MemoryCheburashkaStorage([
    item("wand", {
      name: "Жезл",
      quantity: 1,
      usage_mode: "charges",
      charges_current: 2,
      charges_max: 5,
      stack_mode: "instance",
      item_state: {
        recharge: { triggers: ["long_rest"], restore: "full" },
      },
      version: 7,
    }),
  ])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.transfer",
    context: context("00000000-0000-4000-8000-000000000315"),
    fromCharacterId: characterId,
    toCharacterId: otherCharacterId,
    itemId: "wand",
    amount: 1,
    expectedVersion: 7,
  })

  assert.equal(result.value.after, null)
  assert.equal(result.value.destinationItem?.character_id, otherCharacterId)
  assert.equal(result.value.destinationItem?.quantity, 1)
  assert.equal(result.value.destinationItem?.charges_current, 2)
  assert.equal(result.value.destinationItem?.charges_max, 5)
  assert.equal(result.value.destinationItem?.stack_mode, "instance")
})
