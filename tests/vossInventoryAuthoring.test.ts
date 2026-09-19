import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const promptPolicy = fs.readFileSync(
  "supabase/functions/voss-agent/inventory-authoring.ts",
  "utf8",
)
const vossIndex = fs.readFileSync(
  "supabase/functions/voss-agent/index.ts",
  "utf8",
)
const draftTools = fs.readFileSync(
  "supabase/functions/voss-agent/draft-tools.ts",
  "utf8",
)
const contract = fs.readFileSync("docs/INVENTORY_PRODUCT_CONTRACT.md", "utf8")

test("Voss receives the physical item packing policy in the live system prompt", () => {
  assert.match(vossIndex, /VOSS_INVENTORY_AUTHORING_RULES/)
  assert.match(vossIndex, /inventoryWorkflowRequested \? VOSS_INVENTORY_AUTHORING_RULES : \[\]/)
  assert.match(draftTools, /payload\.data\.inventory_profile/)
})

test("item authoring separates semantic ingredient role from stackability", () => {
  assert.match(promptPolicy, /ingredient.*НЕ означает.*стак/si)
  assert.match(promptPolicy, /лечебная трава -> ingredient \+ bulk_stack/)
  assert.match(promptPolicy, /кусок железной руды -> ingredient \+ instance \+ shape/)
  assert.match(promptPolicy, /железная пыль -> ingredient \+ bulk_stack/)
  assert.match(promptPolicy, /Если есть сомнение между stack и instance — выбирай instance/)
  assert.match(contract, /Кусок руды \/ самородок.*instance.*not stackable/si)
})

test("compact items and specialized ammunition capacity stay distinct", () => {
  assert.match(promptPolicy, /Малое зелье.*packing=instance.*compact_1x1/)
  assert.match(promptPolicy, /Стрелы.*packing=bulk_stack.*1x1.*20.*колчан.*50/si)
  assert.match(promptPolicy, /примерно 5 см/)
  assert.match(contract, /small potion: 1×1, instance/)
  assert.match(contract, /two permanent 1×1 hand slots/)
})


test("Voss keeps container geometry separate from the mobile viewport and normal mechanics", () => {
  assert.match(promptPolicy, /container_profile.*internal_grid_width.*internal_grid_height.*cell_size_cm/si)
  assert.match(promptPolicy, /НИКОГДА не определяет экранный размер клеток/)
  assert.match(promptPolicy, /100×100 см.*20×20/si)
  assert.match(promptPolicy, /бонус Силы, сопротивление, проклятие/)
  assert.match(promptPolicy, /не кодируй такие эффекты в container_profile/)
})
