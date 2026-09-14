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

test("global Voss launcher is draggable and snaps to the nearest viewport edge", () => {
  const shell = read("src/ai/AgentShell.tsx")
  const styles = read("src/ai/ai-voss.css")

  assert.match(shell, /className="u1-agent-orb"/)
  assert.match(shell, /onPointerDown=\{orbPointerDown\}/)
  assert.match(shell, /onPointerMove=\{orbPointerMove\}/)
  assert.match(shell, /onPointerUp=\{orbPointerUp\}/)
  assert.match(shell, /function snapOrb/)
  assert.match(shell, /ORB_STORAGE_KEY/)
  assert.match(styles, /\.u1-agent-orb\s*\{[\s\S]*?position:\s*fixed/)
  assert.match(styles, /touch-action:\s*none/)
  assert.doesNotMatch(styles, /\.u1-agent-orb\s*\{[\s\S]*?top:\s*calc\(/)
})

test("desktop agent is a MEGANOT side layer and mobile agent remains a bottom layer", () => {
  const styles = read("src/ai/ai-voss.css")

  assert.match(styles, /\.u1-agent-panel\s*\{[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;/)
  assert.match(styles, /width:\s*min\(460px, 40vw\)/)
  assert.match(styles, /@media \(max-width: 720px\)/)
  assert.match(styles, /height:\s*min\(80dvh, 760px\)/)
  assert.match(styles, /transform:\s*translateY\(103%\)/)
  assert.doesNotMatch(styles, /border-radius:\s*14px 14px 0 0/)
})

test("chat body has no context explainer, prompt tiles or giant empty-state coaching", () => {
  const shell = read("src/ai/AgentShell.tsx")
  const styles = read("src/ai/ai-voss.css")

  assert.doesNotMatch(shell, /Сейчас вижу/)
  assert.doesNotMatch(shell, /Что из прошлого кампании/)
  assert.doesNotMatch(shell, /Спрашивай по тому, что открыто/)
  assert.doesNotMatch(shell, /contextPrompts/)
  assert.doesNotMatch(shell, /u1-agent-prompts/)
  assert.doesNotMatch(shell, /u1-agent-context/)
  assert.doesNotMatch(styles, /\.u1-agent-prompts/)
  assert.doesNotMatch(styles, /\.u1-agent-context/)
})

test("model, file and Developer Mode controls live in a dedicated Snake-like tool drawer", () => {
  const shell = read("src/ai/AgentShell.tsx")
  const styles = read("src/ai/ai-voss.css")

  assert.match(shell, /u1-agent-tools-trigger/)
  assert.match(shell, /u1-agent-tools-drawer/)
  assert.match(shell, /selectableModels\.map/)
  assert.match(shell, /Вставить файл/)
  assert.match(shell, /fileInputRef/)
  assert.match(shell, /Developer Mode/)
  assert.match(styles, /\.u1-agent-tools-drawer/)
  assert.match(styles, /transform:\s*translateX\(-104%\)/)
  assert.doesNotMatch(shell, /className="u1-agent-model"/)
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

test("conversation keeps canonical system artifacts without turning them into dashboard widgets", () => {
  const shell = read("src/ai/AgentShell.tsx")
  const styles = read("src/ai/ai-voss.css")

  assert.match(shell, /AI DRAFT · НЕ КАНОН/)
  assert.doesNotMatch(shell, /MECHANICS COMPILER/)
  assert.match(shell, /DEVELOPER RUN/)
  assert.match(styles, /\.u1-agent-system-entry/)
  assert.match(styles, /border-left:/)
  assert.doesNotMatch(styles, /border-radius:\s*1[024]px/)
  assert.match(shell, /Escape/)
})
