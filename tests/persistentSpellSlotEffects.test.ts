import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260904190500_persistent_spell_slot_effects.sql",
  "utf8",
)

test("template runtime snapshots parser-owned slots from the persistent CE ledger", () => {
  assert.match(migration, /from public\.character_resource_states/)
  assert.match(migration, /s\.state_key=p_state_key/)
  assert.doesNotMatch(migration, /character_sheets/)
  assert.doesNotMatch(migration, /spell_slots/)
})

test("template resource effects restore and spend the same persistent resource row", () => {
  assert.match(migration, /create or replace function private\.apply_character_runtime_resource_effect/)
  assert.match(migration, /set current=least\(max_snapshot,current\+greatest\(0,p_amount\)\)/)
  assert.match(migration, /set current=current-greatest\(0,p_amount\)/)
  assert.match(migration, /Ресурс не синхронизирован/)
})
