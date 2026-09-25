import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const app = readFileSync("src/ui-v1-isolated/UiV1App.tsx", "utf8")
const control = readFileSync("src/ui-v1-isolated/AiGmControl.tsx", "utf8")
const agent = readFileSync("src/ai/AgentShell.tsx", "utf8")
const agentCss = readFileSync("src/ai/ai-voss.css", "utf8")

test("square AI GM route owns assistant UI and global floating orb stays unmounted", () => {
  assert.doesNotMatch(app, /import AgentShell from/)
  assert.doesNotMatch(app, /<AgentShell\s*\/>/)
  assert.match(control, /import AgentShell from "\.\.\/ai\/AgentShell"/)
  assert.match(control, /<AgentShell embedded \/>/)
  assert.match(agent, /embedded = false/)
  assert.match(agent, /\{!embedded && \([\s\S]*className="u1-agent-orb"/)
  assert.match(agent, /data-embedded=\{embedded \|\| undefined\}/)
  assert.match(agentCss, /\.u1-agent-panel\[data-embedded\]/)
})
