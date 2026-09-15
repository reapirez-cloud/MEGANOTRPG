import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const main = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const characterView = fs.readFileSync("src/ui-v1-isolated/CharacterView.tsx", "utf8")
const resourceHook = fs.readFileSync("src/hooks/useCharacterResourceStates.ts", "utf8")

test("UI 1.0 mounts CharacterProvider before character runtime consumers", () => {
  assert.match(main, /import \{ CharacterProvider \} from "\.\.\/context\/CharacterContext"/)
  assert.match(
    main,
    /<CampaignAccessGate>[\s\S]*?<CharacterProvider>[\s\S]*?<AIProvider>[\s\S]*?<SnakeProvider>[\s\S]*?<UiV1App \/>[\s\S]*?<\/SnakeProvider>[\s\S]*?<\/AIProvider>[\s\S]*?<\/CharacterProvider>[\s\S]*?<\/CampaignAccessGate>/,
  )
})

test("production CharacterView keeps using the shared runtime that requires character context", () => {
  assert.match(characterView, /useResolvedCharacterRuntime\(control\.runtimeEntity\)/)
  assert.match(resourceHook, /const \{ campaignId, canManage \} = useCharacters\(\)/)
})
