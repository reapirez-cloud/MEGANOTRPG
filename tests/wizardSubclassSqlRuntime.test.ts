import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260902060000_wizard_subclass_persistent_state_policy.sql",
  "utf8",
)

test("Wizard SQL installer matches the canonical persistent Overchannel lifecycle", () => {
  assert.match(migration, /'evoker-overchannel-safe-action'/)
  assert.match(
    migration,
    /'kind','state','key',v_state_overchannel,'operation','SET','value',0/,
  )
  assert.match(migration, /'evoker-overchannel-repeat-action'/)
  assert.match(
    migration,
    /'condition',jsonb_build_object\('kind','state','key',v_state_overchannel,'operator','EXISTS'\)/,
  )
  assert.match(
    migration,
    /'kind','state','key',v_state_overchannel,'operation','ADD','value',1/,
  )
})

test("Wizard SQL installer uses canonical resourceCosts for migrated persistent actions", () => {
  assert.match(migration, /'resourceCosts'/)
  assert.doesNotMatch(migration, /'resourceKey'/)
  assert.doesNotMatch(migration, /'resourceCost'/)
})
