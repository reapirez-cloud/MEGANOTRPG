import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const html = fs.readFileSync("ui-v1.html", "utf8")
const entry = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const app = fs.readFileSync("src/ui-v1-isolated/UiV1App.tsx", "utf8")
const styles = fs.readFileSync("src/ui-v1-isolated/styles.css", "utf8")
const legacyApp = fs.readFileSync("src/App.tsx", "utf8")

test("UI v1 has a physically separate application entry", () => {
  assert.match(html, /src\/ui-v1-isolated\/main\.tsx/)
  assert.match(entry, /\.\/UiV1App/)
  assert.match(entry, /\.\/styles\.css/)
  assert.doesNotMatch(entry + app, /\.\.\/App|pages\/|components\/app|CharacterContext|supabase/i)
})

test("UI v1 does not load the legacy stylesheet graph", () => {
  assert.doesNotMatch(entry + app + styles, /App\.css|social\.css|ui-v2\.css|gm-workspace\.css|character-profile/i)
})

test("legacy app does not import the isolated UI v1 tree", () => {
  assert.doesNotMatch(legacyApp, /ui-v1-isolated/)
})
