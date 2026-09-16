import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Voss stage 2 composes prioritized semantic context layers", () => {
  const provider = read("src/ai/AIProvider.tsx")

  assert.match(provider, /setViewContextLayer/)
  assert.match(provider, /clearViewContextLayer/)
  assert.match(provider, /contextLayers/)
  assert.match(provider, /priority/)
  assert.match(provider, /useAIViewContextLayer/)
})

test("character and location screens expose current domain state", () => {
  const character = read("src/ui-v1-isolated/CharacterView.tsx")
  const locations = read("src/ui-v1-isolated/LocationNavigator.tsx")

  assert.match(character, /"character-sheet"/)
  assert.match(character, /interfaceMode/)
  assert.match(character, /spellCount:/)
  assert.match(character, /featureCount:/)
  assert.match(character, /inventoryCount:/)
  assert.match(character, /resourceCount:/)

  assert.match(locations, /screen: detail \? "location-detail" : "location-navigator"/)
  assert.match(locations, /selectedSections/)
  assert.match(locations, /children:/)
  assert.match(locations, /transitions:/)
})

test("class, subclass and feature reference pages expose exact open material", () => {
  const sections = read("src/ui-v1-isolated/SectionScreens.tsx")

  assert.match(sections, /"reference-class"/)
  assert.match(sections, /"reference-subclass"/)
  assert.match(sections, /"reference-feature"/)
  assert.match(sections, /exactRule:/)
  assert.match(sections, /vossExplanation:/)
})

test("Snake editors expose unsaved values without changing canonical state", () => {
  const editor = read("src/ui-v1-isolated/snake/surfaces/SnakeEditorSurface.tsx")
  const host = read("src/ui-v1-isolated/snake/surfaces/SnakeWindowHost.tsx")
  const provider = read("src/ui-v1-isolated/SnakeProvider.tsx")

  assert.match(editor, /dirty/)
  assert.match(editor, /values,/)
  assert.match(editor, /initialValues/)
  assert.match(editor, /contextSource/)
  assert.match(host, /"snake-surface"/)
  assert.match(provider, /"snake-menu"/)
})

test("Edge Function gives unsaved draft values precedence in Voss prompt", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /facts\.contextLayers/)
  assert.match(edge, /draft\.values/)
  assert.match(edge, /dirty=true/)
  assert.match(edge, /24000/)
})
