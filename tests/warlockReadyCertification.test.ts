import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const ledger = fs.readFileSync("src/rule-templates/CLASS_WORK_STATUS.md", "utf8")
const certification = fs.readFileSync("src/rule-templates/WARLOCK_READY_CERTIFICATION.md", "utf8")
const plan = fs.readFileSync("src/data/classes/warlockAuthoringPlan.md", "utf8")

function warlockSection(): string {
  return ledger.split("## Warlock (`class:warlock`)")[1]?.split("\n---")[0] ?? ""
}

test("Warlock canonical ledger is READY only for the certified nine-patron runtime", () => {
  const section = warlockSection()
  assert.match(section, /\*\*Text:\*\* `READY`/)
  assert.match(section, /\*\*Mechanics\/runtime:\*\* `READY`/)
  assert.match(section, /production_supported_patron_count: 9/)
  assert.match(section, /production_supplemental_patron_count: 5/)
  assert.match(section, /production_duplicate_active_catalog_keys: 0/)
  assert.match(section, /production_orphan_subclasses: 0/)
  assert.match(section, /runtime_ready_subclasses: archfey, celestial, fiend, great-old-one, hexblade, fathomless, genie, undead, undying/)
  assert.match(section, /expanded_literary_only_subclasses: raven-queen, seeker, great-wyrm/)
})

test("Warlock final certification records source-gated production closure", () => {
  assert.match(certification, /Mechanics\/runtime:\*\* `READY`/)
  assert.match(certification, /DEPLOYED_AND_CERTIFIED_2026_09_07/)
  assert.match(certification, /warlock-ready-stage4-source-gated-spells-v1/)
  assert.match(certification, /Shield.*Hexblade/i)
  assert.match(certification, /Sanctuary.*Genie\/Dao/i)
  assert.match(certification, /active runtime patrons: `9`/)
  assert.match(certification, /active duplicate Warlock catalog keys: `0`/)
  assert.match(certification, /orphan Warlock subclasses: `0`/)
  assert.match(certification, /GitHub Actions CI run `#1863`/)
})

test("Warlock four-stage authoring plan is closed and points to final certification", () => {
  assert.match(plan, /Four-stage READY plan:\*\* `CLOSED_2026_09_07`/)
  assert.match(plan, /Mechanics\/runtime:\*\* `READY`/)
  assert.match(plan, /WARLOCK_READY_CERTIFICATION\.md/)
  assert.match(plan, /Stage 4 — final READY certification/)
  assert.match(plan, /Status:\*\* `READY_2026_09_07`/)
  assert.match(plan, /nine active runtime patrons/i)
})
