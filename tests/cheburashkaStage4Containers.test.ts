import assert from "node:assert/strict"
import test from "node:test"

import {
  createEngineCommandContext,
  EngineCommandError,
} from "../src/engine-contracts/index.ts"
import { CheburashkaEngine } from "../src/inventory-engine/engine.ts"
import {
  inventoryChildren,
  inventoryContainerTargets,
} from "../src/inventory-engine/holders.ts"
import { MemoryCheburashkaStorage } from "../src/inventory-engine/memory.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const campaignId = "00000000-0000-4000-8000-000000000401"
const characterId = "00000000-0000-4000-8000-000000000402"
const otherCharacterId = "00000000-0000-4000-8000-000000000403"
const userId = "00000000-0000-4000-8000-000000000404"

function context(commandId: string, authority: "gm" | "player" = "gm") {
  return createEngineCommandContext({
    commandId,
    occurredAt: "2026-09-15T16:55:00.000Z",
    campaignId,
    requestedBy: userId,
    authority,
    actorCharacterId: characterId,
  })
}

function item(id: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    character_id: characterId,
    name: id,
    quantity: 1,
    weight: 1,
    equipped: false,
    category: "other",
    equipment_slot: null,
    image_url: null,
    description: "",
    mechanics: [],
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    stack_mode: "instance",
    holder_item_id: null,
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-15T16:00:00.000Z",
    updated_at: "2026-09-15T16:00:00.000Z",
    ...overrides,
  }
}

test("player can move an owned item into a container and it is unequipped", async () => {
  const bag = item("bag", { category: "container" })
  const sword = item("sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    equipped: true,
  })
  const storage = new MemoryCheburashkaStorage([bag, sword])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.move",
    context: context("00000000-0000-4000-8000-000000000411", "player"),
    characterId,
    itemId: sword.id,
    holderItemId: bag.id,
    expectedVersion: 1,
  })

  assert.equal(result.value.after?.holder_item_id, bag.id)
  assert.equal(result.value.after?.equipped, false)
  assert.equal(result.value.after?.version, 2)
})

test("only real containers can be holders", async () => {
  const book = item("book", { category: "book" })
  const rope = item("rope")
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([book, rope]))

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.move",
      context: context("00000000-0000-4000-8000-000000000412", "player"),
      characterId,
      itemId: rope.id,
      holderItemId: book.id,
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.holder_not_container",
  )
})

test("container hierarchy rejects cycles", async () => {
  const bag = item("bag", { category: "container" })
  const pouch = item("pouch", {
    category: "container",
    holder_item_id: bag.id,
  })
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([bag, pouch]))

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.move",
      context: context("00000000-0000-4000-8000-000000000413", "player"),
      characterId,
      itemId: bag.id,
      holderItemId: pouch.id,
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.holder_cycle",
  )
})

test("non-empty container cannot be deleted", async () => {
  const bag = item("bag", { category: "container" })
  const rope = item("rope", { holder_item_id: bag.id })
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([bag, rope]))

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.remove",
      context: context("00000000-0000-4000-8000-000000000414"),
      characterId,
      itemId: bag.id,
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.container_not_empty",
  )
})

test("transferring a container moves its entire nested subtree", async () => {
  const bag = item("bag", { category: "container", version: 4 })
  const pouch = item("pouch", {
    category: "container",
    holder_item_id: bag.id,
    version: 2,
  })
  const gem = item("gem", {
    category: "trinket",
    holder_item_id: pouch.id,
    version: 3,
  })
  const storage = new MemoryCheburashkaStorage([bag, pouch, gem])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.transfer",
    context: context("00000000-0000-4000-8000-000000000415"),
    fromCharacterId: characterId,
    toCharacterId: otherCharacterId,
    itemId: bag.id,
    amount: 1,
    expectedVersion: 4,
  })

  assert.equal(result.value.destinationItem?.character_id, otherCharacterId)
  assert.equal(result.value.destinationItem?.holder_item_id, null)
  assert.equal(result.value.relatedChanges?.length, 2)

  const movedPouch = await storage.getItem(pouch.id)
  const movedGem = await storage.getItem(gem.id)
  assert.equal(movedPouch?.character_id, otherCharacterId)
  assert.equal(movedPouch?.holder_item_id, bag.id)
  assert.equal(movedGem?.character_id, otherCharacterId)
  assert.equal(movedGem?.holder_item_id, pouch.id)
})

test("partial transfer from a container keeps the source inside and creates a root destination stack", async () => {
  const bag = item("bag", { category: "container" })
  const arrows = item("arrows", {
    category: "material",
    usage_mode: "quantity",
    stack_mode: "stack",
    quantity: 10,
    holder_item_id: bag.id,
    version: 5,
  })
  const storage = new MemoryCheburashkaStorage([bag, arrows])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.transfer",
    context: context("00000000-0000-4000-8000-000000000416"),
    fromCharacterId: characterId,
    toCharacterId: otherCharacterId,
    itemId: arrows.id,
    amount: 3,
    expectedVersion: 5,
  })

  assert.equal(result.value.after?.quantity, 7)
  assert.equal(result.value.after?.holder_item_id, bag.id)
  assert.equal(result.value.destinationItem?.quantity, 3)
  assert.equal(result.value.destinationItem?.holder_item_id, null)
  assert.equal(result.value.destinationItem?.character_id, otherCharacterId)
})

test("container target helper hides self, current holder and descendants", () => {
  const bag = item("bag", { category: "container" })
  const pouch = item("pouch", {
    category: "container",
    holder_item_id: bag.id,
  })
  const box = item("box", { category: "container" })

  assert.deepEqual(
    inventoryChildren([bag, pouch, box], bag.id).map((entry) => entry.id),
    [pouch.id],
  )

  assert.deepEqual(
    inventoryContainerTargets([bag, pouch, box], bag).map((entry) => entry.id),
    [box.id],
  )
})
