import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createEngineCommandContext, EngineCommandError } from "../src/engine-contracts/index.ts"
import { CheburashkaEngine } from "../src/inventory-engine/engine.ts"
import { MemoryCheburashkaStorage } from "../src/inventory-engine/memory.ts"
import type { InventoryPhysicalProfile } from "../src/inventory-engine/profile.ts"
import { LarisaEngine } from "../src/location-engine/engine.ts"
import { MemoryLarisaStorage } from "../src/location-engine/memory.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const campaignId = "00000000-0000-4000-8000-000000008001"
const characterId = "00000000-0000-4000-8000-000000008002"
const userId = "00000000-0000-4000-8000-000000008003"
const storageId = "00000000-0000-4000-8000-000000008004"
const locationA = "00000000-0000-4000-8000-000000008005"
const locationB = "00000000-0000-4000-8000-000000008006"

function context(id: string, authority: "gm" | "player" = "gm") {
  return createEngineCommandContext({
    commandId: id,
    occurredAt: "2026-09-16T07:00:00.000Z",
    campaignId,
    requestedBy: userId,
    authority,
    actorCharacterId: authority === "player" ? characterId : undefined,
  })
}

function profile(role: string, container = false): InventoryPhysicalProfile {
  return {
    semantic_role: role,
    packing_mode: "instance",
    footprint_mode: "compact_1x1",
    shape_mask: ["1"],
    shape_width: 1,
    shape_height: 1,
    rotatable: false,
    stack_max: null,
    ...(container ? {
      container_profile: {
        internal_grid_width: 6,
        internal_grid_height: 6,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    } : {}),
  }
}

function item(id: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    character_id: characterId,
    world_storage_id: null,
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
    placement_kind: "root",
    placement_index: null,
    grid_x: null,
    grid_y: null,
    grid_rotation: 0,
    inventory_profile: profile("other.test"),
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-16T07:00:00.000Z",
    updated_at: "2026-09-16T07:00:00.000Z",
    ...overrides,
  }
}

function worldRoot(): InventoryItem {
  return item("world-root", {
    character_id: null,
    world_storage_id: storageId,
    name: "Сундук",
    category: "container",
    inventory_profile: profile("container.world", true),
    item_state: { world_storage_root: true },
  })
}

test("Stage 8 moves one container subtree to world storage without copying identities", async () => {
  const root = worldRoot()
  const bag = item("bag", {
    category: "container",
    inventory_profile: profile("container.bag", true),
  })
  const gem = item("gem", {
    holder_item_id: bag.id,
    placement_kind: "grid",
    grid_x: 0,
    grid_y: 0,
  })
  const storage = new MemoryCheburashkaStorage([root, bag, gem])
  const engine = new CheburashkaEngine(storage)

  await engine.execute({
    kind: "inventory.store_world",
    context: context("00000000-0000-4000-8000-000000008011"),
    characterId,
    itemId: bag.id,
    worldStorageId: storageId,
    amount: 1,
    placement: { kind: "grid", holderItemId: root.id, gridX: 0, gridY: 0, rotation: 0 },
    expectedVersion: 1,
  })

  assert.deepEqual((await engine.listCharacterItems(characterId)).map((entry) => entry.id), [])
  const inWorld = await engine.listWorldStorageItems(storageId)
  assert.deepEqual(new Set(inWorld.map((entry) => entry.id)), new Set([root.id, bag.id, gem.id]))
  assert.equal(inWorld.find((entry) => entry.id === bag.id)?.holder_item_id, root.id)
  assert.equal(inWorld.find((entry) => entry.id === gem.id)?.holder_item_id, bag.id)
  assert.equal(inWorld.find((entry) => entry.id === gem.id)?.world_storage_id, storageId)

  const movedBag = inWorld.find((entry) => entry.id === bag.id)
  assert.ok(movedBag)
  await engine.execute({
    kind: "inventory.take_world",
    context: context("00000000-0000-4000-8000-000000008012"),
    worldStorageId: storageId,
    itemId: bag.id,
    characterId,
    amount: 1,
    placement: { kind: "root" },
    expectedVersion: movedBag.version,
  })

  const back = await engine.listCharacterItems(characterId)
  assert.deepEqual(new Set(back.map((entry) => entry.id)), new Set([bag.id, gem.id]))
  assert.equal(back.find((entry) => entry.id === bag.id)?.holder_item_id, null)
  assert.equal(back.find((entry) => entry.id === gem.id)?.holder_item_id, bag.id)
  assert.equal((await engine.listWorldStorageItems(storageId)).length, 1)
})

test("Stage 8 bulk transfer splits quantity but never duplicates total quantity", async () => {
  const root = worldRoot()
  const arrows = item("arrows", {
    quantity: 20,
    stack_mode: "stack",
    inventory_profile: {
      ...profile("ammo.arrow"),
      packing_mode: "bulk_stack",
      stack_max: 100,
    },
  })
  const storage = new MemoryCheburashkaStorage([root, arrows])
  const engine = new CheburashkaEngine(storage)

  await engine.execute({
    kind: "inventory.store_world",
    context: context("00000000-0000-4000-8000-000000008021"),
    characterId,
    itemId: arrows.id,
    worldStorageId: storageId,
    amount: 7,
    placement: { kind: "grid", holderItemId: root.id, gridX: 0, gridY: 0, rotation: 0 },
    expectedVersion: 1,
  })

  const carried = await engine.listCharacterItems(characterId)
  const world = (await engine.listWorldStorageItems(storageId)).filter((entry) => entry.id !== root.id)
  assert.equal(carried.reduce((sum, entry) => sum + entry.quantity, 0), 13)
  assert.equal(world.reduce((sum, entry) => sum + entry.quantity, 0), 7)
  assert.equal(carried.reduce((sum, entry) => sum + entry.quantity, 0) + world.reduce((sum, entry) => sum + entry.quantity, 0), 20)
})

test("Stage 8 Larisa keeps storage identity while GM moves only its location fact", async () => {
  const storage = new MemoryLarisaStorage({
    characterStates: [],
    locations: [
      { id: locationA, name: "A", parent_location_id: null, image_url: null, visibility_mode: "public", lifecycle_state: "active" },
      { id: locationB, name: "B", parent_location_id: null, image_url: null, visibility_mode: "public", lifecycle_state: "active" },
    ],
    scenes: [],
    sceneParticipants: [],
    worldStorages: [],
  })
  const engine = new LarisaEngine(storage)

  const created = await engine.execute({
    kind: "world.storage_create",
    context: context("00000000-0000-4000-8000-000000008031"),
    input: {
      locationId: locationA,
      storageKind: "chest",
      name: "Сундук",
      description: "",
      visibilityMode: "campaign",
      accessMode: "shared",
      ownerCharacterId: null,
    },
  })
  const createdId = String(created.value.details.storageId)
  const before = (await engine.loadCampaignSnapshot(campaignId)).worldStorages.find((entry) => entry.id === createdId)
  assert.ok(before)

  await engine.execute({
    kind: "world.storage_move",
    context: context("00000000-0000-4000-8000-000000008032"),
    worldStorageId: createdId,
    locationId: locationB,
    expectedVersion: before.version,
  })

  const after = (await engine.loadCampaignSnapshot(campaignId)).worldStorages.find((entry) => entry.id === createdId)
  assert.ok(after)
  assert.equal(after.id, before.id)
  assert.equal(after.root_item_id, before.root_item_id)
  assert.equal(after.location_id, locationB)
})

test("Stage 8 player may create/manage own stash but may not move world storage", async () => {
  const storage = new MemoryLarisaStorage({
    characterStates: [],
    locations: [{ id: locationA, name: "A", parent_location_id: null, image_url: null, visibility_mode: "public", lifecycle_state: "active" }],
    scenes: [],
    sceneParticipants: [],
    worldStorages: [],
  })
  const engine = new LarisaEngine(storage)

  await engine.execute({
    kind: "world.storage_create",
    context: context("00000000-0000-4000-8000-000000008041", "player"),
    input: {
      locationId: locationA,
      storageKind: "stash",
      name: "Мой тайник",
      description: "",
      visibilityMode: "owner",
      accessMode: "owner",
      ownerCharacterId: characterId,
    },
  })

  await assert.rejects(
    () => engine.execute({
      kind: "world.storage_move",
      context: context("00000000-0000-4000-8000-000000008042", "player"),
      worldStorageId: "world-storage-00000000-0000-4000-8000-000000008041",
      locationId: locationA,
      expectedVersion: 1,
    }),
    (reason: unknown) => reason instanceof EngineCommandError && reason.code === "world.gm_required",
  )
})

test("Stage 8 migration locks one item truth and server-authoritative world access", () => {
  const sql = fs.readFileSync("supabase/migrations/20260916070000_cheburashka_stage8_world_storage.sql", "utf8")
  assert.match(sql, /create table if not exists public\.world_storages/)
  assert.match(sql, /character_inventory_items_owner_scope_check/)
  assert.match(sql, /character_id is not null and world_storage_id is null/)
  assert.match(sql, /character_id is null and world_storage_id is not null/)
  assert.doesNotMatch(sql, /create table[^;]*world_inventory_items/i)
  assert.match(sql, /cheburashka_assert_world_storage_tree_v1/)
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*inventory:/)
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*world-storage:/)
  assert.match(sql, /p_expected_version/)
  assert.match(sql, /private\.can_operate_world_storage_v1/)
  assert.match(sql, /revoke all on function public\.store_inventory_item_in_world_v1[\s\S]*from public, anon/)
  assert.match(sql, /grant execute on function public\.take_inventory_item_from_world_v1[\s\S]*to authenticated/)
})
