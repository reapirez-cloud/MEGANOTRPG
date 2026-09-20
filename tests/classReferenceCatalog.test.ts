import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const app = fs.readFileSync("src/ui-v1-isolated/UiV1App.tsx", "utf8")
const reference = fs.readFileSync("src/ui-v1-isolated/SectionScreens.tsx", "utf8")
const druid = fs.readFileSync("src/data/classes/druidReference.ts", "utf8")
const clarity = fs.readFileSync("supabase/migrations/20260828010000_druid_rule_clarity.sql", "utf8")

test("rules reference has a canonical UI v1 entry point and campaign catalog", () => {
  assert.match(app, /<KnowledgeBaseScreen subsection=\{route\.subsection\} path=\{route\.tail\}/)
  assert.match(reference, /useRuleTemplates\(subsection === "classes" \? catalog\.campaignId : ""\)/)
  assert.match(reference, /function ClassCatalogPanels/)
})

test("subclasses are navigable detail pages in the canonical knowledge-base route", () => {
  assert.match(reference, /function ClassModeTabs/)
  assert.match(reference, /active: "class" \| "subclasses"/)
  assert.match(reference, /home\/knowledge-base\/classes\/\$\{entry\.id\}\/subclasses/)
  assert.match(reference, /buildSubclassPresentation/)
  assert.match(reference, /<SubclassDetailScreen/)
})

test("Druid resource exchanges are explicit instead of relying on vague prose", () => {
  assert.match(druid, /ячейку(?: заклинаний)? ЛЮБОГО уровня/)
  assert.match(druid, /ячейка 1, 3 или 9 уровня всё равно возвращает только 1 использование Дикой формы/)
  assert.match(druid, /потратьте 1 использование Дикой формы и восстановите одну потраченную ячейку именно 1 уровня/)
  assert.match(druid, /1 форма → ячейка 2 уровня; 2 формы → одна ячейка 4 уровня/)
  assert.match(clarity, /уровень ячейки не влияет на обмен/i)
})


test("class reference reads CE catalog mechanics through the canonical UI v1 presentation", () => {
  assert.match(presentation, /proficiencies: buildProficiencies/)
  assert.match(presentation, /mechanics: mechanics\.length \? mechanics : mechanicsFallback/)
  assert.match(presentation, /classifyProficiency/)
  assert.match(reference, /function ProficiencyView/)
  assert.match(reference, /function MechanicsView/)
  assert.doesNotMatch(reference, />grantOperation<|>priority<|>sourceKey</)
})
