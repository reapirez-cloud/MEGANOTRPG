import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sheetHook = fs.readFileSync("src/hooks/useCharacterSheet.ts", "utf8")
const itemEditor = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")
const itemLibrary = fs.readFileSync("src/components/gm/GmItemLibrary.tsx", "utf8")
const migration = fs.readFileSync(
  "supabase/migrations/20260915161709_cheburashka_stage1_runtime_closure.sql",
  "utf8",
)

test("legacy character sheet inventory mutations forward the loaded item version", () => {
  assert.match(
    sheetHook,
    /oracle\.inventory\.update\(gmContext\(\), characterId, itemId, input, version, inventoryProfile\)/,
  )
  assert.match(
    sheetHook,
    /oracle\.inventory\.remove\(gmContext\(\), characterId, itemId, version\)/,
  )
  assert.match(
    sheetHook,
    /oracle\.inventory\.setEquipped\(gmContext\(\), characterId, itemId, equipped, equipmentSlot, version\)/,
  )
  assert.match(sheetHook, /expectedVersion: version/)
})

test("inventory editor preserves canonical Chasovoy provenance", () => {
  assert.match(itemEditor, /definition_id: item\?\.definition_id \?\? null/)
  assert.match(itemEditor, /definition_revision: item\?\.definition_revision \?\? null/)
})

test("GM item library issues definition-backed inventory instances", () => {
  assert.match(itemLibrary, /definition_id: issueTarget\.id/)
  assert.match(itemLibrary, /definition_revision: issueTarget\.revision/)
})

test("direct inventory Data API mutation and pre-versioned RPCs are sealed", () => {
  assert.match(
    migration,
    /revoke insert, update, delete\s+on table public\.character_inventory_items\s+from anon, authenticated;/s,
  )
  assert.match(
    migration,
    /revoke execute\s+on function public\.consume_inventory_item_v1\(uuid, uuid, integer, uuid\)\s+from public, anon, authenticated;/s,
  )
  assert.match(
    migration,
    /revoke execute\s+on function public\.transfer_inventory_item_v1\(uuid, uuid, uuid, integer, uuid\)\s+from public, anon, authenticated;/s,
  )
  assert.match(
    migration,
    /revoke execute\s+on function public\.set_character_inventory_equipped\(uuid, boolean, text\)\s+from public, anon, authenticated;/s,
  )
})
