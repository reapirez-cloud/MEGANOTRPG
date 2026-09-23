import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260922184617_cheburashka_simple_inventory_mode_v1.sql",
  "utf8",
)
const swapMigration = fs.readFileSync(
  "supabase/migrations/20260922224000_simple_inventory_drag_swap_v1.sql",
  "utf8",
)
const quickMigration = fs.readFileSync(
  "supabase/migrations/20260922225000_simple_inventory_quick_access_v1.sql",
  "utf8",
)
const quickGuardMigration = fs.readFileSync(
  "supabase/migrations/20260922225100_simple_inventory_quick_access_owner_guard_v1.sql",
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
const characterControl = fs.readFileSync(
  "src/ui-v1-isolated/useUiV1CharacterControl.ts",
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
  assert.match(simpleUi, /Array\.from\(\{ length: emptyCount \}/)
  assert.match(simpleUi, /item\.stack_mode === "stack" && item\.quantity > 1/)
  assert.match(simpleUi, /u1-simple-inventory__quantity/)
  assert.match(stacking, /forcedInstanceCategories/)
  assert.match(stacking, /input\.stack_mode === "stack" \? "stack" : "instance"/)
})

test("active inventory UI shows equipment, one non-physical quick shortcut and every bag as draggable simple slots", () => {
  assert.match(inventoryBoundary, /<InventorySimpleView/)
  assert.match(simpleUi, /<svg viewBox="0 0 48 48"/)
  assert.match(simpleUi, /inventorySimpleContainerTargets/)
  assert.match(simpleUi, /EQUIPMENT_SLOTS/)
  assert.match(simpleUi, /hasQuickAccess/)
  assert.match(simpleUi, /Не экипировано/)
  assert.match(simpleUi, />Экипировано</)
  assert.match(simpleUi, /Можно положить любой предмет/)
  assert.match(simpleUi, /u1-simple-inventory__bag-panel/)
  assert.match(simpleUi, /draggable=\{canControl\}/)
  assert.match(simpleUi, /onSwap\(item, target\)/)
  assert.match(simpleUi, /onQuickAccess\(item, enabled\)/)
  assert.match(simpleUi, /data-simple-drop-quick="true"/)
  assert.match(simpleUi, /onPointerDown/)
  assert.match(simpleUi, /document\.elementFromPoint/)
  assert.doesNotMatch(simpleUi, /onPlace\(item, \{ kind: "hand", index \}\)/)
  assert.match(simpleUi, /Переложить/)
  assert.match(simpleUi, /Экипировать/)
  assert.match(simpleUi, /Использовать/)
  assert.match(swapMigration, /swap_inventory_items_simple_v1/)
  assert.match(swapMigration, /private\.can_operate_character_resources/)
  assert.match(quickMigration, /set_inventory_quick_access_v1/)
  assert.match(quickMigration, /item_state ->> 'quick_access'/)
  assert.match(quickMigration, /private\.can_operate_character_resources/)
  assert.match(quickGuardMigration, /one_quick_access_per_character/)
  assert.match(quickGuardMigration, /clear_quick_access_on_owner_change_v1/)
  assert.match(characterControl, /rpc\(\s*"swap_inventory_items_simple_v1"/)
  assert.match(characterControl, /rpc\(\s*"set_inventory_quick_access_v1"/)
  assert.match(characterView, /onMoveItem=\{control\.moveItemSimple\}/)
  assert.match(characterView, /onQuickAccessItem=\{control\.setQuickAccessSimple\}/)
  assert.match(characterView, /onSwapItems=\{control\.swapItemsSimple\}/)
  assert.match(characterView, /onEquipItem=\{\(item\) => control\.setEquipped\(item, true\)\}/)
  assert.match(characterView, /onUseItem=\{control\.useItem\}/)
  assert.match(contract, /status: "simple-active"/)
  assert.match(contract, /spatialRuntimeIsolatedUntilReenabled: true/)
  assert.match(contract, /"spatial-grid"/)
})
