import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const boundaryPath = "src/rule-templates/GM_ADJUDICATION_BOUNDARY.md"
const agentsPath = "src/rule-templates/AGENTS.md"
const statusPath = "src/rule-templates/CLASS_WORK_STATUS.md"

test("class agents must read the canonical GM adjudication boundary", () => {
  const agents = fs.readFileSync(agentsPath, "utf8")
  assert.match(agents, /GM_ADJUDICATION_BOUNDARY\.md/)
  assert.match(agents, /Do not automate the GM/i)
  assert.match(agents, /lack of bespoke automation.*not.*mechanics gap/is)
})

test("GM boundary keeps action economy and scene legality out of fake runtime state", () => {
  const boundary = fs.readFileSync(boundaryPath, "utf8")
  for (const required of [
    "Action",
    "Bonus Action",
    "Reaction",
    "once per turn",
    "turn tracker",
    "ten ordinary attacks",
    "GM decides",
    "finite resource",
    "scene",
  ]) {
    assert.match(boundary, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
  }
})

test("manual GM transactions are an intentional completed execution path", () => {
  const boundary = fs.readFileSync(boundaryPath, "utf8")
  for (const required of [
    "Manual GM mutation",
    "copying a found spell or spell scroll",
    "deduct currency",
    "remove/consume the scroll",
    "add the resulting spell",
    "does not need a special \"transcribe scroll\" workflow",
    "not a missing runtime mechanic",
  ]) {
    assert.match(boundary, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
  }
})

test("Wizard audit no longer treats scroll transcription automation as a blocker", () => {
  const status = fs.readFileSync(statusPath, "utf8")
  const wizard = status.slice(status.indexOf("## Wizard (`class:wizard`)"), status.indexOf("## Legacy builtin catalog reset"))
  assert.match(wizard, /FOUND_SPELL_TRANSCRIPTION_IS_MANUAL_BY_DESIGN/)
  assert.match(wizard, /Found-spell\/scroll transcription.*GM-adjudicated by design/is)
  assert.match(wizard, /not missing Wizard runtime mechanics/i)
  assert.match(wizard, /Action\/Bonus Action\/Reaction legality.*GM-adjudicated/is)
})
