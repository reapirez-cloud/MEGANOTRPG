import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260911072000_template_formula_ability_reference_fix.sql",
  "utf8",
)

test("server formula evaluator reads the canonical scalar ability columns", () => {
  assert.match(migration, /abilities\\\.\(strength\|dexterity\|constitution\|intelligence\|wisdom\|charisma\)\\\.\(score\|modifier\)/)
  for (const ability of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) {
    assert.match(migration, new RegExp(`when '${ability}' then s\\.${ability}::numeric`))
  }
  assert.doesNotMatch(migration, /\bs\.ability_scores\b/)
  assert.match(migration, /from public\.character_sheets s/)
})

test("ability modifier formulas preserve the D&D floor rule", () => {
  assert.match(migration, /return floor\(\(v_score-10\)\/2\)/)
})

test("formula evaluator remains private to application clients", () => {
  assert.match(migration, /revoke all on function private\.evaluate_character_template_numeric_expression\(uuid,jsonb\) from public,anon,authenticated/)
  assert.match(migration, /grant execute on function private\.evaluate_character_template_numeric_expression\(uuid,jsonb\) to service_role/)
})
