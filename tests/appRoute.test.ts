import assert from "node:assert/strict"
import test from "node:test"

import {
  characterReturnPath,
  legacyRedirectForLocation,
  mainRouteHash,
  parseAppRoute,
} from "../src/lib/appRoute.ts"

test("empty and unknown hashes resolve to the new Home space", () => {
  assert.deepEqual(parseAppRoute(""), { type: "space", space: "home" })
  assert.deepEqual(parseAppRoute("#/unknown"), { type: "space", space: "home" })
})

test("new root spaces are stable deep links", () => {
  assert.deepEqual(parseAppRoute("#/home"), { type: "space", space: "home" })
  assert.deepEqual(parseAppRoute("#/chats"), { type: "space", space: "chats" })
  assert.deepEqual(parseAppRoute("#/workspace"), { type: "space", space: "workspace" })
})

test("legacy root links have explicit migration targets", () => {
  assert.equal(legacyRedirectForLocation("/feed"), "/home/whats-new")
  assert.equal(legacyRedirectForLocation("/me"), "/workspace")
  assert.equal(legacyRedirectForLocation("/characters"), "/workspace/characters")
  assert.equal(mainRouteHash("world"), "#/world")
})

test("character route remembers a chat return target", () => {
  const route = parseAppRoute("#/character/hero-1?from=chat&room=room-7")
  assert.deepEqual(route, {
    type: "character",
    id: "hero-1",
    returnTo: "chat",
    roomId: "room-7",
  })

  if (route.type !== "character") throw new Error("Expected character route")
  assert.equal(characterReturnPath(route), "/chat/room-7")
})

test("character opened from World returns to World instead of Feed", () => {
  const route = parseAppRoute("#/character/npc-9?from=world")
  assert.deepEqual(route, {
    type: "character",
    id: "npc-9",
    returnTo: "world",
    roomId: undefined,
  })

  if (route.type !== "character") throw new Error("Expected character route")
  assert.equal(characterReturnPath(route), "/world")
})

test("legacy character return targets are translated to UI v1 semantics", () => {
  const feedRoute = parseAppRoute("#/character/hero-2?from=feed")
  const meRoute = parseAppRoute("#/character/hero-2?from=me")

  assert.equal(feedRoute.type === "character" ? feedRoute.returnTo : null, "whats-new")
  assert.equal(meRoute.type === "character" ? meRoute.returnTo : null, "workspace")
})
