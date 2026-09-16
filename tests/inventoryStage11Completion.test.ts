import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260916110000_cheburashka_stage11b_chasovoy_closure.sql",
  "utf8",
)
const storage = fs.readFileSync("src/inventory-engine/supabase.ts", "utf8")
const inventoryTypes = fs.readFileSync("src/inventory-engine/types.ts", "utf8")
const oracle = fs.readFileSync("src/oracle-engine/engine.ts", "utf8")
const hook = fs.readFileSync("src/hooks/useCharacterSheet.ts", "utf8")
const profilePage = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const editor = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")
const plan = fs.readFileSync("docs/INVENTORY_IMPLEMENTATION_PLAN.md", "utf8")

test("Stage 11B makes normal Cheburashka authoring resolve through Chasovoy", () => {
  assert.match(migration, /create or replace function public\.create_inventory_item_v3/)
  assert.match(migration, /create or replace function public\.update_inventory_item_v3/)
  assert.match(migration, /create or replace function public\.create_surface_inventory_item_v2/)
  assert.match(migration, /cheburashka_resolve_authored_definition_v1/)
  assert.match(migration, /insert into public\.reference_definitions/)
  assert.match(migration, /d\.scope='system'/)
  assert.match(migration, /d\.scope='campaign'/)

  assert.match(storage, /rpc\("create_inventory_item_v3"/)
  assert.match(storage, /rpc\("update_inventory_item_v3"/)
  assert.match(storage, /rpc\("create_surface_inventory_item_v2"/)
  assert.match(storage, /p_inventory_profile: command\.inventoryProfile \?\? null/)
  assert.match(inventoryTypes, /inventoryProfile\?: InventoryPhysicalProfile \| null/)
  assert.match(oracle, /inventoryProfile/)
})

test("Stage 11B connects the GM item editor to the canonical physical profile", () => {
  assert.match(profilePage, /<InventoryItemEditor[^>]*enablePhysicalProfile/)
  assert.match(profilePage, /addInventoryItem\(input, inventoryProfile\)/)
  assert.match(profilePage, /updateInventoryItem\(editor\.item\.id, input, inventoryProfile\)/)
  assert.match(hook, /oracle\.inventory\.create\(gmContext\(\), characterId, input, inventoryProfile\)/)
  assert.match(hook, /oracle\.inventory\.update\(gmContext\(\), characterId, itemId, input, version, inventoryProfile\)/)
  assert.match(editor, /readInventoryProfile\(item\?\.inventory_profile\)/)
})

test("Stage 11B closes reviewed legacy debt without guessing narrative junk", () => {
  for (const slug of [
    "gear-ring",
    "gear-belt",
    "gear-headwear",
    "focus-amulet",
    "reference-letter",
    "trinket-small",
    "quest-key-bundle",
  ]) {
    assert.match(migration, new RegExp(`"slug":"${slug}"`))
  }
  assert.match(migration, /bundle_count/)
  assert.match(migration, /stage11_intentional_narrative/)
  assert.match(migration, /stage11_definition_review/)
  assert.doesNotMatch(migration, /\blike\b/i)
})

test("Stage 11 roadmap is closed and Stage 12 is next", () => {
  assert.match(plan, /\| 11 \| ✅ COMPLETE \| Chasovoy adoption \+ legacy inventory migration \|/)
  assert.match(plan, /Stages 1–11 complete\. Stage 12 is next/)
  assert.match(plan, /Stage 11 completion gate — PASSED ✅/)
})
