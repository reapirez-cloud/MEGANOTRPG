import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/UiV1ChatRoom.tsx", import.meta.url)
const launcherPath = new URL("../src/ui-v1-isolated/chat/ChatActionLauncher.tsx", import.meta.url)
const runtimePath = new URL("../src/ui-v1-isolated/chat/useChatDrawerRuntime.ts", import.meta.url)
const stylePath = new URL("../src/ui-v1-isolated/chat-room.css", import.meta.url)

test("stage 3 plus opens a compact action launcher instead of a bottom sheet", async () => {
  const [room, launcher] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(launcherPath, "utf8"),
  ])

  assert.match(room, /aria-haspopup="menu"/)
  assert.match(room, /setLauncherOpen\(\(value\) => !value\)/)
  assert.match(room, /<ChatActionLauncher/)
  assert.match(launcher, /role="menu"/)
  assert.doesNotMatch(room + launcher, /bottom-sheet|ChatActionSheet|sheet-tabs/i)
})

test("stage 3 launcher exposes the approved first-level action sections", async () => {
  const launcher = await readFile(launcherPath, "utf8")
  for (const label of ["Бросок", "Умение", "Действие", "Предмет", "Заклинание"]) {
    assert.match(launcher, new RegExp(label))
  }
  assert.match(launcher, /items\.map/)
  assert.match(launcher, /onSelect\(item\.id\)/)
})

test("stage 3 selection closes launcher and opens the shared workspace drawer", async () => {
  const [room, runtime] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(runtimePath, "utf8"),
  ])
  assert.match(runtime, /contentKey\?: string/)
  assert.match(room, /setLauncherOpen\(false\)[\s\S]*drawers\.openWorkspace\(/)
  assert.match(room, /contentKey: item\.id/)
  assert.match(room, /ChatActionWorkspace/)
  assert.match(room, /sectionId=\{drawers\.session\?\.contentKey\}/)
})

test("stage 3 launcher is compact graphite motion and consumes outside clicks", async () => {
  const [launcher, css] = await Promise.all([
    readFile(launcherPath, "utf8"),
    readFile(stylePath, "utf8"),
  ])
  assert.match(launcher, /onPointerDown/)
  assert.match(launcher, /onPointerUp/)
  assert.match(launcher, /event\.target !== event\.currentTarget/)
  assert.match(launcher, /event\.key !== "Escape"/)
  assert.match(css, /\.u1-chat-launcher[\s\S]*width:\s*min\(276px/)
  assert.match(css, /u1-chat-launcher-in 155ms/)
  assert.match(css, /var\(--u1-surface-1\)/)
  assert.doesNotMatch(css, /#6d28d9|#8d66d0|#7c3aed|#c4b5fd/i)
})

test("stage 3 keeps action selection separate from gameplay execution", async () => {
  const [room, launcher] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(launcherPath, "utf8"),
  ])
  assert.match(room, /CE\/Snake-интерфейс подключаются на этапе 4/)
  assert.doesNotMatch(launcher, /supabase|snakeAgent|execute\(/)
})
