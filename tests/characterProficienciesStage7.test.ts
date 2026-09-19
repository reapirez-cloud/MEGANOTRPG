import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const component = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetProficiencies.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-proficiencies.css",
  "utf8",
)
const fixture = fs.readFileSync(
  "src/e2e/character-proficiencies-stage7-main.tsx",
  "utf8",
)
const browserSpec = fs.readFileSync(
  "e2e/character-proficiencies-stage7.spec.ts",
  "utf8",
)
const roadmap = fs.readFileSync(
  "docs/CHARACTER_PROFICIENCIES_ROADMAP.md",
  "utf8",
)

test("stage 7 removes developer-only diagnostics from visible player copy", () => {
  assert.doesNotMatch(component, /read-model|Character Engine/)
  assert.doesNotMatch(component, /u1-character-proficiencies__diagnostic/)
  assert.match(component, /data-unclassified-runtime/)
  assert.match(component, /data-unclassified-legacy/)
})

test("stage 7 adds hard overflow guardrails for long labels and narrow phones", () => {
  assert.ok(styles.includes("overflow-x: clip"))
  assert.ok(styles.includes("max-width: 100%"))
  assert.ok(styles.includes("overflow-wrap: anywhere"))
  assert.ok(styles.includes("white-space: normal"))
  assert.ok(styles.includes("@media (max-width: 359px)"))
  assert.ok(styles.includes("@media (min-width: 360px) and (max-width: 389px)"))
  assert.ok(styles.includes("@media (min-width: 390px) and (max-width: 399px)"))
  assert.ok(styles.includes("@media (min-width: 400px) and (max-width: 430px)"))
})

test("stage 7 fixture covers five groups, empty state, large open catalogs and suppression", () => {
  for (const group of ["weapons", "armor", "tools", "languages", "saving_throws"]) {
    assert.match(fixture, new RegExp('key: "' + group + '"'))
  }
  assert.match(fixture, /const armor: CharacterProficiencyRow\[\] = \[\]/)
  assert.match(fixture, /tool:calligrapher-supplies/)
  assert.match(fixture, /tool:leatherworker-tools/)
  assert.match(fixture, /deep-speech/)
  assert.match(fixture, /suppressed: true/)
  assert.match(fixture, /canManage=\{manager\}/)
})

test("stage 7 browser certification covers mobile geometry, accordion, permissions and screenshot artifact", () => {
  assert.match(browserSpec, /\[320, 360, 390, 430\]/)
  assert.match(browserSpec, /empty category quiet, explicit and geometrically intact/)
  assert.match(browserSpec, /long tool and language catalogs wrapping/)
  assert.match(browserSpec, /accordion panels remain independent/)
  assert.match(browserSpec, /player Snake exposes provenance without mutation commands/)
  assert.match(browserSpec, /manager Snake exposes the canonical granular suppression command/)
  assert.match(browserSpec, /proficiencies-stage7-390\.png/)
  assert.match(browserSpec, /page\.screenshot\(/)
})

test("stage 7 roadmap closes the screen after preserving all earlier certified layers", () => {
  for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
    assert.match(roadmap, new RegExp("Stage " + stage + ".*READY"))
  }
})
