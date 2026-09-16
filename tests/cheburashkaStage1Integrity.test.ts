import assert from "node:assert/strict"
import test from "node:test"

import {
  createEngineCommandContext,
  EngineCommandError,
} from "../src/engine-contracts/index.ts"
import { CheburashkaEngine } from "../src/inventory-engine/engine.ts"
import { MemoryCheburashkaStorage } from "../src/inventory-engine/memory.ts"
import type {
  InventoryInput,
  InventoryItem,
} from "../src/types/characterSheet.ts"

const campaignId = "00000000-0000-4000-8000-000000000001"
const characterId = "00000000-0000-4000-8000-000000000002"
const otherCharacterId = "00000000-0000-4000-8000-000000000003"
const userId = "00000000-0000-4000-8000-000000000004"

function context(commandId: string) {
  return createEngineCommandContext({
    commandId,
    occurredAt: "2026-09-15T13:00:00.000Z",
    campaignId,
    requestedBy: userId,
    authority: "gm",
    actorCharacterId: characterId,
  })
}

function input(overrides: Partial<InventoryInput> = {}): InventoryInput {
  return {
    name: "Тестовый меч",
    quantity: 1,
    weight: 1,
    equipped: false,
    category: "equipment",
    equipment_slot: "main_hand",
    image_url: null,
    description: "",
    definition_id: "00000000-0000-4000-8000-000000000010",
    definition_revision: 3,
    mechanics: [],
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    item_state: {},
    ...overrides,
  }
}

function item(
  id: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    id,
    character_id: characterId,
    name: "Тестовый меч",
    quantity: 1,
    weight: 1,
    equipped: false,
    category: "equipment",
    equipment_slot: "main_hand",
    image_url: null,
    description: "",
    definition_id: "00000000-0000-4000-8000-000000000010",
    definition_revision: 3,
    mechanics: [],
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    item_state: {},
    version: 4,
    sort_order: 0,
    created_at: "2026-09-15T12:00:00.000Z",
    updated_at: "2026-09-15T12:00:00.000Z",
    ...overrides,
  }
}

test("Cheburashka rejects stale optimistic updates", async () => {
  const engine = new CheburashkaEngine(
    new MemoryCheburashkaStorage([item("sword")]),
  )

  await assert.rejects(
    () =>
      engine.execute({
        kind: "inventory.update",
        context: context("00000000-0000-4000-8000-000000000101"),
        characterId,
        itemId: "sword",
        input: input({ name: "Новая версия" }),
        expectedVersion: 3,
      }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.version_conflict",
  )
})

test("equipping refuses to displace another equipped instance without a real destination", async () => {
  const shield = item("shield", {
    name: "Старый щит",
    equipment_slot: "off_hand",
    equipped: true,
    version: 2,
  })
  const twoHanded = item("greatsword", {
    name: "Двуручный меч",
    equipment_slot: "two_hands",
    equipped: false,
    version: 7,
  })
  const storage = new MemoryCheburashkaStorage([shield, twoHanded])
  const engine = new CheburashkaEngine(storage)

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.set_equipped",
      context: context("00000000-0000-4000-8000-000000000102"),
      characterId,
      itemId: "greatsword",
      equipped: true,
      equipmentSlot: "two_hands",
      expectedVersion: 7,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.equipment_slot_occupied",
  )

  assert.equal((await storage.getItem("shield"))?.equipped, true)
  assert.equal((await storage.getItem("shield"))?.version, 2)
  assert.equal((await storage.getItem("greatsword"))?.equipped, false)
  assert.equal((await storage.getItem("greatsword"))?.version, 7)
})

test("replaying the same command id is idempotent", async () => {
  const storage = new MemoryCheburashkaStorage()
  const engine = new CheburashkaEngine(storage)
  const command = {
    kind: "inventory.create" as const,
    context: context("00000000-0000-4000-8000-000000000103"),
    characterId,
    input: input(),
  }

  const first = await engine.execute(command)
  const second = await engine.execute(command)
  const items = await storage.listCharacterItems(characterId)

  assert.equal(items.length, 1)
  assert.equal(first.value.itemId, second.value.itemId)
  assert.equal(first.value.after?.version, 1)
  assert.equal(second.value.after?.version, 1)
})

test("partial transfer keeps Chasovoy definition provenance", async () => {
  const source = item("stack", {
    quantity: 3,
    category: "material",
    equipment_slot: null,
    stack_mode: "stack",
    version: 5,
    definition_id: "00000000-0000-4000-8000-000000000099",
    definition_revision: 11,
  })
  const engine = new CheburashkaEngine(
    new MemoryCheburashkaStorage([source]),
  )

  const result = await engine.execute({
    kind: "inventory.transfer",
    context: context("00000000-0000-4000-8000-000000000104"),
    fromCharacterId: characterId,
    toCharacterId: otherCharacterId,
    itemId: "stack",
    amount: 1,
    expectedVersion: 5,
  })

  assert.equal(result.value.after?.quantity, 2)
  assert.equal(result.value.destinationItem?.quantity, 1)
  assert.equal(
    result.value.destinationItem?.definition_id,
    source.definition_id,
  )
  assert.equal(
    result.value.destinationItem?.definition_revision,
    source.definition_revision,
  )
  assert.equal(result.value.destinationItem?.version, 1)
})

test("consume rejects a stale inventory snapshot", async () => {
  const potion = item("potion", {
    name: "Зелье",
    category: "consumable",
    equipment_slot: null,
    quantity: 2,
    usage_mode: "quantity",
    version: 6,
  })
  const engine = new CheburashkaEngine(
    new MemoryCheburashkaStorage([potion]),
  )

  await assert.rejects(
    () =>
      engine.execute({
        kind: "inventory.consume",
        context: context("00000000-0000-4000-8000-000000000105"),
        characterId,
        itemId: "potion",
        amount: 1,
        expectedVersion: 5,
      }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.version_conflict",
  )
})

test("zero-quantity inventory rows are rejected before persistence", async () => {
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage())

  await assert.rejects(
    () =>
      engine.execute({
        kind: "inventory.create",
        context: context("00000000-0000-4000-8000-000000000106"),
        characterId,
        input: input({ quantity: 0 }),
      }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.invalid_quantity",
  )
})
