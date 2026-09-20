import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/UiV1ChatRoom.tsx", import.meta.url)
const hostPath = new URL("../src/ui-v1-isolated/chat/ChatDrawerHost.tsx", import.meta.url)
const runtimePath = new URL("../src/ui-v1-isolated/chat/useChatDrawerRuntime.ts", import.meta.url)
const edgePath = new URL("../src/ui-v1-isolated/chat/ChatContextEdgeSwipe.tsx", import.meta.url)
const launcherPath = new URL("../src/ui-v1-isolated/chat/ChatActionLauncher.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room.css", import.meta.url)

test("stage 6 gives the shared drawer an exit phase instead of instant unmount", async () => {
  const runtime = await readFile(runtimePath, "utf8")
  assert.match(runtime, /export type ChatDrawerPhase = "open" \| "closing"/)
  assert.match(runtime, /phase: "open"/)
  assert.match(runtime, /return \{ \.\.\.current, phase: "closing" \}/)
  assert.match(runtime, /window\.setTimeout\(\(\) => \{[\s\S]*setSession\(null\)/)
  assert.doesNotMatch(runtime, /const close = useCallback\(\(\) => \{\s*setSession\(null\)/)
})

test("stage 6 closes both context and workspace through the same swipe edge", async () => {
  const [host, css] = await Promise.all([
    readFile(hostPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])
  assert.match(host, /u1-chat-drawer__swipe-edge/)
  assert.match(host, /SWIPE_CLOSE_RATIO/)
  assert.match(host, /onPointerMove=\{moveSwipe\}/)
  assert.match(host, /onClose\(\)/)
  assert.match(css, /\.u1-chat-drawer__swipe-edge[\s\S]*touch-action:\s*pan-y/)
  assert.match(css, /\.u1-chat-drawer\[data-mode="context"\]/)
  assert.match(css, /\.u1-chat-drawer\[data-mode="workspace"\]/)
})

test("stage 6 opens room context from a right-edge touch swipe without hijacking mouse input", async () => {
  const [edge, room] = await Promise.all([
    readFile(edgePath, "utf8"),
    readFile(roomPath, "utf8"),
  ])
  assert.match(edge, /OPEN_THRESHOLD_PX = 52/)
  assert.match(edge, /event\.pointerType === "mouse"/)
  assert.match(edge, /-dx >= OPEN_THRESHOLD_PX/)
  assert.match(edge, /Math\.abs\(dy\) \* 1\.15/)
  assert.match(room, /<ChatContextEdgeSwipe/)
  assert.match(room, /disabled=\{Boolean\(drawers\.session\) \|\| launcherOpen\}/)
  assert.match(room, /onOpen=\{openRoomContext\}/)
})

test("stage 6 preserves one context-opening command for button and swipe", async () => {
  const room = await readFile(roomPath, "utf8")
  assert.match(room, /const openRoomContext = \(\) => \{/)
  assert.match(room, /onClick=\{openRoomContext\}/)
  assert.match(room, /onOpen=\{openRoomContext\}/)
  assert.match(room, /contentKey: "room"/)
  assert.doesNotMatch(room, /openContextFromSwipe|openContextFromButton/)
})

test("stage 6 launcher exits smoothly and uses authored SVG icons", async () => {
  const [launcher, css] = await Promise.all([
    readFile(launcherPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])
  assert.match(launcher, /const \[rendered, setRendered\] = useState\(open\)/)
  assert.match(launcher, /const \[closing, setClosing\] = useState\(false\)/)
  assert.match(launcher, /<LauncherIcon name=\{item\.icon\}/)
  assert.match(launcher, /<svg/)
  assert.match(css, /u1-chat-launcher-out 135ms/)
  assert.match(css, /u1-chat-launcher-layer-out 135ms/)
})

test("stage 6 message auto-stick respects users reading older history", async () => {
  const room = await readFile(roomPath, "utf8")
  assert.match(room, /const stickToBottomRef = useRef\(true\)/)
  assert.match(room, /root\.scrollHeight - root\.scrollTop - root\.clientHeight/)
  assert.match(room, /stickToBottomRef\.current = distance < 88/)
  assert.match(room, /if \(!root \|\| !stickToBottomRef\.current\) return/)
  assert.match(room, /root\.scrollTop = root\.scrollHeight/)
})

test("stage 6 honors reduced motion and coarse-pointer hit areas", async () => {
  const css = await readFile(cssPath, "utf8")
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation-duration:\s*1ms !important/)
  assert.match(css, /@media \(pointer: coarse\)/)
  assert.match(css, /\.u1-room-composer__plus::after/)
  assert.match(css, /\.u1-chat-drawer__close::after/)
})

test("stage 6 keeps graphite styling and narrow-screen geometry", async () => {
  const [room, css] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])
  assert.match(room, /data-chat-room-stage="6"/)
  assert.match(css, /@media \(max-width: 360px\)/)
  assert.match(css, /width:\s*min\(262px, calc\(100% - 44px\)\)/)
  assert.match(css, /var\(--u1-surface-1\)/)
  assert.doesNotMatch(css, /#7c3aed|#8d66d0|#c4b5fd/i)
})
