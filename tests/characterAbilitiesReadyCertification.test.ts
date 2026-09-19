import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const agents = fs.readFileSync("AGENTS.md", "utf8")
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const features = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetFeatures.tsx",
  "utf8",
)
const legacyProfile = fs.readFileSync(
  "src/pages/CharacterProfileV2.tsx",
  "utf8",
)
const patchLog = fs.readFileSync("docs/PATCH_LOG.md", "utf8")
const visualContract = fs.readFileSync(
  "docs/ABILITIES_VISUAL_REWORK_CONTRACT.md",
  "utf8",
)

test("READY self-deletion removed the temporary abilities implementation contract", () => {
  assert.equal(
    fs.existsSync("docs/ABILITIES_TAB_IMPLEMENTATION_PLAN.md"),
    false,
  )
  assert.doesNotMatch(
    agents,
    /Temporary abilities-tab implementation contract|ABILITIES_TAB_IMPLEMENTATION_PLAN/,
  )
})

test("UI 1.0 abilities route no longer depends on the superseded class mechanics panel", () => {
  assert.match(view, /import CharacterSheetFeatures from "\.\/CharacterSheetFeatures"/)
  assert.doesNotMatch(
    view,
    /CharacterClassPanel(?:Base)?|ContextActionSheet|useLongPressItem/,
  )
  assert.doesNotMatch(
    features,
    /CharacterClassPanel(?:Base)?|ContextActionSheet|useLongPressItem/,
  )
})

test("legacy CharacterProfileV2 keeps its still-used class panel instead of cleanup deleting shared compatibility UI", () => {
  assert.match(
    legacyProfile,
    /import CharacterClassPanel from "\.\.\/components\/characters\/CharacterClassPanel\.tsx"/,
  )
})

test("finished abilities component contains no stage-only milestone marker", () => {
  assert.doesNotMatch(features, /data-stage=/)
})

test("active patch journal records the finished READY abilities tab", () => {
  assert.match(
    patchLog,
    /Abilities tab[^\n]*READY|Умения[^\n]*READY/i,
  )
})


test("abilities v2 visual rework is Stage 8 READY and browser-certified", () => {
  assert.match(
    visualContract,
    /Status: \*\*READY — Stage 8 certified\*\*/,
  )
  assert.match(visualContract, /## Stage 8 acceptance/)
  assert.equal(
    fs.existsSync("e2e-character-abilities-stage8.html"),
    true,
  )
  assert.equal(
    fs.existsSync("src/e2e/character-abilities-stage8-main.tsx"),
    true,
  )
  assert.equal(
    fs.existsSync("e2e/character-abilities-stage8.spec.ts"),
    true,
  )
})
