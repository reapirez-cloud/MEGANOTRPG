import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import {
  warlockSubclassRuntimeBundles,
  WARLOCK_SUBCLASS_RUNTIME_CATALOG_KEYS,
} from "../src/rule-templates/warlockSubclassMechanics.ts"

const migrationPath = "supabase/migrations/20260907074308_warlock_stage5_production_reconciliation_v1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

function bundlesAtLevel(level: number) {
  return warlockSubclassRuntimeBundles.map((bundle) => ({
    ...bundle,
    assignment: {
      ...bundle.assignment,
      ...(bundle.template.kind === "class" ? { template_level: level } : { template_level: null }),
    },
  }))
}

test("Stage 5 production reconciliation preserves the strict subclass package contract", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*subclass:warlock/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/warlockStage5ProductionReconciliation\.test\.ts/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
  assert.doesNotThrow(() => assertClassPackageQuality(warlockSubclassRuntimeBundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(warlockSubclassRuntimeBundles))

  const parsed = resolveTemplateBundles(bundlesAtLevel(14), 14)
  assert.ok(parsed.contributions.length > 0)
  const contract = resolveCharacterContract({
    base: {
      id: "warlock-stage5-production-reconcile",
      name: "Колдун",
      level: 14,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 92,
      baseSpeed: 30,
    },
    state: { currentHp: 92, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  })
  assert.ok(contract.rules.length > 0)
  assert.ok(contract.resources.some((entry) => entry.key === "warlock_pact_slots"))
})

test("Stage 5 keeps exactly the four PHB 2024 patrons", () => {
  assert.deepEqual([...WARLOCK_SUBCLASS_RUNTIME_CATALOG_KEYS], [
    "subclass:warlock:archfey",
    "subclass:warlock:celestial",
    "subclass:warlock:fiend",
    "subclass:warlock:great-old-one",
  ])
  assert.match(migration, /v_count <> 4 or v_exact <> 4/)
  assert.match(migration, /WARLOCK_STAGE5_PATRON_SET_INVALID/)
})

test("production reconciliation re-runs the canonical installer only when it already exists", () => {
  assert.match(migration, /to_regprocedure\('private\.install_warlock_phb2024_subclasses_v1\(uuid\)'\) is not null/)
  assert.match(migration, /execute 'select private\.install_warlock_phb2024_subclasses_v1\(\$1\)' using v_campaign\.id/)
  assert.match(migration, /to_regprocedure\('private\.install_warlock_phb2024_subclasses_v1\(uuid\)'\) is null/)
})

test("production reconciliation guards the executable resource/action paths of every patron", () => {
  assert.match(migration, /warlock_archfey_beguiling_defenses_restore_by_pact_slot/)
  assert.match(migration, /warlock_celestial_healing_light_5d6/)
  assert.match(migration, /warlock_fiend_hurl_through_hell_restore_by_pact_slot/)
  assert.match(migration, /warlock_goo_clairvoyant_combatant_restore_by_pact_slot/)
})

test("production reconciliation verifies patron Pact Magic follows pact-slot progression", () => {
  assert.match(migration, /m\.value->>'key' = 'spell:fireball'/)
  assert.match(migration, /v_cast_level is distinct from 3/)
  assert.match(migration, /v_cast_level is distinct from 5/)
  assert.match(migration, /WARLOCK_STAGE5_PATRON_CAST_LEVEL_INVALID/)
})
