import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const plan = fs.readFileSync("docs/INVENTORY_IMPLEMENTATION_PLAN.md", "utf8")
const contract = fs.readFileSync("docs/INVENTORY_PRODUCT_CONTRACT.md", "utf8")
const agents = fs.readFileSync("AGENTS.md", "utf8")

test("inventory roadmap keeps the 12-stage checkpoint explicit", () => {
  assert.match(plan, /There are \*\*12 stages total\*\*/)
  assert.match(plan, /Stages 1–7 complete/)
  assert.match(plan, /Stage 5 — Physical item definition \+ authoring language/)
  assert.match(plan, /Stage 5 completion gate — PASSED/)
  assert.match(plan, /Stage 6 — Spatial runtime \+ mobile inventory UX/)
  assert.match(plan, /Stage 6 completion gate — PASSED/)
  assert.match(plan, /Stage 7 — Weight, load and specialized capacity/)
  assert.match(plan, /Stage 7 completion gate — PASSED/)
  assert.match(plan, /carrying\.capacityKg/)
  assert.match(plan, /Strength × 6\.8 kg/)
  assert.match(plan, /CE buffs\/effects authoring pass/)
  assert.match(plan, /Stage 8 — Persistent world storage, chests and stashes/)
  assert.match(plan, /Stage 9 — Chats\/scenes \+ shared Surfaces/)
  assert.match(plan, /Stage 10 — Dedicated Trade block/)
  assert.match(plan, /Stage 12 — Final security\/concurrency\/E2E certification/)
})

test("final carry model is hands plus generic external cells, not anatomy simulation", () => {
  assert.match(plan, /two permanent 1×1 hand slots/)
  assert.match(plan, /N generic external 1×1 carry slots/)
  assert.match(plan, /Do not model:\n- back;\n- hip;\n- shoulder;/)
  assert.match(contract, /Do not model anatomical destinations such as back, hip or shoulder/)
  assert.match(contract, /geometry is the primary rule/i)
  assert.match(contract, /two permanent 1×1 hand cells/)
})

test("agents must read both the product contract and implementation plan", () => {
  assert.match(agents, /INVENTORY_PRODUCT_CONTRACT\.md/)
  assert.match(agents, /INVENTORY_IMPLEMENTATION_PLAN\.md/)
})
