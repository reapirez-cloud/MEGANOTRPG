import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createEngineCommandContext, EngineCommandError } from "../src/engine-contracts/index.ts"
import {
  CheburashkaEngine,
  MemoryCheburashkaStorage,
  inventoryHolderProblem,
} from "../src/inventory-engine/index.ts"
import type { InventoryPhysicalProfile } from "../src/inventory-engine/profile.ts"
import { LarisaEngine, MemoryLarisaStorage } from "../src/location-engine/index.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const campaignId = "00000000-0000-4000-8000-000000009001"
const characterA = "00000000-0000-4000-8000-000000009002"
const characterB = "00000000-0000-4000-8000-000000009003"
const userId = "00000000-0000-4000-8000-000000009004"
const surfaceA = "00000000-0000-4000-8000-000000009005"
const surfaceB = "00000000-0000-4000-8000-000000009006"
const sceneA = "00000000-0000-4000-8000-000000009007"
const sceneB = "00000000-0000-4000-8000-000000009008"
const locationA = "00000000-0000-4000-8000-000000009009"
const locationB = "00000000-0000-4000-8000-000000009010"

function context(commandId: string, actorCharacterId = characterA, authority: "gm" | "player" = "gm") {
  return createEngineCommandContext({
    commandId,
    occurredAt: "2026-09-16T09:00:00.000Z",
    campaignId,
    requestedBy: userId,
    authority,
    actorCharacterId,
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
    character_id: characterA,
    world_storage_id: null,
    surface_id: null,
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
    created_at: "2026-09-16T09:00:00.000Z",
    updated_at: "2026-09-16T09:00:00.000Z",
    ...overrides,
  }
}

test("Stage 9 moves one physical container subtree character -> Surface -> character without changing identities", async () => {
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
  const storage = new MemoryCheburashkaStorage([bag, gem])
  const engine = new CheburashkaEngine(storage)

  await engine.execute({
    kind: "inventory.place_surface",
    context: context("00000000-0000-4000-8000-000000009011"),
    characterId: characterA,
    itemId: bag.id,
    surfaceId: surfaceA,
    amount: 1,
    expectedVersion: 1,
  })

  assert.deepEqual(await engine.listCharacterItems(characterA), [])
  const placed = await engine.listSurfaceItems(surfaceA)
  assert.deepEqual(new Set(placed.map((entry) => entry.id)), new Set([bag.id, gem.id]))
  assert.equal(placed.find((entry) => entry.id === bag.id)?.placement_kind, "surface")
  assert.equal(placed.find((entry) => entry.id === gem.id)?.holder_item_id, bag.id)
  assert.equal(placed.find((entry) => entry.id === gem.id)?.surface_id, surfaceA)

  const placedBag = placed.find((entry) => entry.id === bag.id)
  assert.ok(placedBag)
  await engine.execute({
    kind: "inventory.take_surface",
    context: context("00000000-0000-4000-8000-000000009012"),
    surfaceId: surfaceA,
    itemId: bag.id,
    characterId: characterA,
    amount: 1,
    placement: { kind: "root" },
    expectedVersion: placedBag.version,
  })

  const returned = await engine.listCharacterItems(characterA)
  assert.deepEqual(new Set(returned.map((entry) => entry.id)), new Set([bag.id, gem.id]))
  assert.equal(returned.find((entry) => entry.id === bag.id)?.surface_id, null)
  assert.equal(returned.find((entry) => entry.id === gem.id)?.holder_item_id, bag.id)
  assert.equal(returned.find((entry) => entry.id === gem.id)?.surface_id, null)
  assert.deepEqual(await engine.listSurfaceItems(surfaceA), [])
})

test("Stage 9 partial Surface claims conserve stack quantity", async () => {
  const arrows = item("arrows", {
    quantity: 20,
    stack_mode: "stack",
    inventory_profile: {
      ...profile("ammo.arrow"),
      packing_mode: "bulk_stack",
      stack_max: 100,
    },
  })
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([arrows]))

  await engine.execute({
    kind: "inventory.place_surface",
    context: context("00000000-0000-4000-8000-000000009021"),
    characterId: characterA,
    itemId: arrows.id,
    surfaceId: surfaceA,
    amount: 7,
    expectedVersion: 1,
  })

  const carried = await engine.listCharacterItems(characterA)
  const surface = await engine.listSurfaceItems(surfaceA)
  assert.equal(carried.reduce((sum, entry) => sum + entry.quantity, 0), 13)
  assert.equal(surface.reduce((sum, entry) => sum + entry.quantity, 0), 7)
  assert.equal(
    carried.reduce((sum, entry) => sum + entry.quantity, 0)
      + surface.reduce((sum, entry) => sum + entry.quantity, 0),
    20,
  )
})

test("Stage 9 first Surface take wins and the second client receives stable already-taken", async () => {
  const loot = item("loot", {
    character_id: null,
    surface_id: surfaceA,
    placement_kind: "surface",
  })
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([loot]))

  await engine.execute({
    kind: "inventory.take_surface",
    context: context("00000000-0000-4000-8000-000000009031", characterA, "player"),
    surfaceId: surfaceA,
    itemId: loot.id,
    characterId: characterA,
    amount: 1,
    placement: { kind: "root" },
    expectedVersion: 1,
  })

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.take_surface",
      context: context("00000000-0000-4000-8000-000000009032", characterB, "player"),
      surfaceId: surfaceA,
      itemId: loot.id,
      characterId: characterB,
      amount: 1,
      placement: { kind: "root" },
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.surface_item_already_taken",
  )
})

test("Stage 9 holder identity includes Surface owner scope", () => {
  const holder = item("holder", {
    character_id: null,
    surface_id: surfaceA,
    category: "container",
    placement_kind: "surface",
    inventory_profile: profile("container.surface", true),
  })
  const foreignItem = item("foreign", {
    character_id: null,
    surface_id: surfaceB,
    placement_kind: "surface",
  })
  assert.equal(
    inventoryHolderProblem([holder, foreignItem], foreignItem, holder.id),
    "different_character",
  )
})

test("Stage 9 Larisa moves a character between current scenes and clears stale selected Surface access", async () => {
  const larisa = new LarisaEngine(new MemoryLarisaStorage({
    characterStates: [],
    locations: [
      { id: locationA, name: "A", parent_location_id: null, image_url: null, visibility_mode: "always", lifecycle_state: "active" },
      { id: locationB, name: "B", parent_location_id: null, image_url: null, visibility_mode: "always", lifecycle_state: "active" },
    ],
    scenes: [
      { room_id: sceneA, title: "A", location_id: locationA, campaign_day: 1, day_period: "day", scene_state: "active", room_state: "open" },
      { room_id: sceneB, title: "B", location_id: locationB, campaign_day: 2, day_period: "night", scene_state: "active", room_state: "open" },
    ],
    sceneParticipants: [{ room_id: sceneA, character_id: characterA }],
    sceneSurfaces: [{
      id: surfaceA,
      campaign_id: campaignId,
      room_id: sceneA,
      name: "Стол",
      description: "",
      access_mode: "selected",
      lifecycle_state: "active",
      version: 1,
      selected_character_ids: [characterA],
    }],
    worldStorages: [],
  }))

  await larisa.execute({
    kind: "world.scene_move_character",
    context: context("00000000-0000-4000-8000-000000009041"),
    characterId: characterA,
    roomId: sceneB,
    syncLocation: true,
    syncTime: true,
  })

  const snapshot = await larisa.loadCampaignSnapshot(campaignId)
  assert.deepEqual(snapshot.sceneParticipants, [{ room_id: sceneB, character_id: characterA }])
  assert.deepEqual(snapshot.sceneSurfaces[0]?.selected_character_ids, [])
  assert.equal(
    snapshot.characterStates.find((state) => state.character_id === characterA)?.location_id,
    locationB,
  )
  assert.equal(
    snapshot.characterStates.find((state) => state.character_id === characterA)?.campaign_day,
    2,
  )
})

test("Stage 9 migration defines mechanics-only Surfaces with server-winner concurrency", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/20260916090500_cheburashka_stage9_scene_surfaces.sql",
    "utf8",
  )
  const closure = fs.readFileSync(
    "supabase/migrations/20260916091500_cheburashka_stage9_surface_membership_integrity.sql",
    "utf8",
  )

  assert.match(sql, /create table if not exists public\.scene_surfaces/)
  assert.match(sql, /access_mode in \('scene','selected','gm'\)/)
  assert.match(sql, /add column if not exists surface_id uuid/)
  assert.match(sql, /placement_kind='surface'/)
  assert.match(sql, /\+ \(surface_id is not null\)::int\) = 1/)
  assert.doesNotMatch(sql, /create table[^;]*surface_inventory_items/i)
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*'surface:'\|\|p_surface_id/)
  assert.match(sql, /select \* into v_source[\s\S]*for update/)
  assert.match(sql, /surface\.item_already_taken/)
  assert.match(sql, /surface\.item_stale/)
  assert.match(sql, /set version=version\+1/)
  assert.match(sql, /alter publication supabase_realtime add table public\.scene_surfaces/)
  assert.match(sql, /create_game_scene_v1/)
  assert.match(sql, /move_character_to_scene_v1/)
  assert.match(closure, /scene_participants_validate_surface_access/)
  assert.match(closure, /delete from public\.scene_surface_character_access/)
})

test("Stage 9 mechanics do not add a chat UI implementation", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20260916090500_cheburashka_stage9_scene_surfaces.sql",
    "utf8",
  )
  assert.doesNotMatch(migration, /chat_message_surface|surface_message_id|message_id.*surface/i)
})
