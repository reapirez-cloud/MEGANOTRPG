import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const read = (path: string) => fs.readFileSync(path, "utf8")

const indexHtml = read("index.html")
const vite = read("vite.config.ts")
const app = read("src/ui-v1-isolated/UiV1App.tsx")
const main = read("src/ui-v1-isolated/GMWorkshopMain.tsx")
const review = read("src/ui-v1-isolated/GMWorkshopReview.tsx")
const members = read("src/ui-v1-isolated/GMWorkshopMembers.tsx")
const characters = read("src/ui-v1-isolated/GMWorkshopCharacters.tsx")
const library = read("src/ui-v1-isolated/GMWorkshopLibrary.tsx")
const materials = read("src/ui-v1-isolated/GMWorkshopMaterials.tsx")
const actions = read("src/ui-v1-isolated/gmWorkshopSnakeActions.ts")
const data = read("src/ui-v1-isolated/useGMWorkshopData.ts")

test("Stage 4 removes the legacy GM application and build entry", () => {
  const removed = [
    "legacy.html",
    "src/main.tsx",
    "src/App.tsx",
    "src/App.css",
    "src/index.css",
    "src/pages/GmWorkspace.tsx",
    "src/components/gm/GmMembersPanel.tsx",
    "src/components/gm/GmItemLibrary.tsx",
    "src/components/gm/GmZoneManager.tsx",
    "src/gm-members.css",
    "src/gm-workspace.css",
    "tests/gmWorkspaceV2.test.ts",
  ]

  for (const path of removed) {
    assert.equal(fs.existsSync(path), false, path + " must stay deleted")
  }

  assert.match(indexHtml, /src\/ui-v1-isolated\/main\.tsx/)
  assert.doesNotMatch(vite, /legacy\.html|legacy:/)
})

test("Stage 4 leaves one canonical GM Workshop information architecture", () => {
  assert.match(
    app,
    /const workshopSections: WorkshopSection\[\] = \["review", "members", "characters", "library", "materials"\]/,
  )
  assert.doesNotMatch(app, /workspace\/manage\/party|workspace\/manage\/draft/)
  assert.match(main, /title="На проверку"/)
  assert.match(main, /title="Участники"/)
  assert.match(main, /title="Персонажи"/)
  assert.match(main, /title="Библиотека"/)
  assert.match(main, /title="Личные материалы"/)

  assert.match(review, /applyAIDraft/)
  assert.match(members, /Участники кампании/)
  assert.match(characters, /Черновики/)
  assert.match(library, /Рабочая база/)
  assert.match(materials, /Личные материалы · только ты/)
})

test("Stage 4 keeps mutations on canonical actions and transactional owners", () => {
  assert.match(actions, /createWorkshopMemberAssignAction/)
  assert.match(actions, /createWorkshopMemberSetActiveAction/)
  assert.match(actions, /createWorkshopMemberUnassignAction/)
  assert.match(actions, /createWorkshopDefinitionActions/)
  assert.match(data, /publishDraft/)
  assert.match(data, /reorder_gm_workspace_folder_v1/)
  assert.match(data, /delete_gm_workspace_folder_v1/)
  assert.match(data, /refreshAfterSuccess/)
})

test("raw mechanics JSON is developer-only and normal definition editing preserves mechanics", () => {
  assert.match(actions, /id: "advanced-mechanics-json"/)
  assert.match(actions, /Механики JSON · разработчик/)
  assert.match(actions, /definitionMechanicsFromSnake/)
  assert.match(actions, /Object\.prototype\.hasOwnProperty\.call\(values, "mechanicsJson"\)/)
  assert.doesNotMatch(
    actions,
    /const common = \[[\s\S]*?mechanicsJson[\s\S]*?\]\n\n  if \(kind === "item"\)/,
  )
})
