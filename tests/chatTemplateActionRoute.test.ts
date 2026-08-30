import assert from "node:assert/strict"
import test from "node:test"

import type { ResolvedAction } from "../src/character-engine/index.ts"
import {
  templateMechanicIdForChatAction,
  templatePaymentOptionKeyForChatAction,
} from "../src/components/chat/chatTemplateActionRoute.ts"

function action(overrides: Partial<ResolvedAction> = {}): ResolvedAction {
  return {
    key: "second_wind",
    variantKey: "default",
    stateKey: "second_wind",
    label: "Второе дыхание",
    economy: "bonus_action",
    damage: [],
    resourceCosts: [],
    costOptions: [],
    requirements: [],
    effects: [],
    tags: [],
    available: true,
    sources: [{
      contributionId: "template:class:fighter:v1:source:second-wind:mechanic:fighter-second-wind-action",
      source: {
        id: "template:class:fighter:v1:source:second-wind",
        name: "Второе дыхание",
        sourceType: "class_template",
      },
    }],
    ...overrides,
  }
}

test("class action routes back to the exact authored mechanic id", () => {
  assert.equal(
    templateMechanicIdForChatAction(action()),
    "fighter-second-wind-action",
  )
})

test("non-template action never guesses a template mechanic from its label or key", () => {
  const weapon = action({
    key: "longsword",
    label: "Длинный меч",
    sources: [{
      contributionId: "item:sword:mechanic:fighter-second-wind-action",
      source: { id: "item:sword", name: "Длинный меч", sourceType: "inventory_item" },
    }],
  })
  assert.equal(templateMechanicIdForChatAction(weapon), null)
})

test("one available alternative payment is selected but ambiguous payments require UI", () => {
  assert.equal(templatePaymentOptionKeyForChatAction(action()), undefined)
  assert.equal(templatePaymentOptionKeyForChatAction(action({
    costOptions: [{ key: "psi", costs: [], available: true }],
  })), "psi")
  assert.equal(templatePaymentOptionKeyForChatAction(action({
    costOptions: [
      { key: "psi", costs: [], available: true },
      { key: "free", costs: [], available: true },
    ],
  })), null)
})
