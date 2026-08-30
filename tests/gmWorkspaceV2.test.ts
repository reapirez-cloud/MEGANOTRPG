import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const workspace = fs.readFileSync("src/pages/GmWorkspace.tsx", "utf8")
const itemLibrary = fs.readFileSync("src/components/gm/GmItemLibrary.tsx", "utf8")
const zoneManager = fs.readFileSync("src/components/gm/GmZoneManager.tsx", "utf8")
const styles = fs.readFileSync("src/gm-workspace.css", "utf8")

test("mobile GM cabinet exposes four focused work sections without a duplicate chat workspace", () => {
  assert.match(workspace, /\["characters", "Персонажи"\]/)
  assert.match(workspace, /\["items", "Предметы"\]/)
  assert.match(workspace, /\["zones", "Зоны"\]/)
  assert.match(workspace, /\["materials", "Материалы"\]/)
  assert.match(workspace, /<span>PC<\/span>/)
  assert.match(workspace, /<span>NPC<\/span>/)
  assert.doesNotMatch(workspace, /useRooms/)
  assert.doesNotMatch(workspace, /Чаты кампании/)
  assert.match(styles, /\.gm-primary-nav/)
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
})

test("GM item library authors reusable item definitions and gives runtime instances through Oracle", () => {
  assert.match(itemLibrary, /chasovoy\.listDefinitions\(\{ kind: "item", scope: "campaign", campaignId, status: "active" \}\)/)
  assert.match(itemLibrary, /oracle\.definitions\.create/)
  assert.match(itemLibrary, /oracle\.definitions\.revise/)
  assert.match(itemLibrary, /oracle\.definitions\.archive/)
  assert.match(itemLibrary, /oracle\.inventory\.create/)
  assert.match(itemLibrary, /source_definition_id/)
  assert.match(itemLibrary, /source_definition_revision/)
  assert.doesNotMatch(itemLibrary, /from\("reference_definitions"\)/)
})

test("GM zone manager stays text-first and mutates locations through the existing world owner path", () => {
  assert.match(zoneManager, /world\.createLocation/)
  assert.match(zoneManager, /world\.updateLocation/)
  assert.match(zoneManager, /world\.setLocationArchived/)
  assert.match(zoneManager, /image_url: null/)
  assert.doesNotMatch(zoneManager, /CampaignImage/)
  assert.doesNotMatch(zoneManager, /<img/)
})

test("private GM materials keep one compact add entry instead of stacked creation panels", () => {
  assert.match(workspace, /setMaterialCreateMenu\(true\)/)
  assert.match(workspace, /title="Добавить материал"/)
  assert.match(workspace, /Новая заметка/)
  assert.match(workspace, /Новая папка/)
  assert.match(workspace, /Загрузить файл/)
  assert.doesNotMatch(workspace, /section-actions/)
})