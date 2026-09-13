import assert from "node:assert/strict"
import test from "node:test"

import {
  activeOtherPlayerCharacterIds,
  canSelectWorkspaceSpeaker,
  isForeignAssignedCharacter,
  sortOwnedWorkspaceCharacters,
} from "../src/ui-v1-isolated/workspaceIdentityRules.ts"

const owner = "owner"
const other = "other"

test("Workspace never lets manager authority claim another player's character voice", () => {
  const foreignPc = {
    id: "foreign-pc",
    assignedUserId: other,
    characterType: "pc" as const,
    lifeState: "alive" as const,
  }

  assert.equal(isForeignAssignedCharacter(foreignPc, owner), true)
  assert.equal(canSelectWorkspaceSpeaker(foreignPc, owner), false)
})

test("Workspace speaker pool allows own living characters and unassigned living NPCs only", () => {
  assert.equal(canSelectWorkspaceSpeaker({
    id: "own",
    assignedUserId: owner,
    characterType: "pc",
    lifeState: "alive",
  }, owner), true)

  assert.equal(canSelectWorkspaceSpeaker({
    id: "npc",
    assignedUserId: null,
    characterType: "npc",
    lifeState: "alive",
  }, owner), true)

  assert.equal(canSelectWorkspaceSpeaker({
    id: "unassigned-pc",
    assignedUserId: null,
    characterType: "pc",
    lifeState: "alive",
  }, owner), false)

  assert.equal(canSelectWorkspaceSpeaker({
    id: "dead-own",
    assignedUserId: owner,
    characterType: "pc",
    lifeState: "dead",
  }, owner), false)
})

test("Player shelf contains only living active PCs of other members with matching assignment", () => {
  const characters = [
    { id: "valid", assignedUserId: other, characterType: "pc" as const, lifeState: "alive" as const },
    { id: "stale", assignedUserId: owner, characterType: "pc" as const, lifeState: "alive" as const },
    { id: "dead", assignedUserId: "third", characterType: "pc" as const, lifeState: "dead" as const },
    { id: "npc", assignedUserId: "fourth", characterType: "npc" as const, lifeState: "alive" as const },
  ]

  const memberships = [
    { userId: owner, activeCharacterId: "stale" },
    { userId: other, activeCharacterId: "valid" },
    { userId: "third", activeCharacterId: "dead" },
    { userId: "fourth", activeCharacterId: "npc" },
  ]

  assert.deepEqual(
    activeOtherPlayerCharacterIds(characters, memberships, owner),
    ["valid"],
  )
})

test("Owned dead characters are preserved but sorted after living characters", () => {
  const sorted = sortOwnedWorkspaceCharacters([
    { id: "dead-a", lifeState: "dead" as const },
    { id: "alive-a", lifeState: "alive" as const },
    { id: "dead-b", lifeState: "dead" as const },
    { id: "alive-b", lifeState: "alive" as const },
  ])

  assert.deepEqual(sorted.map((character) => character.id), [
    "alive-a",
    "alive-b",
    "dead-a",
    "dead-b",
  ])
})
