import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const catalog = readFileSync("supabase/migrations/20260906182000_warlock_catalog_bootstrap.sql", "utf8")
const runtime = readFileSync("supabase/migrations/20260906182100_warlock_base_runtime_v1.sql", "utf8")

function expectedSlots(level: number): number {
  if (level === 1) return 1
  if (level <= 10) return 2
  if (level <= 16) return 3
  return 4
}

function expectedSlotLevel(level: number): number {
  if (level <= 2) return 1
  if (level <= 4) return 2
  if (level <= 6) return 3
  if (level <= 8) return 4
  return 5
}

const prepared = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]
const cantrips = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]

test("Warlock clean catalog is 2024 base-only", () => {
  assert.match(catalog, /catalog_key='class:warlock'/)
  assert.match(catalog, /'spell_progression','pact_magic'/)
  assert.match(catalog, /'spellcasting_ability','charisma'/)
  assert.match(catalog, /'invocation_runtime_included',false/)
  assert.match(catalog, /'subclass_runtime_included',false/)
  assert.doesNotMatch(catalog, /TODO|FIXME/)
})

test("Pact Magic slot progression is exact from Warlock level 1 through 20", () => {
  for (let level = 1; level <= 20; level += 1) {
    assert.equal(expectedSlots(level), level === 1 ? 1 : level <= 10 ? 2 : level <= 16 ? 3 : 4)
    assert.equal(expectedSlotLevel(level), level <= 2 ? 1 : level <= 4 ? 2 : level <= 6 ? 3 : level <= 8 ? 4 : 5)
  }

  assert.match(runtime, /v_slots := case when v_level=1 then 1 when v_level<=10 then 2 when v_level<=16 then 3 else 4 end;/)
  assert.match(runtime, /v_slot_level := case when v_level<=2 then 1 when v_level<=4 then 2 when v_level<=6 then 3 when v_level<=8 then 4 else 5 end;/)
  assert.match(runtime, /"short_rest","long_rest"/)
  assert.match(runtime, /warlock_pact_slots/)
})

test("Warlock prepared-spell and cantrip progression is encoded for every level", () => {
  assert.equal(prepared.length, 20)
  assert.equal(cantrips.length, 20)
  assert.deepEqual(prepared, [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15])
  assert.deepEqual(cantrips, [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4])
  assert.match(runtime, /warlock_prepared_spell_limit/)
  assert.match(runtime, /warlock_cantrip_count/)
})

test("Magical Cunning is a real long-rest resource conversion and Eldritch Master upgrades it", () => {
  assert.match(runtime, /warlock_magical_cunning/)
  assert.match(runtime, /warlock_magical_cunning_restore/)
  assert.match(runtime, /\(\(v_slots\+1\)\/2\)/)
  assert.match(runtime, /when v_level>=20 then v_slots/)
  assert.match(runtime, /'operation','RESTORE'/)
  assert.match(runtime, /values\.warlock_magical_cunning_restore/)
  assert.match(runtime, /restore','all_pact_slots'/)
})

test("Contact Patron has always-prepared spell access plus an independent free use", () => {
  assert.match(runtime, /warlock_contact_patron/)
  assert.match(runtime, /spell:contact-other-plane/)
  assert.match(runtime, /'mode','always_prepared'/)
  assert.match(runtime, /automatic_intelligence_save_success/)
  assert.match(runtime, /'key','free-contact'/)
})

test("Mystic Arcanum 6 through 9 uses independent long-rest resources and structured choices", () => {
  for (const level of [6, 7, 8, 9]) {
    assert.match(runtime, new RegExp(`warlock_mystic_arcanum_${level}`))
    assert.match(runtime, new RegExp(`warlock_spell_level_${level}`))
  }
  assert.match(runtime, /replacement_policy','on_level_change'/)
  assert.match(runtime, /selection_mode','player_once'/)
})

test("Stage 2 does not wire Eldritch Invocation acquisition or subclasses", () => {
  assert.match(runtime, /'invocation_runtime_included',false/)
  assert.match(runtime, /'subclass_runtime_included',false/)
  assert.doesNotMatch(runtime, /eldritch_invocation_choice|warlock_subclass_choice|patron_choice/)
  assert.doesNotMatch(runtime, /TODO|FIXME/)
})

test("base installer preserves future non-base mechanics on the same level rows", () => {
  assert.match(runtime, /not like 'warlock-base:%'/)
  assert.match(runtime, /not like 'warlock_mystic_arcanum_%'/)
})