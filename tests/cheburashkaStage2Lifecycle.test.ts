import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createEngineCommandContext, EngineCommandError } from "../src/engine-contracts/index.ts"
import { CheburashkaEngine } from "../src/inventory-engine/engine.ts"
import { readItemRecharge, writeItemRecharge } from "../src/inventory-engine/lifecycle.ts"
import { MemoryCheburashkaStorage } from "../src/inventory-engine/memory.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const campaignId = "00000000-0000-4000-8000-000000000201"
const characterId = "00000000-0000-4000-8000-000000000202"
const userId = "00000000-0000-4000-8000-000000000203"

function context(commandId: string) {
  return createEngineCommandContext({
    commandId,
    occurredAt: "2026-09-15T16:30:00.000Z",
    campaignId,
    requestedBy: userId,
    authority: "player",
    actorCharacterId: characterId,
  })
}

function item(id: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    character_id: characterId,
    name: "Тестовый предмет",
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
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-15T16:00:00.000Z",
    updated_at: "2026-09-15T16:00:00.000Z",
    ...overrides,
  }
}

test("charged item use spends one charge and advances version", async () => {
  const storage = new MemoryCheburashkaStorage([
    item("wand", { usage_mode: "charges", charges_current: 2, charges_max: 3 }),
  ])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.consume",
    context: context("00000000-0000-4000-8000-000000000211"),
    characterId,
    itemId: "wand",
    amount: 1,
    expectedVersion: 1,
  })

  assert.equal(result.value.after?.charges_current, 1)
  assert.equal(result.value.after?.version, 2)
})

test("using the last quantity removes the inventory row", async () => {
  const storage = new MemoryCheburashkaStorage([
    item("potion", { category: "consumable", usage_mode: "quantity", quantity: 1 }),
  ])
  const engine = new CheburashkaEngine(storage)

  const result = await engine.execute({
    kind: "inventory.consume",
    context: context("00000000-0000-4000-8000-000000000212"),
    characterId,
    itemId: "potion",
    amount: 1,
    expectedVersion: 1,
  })

  assert.equal(result.value.after, null)
  assert.equal(await storage.getItem("potion"), null)
})

test("ordinary inventory rows cannot be consumed", async () => {
  const engine = new CheburashkaEngine(
    new MemoryCheburashkaStorage([item("book")]),
  )

  await assert.rejects(
    () => engine.execute({
      kind: "inventory.consume",
      context: context("00000000-0000-4000-8000-000000000213"),
      characterId,
      itemId: "book",
      amount: 1,
      expectedVersion: 1,
    }),
    (reason: unknown) =>
      reason instanceof EngineCommandError &&
      reason.code === "inventory.not_usable",
  )
})

test("recharge state round-trips without touching unrelated item state", () => {
  const state = writeItemRecharge(
    { denomination: "gp", hidden: true },
    { trigger: "long_rest", restore: "amount", amount: 2 },
  )

  assert.deepEqual(readItemRecharge(state), {
    trigger: "long_rest",
    restore: "amount",
    amount: 2,
  })
  assert.equal(state.denomination, "gp")
  assert.equal(state.hidden, true)
})

test("stage 2 UI exposes item use in both character surfaces", () => {
  const legacy = fs.readFileSync("src/components/characters/CharacterInventory.tsx", "utf8")
  const current = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
  const editor = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")

  assert.match(legacy, /onUse: \(itemId: string, amount\?: number\)/)
  assert.match(current, /id: "use-item"/)
  assert.match(editor, /value=\{rechargeTrigger\}/)
  assert.match(editor, /value=\{usageMode\}/)
})

test("rest recovery bridge is committed as a migration contract", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20260915162329_cheburashka_stage2_item_lifecycle.sql",
    "utf8",
  )
  const fix = fs.readFileSync(
    "supabase/migrations/20260915162435_cheburashka_stage2_recharge_noop_fix.sql",
    "utf8",
  )

  assert.match(
    migration,
    /perform private\.cheburashka_recover_inventory_items_v1\(p_character_id, p_trigger\)/,
  )
  assert.match(migration, /raise exception 'Inventory item is not usable'/)
  assert.match(fix, /if v_rule is null then\s+return v_current;/s)
})
