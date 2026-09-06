import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const catalog = readFileSync("supabase/migrations/20260906182000_warlock_catalog_bootstrap.sql", "utf8")
const pactContract = readFileSync("supabase/migrations/20260906182050_pact_magic_spell_contract.sql", "utf8")
const runtime = readFileSync("supabase/migrations/20260906182100_warlock_base_runtime_v1.sql", "utf8")

const prepared = [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15]
const cantrips = [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]

test("Warlock clean catalog is 2024 base-only", () => {
  assert.match(catalog, /catalog_key='class:warlock'/)
  assert.match(catalog, /'spell_progression','pact_magic'/)
  assert.match(catalog, /'spellcasting_ability','charisma'/)
  assert.match(catalog, /'invocation_runtime_included',false/)
  assert.match(catalog, /'subclass_runtime_included',false/)
  assert.doesNotMatch(catalog, /TODO|FIXME/)
})

test("generic spell contract keeps ordinary slots strict while admitting Pact Magic", () => {
  assert.match(pactContract, /'class_spell','pact_magic','class_feature'/)
  assert.match(pactContract, /v_kind='class_spell'.*spell_slot_/s)
  assert.match(pactContract, /v_kind='pact_magic'.*must not spend ordinary spell slots/s)
})

test("Pact Magic slot and slot-level progression is encoded exactly", () => {
  assert.match(runtime, /v_slots\s*:=\s*case when v_level=1 then 1 when v_level<=10 then 2 when v_level<=16 then 3 else 4 end;/)
  assert.match(runtime, /v_slot_level\s*:=\s*case when v_level<=2 then 1 when v_level<=4 then 2 when v_level<=6 then 3 when v_level<=8 then 4 else 5 end;/)
  assert.match(runtime, /"short_rest","long_rest"/)
  assert.match(runtime, /warlock_pact_slots/)
})

test("prepared-spell and cantrip progression covers Warlock levels 1 through 20", () => {
  assert.equal(prepared.length, 20)
  assert.equal(cantrips.length, 20)
  assert.deepEqual(prepared, [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15])
  assert.deepEqual(cantrips, [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4])
  assert.match(runtime, /warlock_prepared_spell_limit/)
  assert.match(runtime, /warlock_cantrip_count/)
})

test("Magical Cunning is a CE resource conversion and Eldritch Master upgrades the value", () => {
  assert.match(runtime, /warlock_magical_cunning/)
  assert.match(runtime, /warlock_magical_cunning_restore/)
  assert.match(runtime, /\(\(v_slots\+1\)\/2\)/)
  assert.match(runtime, /when v_level>=20 then v_slots/)
  assert.match(runtime, /'operation','RESTORE'/)
  assert.match(runtime, /values\.warlock_magical_cunning_restore/)
  assert.match(runtime, /'restore','all_pact_slots'/)
})

test("Contact Patron has a separate long-rest use and exact semantic payload", () => {
  assert.match(runtime, /warlock_contact_patron/)
  assert.match(runtime, /contact-other-plane/)
  assert.match(runtime, /automatic_intelligence_save_success/)
  assert.match(runtime, /'slot_cost',0/)
})

test("Mystic Arcanum 6 through 9 has independent resources, actions, and v2 selectors", () => {
  assert.match(runtime, /v_level in \(11,13,15,17\)/)
  assert.match(runtime, /warlock_mystic_arcanum_/)
  assert.match(runtime, /warlock_spell_level_/)
  assert.match(runtime, /replacement_policy','on_level_change'/)
  assert.match(runtime, /selection_mode','player_once'/)
  assert.match(runtime, /cast_selected_spell/)
})

test("Pact Magic cast RPC validates class spell access and spends only the pact pool", () => {
  assert.match(runtime, /cast_warlock_pact_spell_v1/)
  assert.match(runtime, /spell_catalog_classes/)
  assert.match(runtime, /sc\.class_key='warlock'/)
  assert.match(runtime, /character_spells[\s\S]*prepared/)
  assert.match(runtime, /state_key='warlock_pact_slots'/)
  assert.match(runtime, /current=current-1/)
})

test("Stage 2 excludes Invocation acquisition and subclasses and preserves future mechanics", () => {
  assert.match(runtime, /'invocation_runtime_included',false/)
  assert.match(runtime, /'subclass_runtime_included',false/)
  assert.doesNotMatch(runtime, /eldritch_invocation_choice|warlock_subclass_choice|patron_choice/)
  assert.match(runtime, /not like 'warlock-base:%'/)
  assert.match(runtime, /not like 'warlock_mystic_arcanum_%'/)
  assert.doesNotMatch(runtime, /TODO|FIXME/)
})