import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const app = fs.readFileSync("src/App.tsx", "utf8")
const agents = fs.readFileSync("AGENTS.md", "utf8")

test("deferred UI v1 root spaces use explicit placeholders", () => {
  assert.match(app, /route\.space === "chats"[\s\S]*?<FeaturePlaceholder[\s\S]*?title="Чаты"/)
  assert.match(app, /title="Я"/)
  assert.doesNotMatch(app, /route\.space === "chats"[\s\S]*?<Chats /)
  assert.doesNotMatch(app, /route\.space === "workspace"[\s\S]*?<GmWorkspace/)
})

test("repository contract requires placeholder-first incremental UI integration", () => {
  assert.match(agents, /UI 1\.0 incremental integration — mandatory/)
  assert.match(agents, /UI 1\.0 placeholder/)
  assert.match(agents, /Legacy screens may remain reachable through explicit legacy\/deep routes/)
})
