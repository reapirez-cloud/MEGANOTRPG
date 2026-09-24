import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const screens = read("src/ui-v1-isolated/SectionScreens.tsx")
const data = read("src/ui-v1-isolated/useUiV1SectionData.ts")

test("knowledge-base live rows open real database detail routes", () => {
  assert.match(screens, /u1-catalog-row--button/)
  assert.match(
    screens,
    /navigate\(\`home\/knowledge-base\/\$\{subsection\}\/\$\{id\}\`\)/,
  )
  assert.match(screens, /KnowledgeCatalogDetailScreen/)
  assert.match(screens, /from\("spell_catalog"\)/)
  assert.match(screens, /from\("reference_definitions"\)/)
  assert.match(screens, /from\("reference_definition_revisions"\)/)
  assert.match(screens, /from\("bestiary_catalog"\)/)
})

test("invocations are loaded from the live reference database", () => {
  assert.match(data, /"invocations"/)
  assert.match(data, /from\("reference_definitions"\)/)
  assert.match(data, /from\("reference_definition_revisions"\)/)
  assert.match(data, /feature_kind === "eldritch_invocation"/)
  assert.match(data, /class_key === "warlock"/)
})

test("knowledge spell and invocation detail leads with mechanics, not Voss commentary", () => {
  assert.match(screens, /label: "Механика"/)
  assert.match(screens, /row\.rules_text \|\| row\.effect_summary/)
  assert.doesNotMatch(screens, /Восс объясняет/)
})
