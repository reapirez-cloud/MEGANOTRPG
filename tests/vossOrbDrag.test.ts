import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const shell = fs.readFileSync("src/ai/AgentShell.tsx", "utf8")
const styles = fs.readFileSync("src/ai/ai-voss.css", "utf8")

test("Voss orb drag paints directly on animation frames instead of React state per pointer move", () => {
  assert.match(shell, /requestAnimationFrame/)
  assert.match(shell, /node\.style\.transform = `translate3d/)
  assert.match(shell, /pendingOrbPositionRef/)
  const pointerMove =
    shell.match(/function orbPointerMove[\s\S]*?function orbPointerUp/)?.[0] || ""
  assert.doesNotMatch(pointerMove, /setOrbPosition\(/)
})

test("orb has no positional transition while the pointer is dragging it", () => {
  const draggingRule =
    styles.match(/\.u1-agent-orb\[data-dragging\]\s*\{[^}]*\}/)?.[0] || ""
  assert.match(draggingRule, /transition:/)
  assert.doesNotMatch(draggingRule, /transform\s+\d+ms/)
  assert.doesNotMatch(styles, /left 180ms|top 180ms/)
})

test("orb uses compositor translation and only animates its final snap", () => {
  assert.match(shell, /translate3d\(\$\{orbPosition\.x\}px, \$\{orbPosition\.y\}px, 0\)/)
  assert.match(styles, /will-change:\s*transform/)
  assert.match(styles, /transform 135ms cubic-bezier/)
  assert.match(shell, /const next = snapOrb\(current\)/)
})
