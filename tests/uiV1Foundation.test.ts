import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

function source(file: string) {
  return fs.readFileSync(file, "utf8")
}

function collectSources(root: string): string[] {
  const output: string[] = []

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      output.push(...collectSources(fullPath))
      continue
    }

    if (/\.(ts|tsx)$/.test(entry.name)) output.push(fullPath)
  }

  return output
}

test("UI v1 foundation owns semantic tokens and shared motion", () => {
  const tokens = source("src/ui-v1/foundation/tokens.css")
  const motion = source("src/ui-v1/motion/presets.ts")
  const shell = source("src/ui-v1/shell/MeganotAppShell.tsx")

  assert.match(tokens, /--mg-color-canvas:/)
  assert.match(tokens, /--mg-type-display:/)
  assert.match(tokens, /--mg-safe-bottom:/)
  assert.match(motion, /spring:\s*\{/)
  assert.match(motion, /press:\s*\{/)
  assert.match(shell, /<MotionConfig reducedMotion="user">/)
})

test("UI v1 owns Radix behavior behind Meganot overlay wrappers", () => {
  const wrappers = [
    "src/ui-v1/overlays/MeganotDialog.tsx",
    "src/ui-v1/overlays/MeganotPopover.tsx",
    "src/ui-v1/overlays/MeganotTooltip.tsx",
    "src/ui-v1/overlays/MeganotMenu.tsx",
  ]

  for (const file of wrappers) {
    assert.match(source(file), /@radix-ui\//)
    assert.match(source(file), /useLayerHost/)
  }

  const protectedSources = [
    ...collectSources("src/ui-v1/screens"),
    ...collectSources("src/ui-v1/shell"),
  ]

  for (const file of protectedSources) {
    assert.doesNotMatch(
      source(file),
      /@radix-ui\//,
      `${file} must use Meganot-owned overlay wrappers instead of importing Radix directly`,
    )
  }
})

test("Surface stays a material primitive instead of becoming a universal layout card", () => {
  const surface = source("src/ui-v1/primitives/Surface.tsx")

  assert.match(surface, /SurfaceTone/)
  assert.match(surface, /data-tone=\{tone\}/)
  assert.doesNotMatch(surface, /title|subtitle|icon|action/)
})
