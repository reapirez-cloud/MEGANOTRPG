import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const shell = fs.readFileSync("src/ai/AgentShell.tsx", "utf8")
const styles = fs.readFileSync("src/ai/ai-voss.css", "utf8")

test("Voss orb drag paints directly on animation frames instead of React state per pointer move", () => {
  assert.match(shell, /requestAnimationFrame/)
  assert.match(shell, /node\.style\.transform = `translate3d/)
  assert.match(shell, /pendingOrbPositionRef/)
  assert.doesNotMatch(
    shell,
    /function orbPointerMove[\s\S]*?setOrbPosition\(/,
  )
})

test("orb has no positional transition while the pointer is dragging it", () => {
  assert.match(styles, /\.u1-agent-orb\[data-dragging\][\s\S]*?transition:/)
  assert.doesNotMatch(
    styles,
    /\.u1-agent-orb\[data-dragging\][\s\S]*?transform\s+\d+ms/,
  )
  assert.doesNotMatch(styles, /left 180ms|top 180ms/)
})

test("orb uses compositor translation and only animates its final snap", () => {
  assert.match(shell, /translate3d\(\$\{orbPosition\.x\}px, \$\{orbPosition\.y\}px, 0\)/)
  assert.match(styles, /will-change:\s*transform/)
  assert.match(styles, /transform 135ms cubic-bezier/)
  assert.match(shell, /const next = snapOrb\(current\)/)
})
