import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260922223000_cheburashka_simple_inventory_mode_v1.sql",
  "utf8",
)
const adapter = fs.readFileSync("src/inventory-engine/supabase.ts", "utf8")
const helpers = fs.readFileSync("src/inventory-engine/simple.ts", "utf8")
const simpleUi = fs.readFileSync(
  "src/ui-v1-isolated/InventorySimpleView.tsx",
  "utf8",
)
const inventoryBoundary = fs.readFileSync(
  "src/ui-v1-isolated/CharacterInventoryInterface.tsx",
  "utf8",
)
const characterView = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const spatialUi = fs.readFileSync(
  "src/ui-v1-isolated/InventorySpatialView.tsx",
  "utf8",
)
const stacking = fs.readFileSync("src/inventory-engine/stacking.ts", "utf8")
const contract = fs.readFileSync(
  "src/ui-v1-isolated/characterSheetUiContract.ts",
  "utf8",
)

test("simple inventory keeps canonical Cheburashka items and turns container geometry into slot capacity", () => {
  assert.match(
    migration,
    /cheburashka_simple_container_capacity_v1/,
  )
  assert.match(
    migration,
    /internal_grid_width'[\s\S]*internal_grid_height'/,
  )
  assert.match(migration, /v_width \* v_height/)
  assert.match(migration, /count\(\*\)::integer[\s\S]*holder_item_id = p_holder_item_id/)
  assert.match(migration, /Inventory container is full/)
  assert.match(migration, /placement_kind = case[\s\S]*'legacy'/)
  assert.match(migration, /grid_x = null/)
  assert.match(migration, /grid_y = null/)
  assert.doesNotMatch(migration, /create table/i)
})

test("simple moves are server-authoritative while the spatial path remains isolated and intact", () => {
  assert.match(adapter, /rpc\("move_inventory_item_simple_v1"/)
  assert.match(adapter, /rpc\("move_inventory_item_v3"/)
  assert.match(migration, /private\.can_operate_character_resources\(p_character_id, auth\.uid\(\)\)/)
  assert.match(migration, /revoke all on function private\.cheburashka_simple_container_capacity_v1/)
  assert.match(migration, /from public, anon;/)
  assert.match(migration, /to authenticated;/)
  assert.match(spatialUi, /data-inventory-grid/)
  assert.doesNotMatch(characterView, /<InventorySpatialView/)
  assert.match(characterView, /<CharacterInventoryInterface/)
})

test("every canonical item row or existing bulk stack occupies one simple slot", () => {
  assert.match(helpers, /inventorySimpleChildren/)
  assert.match(helpers, /inventorySimpleContainerUsage/)
  assert.match(helpers, /const used = inventorySimpleChildren\(items, containerId\)\.length/)
  assert.match(simpleUi, /Array\.from\(\{ length: emptySlots \}/)
  assert.match(simpleUi, /item\.stack_mode === "stack" && item\.quantity > 1/)
  assert.match(simpleUi, /u1-simple-inventory__quantity/)
  assert.match(stacking, /forcedInstanceCategories/)
  assert.match(stacking, /input\.stack_mode === "stack" \? "stack" : "instance"/)
})

test("active inventory UI uses bags, nested containers and custom graphite SVG glyphs", () => {
  assert.match(inventoryBoundary, /<InventorySimpleView/)
  assert.match(simpleUi, /<svg viewBox="0 0 48 48"/)
  assert.match(simpleUi, /inventorySimpleContainerTargets/)
  assert.match(simpleUi, /Открыть сумку/)
  assert.match(simpleUi, /Переложить/)
  assert.match(simpleUi, /Экипировать/)
  assert.match(simpleUi, /Использовать/)
  assert.match(characterView, /onMoveItem=\{control\.moveItemSimple\}/)
  assert.match(characterView, /onEquipItem=\{\(item\) => control\.setEquipped\(item, true\)\}/)
  assert.match(characterView, /onUseItem=\{control\.useItem\}/)
  assert.match(contract, /status: "simple-active"/)
  assert.match(contract, /spatialRuntimeIsolatedUntilReenabled: true/)
  assert.match(contract, /"spatial-grid"/)
})
