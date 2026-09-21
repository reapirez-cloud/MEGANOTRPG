import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const audit = readFileSync(
  new URL("../src/data/classes/rogueRuntimeReuseAudit.md", import.meta.url),
  "utf8",
)
const plan = readFileSync(
  new URL("../src/data/classes/rogueRuntimePlan.md", import.meta.url),
  "utf8",
)
const ledger = readFileSync(
  new URL("../src/rule-templates/CLASS_WORK_STATUS.md", import.meta.url),
  "utf8",
)
const queue = readFileSync(
  new URL("../docs/WORK_QUEUE.md", import.meta.url),
  "utf8",
)

test("Rogue reuse audit is the completed handoff before executable Stage 2", () => {
  assert.match(audit, /Status:\*\* `COMPLETE_2026_09_21`/)
  assert.match(audit, /Next executable stage:\*\* `Stage 2 — clean class foundation and 1–20 progression`/)
  assert.match(plan, /Pre-Stage-2 reuse audit[\s\S]*COMPLETE_2026_09_21/)
  assert.match(ledger, /pre_stage_2_reuse_audit: COMPLETE_2026_09_21/)
  assert.match(queue, /Pre-Stage-2 reuse audit is complete/)
})

test("Rogue audit forbids restoring the retired legacy catalog wholesale", () => {
  assert.match(audit, /ADAPT, DO NOT RESTORE WHOLESALE/)
  assert.match(audit, /Do not reinstall the historical Rogue catalog/)
  assert.match(audit, /rogue-scion-of-the-three.*OUTSIDE the frozen supported roster/s)
  assert.match(
    ledger,
    /historical_builtin_reuse_policy: ADAPT_SELECTED_STRUCTURAL_AND_ACTION_FRAGMENTS_ONLY_DO_NOT_RESTORE_LEGACY_INSTALLER/,
  )
  assert.match(
    ledger,
    /historical_extra_subclass_excluded: rogue-scion-of-the-three/,
  )
})

test("Rogue audit preserves reusable old action shapes without treating summaries as runtime", () => {
  assert.match(audit, /Cunning Action.*three CE action definitions/s)
  assert.match(audit, /cunning_dash/)
  assert.match(audit, /cunning_disengage/)
  assert.match(audit, /historical label `Засада`/)
  assert.match(audit, /generated mechanic summaries \| DISCARD AS RUNTIME/)
  assert.match(audit, /Historical `runtime: \[\]` rows \| DISCARD AS RUNTIME/)
})

test("Rogue Stage 2 has one confirmed generic infrastructure prerequisite", () => {
  assert.match(audit, /Dynamic proficient-weapon choice provider/)
  assert.match(audit, /Long-rest replacement itself already exists and is not a blocker/)
  assert.match(
    ledger,
    /stage_2_confirmed_generic_gap: PROFICIENT_WEAPON_DYNAMIC_CHOICE_PROVIDER/,
  )
})

test("later Rogue gaps remain generic instead of class-specific forks", () => {
  for (const phrase of [
    "Sneak-Attack-dice sacrifice/rider primitive",
    "Authoritative d20 result override seam",
    "Temporary spell access state",
    "Conditional resource spending",
    "Ensure-minimum-on-rest resource recovery",
  ]) {
    assert.ok(audit.includes(phrase), phrase)
  }
})
