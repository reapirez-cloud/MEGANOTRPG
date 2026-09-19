import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const hostPath = new URL(
  "../src/ui-v1-isolated/snake/surfaces/SnakeWindowHost.tsx",
  import.meta.url,
)
const contractPath = new URL("../docs/SNAKE_INTERACTION_CONTRACT.md", import.meta.url)

test("Snake window backdrop closes after the completed click instead of pointerdown", async () => {
  const host = await readFile(hostPath, "utf8")

  assert.match(host, /onPointerDown=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\)/)
  assert.match(host, /onPointerUp=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\)/)
  assert.match(host, /onClick=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onClose\(\)/)
  assert.doesNotMatch(
    host,
    /onPointerDown=\{\(event\) => \{\s*if \(event\.target === event\.currentTarget && !busy\) onClose\(\)/,
  )
})

test("Snake contract explicitly forbids click-through on window dismissal", async () => {
  const contract = await readFile(contractPath, "utf8")

  assert.match(contract, /backdrop consumes the full pointer\/click sequence/i)
  assert.match(contract, /never unmount a Snake window on pointerdown/i)
})
