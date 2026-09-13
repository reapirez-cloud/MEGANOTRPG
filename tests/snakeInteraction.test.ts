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
    path: [],
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


test("Snake flow contracts can accumulate multi-step draft into one final executor payload", async () => {
  const agent = new SnakeAgent()
  let payload: unknown = null

  const action: SnakeAction = {
    id: "create",
    label: "Create",
    execute: ({ input }) => {
      payload = input
      return { type: "success" }
    },
  }

  const draft = {
    name: "Мара",
    role: "Стражник",
    factionId: "harbor-watch",
  }

  await agent.execute(action, { type: "character", id: "draft" }, draft)

  assert.deepEqual(payload, draft)
})


test("Snake resolves branch children from the current interaction path", async () => {
  const agent = new SnakeAgent()
  let observedPath: unknown = null

  const action: SnakeAction = {
    id: "avatar",
    label: "Аватар",
    kind: "branch",
    children: ({ path }) => {
      observedPath = path
      return [
        { id: "character-avatar", label: "Аватар персонажа" },
        { id: "panel-avatar", label: "Аватар панели" },
      ]
    },
  }

  const next = await agent.resolveBranch(
    action,
    { type: "character", id: "char-1" },
    [],
  )

  assert.deepEqual(observedPath, [{ id: "avatar", label: "Аватар" }])
  assert.deepEqual(next.path, [{ id: "avatar", label: "Аватар" }])
  assert.deepEqual(
    next.actions.map((entry) => entry.id),
    ["character-avatar", "panel-avatar"],
  )
})

test("Snake forwards the nested branch path to a terminal command", async () => {
  const agent = new SnakeAgent()
  let path: unknown = null

  await agent.execute(
    {
      id: "replace",
      label: "Заменить",
      execute: (context) => {
        path = context.path
        return { type: "success" }
      },
    },
    { type: "character", id: "char-1" },
    undefined,
    [
      { id: "avatar", label: "Аватар" },
      { id: "panel-avatar", label: "Аватар панели" },
    ],
  )

  assert.deepEqual(path, [
    { id: "avatar", label: "Аватар" },
    { id: "panel-avatar", label: "Аватар панели" },
  ])
})
