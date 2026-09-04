import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260904192000_persistent_set_recovery.sql",
  "utf8",
)
const mechanics = fs.readFileSync("src/lib/characterMechanics.ts", "utf8")
const restRuntime = fs.readFileSync(
  "supabase/migrations/20260830185148_restore_post_rest_preparation_runtime.sql",
  "utf8",
)

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
})

test("post-rest runtime already executes set recovery to an exact value", () => {
  assert.match(restRuntime, /v_restore='set'/)
  assert.match(restRuntime, /current=least\(max_snapshot,v_amount\)/)
})
