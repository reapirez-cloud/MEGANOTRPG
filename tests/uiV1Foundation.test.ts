import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

function source(file: string) {
  return fs.readFileSync(file, "utf8")
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

test("UI v1 entry stylesheet is composed from foundation layers", () => {
  const css = source("src/ui-v1/ui-v1.css")

  assert.match(css, /foundation\/tokens\.css/)
  assert.match(css, /foundation\/typography\.css/)
  assert.match(css, /foundation\/materials\.css/)
  assert.match(css, /foundation\/interactions\.css/)
  assert.match(css, /overlays\/overlays\.css/)
  assert.match(css, /shell\/shell\.css/)
})

test("new UI uses its own semantic token namespace", () => {
  const tokens = source("src/ui-v1/foundation/tokens.css")

  assert.match(tokens, /--mg-color-canvas:/)
  assert.match(tokens, /--mg-space-4:/)
  assert.match(tokens, /--mg-radius-md:/)
  assert.match(tokens, /--mg-type-display:/)
  assert.doesNotMatch(tokens, /--app-/)
})

test("App Shell owns reduced motion and the shared Layer Host", () => {
  const shell = source("src/ui-v1/shell/MeganotAppShell.tsx")

  assert.match(shell, /<MotionConfig reducedMotion="user">/)
  assert.match(shell, /<LayerHost>/)
  assert.match(shell, /className="mg-theme mg-shell"/)
})

test("UI v1 screens do not import Radix directly", () => {
  const files = walk("src/ui-v1").filter((file) => /\.(ts|tsx)$/.test(file))

  for (const file of files) {
    if (file.includes(`${path.sep}overlays${path.sep}`)) continue
    assert.doesNotMatch(
      source(file),
      /@radix-ui\//,
      `Radix import must stay behind Meganot overlay wrappers: ${file}`,
    )
  }
})

test("Dock consumes the shared motion language instead of local timings", () => {
  const dock = source("src/ui-v1/shell/MeganotDock.tsx")

  assert.match(dock, /mgMotion\.press/)
  assert.match(dock, /mgMotion\.duration\.fast/)
  assert.match(dock, /mgMotion\.spring\.selection/)
  assert.doesNotMatch(dock, /stiffness:\s*420/)
})

test("Storybook renders the actual UI v1 theme", () => {
  const preview = source(".storybook/preview.ts")

  assert.match(preview, /ui-v1\/ui-v1\.css/)
  assert.match(preview, /mg-theme mg-story-root/)
})
