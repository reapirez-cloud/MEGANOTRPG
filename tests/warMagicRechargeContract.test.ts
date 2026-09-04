import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260902125019_wizard_subclass_runtime_v3.sql",
  "utf8",
)
const runtime = fs.readFileSync("src/rule-templates/wizardSubclassRuntime.ts", "utf8")

test("War Magic Power Surge declares a one-point long-rest reset instead of full refill", () => {
  assert.match(migration, /wizard_war_magic_power_surge/)
  assert.match(migration, /restoreAmount/)
  assert.match(runtime, /wizard_war_magic_power_surge/)
})
