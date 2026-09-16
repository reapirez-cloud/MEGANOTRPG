import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260916104600_cheburashka_stage11a_catalog_adoption.sql",
  "utf8",
)

test("Stage 11A turns reusable physical presets into immutable system definitions", () => {
  for (const slug of [
    "consumable-healing-potion-small",
    "currency-gold-coin",
    "ammo-arrow",
    "ingredient-herb",
    "material-ore-chunk",
    "material-ingot",
    "weapon-dagger",
    "weapon-longsword",
    "weapon-club",
    "armor-shield",
    "armor-chain-mail",
    "tool-rope",
    "tool-torch",
    "reference-book",
    "gear-bedroll",
    "container-component-pouch",
  ]) {
    assert.match(migration, new RegExp(`"slug":"${slug}"`))
  }

  assert.match(migration, /scope='system'/)
  assert.match(migration, /private\.cheburashka_assert_inventory_profile_v1/)
  assert.match(migration, /ingredient\.herb/)
  assert.match(migration, /packing_mode":"bulk_stack"/)
  assert.match(migration, /material\.ore_chunk/)
  assert.match(migration, /packing_mode":"instance"/)
})

test("Stage 11A adoption is exact and preserves concrete item state", () => {
  const start = migration.indexOf("-- Stage 11A safe exact adoption begins.")
  const end = migration.indexOf("-- Stage 11A safe exact adoption ends.")
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const adoption = migration.slice(start, end)

  assert.match(adoption, /lower\(btrim\(item\.name\)\)=resolved\.item_name/)
  assert.match(adoption, /item\.category=resolved\.category/)
  assert.match(adoption, /item\.definition_id is null/)
  assert.doesNotMatch(adoption, /\blike\b/i)
  assert.doesNotMatch(adoption, /\bname\s*=/i)
  assert.doesNotMatch(adoption, /\bquantity\s*=/i)
  assert.doesNotMatch(adoption, /\bweight\s*=/i)
  assert.doesNotMatch(adoption, /\bmechanics\s*=/i)
  assert.doesNotMatch(adoption, /\bstack_mode\s*=/i)
  assert.match(adoption, /version=item\.version\+1/)
  assert.match(adoption, /stage11_adopted/)
})

test("Stage 11A leaves ambiguous narrative legacy rows for explicit review", () => {
  assert.doesNotMatch(migration, /связка ключей от лекарского домика/i)
  assert.doesNotMatch(migration, /жопа с ручкой/i)
  assert.doesNotMatch(migration, /резиновая жопа/i)
  assert.doesNotMatch(migration, /рыбный кинжал/i)
})
