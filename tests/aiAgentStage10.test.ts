import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 10 mounts exactly one global agent shell inside UiV1App", () => {
  const entry = read("src/ui-v1-isolated/main.tsx")
  const app = read("src/ui-v1-isolated/UiV1App.tsx")

  assert.match(entry, /<AIProvider>/)
  assert.match(entry, /<SnakeProvider>/)
  assert.doesNotMatch(entry, /<VossDock\s*\/>/)
  assert.doesNotMatch(entry, /<AgentShell\s*\/>/)
  assert.match(app, /import AgentShell from "\.\.\/ai\/AgentShell"/)
  assert.equal((app.match(/<AgentShell\s*\/>/g) || []).length, 1)
})

test("Stage 10 replaces the old VI profile mark with the global agent orb", () => {
  const app = read("src/ui-v1-isolated/UiV1App.tsx")
  const shell = read("src/ai/AgentShell.tsx")
  const styles = read("src/ai/ai-voss.css")

  assert.doesNotMatch(app, /PlayerProfileMark/)
  assert.match(shell, /className="u1-agent-orb"/)
  assert.match(shell, /aria-controls="u1-agent-panel"/)
  assert.match(styles, /\.u1-agent-orb\s*\{[\s\S]*?position:\s*fixed/)
  assert.match(styles, /top:\s*calc\(/)
  assert.match(styles, /right:\s*max\(/)
  assert.doesNotMatch(styles, /u1-voss-launcher/)
})

test("desktop agent is a right side panel and mobile agent is a bottom sheet", () => {
  const styles = read("src/ai/ai-voss.css")

  assert.match(styles, /\.u1-agent-panel\s*\{[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;/)
  assert.match(styles, /width:\s*min\(430px, 38vw\)/)
  assert.match(styles, /@media \(max-width: 720px\)/)
  assert.match(styles, /height:\s*min\(76dvh, 720px\)/)
  assert.match(styles, /max-height:\s*82dvh/)
  assert.match(styles, /transform:\s*translateY\(104%\)/)
  assert.match(styles, /border-radius:\s*14px 14px 0 0/)
})

test("agent suggestions are semantic and never auto-send on tap", () => {
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(shell, /viewContext\?\.draft\?\.dirty/)
  assert.match(shell, /viewContext\?\.entity/)
  assert.match(shell, /reference-\(\?:class\|subclass\|feature\)/)
  assert.match(shell, /gm-workshop/)
  assert.match(shell, /onClick=\{\(\) => usePrompt\(prompt\)\}/)
  assert.match(shell, /setDraft\(prompt\)/)
  assert.doesNotMatch(shell, /onClick=\{\(\) => send\(prompt\)\}/)
  assert.doesNotMatch(shell, /generate_image|Сгенерировать изображение|Генерировать арт/i)
})

test("agent shell can be opened globally without adding duplicate buttons", () => {
  const bridge = read("src/ai/agentUiBridge.ts")
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(bridge, /AGENT_OPEN_EVENT = "meganot:agent:open"/)
  assert.match(bridge, /window\.dispatchEvent/)
  assert.match(shell, /window\.addEventListener\(AGENT_OPEN_EVENT/)
  assert.match(shell, /setOpen\(true\)/)
  assert.match(shell, /detail\?\.prompt/)
})

test("agent panel preserves context, routing and GM model controls", () => {
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(shell, /viewContext\?\.title/)
  assert.match(shell, /viewContext\?\.entity/)
  assert.match(shell, /lastRoute\.task\.toUpperCase\(\)/)
  assert.match(shell, /lastRoute\.modelName/)
  assert.match(shell, /models[\s\S]*?gm_selectable/)
  assert.match(shell, /chooseModel/)
  assert.match(shell, /AI DRAFT · НЕ КАНОН/)
  assert.match(shell, /Escape/)
})
