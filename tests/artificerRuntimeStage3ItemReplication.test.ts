import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { inventoryMechanicContributions } from "../src/lib/characterMechanics.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260921233000_artificer_stage3_item_replication_v1.sql", import.meta.url),
  "utf8",
)
const plan = readFileSync(new URL("../src/data/classes/artificerRuntimePlan.md", import.meta.url), "utf8")
const ledger = readFileSync(new URL("../src/rule-templates/CLASS_WORK_STATUS.md", import.meta.url), "utf8")

function item(attuned: boolean): InventoryItem {
  return {
    id: "item-1",
    character_id: "character-1",
    name: "Attunement fixture",
    quantity: 1,
    weight: null,
    equipped: false,
    category: "other",
    equipment_slot: null,
    image_url: null,
    description: "",
    mechanics: [{
      id: "attuned-resistance",
      type: "grant",
      activation: "attuned",
      target: "resistance",
      key: "fire",
    }],
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
    world_storage_id: null,
    surface_id: null,
    item_state: attuned ? { attunement: { attuned_to_character_id: "character-1" } } : {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
  }
}

test("Stage 3 freezes exact plan and replica capacity progression", () => {
  assert.match(migration, /'2',4,'6',5,'10',6,'14',7,'18',8/)
  assert.match(migration, /'2',2,'6',3,'10',4,'14',5,'18',6/)
  assert.match(migration, /v_count<>56/)
  assert.match(migration, /v_count<>31/)
})

test("Stage 3 uses generic bounded choices for optional replication loadouts", () => {
  assert.match(migration, /allow_fewer/)
  assert.match(migration, /minimum_count/)
  assert.match(migration, /CHOICE_COUNT_OUT_OF_BOUNDS/)
  assert.match(migration, /selected_reference_item_plans/)
})

test("instant replica attunement is server-validated against the definition", () => {
  assert.match(migration, /ARTIFICER_REPLICATION_ATTUNEMENT_NOT_REQUIRED/)
  assert.match(migration, /attunement,required/)
})

test("Stage 3 creates real Cheburashka inventory instances with provenance", () => {
  assert.match(migration, /cheburashka_create_definition_instance_v1/)
  assert.match(migration, /insert into public\.character_inventory_items/)
  assert.match(migration, /origin_feature','replicate-magic-item'/)
  assert.match(migration, /plan_definition_id/)
  assert.match(migration, /creator_character_id/)
  assert.doesNotMatch(migration, /create table[^;]*artificer_/i)
})

test("Tinker's Magic is INT-based, recovers on Long Rest, and temporary items expire", () => {
  assert.match(migration, /artificer_tinkers_magic/)
  assert.match(migration, /abilities\.intelligence\.modifier/)
  assert.match(migration, /artificer_stage3_tinkers_max_v1/)
  assert.match(migration, /expires_on_creator_long_rest/)
  assert.match(migration, /artificer_stage3_expire_tinkers_magic_items_v1/)
})

test("generic attunement activation emits mechanics only for the current holder", () => {
  assert.equal(inventoryMechanicContributions([item(false)]).length, 0)
  const contributions = inventoryMechanicContributions([item(true)])
  assert.equal(contributions.length, 1)
  assert.equal(contributions[0]?.kind, "grant")
})

test("Stage 3 stays non-READY and hands off to Stage 4", () => {
  assert.match(plan, /Stage 3 — core item\/replication runtime: COMPLETE_2026_09_21/)
  assert.match(plan, /Stage 4 — remaining base class 1–20: NEXT/)
  assert.match(ledger, /stage_3_core_item_replication_runtime: COMPLETE_2026_09_21/)
  assert.match(migration, /IN_PROGRESS_STAGE3_ITEM_REPLICATION_READY/)
  assert.doesNotMatch(migration, /'mechanics_status','READY'/)
})
