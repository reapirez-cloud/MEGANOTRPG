import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import { sorcererRuntimePackageFixture } from "./support/sorcererRuntimePackageFixture.ts"

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260909010000_sorcerer_stage5_base_runtime_v1.sql", import.meta.url),
  "utf8",
)

test("Stage 5 package contract reaches the real parser and Character Engine", () => {
  const bundle = sorcererRuntimePackageFixture(20)
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))

  const parsed = resolveTemplateBundles([bundle], 20)
  const contract = resolveCharacterContract({
    base: {
      id: "sorcerer-stage5-package-gate",
      name: "Чародей",
      level: 20,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 20 },
      baseMaxHp: 120,
      baseSpeed: 30,
    },
    state: {
      currentHp: 120,
      tempHp: 0,
      resources: {
        innate_sorcery: { current: 2 },
        sorcery_points: { current: 20 },
        sorcerous_restoration: { current: 1 },
      },
    },
    contributions: parsed.contributions,
  })

  assert.equal(contract.resources.find((entry) => entry.key === "sorcery_points")?.max.value, 20)
  assert.ok(contract.actions.find((entry) => entry.key === "innate_sorcery"))
})

test("Stage 5 declares the strict Sorcerer mechanics and resource contracts", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:sorcerer/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/sorcererBaseRuntimeStage5\.test\.ts/i)
  assert.match(migration, /CLASS_WORK_STATUS:\s*sorcerer:stage5=READY/i)
})

test("Innate Sorcery activation is server-owned and lasts exactly one minute", () => {
  assert.match(migration, /create or replace function public\.use_sorcerer_innate_sorcery_v1/i)
  assert.match(migration, /clock_timestamp\(\)\+interval '1 minute'/i)
  assert.match(migration, /sorcerer\.innate_sorcery_expires_at_epoch/i)
  assert.match(migration, /'saveDcBonus',1/i)
  assert.match(migration, /'spellAttackAdvantage',true/i)
})

test("Sorcery Incarnate only opens the fallback activation at Sorcerer level 7", () => {
  assert.match(migration, /if v_level<7 then raise exception 'Innate Sorcery has no uses remaining'/i)
  assert.match(migration, /'stateKey','sorcery_points','amount',2/i)
  assert.match(migration, /'max_metamagic_while_innate_active',2/i)
  assert.match(migration, /cardinality\(p_modifier_mechanic_ids\)>2/i)
})

test("Sorcery Incarnate checks live Innate Sorcery time instead of a permanent boolean", () => {
  assert.match(migration, /private\.sorcerer_innate_sorcery_active_v1/i)
  assert.match(migration, /> extract\(epoch from statement_timestamp\(\)\)/i)
  assert.doesNotMatch(migration, /sorcerer\.innate_sorcery_active['"]\s*[:,]/i)
})

test("Arcane Apotheosis waives one Metamagic cost only while Innate Sorcery is active", () => {
  assert.match(migration, /v_free_this_modifier:=v_innate_active and v_level>=20 and not v_free_used/i)
  assert.match(migration, /'sorceryPointCostWaived',v_free_this_modifier/i)
  assert.match(migration, /'once_per_turn_gm_adjudicated'/i)
  assert.match(migration, /'free_metamagic_while_innate_active',1/i)
})

test("Stage 5 keeps turn cadence on the documented GM boundary", () => {
  assert.doesNotMatch(migration, /turn_counter|current_turn|turn_sequence/i)
  assert.match(migration, /once_per_turn_gm_adjudicated/i)
})

test("Stage 5 preserves later full integration as a separate stage", () => {
  assert.match(migration, /'stage6_ui_full_integration_pending',true/i)
  assert.match(migration, /xphb-2024-sorcerer-stage5-base-runtime-v1/i)
  assert.match(migration, /ensure_sorcerer_stage4_metamagic_runtime_v1/i)
})
