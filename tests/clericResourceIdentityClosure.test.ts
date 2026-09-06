import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260906181500_cleric_resource_identity_closure.sql", "utf8")

test("Cleric resource identity closure repairs every split action/resource key", () => {
  const pairs = [
    ["cleric-sentinel-at-death-s-door-l6-1-action-1", "grave_sentinel"],
    ["cleric-divine-foreknowledge-l17-1-action-1", "knowledge_foreknowledge"],
    ["cleric-embodiment-of-the-law-l6-1-action-1", "order_embodiment_law"],
    ["cleric-steps-of-night-l6-1-action-1", "twilight_steps_of_night"],
  ] as const

  for (const [actionId, resourceKey] of pairs) {
    assert.ok(migration.includes(actionId), `missing ${actionId}`)
    assert.ok(migration.includes(resourceKey), `missing ${resourceKey}`)
  }

  assert.match(migration, /'effects',jsonb_build_array\(jsonb_build_object\([\s\S]*?'knowledge_foreknowledge'[\s\S]*?'RESTORE'/)
})

test("Cleric feature metadata uses the actual CE ledger identities", () => {
  for (const key of [
    "grave_sentinel",
    "knowledge_foreknowledge",
    "light_warding_flare",
    "order_embodiment_law",
    "peace_emboldening_bond",
    "tempest_wrath_of_storm",
    "twilight_steps_of_night",
  ]) assert.ok(migration.includes(key), `missing counter identity ${key}`)

  assert.match(migration, /jsonb_build_array\('channel_divinity','light_warding_flare'\)/)
})

test("Cleric closure deletes only the dead Grave Keeper alias and preserves the canonical package", () => {
  assert.match(migration, /cleric-grave-keeper-resource/)
  assert.match(migration, /grave_keeper_of_souls/)
  assert.match(migration, /soul_guardian/)
  assert.match(migration, /cleric-grave-soul-guardian-trigger/)
  assert.match(migration, /cleric-grave-soul-guardian-recharge/)
})

test("Cleric closure hard-fails future resource identity drift", () => {
  assert.match(migration, /action resource cost reference\(s\) target missing resources/)
  assert.match(migration, /action resource effect\(s\) target missing resources/)
  assert.match(migration, /structured counter reference\(s\) target missing resources/)
  assert.match(migration, /v_domains<>14 or v_unlock<>14/)
})
