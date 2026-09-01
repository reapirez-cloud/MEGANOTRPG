import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const agents = fs.readFileSync("AGENTS.md", "utf8")
const log = fs.readFileSync("docs/PATCH_LOG.md", "utf8")

test("root agent contract requires the dev patch journal", () => {
  assert.match(agents, /## Patch journal — mandatory release ledger/)
  assert.match(agents, /docs\/PATCH_LOG\.md/)
  assert.match(agents, /current Active patch/)
  assert.match(agents, /explicit user instruction to promote\/merge\/push to `main` means \*\*the current patch is finished\*\*/)
  assert.match(agents, /After successful promotion/)
  assert.match(agents, /next empty `Active patch`/)
})

test("patch log keeps either one open dev patch or a closed main release transition", () => {
  const hasOpenDevPatch = /## Active patch — [\s\S]*?\*\*Status:\*\* OPEN[\s\S]*?\*\*Branch:\*\* `dev`/.test(log)
  const hasClosedRelease = /## Released patches[\s\S]*?\*\*Status:\*\* RELEASED[\s\S]*?\*\*Branch:\*\* `dev` → `main`/.test(log)
  assert.ok(hasOpenDevPatch || hasClosedRelease, "journal must represent the open-dev or closed-release lifecycle state")
  assert.match(log, /\*\*Base main:\*\* `[0-9a-f]{40}`/)
  assert.match(log, /## Released patches/)
  assert.match(log, /The executable agent rule lives in `\/AGENTS\.md`/)
})
