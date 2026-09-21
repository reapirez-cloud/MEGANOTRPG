import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  fallbackBackPath,
  isSwipeBackGesture,
  swipeBackEdgeWidth,
} from "../src/ui-v1-isolated/navigationGestures.ts"

const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)

test("swipe back only accepts a deliberate rightward gesture from the left edge", () => {
  const viewportWidth = 390
  const edge = swipeBackEdgeWidth(viewportWidth)

  assert.equal(edge, 31.2)
  assert.equal(isSwipeBackGesture({
    startX: 12,
    startY: 300,
    endX: 104,
    endY: 310,
    durationMs: 330,
    viewportWidth,
  }), true)

  assert.equal(isSwipeBackGesture({
    startX: edge + 1,
    startY: 300,
    endX: 130,
    endY: 305,
    durationMs: 300,
    viewportWidth,
  }), false)

  assert.equal(isSwipeBackGesture({
    startX: 12,
    startY: 300,
    endX: 84,
    endY: 390,
    durationMs: 350,
    viewportWidth,
  }), false)

  assert.equal(isSwipeBackGesture({
    startX: 12,
    startY: 300,
    endX: -60,
    endY: 302,
    durationMs: 300,
    viewportWidth,
  }), false)
})

test("deep links have a deterministic in-app fallback back path", () => {
  assert.equal(fallbackBackPath("#/chats/room-1"), "chats")
  assert.equal(fallbackBackPath("#/workspace/character/char-1"), "workspace")
  assert.equal(fallbackBackPath("#/workspace/manage/review"), "workspace/manage")
  assert.equal(fallbackBackPath("#/workspace/manage"), "workspace")
  assert.equal(fallbackBackPath("#/home/world/location/tavern"), "home/world/location")
  assert.equal(fallbackBackPath("#/home/world"), "home")
  assert.equal(fallbackBackPath("#/home"), null)
  assert.equal(fallbackBackPath("#/chats"), null)
})

test("ui v1 routes swipe, browser, and Telegram back through one navigation contract", async () => {
  const app = await readFile(appPath, "utf8")

  assert.match(app, /pushAppHash\(path\)/)
  assert.match(app, /useSwipeBackNavigation\(/)
  assert.match(app, /navigateAppBack\(\)/)
  assert.match(app, /bindTelegramBackButton\(navigateBack\)/)
  assert.match(app, /addEventListener\("popstate", sync\)/)
  assert.doesNotMatch(app, /if \(window\.history\.length > 1\) window\.history\.back\(\)/)
})
