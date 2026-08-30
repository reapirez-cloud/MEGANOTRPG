import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

function source(path: string) {
  return fs.readFileSync(path, "utf8")
}

test("character runtime lifecycle gate is wired", () => {
  const frame = source("src/components/characters/CharacterGameFrame.tsx")
  assert.match(frame, /CharacterRuntimeProvider/)
})
