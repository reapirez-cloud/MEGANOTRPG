import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260916120000_cheburashka_stage12_final_certification.sql",
  "utf8",
)
const plan = fs.readFileSync("docs/INVENTORY_IMPLEMENTATION_PLAN.md", "utf8")
const contract = fs.readFileSync("docs/INVENTORY_PRODUCT_CONTRACT.md", "utf8")
const report = fs.readFileSync("docs/INVENTORY_STAGE12_CERTIFICATION.md", "utf8")
const adapter = fs.readFileSync("src/inventory-engine/supabase.ts", "utf8")
const characterView = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
const spatial = fs.readFileSync("src/ui-v1-isolated/InventorySpatialView.tsx", "utf8")
const worldSnake = fs.readFileSync("src/ui-v1-isolated/worldStorageSnakeActions.ts", "utf8")

test("Stage 12 closes legacy authoring without breaking shared production v1", () => {
  assert.match(migration, /cheburashka_bind_definition_on_authoring_v1/)
  assert.match(migration, /before insert or update of/)
  assert.match(migration, /cheburashka_resolve_authored_definition_v1/)
  assert.match(migration, /definition_required_or_narrative_check/)
  assert.match(migration, /stage11_intentional_narrative/)
  assert.match(migration, /revoke execute on function public\.create_inventory_item_v2/)
  assert.doesNotMatch(migration, /revoke execute on function public\.create_inventory_item_v1/)
  assert.match(adapter, /rpc\("create_inventory_item_v3"/)
  assert.match(adapter, /rpc\("update_inventory_item_v3"/)
})

test("Stage 12 RLS exposes current-user predicates instead of raw user-id helpers", () => {
  for (const helper of [
    "rls_can_view_character_v1",
    "rls_can_read_scene_surface_v1",
    "rls_can_manage_campaign_v1",
    "rls_can_view_world_storage_v1",
    "rls_can_read_trade_session_v1",
  ]) {
    assert.match(migration, new RegExp(`private\\.${helper}`))
  }
  assert.match(migration, /from public,anon;/)
  assert.match(migration, /to authenticated;/)
  assert.match(migration, /drop policy if exists character_inventory_surface_read/)
  assert.match(migration, /create policy character_inventory_read/)
  assert.match(migration, /alter function private\.can_manage_campaign\(uuid,uuid\) set search_path=''/)
})

test("Stage 12 keeps direct writes sealed and adds advisor-requested FK indexes", () => {
  assert.match(migration, /revoke insert,update,delete on table public\.character_inventory_items from anon,authenticated/)
  assert.match(migration, /trade_sessions_side_a_character_id_idx/)
  assert.match(migration, /trade_sessions_side_b_character_id_idx/)
  assert.match(migration, /trade_visible_items_owner_character_id_idx/)
  assert.match(migration, /world_storages_location_id_idx/)
  assert.match(report, /zero `legacy` placements/)
})

test("Stage 12 locks the intended Snake inventory routing", () => {
  for (const action of [
    "inspect",
    "open-container",
    "use-item",
    "rotate-item",
    "move-to-hand",
    "move-to-external",
    "store-in-world",
    "move-to-container",
    "move-to-root",
    "equip",
    "unequip",
  ]) {
    assert.match(characterView, new RegExp(`id: "${action}"`))
  }
  assert.match(worldSnake, /store-world-item/)
  assert.match(worldSnake, /take-world-item/)
})

test("Stage 12 locks mobile physical drag/tap behavior", () => {
  assert.match(spatial, /const CELL_PX = 46/)
  assert.match(spatial, /onPointerDown/)
  assert.match(spatial, /onPointerMove/)
  assert.match(spatial, /onPointerUp/)
  for (const kind of ["hand", "external", "equipment", "root"]) {
    assert.match(spatial, new RegExp(`data-inventory-drop-kind="${kind}"`))
  }
  assert.match(spatial, /data-inventory-grid/)
  assert.match(spatial, /if \(item\.category === "container"\) onActiveHolderChange\(item\.id\)/)
})

test("Stage 12 roadmap and certification are closed", () => {
  assert.match(plan, /\| 12 \| ✅ COMPLETE \| Final security\/concurrency\/E2E certification \|/)
  assert.match(plan, /Stages 1–12 complete/)
  assert.match(plan, /Stage 12 completion gate — PASSED ✅/)
  assert.match(contract, /12 ✅ final security\/concurrency\/E2E certification/)
  assert.match(contract, /Stages 1–12 are complete/)
  assert.match(report, /No known critical inventory integrity, ownership or authorization debt remains/)
})
