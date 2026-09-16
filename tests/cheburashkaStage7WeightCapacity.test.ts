import assert from "node:assert/strict"
import test from "node:test"

import {
  baseCarryingCapacityKg,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
} from "../src/character-engine/index.ts"
import {
  createInventoryLoadProjection,
  inventorySpecializedCapacityProblem,
} from "../src/inventory-engine/load.ts"
import { inventoryPlacementProblem } from "../src/inventory-engine/spatial.ts"
import type { InventoryPhysicalProfile } from "../src/inventory-engine/profile.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const characterId = "00000000-0000-4000-8000-000000007001"

const state: CharacterState = { currentHp: 10, tempHp: 0 }

function base(strength: number): BaseCharacter {
  return {
    id: characterId,
    name: "Stage 7",
    level: 1,
    abilities: {
      strength,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    baseMaxHp: 10,
    baseSpeed: 30,
  }
}

function profile(
  semanticRole: string,
  weightPerUnit: number | null,
  containerProfile: InventoryPhysicalProfile["container_profile"] = null,
): InventoryPhysicalProfile {
  return {
    semantic_role: semanticRole,
    packing_mode: semanticRole.startsWith("ammo.") ? "bulk_stack" : "instance",
    footprint_mode: "compact_1x1",
    shape_mask: ["1"],
    shape_width: 1,
    shape_height: 1,
    rotatable: false,
    stack_max: semanticRole.startsWith("ammo.") ? 100 : null,
    weight_per_unit: weightPerUnit,
    container_profile: containerProfile,
  }
}

function item(id: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    character_id: characterId,
    name: id,
    quantity: 1,
    weight: null,
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
    inventory_profile: profile("other.test", null),
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-16T06:00:00.000Z",
    updated_at: "2026-09-16T06:00:00.000Z",
    ...overrides,
  }
}

test("Stage 7 carrying capacity is metric Strength × 6.8 kg", () => {
  assert.equal(baseCarryingCapacityKg(4), 27.2)
  assert.equal(baseCarryingCapacityKg(10), 68)

  const resolved = resolveCharacter(base(4), state)
  assert.equal(resolved.carrying.capacityKg.baseValue, 27.2)
  assert.equal(resolved.carrying.capacityKg.value, 27.2)
})

test("Stage 7 CE numeric buff can add carrying capacity in kilograms", () => {
  const contributions: CharacterContribution[] = [{
    id: "carry-buff",
    kind: "numeric",
    target: "carrying.capacityKg",
    operation: "ADD",
    value: 20,
    source: { id: "feature:pack-mule", name: "Вьючный талант" },
  }]

  const resolved = resolveCharacter(base(4), state, contributions)
  assert.equal(resolved.carrying.capacityKg.value, 47.2)
  assert.equal(resolved.carrying.capacityKg.sources[0]?.source.id, "feature:pack-mule")
})

test("Stage 7 load counts nested contents and stack quantity exactly once", () => {
  const bag = item("bag", {
    category: "container",
    weight: 1,
    inventory_profile: profile("container.bag", 1, {
      internal_grid_width: 4,
      internal_grid_height: 4,
      cell_size_cm: 5,
      allow_nested_containers: true,
      external_carry_slots: 0,
      specialized_capacity: [],
    }),
  })
  const arrows = item("arrows", {
    quantity: 20,
    weight: 999,
    stack_mode: "stack",
    holder_item_id: bag.id,
    placement_kind: "grid",
    grid_x: 0,
    grid_y: 0,
    inventory_profile: profile("ammo.arrow", 0.05),
  })
  const stone = item("stone", {
    holder_item_id: bag.id,
    placement_kind: "grid",
    grid_x: 1,
    grid_y: 0,
    weight: 2,
    inventory_profile: profile("material.stone", null),
  })

  const load = createInventoryLoadProjection(characterId, [bag, arrows, stone])
  assert.equal(load.knownWeightKg, 4)
  assert.equal(load.complete, true)
  assert.deepEqual(load.unknownWeightItemIds, [])
})

test("Stage 7 unknown item mass stays explicit instead of becoming zero", () => {
  const known = item("known", { weight: 2 })
  const unknown = item("unknown", { weight: null })

  const load = createInventoryLoadProjection(characterId, [known, unknown])
  assert.equal(load.knownWeightKg, 2)
  assert.equal(load.complete, false)
  assert.deepEqual(load.unknownWeightItemIds, ["unknown"])
})

test("Stage 7 specialized capacity blocks quiver overflow before commit", () => {
  const quiver = item("quiver", {
    category: "container",
    inventory_profile: profile("container.quiver", 0.5, {
      internal_grid_width: 4,
      internal_grid_height: 5,
      cell_size_cm: 5,
      allow_nested_containers: false,
      external_carry_slots: 0,
      specialized_capacity: [{ semantic_role: "ammo.arrow", max_quantity: 50 }],
    }),
  })
  const existing = item("existing-arrows", {
    quantity: 45,
    stack_mode: "stack",
    holder_item_id: quiver.id,
    placement_kind: "grid",
    grid_x: 0,
    grid_y: 0,
    inventory_profile: profile("ammo.arrow", 0.05),
  })
  const incoming = item("incoming-arrows", {
    quantity: 6,
    stack_mode: "stack",
    inventory_profile: profile("ammo.arrow", 0.05),
  })

  const projectedIncoming = {
    ...incoming,
    holder_item_id: quiver.id,
    placement_kind: "grid" as const,
    grid_x: 1,
    grid_y: 0,
  }
  assert.match(
    inventorySpecializedCapacityProblem([quiver, existing, projectedIncoming], quiver) || "",
    /51\/50/,
  )
  assert.match(
    inventoryPlacementProblem([quiver, existing, incoming], incoming, {
      kind: "grid",
      holderItemId: quiver.id,
      gridX: 1,
      gridY: 0,
      rotation: 0,
    }) || "",
    /51\/50/,
  )
})
