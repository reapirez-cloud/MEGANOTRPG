import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const paladinReference = fs.readFileSync(
  "src/data/classes/paladinReferenceComplete.ts",
  "utf8",
)
const referenceGuide = fs.readFileSync(
  "src/components/reference/ReferenceGuide.tsx",
  "utf8",
)
const ruleTemplatesHook = fs.readFileSync(
  "src/hooks/useRuleTemplates.ts",
  "utf8",
)
const finalCloseout = fs.readFileSync(
  "supabase/migrations/20260908131500_paladin_final_closeout_v1.sql",
  "utf8",
)

test("Paladin reference is runtime-backed instead of literary-only", () => {
  assert.match(paladinReference, /referenceOnly:\s*false/)
  assert.match(paladinReference, /все пятнадцать клятв подключены к Character Engine/)
  assert.doesNotMatch(paladinReference, /runtime mechanics remain intentionally inactive/)
})

test("Reference guide can resolve Paladin subclass level mechanics", () => {
  assert.match(referenceGuide, /function buildTemplateFeatures\(/)
  assert.match(referenceGuide, /levels\.filter\(\(entry\) => entry\.template_id === template\.id\)/)
  assert.match(referenceGuide, /if \(!selectedClass \|\| selectedClass\.referenceOnly\) return undefined/)
  assert.match(referenceGuide, /selectedSubclass\.templateId/)
  assert.match(ruleTemplatesHook, /from\("rule_template_levels"\)/)
  assert.match(ruleTemplatesHook, /setLevels\(presented\.levels\)/)
})

test("Paladin closeout removes stale deferred stage metadata", () => {
  assert.match(finalCloseout, /- 'stage4_deferred'/)
  assert.match(finalCloseout, /'closeout_status', 'CLOSED'/)
  assert.match(finalCloseout, /PALADIN_CLOSEOUT_OATH_COUNT/)
  assert.match(finalCloseout, /v_oath_count <> 15/)
})
