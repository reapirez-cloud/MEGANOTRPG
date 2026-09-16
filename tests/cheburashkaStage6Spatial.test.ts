import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  createEngineCommandContext,
  EngineCommandError,
} from "../src/engine-contracts/index.ts"
import { CheburashkaEngine } from "../src/inventory-engine/engine.ts"
import { MemoryCheburashkaStorage } from "../src/inventory-engine/memory.ts"
import {
  firstAvailableGridPlacement,
  firstFreeExternalSlot,
  firstFreeHand,
  inventoryPlacementProblem,
  rotateInventoryShape,
} from "../src/inventory-engine/spatial.ts"
import type { InventoryPhysicalProfile } from "../src/inventory-engine/profile.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const campaignId = "00000000-0000-4000-8000-000000006001"
const characterId = "00000000-0000-4000-8000-000000006002"
const userId = "00000000-0000-4000-8000-000000006003"

function context(commandId: string, authority: "player" | "gm" = "player") {
  return createEngineCommandContext({
    commandId,
    occurredAt: "2026-09-16T05:00:00.000Z",
    campaignId,
    requestedBy: userId,
    authority,
    actorCharacterId: characterId,
  })
}

function compactProfile(role = "other.small"): InventoryPhysicalProfile {
  return {
    semantic_role: role,
    packing_mode: "instance",
    footprint_mode: "compact_1x1",
    shape_mask: ["1"],
    shape_width: 1,
    shape_height: 1,
    rotatable: false,
    stack_max: null,
  }
}

function bagProfile(
  width = 4,
  height = 4,
  externalCarrySlots = 0,
): InventoryPhysicalProfile {
  return {
    ...compactProfile("container.test"),
    container_profile: {
      internal_grid_width: width,
      internal_grid_height: height,
      cell_size_cm: 5,
      allow_nested_containers: true,
      external_carry_slots: externalCarrySlots,
      specialized_capacity: [],
    },
  }
}

const swordProfile: InventoryPhysicalProfile = {
  semantic_role: "weapon.sword",
  packing_mode: "instance",
  footprint_mode: "shape",
  shape_mask: ["1", "1", "1"],
  shape_width: 1,
  shape_height: 3,
  rotatable: true,
  stack_max: null,
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
    placement_kind: "root",
    placement_index: null,
    grid_x: null,
    grid_y: null,
    grid_rotation: 0,
    inventory_profile: compactProfile(),
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-16T05:00:00.000Z",
    updated_at: "2026-09-16T05:00:00.000Z",
    ...overrides,
  }
}

test("Stage 6 rotation keeps the authored mask instead of inflating to a rectangle", () => {
  const shape = rotateInventoryShape(swordProfile, 90)
  assert.equal(shape.width, 3)
  assert.equal(shape.height, 1)
  assert.deepEqual(shape.cells, [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }])
})

test("Stage 6 placement preflight rejects bounds and occupied cells", () => {
  const bag = item("bag", {
    category: "container",
    inventory_profile: bagProfile(4, 4),
  })
  const sword = item("sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    inventory_profile: swordProfile,
    holder_item_id: bag.id,
    placement_kind: "grid",
    grid_x: 0,
    grid_y: 0,
  })
  const potion = item("potion", {
    holder_item_id: bag.id,
    placement_kind: "grid",
    grid_x: 0,
    grid_y: 1,
  })

  assert.match(
    inventoryPlacementProblem([bag, sword, potion], potion, {
      kind: "grid",
      holderItemId: bag.id,
      gridX: 0,
      gridY: 0,
      rotation: 0,
    }) || "",
    /занято/,
  )

  assert.match(
    inventoryPlacementProblem([bag, sword, potion], sword, {
      kind: "grid",
      holderItemId: bag.id,
      gridX: 3,
      gridY: 2,
      rotation: 90,
    }) || "",
    /границы/,
  )
})

test("Stage 6 first-fit and carry helpers respect real capacity", () => {
  const bag = item("bag", {
    category: "container",
    inventory_profile: bagProfile(3, 3, 2),
  })
  const handItem = item("hand-item", {
    placement_kind: "hand",
    placement_index: 0,
  })
  const outsideItem = item("outside-item", {
    placement_kind: "external",
    placement_index: 0,
  })
  const sword = item("sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    inventory_profile: swordProfile,
  })

  assert.equal(firstFreeHand([bag, handItem, outsideItem, sword]), 1)
  assert.equal(firstFreeExternalSlot([bag, handItem, outsideItem, sword]), 1)

  const placement = firstAvailableGridPlacement([bag, handItem, outsideItem, sword], sword, bag)
  assert.ok(placement)
  assert.equal(placement.holderItemId, bag.id)
})

test("Cheburashka spatial move writes holder, coordinates and rotation as one versioned mutation", async () => {
  const bag = item("bag", {
    category: "container",
    inventory_profile: bagProfile(4, 4),
  })
  const sword = item("sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    inventory_profile: swordProfile,
  })
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([bag, sword]))

  const result = await engine.execute({
    kind: "inventory.move",
    context: context("00000000-0000-4000-8000-000000006011"),
    characterId,
    itemId: sword.id,
    holderItemId: bag.id,
    placement: {
      kind: "grid",
      holderItemId: bag.id,
      gridX: 1,
      gridY: 0,
      rotation: 0,
    },
    expectedVersion: 1,
  })

  assert.equal(result.value.after?.holder_item_id, bag.id)
  assert.equal(result.value.after?.placement_kind, "grid")
  assert.equal(result.value.after?.grid_x, 1)
  assert.equal(result.value.after?.grid_y, 0)
  assert.equal(result.value.after?.grid_rotation, 0)
  assert.equal(result.value.after?.version, 2)
})

test("Cheburashka rejects overlap before storage and keeps the previous state", async () => {
  const bag = item("bag", {
    category: "container",
    inventory_profile: bagProfile(4, 4),
  })
  const sword = item("sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    inventory_profile: swordProfile,
    holder_item_id: bag.id,
    placement_kind: "grid",
    grid_x: 0,
    grid_y: 0,
  })
  const potion = item("potion")
  const storage = new MemoryCheburashkaStorage([bag, sword, potion])
  const engine = new CheburashkaEngine(storage)

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.move",
      context: context("00000000-0000-4000-8000-000000006012"),
      characterId,
      itemId: potion.id,
      holderItemId: bag.id,
      placement: {
        kind: "grid",
        holderItemId: bag.id,
        gridX: 0,
        gridY: 1,
        rotation: 0,
      },
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.placement_invalid",
  )

  assert.equal((await storage.getItem(potion.id))?.placement_kind, "root")
})

test("two hand cells are permanent and a hand collision is rejected", async () => {
  const first = item("first", { placement_kind: "hand", placement_index: 0 })
  const second = item("second")
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([first, second]))

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.move",
      context: context("00000000-0000-4000-8000-000000006013"),
      characterId,
      itemId: second.id,
      holderItemId: null,
      placement: { kind: "hand", index: 0 },
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.placement_invalid",
  )
})

test("equipping a contained item keeps one canonical instance and clears spatial placement atomically", async () => {
  const bag = item("bag", {
    category: "container",
    inventory_profile: bagProfile(),
  })
  const sword = item("sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    inventory_profile: swordProfile,
    holder_item_id: bag.id,
    placement_kind: "grid",
    grid_x: 0,
    grid_y: 0,
  })
  const storage = new MemoryCheburashkaStorage([bag, sword])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.set_equipped",
    context: context("00000000-0000-4000-8000-000000006014"),
    characterId,
    itemId: sword.id,
    equipped: true,
    equipmentSlot: "main_hand",
    expectedVersion: 1,
  })

  assert.equal(result.value.after?.id, sword.id)
  assert.equal(result.value.after?.equipped, true)
  assert.equal(result.value.after?.holder_item_id, null)
  assert.equal(result.value.after?.placement_kind, "root")
  assert.equal(result.value.after?.grid_x, null)
  assert.equal((await storage.listCharacterItems(characterId)).filter((row) => row.id === sword.id).length, 1)
})

test("moving a carry-capacity provider cannot orphan occupied external cells", () => {
  const outer = item("outer", {
    category: "container",
    inventory_profile: bagProfile(6, 6),
  })
  const provider = item("provider", {
    category: "container",
    inventory_profile: bagProfile(4, 4, 1),
  })
  const attached = item("attached", {
    placement_kind: "external",
    placement_index: 0,
  })

  assert.match(
    inventoryPlacementProblem([outer, provider, attached], provider, {
      kind: "grid",
      holderItemId: outer.id,
      gridX: 0,
      gridY: 0,
      rotation: 0,
    }) || "",
    /освободи внешние ячейки/,
  )
})

test("generic create and update cannot bypass the Stage 6 equipment bridge", async () => {
  const storage = new MemoryCheburashkaStorage()
  const engine = new CheburashkaEngine(storage)

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.create",
      context: context("00000000-0000-4000-8000-000000006015", "gm"),
      characterId,
      input: {
        name: "Нельзя сразу надеть",
        quantity: 1,
        weight: 1,
        equipped: true,
        category: "equipment",
        equipment_slot: "main_hand",
        image_url: null,
        description: "",
        mechanics: [],
        usage_mode: "none",
        charges_current: null,
        charges_max: null,
        stack_mode: "instance",
        item_state: {},
      },
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.create_equipped_forbidden",
  )

  const equipped = item("equipped", {
    category: "equipment",
    equipment_slot: "main_hand",
    equipped: true,
  })
  const equippedStorage = new MemoryCheburashkaStorage([equipped])
  const equippedEngine = new CheburashkaEngine(equippedStorage)

  await assert.rejects(
    () => equippedEngine.execute({
      kind: "inventory.update",
      context: context("00000000-0000-4000-8000-000000006016", "gm"),
      characterId,
      itemId: equipped.id,
      input: {
        name: equipped.name,
        quantity: 1,
        weight: equipped.weight,
        equipped: false,
        category: "equipment",
        equipment_slot: "main_hand",
        image_url: null,
        description: "",
        mechanics: [],
        usage_mode: "none",
        charges_current: null,
        charges_max: null,
        stack_mode: "instance",
        item_state: {},
      },
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.equipment_transition_forbidden",
  )
})

test("unequip requires an explicit physical destination", async () => {
  const sword = item("equipped-sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    equipped: true,
  })
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([sword]))

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.set_equipped",
      context: context("00000000-0000-4000-8000-000000006017"),
      characterId,
      itemId: sword.id,
      equipped: false,
      equipmentSlot: "main_hand",
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.unequip_destination_required",
  )
})

test("equipped item cannot move into abstract root without a real destination", async () => {
  const sword = item("root-guard-sword", {
    category: "equipment",
    equipment_slot: "main_hand",
    equipped: true,
  })
  const engine = new CheburashkaEngine(new MemoryCheburashkaStorage([sword]))

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.move",
      context: context("00000000-0000-4000-8000-000000006018"),
      characterId,
      itemId: sword.id,
      holderItemId: null,
      placement: { kind: "root" },
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError
      && reason.code === "inventory.placement_invalid",
  )
})

test("Stage 6 database contract is versioned, locked and server-authoritative", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20260916044954_cheburashka_stage6_spatial_inventory.sql",
    "utf8",
  )
  const bridge = fs.readFileSync(
    "supabase/migrations/20260916045859_cheburashka_stage6_equipment_transfer_bridge.sql",
    "utf8",
  )
  const closure = fs.readFileSync(
    "supabase/migrations/20260916052417_cheburashka_stage6_integrity_closure.sql",
    "utf8",
  )
  const adapter = fs.readFileSync("src/inventory-engine/supabase.ts", "utf8")
  const profileProjection = fs.readFileSync(
    "supabase/migrations/20260916053336_cheburashka_stage6_profile_projection.sql",
    "utf8",
  )
  const equipmentGuard = fs.readFileSync(
    "supabase/migrations/20260916053628_cheburashka_stage6_equipment_state_guard.sql",
    "utf8",
  )
  const moveGuard = fs.readFileSync(
    "supabase/migrations/20260916053859_cheburashka_stage6_move_destination_guard.sql",
    "utf8",
  )

  assert.match(migration, /placement_kind text not null default 'root'/)
  assert.match(migration, /grid_x integer/)
  assert.match(migration, /grid_y integer/)
  assert.match(migration, /grid_rotation smallint/)
  assert.match(migration, /Inventory placement is out of bounds/)
  assert.match(migration, /Inventory placement overlaps another item/)
  assert.match(migration, /Inventory hand index must be 0 or 1/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /for update/)
  assert.match(migration, /move_inventory_item_v2/)
  assert.match(migration, /from public, anon/)
  assert.match(migration, /to authenticated/)
  assert.match(bridge, /character_id is distinct from old\.character_id/)
  assert.match(bridge, /Equipment slot is occupied; choose a destination/)
  assert.match(closure, /character_inventory_items_validate_spatial_state/)
  assert.match(closure, /deferrable initially deferred/)
  assert.match(closure, /External carry capacity would orphan occupied slot/)
  assert.match(closure, /Inventory creation cannot equip directly/)
  assert.match(closure, /Inventory equipment state must change through the equipment or spatial move command/)
  assert.match(closure, /Unequip requires a real inventory destination/)
  assert.match(adapter, /rpc\("create_inventory_item_v3"/)
  assert.match(adapter, /rpc\("update_inventory_item_v3"/)
  assert.match(profileProjection, /list_character_inventory_physical_profiles_v1/)
  assert.match(profileProjection, /private\.can_view_character/)
  assert.match(adapter, /list_character_inventory_physical_profiles_v1/)
  assert.doesNotMatch(adapter, /reference_definition_revisions/)
  assert.match(equipmentGuard, /Conflicting equipped inventory items are not allowed/)
  assert.match(equipmentGuard, /deferrable initially deferred/)
  assert.match(moveGuard, /move_inventory_item_v3/)
  assert.match(moveGuard, /Equipped inventory item requires a real unequip destination/)
  assert.match(moveGuard, /revoke execute on function public\.move_inventory_item_v2/)
  assert.match(adapter, /rpc\("move_inventory_item_v3"/)
})

test("Stage 6 UI keeps fixed cell pixels, six-cell viewport and physical Snake actions", () => {
  const surface = fs.readFileSync("src/ui-v1-isolated/InventorySpatialView.tsx", "utf8")
  const css = fs.readFileSync("src/ui-v1-isolated/inventory-spatial.css", "utf8")
  const characterView = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
  const sheetContract = fs.readFileSync("src/ui-v1-isolated/characterSheetUiContract.ts", "utf8")
  const snakeTrigger = fs.readFileSync("src/ui-v1-isolated/snake/interaction/SnakeTrigger.tsx", "utf8")
  const control = fs.readFileSync("src/ui-v1-isolated/useUiV1CharacterControl.ts", "utf8")
  const itemEditor = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")

  assert.match(surface, /const CELL_PX = 46/)
  assert.match(surface, /onPointerDown/)
  assert.match(surface, /onPointerMove/)
  assert.match(surface, /onPointerUp/)
  assert.match(surface, /data-inventory-drop-kind="hand"/)
  assert.match(surface, /data-inventory-drop-kind="external"/)
  assert.match(surface, /РУКА \{handIndex \+ 1\}/)
  assert.match(css, /calc\(var\(--inv-cell\) \* 6 \+ 2px\)/)
  assert.match(css, /overflow: auto/)
  assert.match(surface, /actionsForItem: \(item: InventoryItem\) => SnakeAction\[\]/)
  assert.match(surface, /<SnakeTrigger/)
  assert.match(characterView, /<CharacterInventoryInterface/)
  assert.doesNotMatch(characterView, /<InventorySpatialView/)
  assert.match(sheetContract, /"spatial-grid"/)
  assert.match(sheetContract, /"drag-drop"/)
  assert.match(sheetContract, /"snake-context"/)
  assert.match(surface, /moveTolerancePx=\{Math\.max\(1, DRAG_THRESHOLD - 1\)\}/)
  assert.match(surface, /data-dragging=/)
  assert.match(snakeTrigger, /moveTolerancePx = 10/)
  assert.match(css, /u1-inventory-grid-item > \.u1-inventory-shape-cell/)
  assert.match(css, /pointer-events: auto/)
  assert.match(css, /data-dragging/)
  assert.match(control, /catch \(reason\) \{\s*await load\(\)\s*return \{ ok: false, error: errorMessage\(reason, "Не удалось переместить предмет\."\) \}/s)
  assert.doesNotMatch(itemEditor, /Надеть сразу/)
})
