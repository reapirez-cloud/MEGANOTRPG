import assert from "node:assert/strict"
import test from "node:test"

import {
  defaultInventoryProfile,
  inventoryProfileStackMode,
  readInventoryProfile,
} from "../src/inventory-engine/profile.ts"
import type { InventoryInput } from "../src/types/characterSheet.ts"

function input(overrides: Partial<InventoryInput> = {}): InventoryInput {
  return {
    name: "Предмет",
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
    item_state: {},
    ...overrides,
  }
}

test("Stage 5 defaults ordinary items to independent compact instances", () => {
  const profile = defaultInventoryProfile(input({ stack_mode: undefined }))
  assert.equal(profile.packing_mode, "instance")
  assert.equal(profile.footprint_mode, "compact_1x1")
  assert.deepEqual(profile.shape_mask, ["1"])
  assert.equal(profile.stack_max, null)
  assert.equal(inventoryProfileStackMode(profile), "instance")
})

test("bulk stacking is explicit and remains a 1x1 packing exception", () => {
  const profile = defaultInventoryProfile(input({ category: "currency", stack_mode: "stack" }))
  assert.equal(profile.packing_mode, "bulk_stack")
  assert.equal(profile.footprint_mode, "compact_1x1")
  assert.equal(profile.stack_max, 20)
  assert.equal(inventoryProfileStackMode(profile), "stack")
})

test("a one-meter magical bag can keep a 20x20 logical interior without UI scale metadata", () => {
  const profile = readInventoryProfile({
    semantic_role: "container.magic_bag",
    packing_mode: "instance",
    footprint_mode: "compact_1x1",
    shape_mask: ["1"],
    shape_width: 1,
    shape_height: 1,
    rotatable: false,
    stack_max: null,
    container_profile: {
      internal_grid_width: 20,
      internal_grid_height: 20,
      cell_size_cm: 5,
      allow_nested_containers: true,
      external_carry_slots: 0,
      specialized_capacity: [],
    },
  })
  assert.ok(profile)
  assert.equal(profile.container_profile?.internal_grid_width, 20)
  assert.equal(profile.container_profile?.internal_grid_height, 20)
  assert.equal("viewport" in (profile.container_profile || {}), false)
})

test("editing normal mechanics preserves an existing magical container profile", () => {
  const current = readInventoryProfile({
    semantic_role: "container.magic_bag",
    packing_mode: "instance",
    footprint_mode: "compact_1x1",
    shape_mask: ["1"],
    shape_width: 1,
    shape_height: 1,
    rotatable: false,
    stack_max: null,
    container_profile: {
      internal_grid_width: 20,
      internal_grid_height: 20,
      cell_size_cm: 5,
      allow_nested_containers: true,
    },
  })
  assert.ok(current)
  const next = defaultInventoryProfile(input({ category: "container" }), current)
  assert.equal(next.container_profile?.internal_grid_width, 20)
  assert.equal(next.container_profile?.internal_grid_height, 20)
})
