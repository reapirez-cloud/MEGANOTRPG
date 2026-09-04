import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260904192000_persistent_set_recovery.sql",
  "utf8",
)
const mechanics = fs.readFileSync("src/lib/characterMechanics.ts", "utf8")

test("persistent resource validation accepts the CE exact-set recharge shape", () => {
  assert.match(mechanics, /mechanic\.restore === "set"/)
  assert.match(mechanics, /restore: "set" as const/)
  assert.match(migration, /coalesce\(v_rule->>'restore',''\) = 'set'/)
  assert.match(migration, /coalesce\(p_recharge->>'restore',''\) = 'set'/)
})

test("exact-set recovery remains numeric and nonnegative", () => {
  assert.match(migration, /jsonb_typeof\(v_rule->'amount'\) = 'number'/)
  assert.match(migration, /\(v_rule->>'amount'\)::numeric >= 0/)
  assert.match(migration, /jsonb_typeof\(p_recharge->'amount'\) = 'number'/)
  assert.match(migration, /\(p_recharge->>'amount'\)::numeric >= 0/)
})
