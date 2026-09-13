import assert from "node:assert/strict"
import test from "node:test"

import { SnakeAgent } from "../src/snake-engine/agent.ts"
import type { SnakeAction } from "../src/snake-engine/types.ts"

test("Snake hides hidden actions without learning entity business rules", () => {
  const agent = new SnakeAgent()
  const actions: SnakeAction[] = [
    { id: "open", label: "Open" },
    { id: "secret", label: "Secret", hidden: true },
  ]

  assert.deepEqual(
    agent.availableActions(actions).map((action) => action.id),
    ["open"],
  )
})

test("Snake forwards entity and window input to the domain-provided executor", async () => {
  const agent = new SnakeAgent()
  let received: unknown = null

  const action: SnakeAction = {
    id: "rename",
    label: "Rename",
    execute: (context) => {
      received = context
      return { type: "success" }
    },
  }

  const result = await agent.execute(
    action,
    { type: "location", id: "loc-1" },
    { name: "Old Port" },
  )

  assert.deepEqual(result, { type: "success" })
  assert.deepEqual(received, {
    entity: { type: "location", id: "loc-1" },
    input: { name: "Old Port" },
  })
})

test("Snake refuses disabled actions before an executor can run", async () => {
  const agent = new SnakeAgent()
  let executed = false

  const result = await agent.execute(
    {
      id: "delete",
      label: "Delete",
      enabled: false,
      disabledReason: "No authority",
      execute: () => {
        executed = true
      },
    },
    { type: "location", id: "loc-1" },
  )

  assert.equal(executed, false)
  assert.deepEqual(result, { type: "error", message: "No authority" })
})
