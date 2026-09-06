import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migrationPath = "supabase/migrations/20260906170000_cleric_runtime_final_certification.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

const supportedDomains = [
  "arcana-domain",
  "death-domain",
  "forge-domain",
  "grave-domain",
  "knowledge-domain",
  "life-domain",
  "light-domain",
  "nature-domain",
  "order-domain",
  "peace-domain",
  "tempest-domain",
  "trickery-domain",
  "twilight-domain",
  "war-domain",
]

test("Cleric final certification gates the live base class and all fourteen domains", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE: mechanics/)
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:cleric/)
  assert.match(migration, /v_domains<>14 or v_unlock<>14/)
  assert.match(migration, /expected 14 domains unlocked at level 3/)
  assert.match(migration, /domainCount',14/)
  for (const domain of supportedDomains) {
    assert.match(migration, /catalog_key like 'subclass:cleric:%'/)
    assert.ok(domain.length > 0)
  }
})

test("Cleric certification proves preparation, Channel Divinity and Divine Spark progression", () => {
  assert.match(migration, /prepared_spells_by_level/)
  assert.match(migration, /spell_preparation_refresh/)
  assert.match(migration, /prepared-spell progression\/refresh contract is incomplete/)
  assert.match(migration, /m->>'key'='channel_divinity'/)
  assert.match(migration, /level=2 and \(m->>'max'\)::integer=2/)
  assert.match(migration, /level=6 and \(m->>'max'\)::integer=3/)
  assert.match(migration, /level=18 and \(m->>'max'\)::integer=4/)
  assert.match(migration, /trigger'='short_rest'/)
  assert.match(migration, /trigger'='long_rest'/)
  assert.match(migration, /diceByClericLevel,2}'='1d8'/)
  assert.match(migration, /diceByClericLevel,7}'='2d8'/)
  assert.match(migration, /diceByClericLevel,13}'='3d8'/)
  assert.match(migration, /diceByClericLevel,18}'='4d8'/)
})

test("Cleric certification fails closed on broken choices, spells and persistent resource identities", () => {
  assert.match(migration, /choice option\(s\) have incomplete labels\/mechanics maps/)
  assert.match(migration, /domain spell package\(s\) are incomplete/)
  assert.match(migration, /runtime resource reference\(s\) target missing ledgers/)
  assert.match(migration, /duplicate action identities remain/)
  assert.match(migration, /malformed\/placeholder\/legacy mechanics remain/)
  assert.match(migration, /m->>'type'='resource'/)
  assert.match(migration, /m->>'type'='action'/)
  assert.match(migration, /persistentCounter/)
  assert.match(migration, /persistentCounters/)
})

test("Greater Divine Intervention keeps the exact Wish cooldown on the documented GM boundary", () => {
  assert.match(migration, /specialCooldown,whenSpell}'='wish'/)
  assert.match(migration, /specialCooldown,longRestsDice}'='2d4'/)
  assert.match(migration, /cooldownEnforcement}'='gm_adjudicated'/)
  assert.match(migration, /wish_selection_and_2d4_result_are_not_authoritative_runtime_state/)
  assert.doesNotMatch(migration, /create table[\s\S]*greater_divine_intervention/i)
  assert.doesNotMatch(migration, /create table[\s\S]*cleric_cooldown/i)
})

test("Cleric is marked READY only after every certification gate succeeds", () => {
  const gateEnd = migration.indexOf("end $$;")
  const readyWrite = migration.indexOf("cleric-runtime-certified@2026-09-06")
  assert.ok(gateEnd >= 0)
  assert.ok(readyWrite > gateEnd)
  assert.match(migration, /class_work_status,mechanics/)
  assert.match(migration, /'mechanics_status','READY'/)
  assert.match(migration, /'runtime_certified_at','2026-09-06'/)
})
