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
const fiveSlotMigration = fs.readFileSync(
  "supabase/migrations/20260926064408_inventory_five_quick_slots_v2.sql", "utf8",
)
const snakeActions = fs.readFileSync(
  "src/ui-v1-isolated/inventorySnakeActions.ts", "utf8",
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

test("compact inventory projects canonical holder rows without empty-cell tetris", () => {
  assert.match(helpers, /inventorySimpleChildren/)
  assert.match(helpers, /inventorySimpleContainerUsage/)
  assert.match(simpleUi, /inventorySimpleChildren\(items, currentBag.id\)/)
  assert.match(simpleUi, /currentBag\?\.name/)
  assert.doesNotMatch(simpleUi, /emptyCount/)
  assert.match(stacking, /forcedInstanceCategories/)
  assert.match(stacking, /input\.stack_mode === "stack" \? "stack" : "instance"/)
})

test("five quick slots are non-physical, authorized and unique per character", () => {
  assert.match(fiveSlotMigration, /p_slot not between 1 and 5/)
  assert.match(fiveSlotMigration, /one_quick_slot_per_character/)
  assert.match(fiveSlotMigration, /private\.can_operate_character_resources\(p_character_id, auth\.uid\(\)\)/)
  assert.match(fiveSlotMigration, /pg_advisory_xact_lock/)
  assert.match(fiveSlotMigration, /v_version <> p_expected_version/)
  assert.match(fiveSlotMigration, /'quick_slot' - 'quick_access'/)
  assert.match(fiveSlotMigration, /set_inventory_quick_access_v1[\s\S]*set_inventory_quick_slot_v2/)
  assert.match(quickMigration, /set_inventory_quick_access_v1/)
  assert.match(quickGuardMigration, /clear_quick_access_on_owner_change_v1/)
  assert.match(characterControl, /rpc\(\s*"set_inventory_quick_slot_v2"/)
  assert.match(simpleUi, /length: 5/)
})

test("inventory actions use Snake inspection and typed Cheburashka operations", () => {
  assert.match(inventoryBoundary, /<InventorySimpleView/)
  assert.match(simpleUi, /<SnakeTrigger/)
  assert.match(simpleUi, /document\.elementFromPoint/)
  assert.match(simpleUi, /onSwap\(item, target\)/)
  assert.match(snakeActions, /id: "inspect"/)
  assert.match(snakeActions, /mediaUrl: item\.image_url/)
  assert.match(snakeActions, /item\.description\.trim\(\)/)
  assert.match(snakeActions, /id: "move"/)
  assert.match(snakeActions, /id: "equip"/)
  assert.match(snakeActions, /id: "use"/)
  assert.match(snakeActions, /id: "unequip"/)
  assert.match(swapMigration, /swap_inventory_items_simple_v1/)
  assert.match(characterView, /onMoveItem=\{control\.moveItemSimple\}/)
  assert.match(characterView, /onQuickAccessItem=\{control\.setQuickAccessSimple\}/)
  assert.match(contract, /status: "simple-active"/)
  assert.match(contract, /spatialRuntimeIsolatedUntilReenabled: true/)
})
