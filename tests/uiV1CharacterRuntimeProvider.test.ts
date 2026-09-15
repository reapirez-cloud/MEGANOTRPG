import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const main = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const characterView = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
const resourceHook = fs.readFileSync("src/hooks/useCharacterResourceStates.ts", "utf8")

test("UI 1.0 keeps one canonical auth/campaign boundary", () => {
  assert.doesNotMatch(main, /CharacterContext|CharacterProvider|CampaignAccessGate/)
  assert.match(
    main,
    /<AuthGate>[\s\S]*?<AIProvider>[\s\S]*?<SnakeProvider>[\s\S]*?<UiV1App \/>/,
  )
})

test("shared character resources use AuthContext campaign access instead of legacy CharacterContext", () => {
  assert.match(characterView, /useResolvedCharacterRuntime\(control\.runtimeEntity\)/)
  assert.match(resourceHook, /const \{ user, campaign \} = useAuth\(\)/)
  assert.match(resourceHook, /campaign\?\.campaignId/)
  assert.match(resourceHook, /campaign\?\.canManage/)
  assert.doesNotMatch(resourceHook, /useCharacters|CharacterContext/)
})
