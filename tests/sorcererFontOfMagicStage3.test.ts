import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sql = fs.readFileSync(
  "supabase/migrations/20260908203000_sorcerer_stage3_font_of_magic_v1.sql",
  "utf8",
)

test("stage 3 uses the 2024 Font of Magic costs and unlock levels", () => {
  assert.match(sql, /\(2,1,2\),\s*\(3,2,3\),\s*\(5,3,5\),\s*\(7,4,6\),\s*\(9,5,7\)/)
  assert.match(sql, /font_of_magic_slot_creation_costs/)
  assert.match(sql, /font_of_magic_slot_creation_unlocks/)
})

test("Font of Magic creates an extra slot instead of merely restoring a spent slot", () => {
  assert.match(sql, /'operation','GRANT_TEMPORARY_MAX'/)
  assert.match(sql, /temporary_max_bonus=temporary_max_bonus\+p_amount/)
  assert.match(sql, /max_snapshot=max_snapshot\+p_amount/)
  assert.match(sql, /current=current\+p_amount/)
  assert.doesNotMatch(sql, /font_of_magic_create_slot_[^\n]+operation','RESTORE'/)
})

test("temporary spell slots survive ordinary ledger sync and expire on Long Rest", () => {
  assert.match(sql, /excluded\.max_snapshot \+ public\.character_resource_states\.temporary_max_bonus/)
  assert.match(sql, /if p_trigger='long_rest' then/)
  assert.match(sql, /max_snapshot=max_snapshot-temporary_max_bonus/)
  assert.match(sql, /temporary_max_bonus=0/)
})

test("stage 3 provisions the canonical full-caster spell-slot ledger", () => {
  assert.match(sql, /spellcasting_ability','charisma'/)
  assert.match(sql, /spell_list','sorcerer'/)
  assert.match(sql, /private\.sync_sorcerer_spell_slots_stage3_v1/)
  assert.match(sql, /'spell_slot_'\|\|v_slot::text/)
  assert.match(sql, /jsonb_build_array\('long_rest'\)/)
})

test("Font actions remain normal GENA template actions with atomic resource cost plus effect", () => {
  assert.match(sql, /'type','action'/)
  assert.match(sql, /'resourceCosts',jsonb_build_array\(jsonb_build_object\(/)
  assert.match(sql, /'key','sorcery_points','amount',v_cost/)
  assert.match(sql, /'kind','resource'/)
  assert.match(sql, /'key','spell_slot_'\|\|v_slot::text/)
})

test("2024 runtime does not install the removed legacy slot-to-Sorcery-Point conversion", () => {
  assert.match(sql, /font_of_magic_reverse_conversion_runtime',false/)
  assert.doesNotMatch(sql, /convert_slot_to_sorcery_points/i)
})
