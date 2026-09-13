import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const agents = fs.readFileSync("AGENTS.md", "utf8")
const snake = fs.readFileSync("docs/SNAKE_INTERACTION_CONTRACT.md", "utf8")
const contracts = fs.readFileSync("docs/ENGINE_CONTRACTS.md", "utf8")
const roadmap = fs.readFileSync("docs/ENGINE_ROADMAP.md", "utf8")
const locations = fs.readFileSync("src/ui-v1-isolated/LocationNavigator.tsx", "utf8")

test("Snake is discoverable as the universal UI interaction contract", () => {
  assert.match(agents, /SNAKE_INTERACTION_CONTRACT\.md/)
  assert.match(agents, /UI Interaction \/ Action Agent/)
  assert.match(contracts, /\*\*SNAKE\*\*/)
  assert.match(roadmap, /Snake — UI interaction\/action agent/)
})

test("Snake stays entity-agnostic and dispatches instead of owning mechanics", () => {
  assert.match(snake, /object\/domain integration provides actions/i)
  assert.match(snake, /Snake dispatches, owner executes/i)
  assert.match(snake, /UI -> Snake -> GENA -> Cheburashka/)
  assert.match(snake, /GM UI -> Snake -> Oracle -> Larisa/)
  assert.match(snake, /No giant entity-type switch inside Snake/i)
})

test("Snake defines reusable surfaces and the placeholder boundary", () => {
  for (const surface of [
    "ContextMenu",
    "ConfirmWindow",
    "EditorWindow",
    "PickerWindow",
    "DetailWindow",
    "Placeholder",
  ]) {
    assert.match(snake, new RegExp(surface))
  }
  assert.match(snake, /MUST use the universal Placeholder surface/)
  assert.match(snake, /must not invent a domain form/i)
})

test("Locations are the first real Snake consumer and no longer own long-press runtime", () => {
  assert.match(locations, /SnakeTrigger/)
  assert.match(locations, /createLocationSnakeActions/)
  assert.doesNotMatch(locations, /timerRef|window\.setTimeout|LocationInlineMenu|toggleActions/)
  assert.match(snake, /Locations.*migrated to Snake/is)
  assert.match(snake, /One physical gesture causes one Snake invocation/i)
})


test("Snake supports dynamic branch navigation instead of flat action catalogs", () => {
  assert.match(snake, /Dynamic branch law/i)
  assert.match(snake, /current interaction level/i)
  assert.match(snake, /Branch.*Command/is)
  assert.match(snake, /path stack/i)
})
