import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput, type CharacterSource } from "../src/character-engine/index.ts"
import { contributionForStoredMechanic } from "../src/lib/characterMechanics.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredResourceMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260831120000_wizard_arcane_recovery_runtime.sql",
  "utf8",
)

function section(start: string, end: string) {
  const from = migration.indexOf(start)
  assert.ok(from >= 0, `missing section ${start}`)
  const to = migration.indexOf(end, from + start.length)
  return migration.slice(from, to >= 0 ? to : undefined)
}

const source: CharacterSource = {
  id: "template:class:wizard:v1:source:arcane-recovery",
  name: "Магическое восстановление",
  sourceType: "class_template",
}

const arcaneResource: StoredResourceMechanic = {
  id: "wizard-arcane-recovery-resource",
  type: "resource",
  key: "wizard_arcane_recovery",
  label: "Магическое восстановление",
  max: 1,
  recharge: ["long_rest"],
  sourceKey: "arcane-recovery",
}

function wizardBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "wizard-assignment",
      character_id: "wizard-character",
      template_id: "wizard-template",
      template_level: 7,
      selected_choices: {},
      assigned_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    template: {
      id: "wizard-template",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "wizard-core",
      name: "Волшебник",
      description: "Волшебник",
      version: 1,
      mechanics: [arcaneResource],
      choices: [],
      mechanical_summary: "Arcane Recovery uses one long-rest pool.",
      rules_meta: { mechanics_status: "IN_PROGRESS", parser_owns_spell_slots: true },
      is_active: true,
      created_by: null,
      created_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    levels: [],
  }
}

test("Wizard Arcane Recovery is a real long-rest resource in CE", () => {
  assert.doesNotThrow(() => assertClassResourcePolicy([wizardBundle()]))
  const input: CharacterEngineInput = {
    base: {
      id: "wizard-character",
      name: "Волшебник",
      level: 7,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
      baseMaxHp: 38,
      baseSpeed: 30,
    },
    state: { currentHp: 38, tempHp: 0, resources: { wizard_arcane_recovery: { current: 1 } } },
    contributions: [contributionForStoredMechanic(arcaneResource, source)],
  }
  const contract = resolveCharacterContract(input)
  const resource = contract.resources.find((entry) => entry.stateKey === "wizard_arcane_recovery")
  assert.equal(resource?.current, 1)
  assert.equal(resource?.max.value, 1)
})

test("full-caster slot capacity is parser-owned and uses the shared resource ledger", () => {
  assert.match(migration, /private\.full_caster_slot_mechanics/)
  assert.match(migration, /'key','spell_slot_' \|\| e\.key/)
  assert.match(migration, /'grantOperation','REPLACE'/)
  assert.match(migration, /'recharge',jsonb_build_array\('long_rest'\)/)
  assert.match(migration, /'parser_owns_spell_slots',true/)
  assert.match(migration, /private\.full_caster_slot_mechanics\('wizard',v_level,'spellcasting'\)/)
})

test("short rest is an authoritative reusable server window", () => {
  assert.match(migration, /character_short_rest_sessions/)
  assert.match(migration, /create or replace function public\.grant_character_short_rest/)
  assert.match(migration, /private\.can_manage_campaign/)
  assert.match(migration, /recover_character_resources\(p_character_id,'short_rest'\)/)
  assert.match(migration, /close_character_short_rest_on_player_text/)
  assert.match(migration, /new\.event_kind is not null/)
})

test("long rest closes stale short-rest windows and restores Arcane Recovery through normal resource recharge", () => {
  const longRest = section("create or replace function public.grant_character_long_rest", "create or replace function private.close_character_short_rest_from_chat")
  assert.match(longRest, /character_short_rest_sessions/)
  assert.match(longRest, /is_open=false/)
  assert.match(longRest, /recover_character_resources\(p_character_id,'long_rest'\)/)
})

test("generic slot recovery validates weighted budget and never writes legacy sheet slot state", () => {
  const restore = section("create or replace function private.restore_spell_slot_resources_v1", "create or replace function public.use_wizard_arcane_recovery_v1")
  assert.match(restore, /character_resource_states/)
  assert.match(restore, /v_total:=v_total \+ v_level\*v_amount/)
  assert.match(restore, /v_total>p_budget/)
  assert.match(restore, /v_amount>v_max-v_current/)
  assert.match(restore, /current=least\(max_snapshot,current\+v_amount\)/)
  assert.doesNotMatch(restore, /character_sheets/)
})

test("Wizard wrapper proves class, short-rest timing, level budget, level-five cap and one-use resource", () => {
  const arcane = section("create or replace function public.use_wizard_arcane_recovery_v1", "create or replace function private.install_wizard_2024_mechanics_v1")
  assert.match(arcane, /catalog_key='class:wizard'/)
  assert.match(arcane, /is_character_short_rest_open/)
  assert.match(arcane, /v_budget:=\(v_level\+1\)\/2/)
  assert.match(arcane, /p_recovery,'\{\}'::jsonb\),v_budget,5,auth\.uid\(\)/)
  assert.match(arcane, /state_key='wizard_arcane_recovery'/)
  assert.match(arcane, /current=current-1/)
})
