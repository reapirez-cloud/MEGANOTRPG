import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260904184500_persistent_spell_slot_spending.sql",
  "utf8",
)
const classRuntime = fs.readFileSync("src/lib/classResourceRuntime.ts", "utf8")
const wizardRecovery = fs.readFileSync(
  "supabase/migrations/20260831120000_wizard_arcane_recovery_runtime.sql",
  "utf8",
)

test("generic CE spending RPC exists for class spell resource options", () => {
  assert.match(classRuntime, /rpc\("spend_character_resources"/)
  assert.match(migration, /create or replace function public\.spend_character_resources/)
  assert.match(migration, /private\.consume_character_resource_costs/)
})

test("parser-owned spell slots stay in the persistent character resource ledger", () => {
  assert.match(wizardRecovery, /'parser_owns_spell_slots',true/)
  assert.match(wizardRecovery, /character_resource_states/)
  assert.match(migration, /from public\.character_resource_states/)
  assert.match(migration, /set current = current - v_amount/)
  assert.doesNotMatch(migration, /character_sheets/)
  assert.doesNotMatch(migration, /spell_slots\s*=/)
  assert.doesNotMatch(migration, /v_state_key\s*~\s*'\^spell_slot_/)
})

test("resource overspend remains server-authoritative and names the resource", () => {
  assert.match(migration, /if v_current < v_amount then/)
  assert.match(migration, /Недостаточно ресурса: %/)
  assert.match(migration, /coalesce\(nullif\(trim\(v_label\), ''\), v_state_key\)/)
})
