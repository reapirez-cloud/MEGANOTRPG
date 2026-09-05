import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const closure = fs.readFileSync(
  "supabase/migrations/20260905200000_fighter_runtime_closure_v2.sql",
  "utf8",
)
const retiredDraft = fs.readFileSync(
  "supabase/migrations/20260905123000_fighter_subclass_runtime_repair.sql",
  "utf8",
)
const retiredCompletion = fs.readFileSync(
  "supabase/migrations/20260905190100_fighter_completion_reapply.sql",
  "utf8",
)
const retiredPsi = fs.readFileSync(
  "supabase/migrations/20260905190200_fighter_psi_runtime_reapply.sql",
  "utf8",
)

test("Fighter closure uses immutable verified repair sources", () => {
  assert.match(closure, /0eb033963217dc96d9bd4624d3035d544fe81ccf/)
  for (const bytes of [3566, 94644, 13637, 6657, 15375]) {
    assert.match(closure, new RegExp(`octet_length\\(v_sql\\) <> ${bytes}`))
  }
  assert.doesNotMatch(closure, /raw\.githubusercontent\.com\/reapirez-cloud\/MEGANOTRPG\/(dev|main)\//)
})

test("Fighter closure explicitly repairs the Battle Master JSON defect", () => {
  assert.match(closure, /expected exactly one malformed Battle Master boundary/)
  assert.match(closure, /replace\(v_sql, '\}\]\}\}\]\}\}', '\}\]\}\]\}\}'\)/)
  assert.match(closure, /battle_master_maneuvers/)
  assert.match(closure, /jsonb_array_length[\s\S]*= 20/)
})

test("Psi free Telekinesis is removed only from the class-spell layer", () => {
  assert.match(closure, /fighter-psi-telekinesis-spell/)
  assert.match(closure, /private\.fighter_psi_restore_action/)
  assert.match(closure, /invalid Psi Telekinesis class-spell mechanic remains/)
})

test("closure validates persistent choices, resources and Champion thresholds", () => {
  for (const key of [
    "arcane_shot_options",
    "battle_master_maneuvers",
    "rune_knight_runes",
    "attack_critical_threshold",
    "mechanics_authority",
  ]) assert.match(closure, new RegExp(key))

  assert.match(closure, /choice action references an undeclared resource/)
  assert.match(closure, /top-level action references an undeclared resource/)
  assert.match(closure, /snapshot table was not cleaned up/)
})

test("unapplied broken Fighter drafts are inert and point at the closure", () => {
  for (const draft of [retiredDraft, retiredCompletion, retiredPsi]) {
    assert.match(draft, /20260905200000_fighter_runtime_closure_v2\.sql/)
    assert.match(draft, /select 1;/)
    assert.doesNotMatch(draft, /extensions\.http_get/)
  }
})
