import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const presets = fs.readFileSync("src/inventory-engine/profilePresets.ts", "utf8")
const physicalEditor = fs.readFileSync(
  "src/components/characters/InventoryPhysicalProfileEditor.tsx",
  "utf8",
)
const itemEditor = fs.readFileSync(
  "src/components/characters/InventoryItemEditor.tsx",
  "utf8",
)
const gmWorkshopData = fs.readFileSync(
  "src/ui-v1-isolated/useGMWorkshopData.ts",
  "utf8",
)
const gmRuntime = fs.readFileSync(
  "src/ui-v1-isolated/gmWorkshopDefinitionRuntime.ts",
  "utf8",
)
const referenceStorage = fs.readFileSync(
  "src/reference-engine/supabase.ts",
  "utf8",
)
const draftApply = fs.readFileSync("src/ai/applyDraft.ts", "utf8")
const vossPolicy = fs.readFileSync(
  "supabase/functions/voss-agent/inventory-authoring.ts",
  "utf8",
)
const migration = fs.readFileSync(
  "supabase/migrations/20260915184110_cheburashka_stage5_complete_authoring_library.sql",
  "utf8",
)

test("Stage 5 ships ordinary physical item and container presets", () => {
  for (const id of [
    "potion",
    "coin",
    "arrows",
    "herb",
    "powder",
    "ore-chunk",
    "dagger",
    "sword",
    "spear",
    "shield",
    "rope",
    "torch",
  ]) {
    assert.ok(presets.includes('id: "' + id + '"'), "missing item preset " + id)
  }

  for (const id of [
    "container-simple-1x1",
    "container-coin-purse",
    "container-small-pouch",
    "container-satchel",
    "container-travel-bag",
    "container-backpack",
    "container-large-backpack",
    "container-sack",
    "container-quiver",
    "container-small-chest",
    "container-chest",
  ]) {
    assert.ok(presets.includes('id: "' + id + '"'), "missing container preset " + id)
  }

  assert.match(presets, /semantic_role: "ammo\.arrow", max_quantity: 50/)
  assert.match(presets, /container-backpack[\s\S]*internal_grid_width: 6[\s\S]*internal_grid_height: 8/)
})

test("GM authoring can draw item shapes but normal container grids come from prepared profiles", () => {
  assert.match(itemEditor, /enablePhysicalProfile/)
  assert.match(itemEditor, /InventoryPhysicalProfileEditor/)
  assert.match(physicalEditor, /toggleCell/)
  assert.match(physicalEditor, /rotateMask/)
  assert.match(physicalEditor, /STANDARD_CONTAINER_PROFILE_PRESETS/)
  assert.match(physicalEditor, /Обычные размеры контейнеров фиксированы заранее/)
  assert.match(physicalEditor, /необычной или магической внутренней геометрии используй Восса/)
  assert.match(physicalEditor, /gridTemplateColumns: "repeat\(" \+ value\.shape_width \+ ", 18px\)"/)
})

test("canonical GM library keeps definition provenance and resolves item mechanics at issue time", () => {
  assert.match(gmWorkshopData, /definition\.kind === "item"/)
  assert.match(gmWorkshopData, /compileWorkshopItemInput/)
  assert.match(gmRuntime, /definition_id: definition\.id/)
  assert.match(gmRuntime, /definition_revision: definition\.revision/)
  assert.match(gmRuntime, /linked_definition_refs/)
  assert.match(gmRuntime, /inventory_profile/)
})

test("Chasovoy item writes use strict Stage 5 v2 RPCs", () => {
  assert.match(referenceStorage, /rpc\("create_reference_definition_v2"/)
  assert.match(referenceStorage, /rpc\("revise_reference_definition_v2"/)
  assert.doesNotMatch(referenceStorage, /rpc\("create_reference_definition_v1"/)
  assert.doesNotMatch(referenceStorage, /rpc\("revise_reference_definition_v1"/)

  assert.match(migration, /Item definition requires data\.inventory_profile/)
  assert.match(migration, /System definitions are immutable through campaign API/)
  assert.match(migration, /from public, anon/)
  assert.match(migration, /to authenticated/)
})

test("Voss can create or safely revise unusual campaign items without erasing mechanics", () => {
  assert.match(vossPolicy, /payload\.existing_definition_id/)
  assert.match(vossPolicy, /Никогда не пытайся ревизовать system definition/)
  assert.match(vossPolicy, /необычную\/магическую внутренность/)
  assert.match(vossPolicy, /кошель 4×3/)
  assert.match(vossPolicy, /рюкзак 6×8/)

  assert.match(draftApply, /existing_definition_id/)
  assert.match(draftApply, /loadDefinitionRevision/)
  assert.match(draftApply, /currentDefinition\?\.mechanics/)
  assert.match(draftApply, /data\.scope !== "campaign"/)
  assert.match(draftApply, /Контейнер .*inventory_profile\.container_profile/)
})

test("Stage 5 migration preserves ambiguous legacy multiplicity instead of guessing", () => {
  assert.match(migration, /where stack_mode = 'stack'[\s\S]*and quantity = 1/)
  assert.match(migration, /stage5_singleton_normalized/)
  assert.match(migration, /stage5_stack_review_required/)
  assert.match(migration, /quantity > 1/)
  assert.doesNotMatch(migration, /delete from public\.character_inventory_items/i)
})
