import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const screenPath = new URL(
  "../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx",
  import.meta.url,
)
const drawerPath = new URL(
  "../src/ui-v1-isolated/chat-room/ChatGmDrawer.tsx",
  import.meta.url,
)
const drawerCssPath = new URL(
  "../src/ui-v1-isolated/chat-room/chat-gm-drawer.css",
  import.meta.url,
)
const navigationPath = new URL(
  "../src/ui-v1-isolated/navigationGestures.ts",
  import.meta.url,
)
const appPath = new URL(
  "../src/ui-v1-isolated/UiV1App.tsx",
  import.meta.url,
)

test("GM chat drawer opens from an explicit side button and does not reserve back swipe", async () => {
  const [screen, navigation, app] = await Promise.all([
    readFile(screenPath, "utf8"),
    readFile(navigationPath, "utf8"),
    readFile(appPath, "utf8"),
  ])

  assert.match(screen, /u1-gm-drawer-trigger/)
  assert.match(screen, /aria-label="Открыть панель ГМ"/)
  assert.match(screen, /onClick=\{\(\) => setGmDrawerOpen\(true\)\}/)
  assert.doesNotMatch(screen, /data-gm-drawer-swipe/)
  assert.doesNotMatch(screen, /deltaX >= 64/)
  assert.match(navigation, /disableLeftEdge = false/)
  assert.doesNotMatch(
    app,
    /route\.type === "chat-room" && campaign\?\.canManage === true/,
  )
})

test("GM drawer restores the old master context actions through current owner boundaries", async () => {
  const drawer = await readFile(drawerPath, "utf8")

  assert.match(drawer, /oracle\.characters\.recover/)
  assert.match(drawer, /"short_rest"/)
  assert.match(drawer, /"long_rest"/)
  assert.match(drawer, /"dawn"/)
  assert.match(drawer, /set_chat_room_campaign_access/)
  assert.match(drawer, /set_chat_room_state/)
  assert.match(drawer, /oracle\.world\.syncSceneParticipants/)
  assert.match(drawer, /oracle\.world\.moveCharacter/)
  assert.match(drawer, /oracle\.world\.setScenePosition/)
  assert.match(drawer, /authority: "gm"/)
})

test("GM drawer is a right-side mobile sheet and does not replace normal chat UI", async () => {
  const [screen, css] = await Promise.all([
    readFile(screenPath, "utf8"),
    readFile(drawerCssPath, "utf8"),
  ])

  assert.match(screen, /<ChatRoomFrame>/)
  assert.match(screen, /<ChatGmDrawer/)
  assert.match(css, /justify-content: flex-end/)
  assert.match(css, /border-left:/)
  assert.match(css, /translateX\(100%\)/)
  assert.match(css, /width: min\(92vw, 520px\)/)
})
