import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260921194000_artificer_stage7_certification_gate_v1.sql",
  "utf8",
)

const supportedSubclassKeys = [
  "subclass:artificer:alchemist",
  "subclass:artificer:armorer",
  "subclass:artificer:artillerist",
  "subclass:artificer:battle-smith",
  "subclass:artificer:cartographer",
]

test("Artificer Stage 7 gate is fail-closed and cannot certify an incomplete family", () => {
  for (const marker of [
    "ARTIFICER_FINAL_ACTIVE_CLASS_NOT_FOUND",
    "ARTIFICER_FINAL_ACTIVE_CLASS_COUNT",
    "ARTIFICER_FINAL_LEVEL_ROWS_INVALID",
    "ARTIFICER_FINAL_STAGE_STACK_INCOMPLETE",
    "ARTIFICER_FINAL_SUPPORTED_SUBCLASS_COUNT",
    "ARTIFICER_FINAL_ORPHAN_OR_UNSUPPORTED_SUBCLASS",
    "ARTIFICER_FINAL_DUPLICATE_ACTIVE_CATALOG_KEYS",
    "ARTIFICER_FINAL_DUPLICATE_MECHANIC_IDS",
    "ARTIFICER_FINAL_ACTION_FEATURE_REF_INVALID",
    "ARTIFICER_FINAL_BROKEN_RESOURCE_REFS",
    "ARTIFICER_FINAL_CHOICE_CONTRACT_INVALID",
    "ARTIFICER_FINAL_SPELL_CATALOG_EMPTY",
    "ARTIFICER_FINAL_REQUIRED_RPC_MISSING",
    "ARTIFICER_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID",
    "ARTIFICER_FINAL_INTERNAL_HELPER_PRIVILEGES_INVALID",
  ]) {
    assert.ok(migration.includes(marker), marker)
  }

  const certificationStart = migration.indexOf(
    "create or replace function private.certify_artificer_runtime_final_v1",
  )
  const finalCheck = migration.indexOf(
    "ARTIFICER_FINAL_INTERNAL_HELPER_PRIVILEGES_INVALID",
  )
  const readyWrite = migration.indexOf("'mechanics_status','READY'")
  assert.ok(certificationStart >= 0)
  assert.ok(finalCheck > certificationStart)
  assert.ok(readyWrite > finalCheck)
})

test("Artificer Stage 7 freezes the supported five-subclass roster", () => {
  for (const key of supportedSubclassKeys) {
    assert.ok(migration.includes(key), key)
  }
  assert.match(migration, /v_count<>5/)
  assert.match(migration, /s\.unlock_level=3/)
})

test("Artificer Stage 7 requires the completed Stage 1-6 stack before READY", () => {
  assert.match(migration, /base_runtime_certified/)
  assert.match(migration, /stage5_subclasses_wave1_runtime/)
  assert.match(migration, /stage6_subclasses_wave2_runtime/)
  assert.match(migration, /supported_subclass_count/)
  assert.match(migration, /runtime_stage'\)::integer,0\)=6/)
})

test("literary translation and Voss copy are deliberately outside mechanical certification", () => {
  const certifierStart = migration.indexOf(
    "create or replace function private.certify_artificer_runtime_final_v1",
  )
  const certifier = migration.slice(certifierStart)

  assert.doesNotMatch(certifier, /author_description/)
  assert.doesNotMatch(certifier, /author_comment/)
  assert.match(migration, /Literary fields are untouched/)
  assert.match(migration, /'literary_layer_required_for_runtime',false/)
})

test("Artificer Stage 7 keeps its private helpers off anon/authenticated", () => {
  assert.match(
    migration,
    /revoke all on function private\.certify_artificer_runtime_final_v1\(uuid\)[\s\S]*?from public,anon,authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function private\.certify_artificer_runtime_final_v1\(uuid\)[\s\S]*?to service_role/,
  )
  assert.match(migration, /ARTIFICER_FINAL_INTERNAL_HELPER_PRIVILEGES_INVALID/)
})

test("Artificer final activation uses one stable runtime revision and never auto-runs in this gate migration", () => {
  assert.match(migration, /eberron-2025-artificer-runtime-final-v1/)
  assert.doesNotMatch(migration, /do \$certify_existing\$/i)
  assert.doesNotMatch(migration, /create trigger .*artificer_runtime_final/i)
  assert.match(migration, /'runtime_stage',7/)
  assert.match(migration, /'stage7_final_certified',true/)
})
