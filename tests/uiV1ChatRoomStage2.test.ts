import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/UiV1ChatRoom.tsx", import.meta.url)
const runtimePath = new URL("../src/ui-v1-isolated/chat/useChatDrawerRuntime.ts", import.meta.url)
const hostPath = new URL("../src/ui-v1-isolated/chat/ChatDrawerHost.tsx", import.meta.url)
const stylePath = new URL("../src/ui-v1-isolated/chat-room.css", import.meta.url)

test("stage 2 uses one drawer session for context and action workspace modes", async () => {
  const runtime = await readFile(runtimePath, "utf8")
  assert.match(runtime, /type ChatDrawerMode = "context" \| "workspace"/)
  assert.match(runtime, /useState<ChatDrawerSession \| null>\(null\)/)
  assert.match(runtime, /openContext/)
  assert.match(runtime, /openWorkspace/)
  assert.doesNotMatch(runtime, /contextSession|workspaceSession/)
})

test("stage 2 drawer owns modal close and focus behavior without click-through", async () => {
  const host = await readFile(hostPath, "utf8")
  assert.match(host, /role="dialog"/)
  assert.match(host, /aria-modal="true"/)
  assert.match(host, /event\.key === "Escape"/)
  assert.match(host, /closeRef\.current\?\.focus\(\)/)
  assert.match(host, /event\.target !== event\.currentTarget/)
  assert.match(host, /onPointerDown/)
  assert.match(host, /onPointerUp/)
  assert.match(host, /event\.stopPropagation\(\)/)
})

test("stage 2 defines narrow context and near-full workspace geometry", async () => {
  const css = await readFile(stylePath, "utf8")
  assert.match(css, /\.u1-chat-drawer\[data-mode="context"\][\s\S]*width:\s*min\(76%, 420px\)/)
  assert.match(css, /\.u1-chat-drawer\[data-mode="workspace"\][\s\S]*width:\s*min\(92%, 700px\)/)
  assert.match(css, /position:\s*absolute;[\s\S]*z-index:\s*40/)
})

test("room context button opens the real drawer while plus still waits for stage 3 launcher", async () => {
  const room = await readFile(roomPath, "utf8")
  assert.match(room, /data-chat-room-stage="2"/)
  assert.match(room, /drawers\.openContext\(/)
  assert.match(room, /<ChatDrawerHost session=\{drawers\.session\}/)
  assert.match(room, /<ActionWorkspaceStage2 \/>/)
  assert.match(room, /"Игровые действия"[\s\S]*"Плюс откроет компактный список действий/)
  assert.doesNotMatch(room, /onClick=\{\(\) => drawers\.openWorkspace/)
})

test("room context has no global rest button and records per-character ownership", async () => {
  const room = await readFile(roomPath, "utf8")
  assert.match(room, /Отдых и персональные[\s\S]*с конкретного персонажа/)
  assert.doesNotMatch(room, />Короткий отдых</)
  assert.doesNotMatch(room, />Долгий отдых</)
})
