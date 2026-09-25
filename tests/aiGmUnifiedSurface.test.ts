import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

function read(path: string) {
  return readFileSync(path, "utf8")
}

const app = read("src/ui-v1-isolated/UiV1App.tsx")
const control = read("src/ui-v1-isolated/AiGmControl.tsx")
const agent = read("src/ai/AgentShell.tsx")
const agentCss = read("src/ai/ai-voss.css")

test("AI GM owns the assistant surface and the global floating orb is disabled", () => {
  assert.doesNotMatch(app, /import AgentShell from/)
  assert.doesNotMatch(app, /<AgentShell\s*\/>/)
  assert.match(control, /import AgentShell from "\.\.\/ai\/AgentShell"/)
  assert.match(control, /<AgentShell embedded \/>/)
  assert.match(agent, /embedded = false/)
  assert.match(agent, /\{!embedded && \([\s\S]*className="u1-agent-orb"/)
  assert.match(agent, /data-embedded=\{embedded \|\| undefined\}/)
  assert.match(agentCss, /\.u1-agent-panel\[data-embedded\]/)
})
