import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const feedPath = new URL("../src/ui-v1-isolated/chat-room/ChatFeed.tsx", import.meta.url)
const eventsPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomEvents.ts", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const viewportPath = new URL("../src/ui-v1-isolated/chat-room/useChatVisualViewport.ts", import.meta.url)
const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)
const panelCssPath = new URL("../src/ui-v1-isolated/chat-room/chat-action-panel.css", import.meta.url)
const presentationPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomPresentation.ts", import.meta.url)

test("stage 6 follows new messages only when appropriate", async () => {
  const feed = await readFile(feedPath, "utf8")

  assert.match(feed, /BOTTOM_THRESHOLD = 96/)
  assert.match(feed, /pinnedToBottomRef/)
  assert.match(feed, /forceFollowNextRef/)
  assert.match(feed, /unseenCount/)
  assert.match(feed, /Новые сообщения/)
  assert.match(feed, /CHAT_MESSAGE_SENT_EVENT/)
  assert.match(feed, /scrollToBottom\("smooth"\)/)
})

test("stage 6 loads older history without losing visual position", async () => {
  const [feed, events] = await Promise.all([
    readFile(feedPath, "utf8"),
    readFile(eventsPath, "utf8"),
  ])

  assert.match(events, /\.lt\("id", oldestId\)/)
  assert.match(events, /loadOlder/)
  assert.match(events, /mergeEvents/)
  assert.match(feed, /pendingRestoreRef/)
  assert.match(feed, /heightDelta/)
  assert.match(feed, /restore\.scrollTop \+ Math\.max\(0, heightDelta\)/)
  assert.match(feed, /LOAD_OLDER_THRESHOLD = 72/)
})

test("stage 6 keeps realtime refresh separate from initial loading", async () => {
  const events = await readFile(eventsPath, "utf8")

  assert.match(events, /refreshing/)
  assert.match(events, /refreshLatest/)
  assert.match(events, /const refreshLatest[\s\S]*setEvents\(\(current\) => mergeEvents\(current, normalized\)\)/)
})

test("stage 6 composer signals own sends and keeps focus", async () => {
  const composer = await readFile(composerPath, "utf8")

  assert.match(composer, /CHAT_MESSAGE_SENT_EVENT/)
  assert.match(composer, /textareaRef\.current\.focus\(\)/)
  assert.match(composer, /aria-busy=\{sending\}/)
  assert.match(composer, /u1-chat-composer__sending-dot/)
})

test("stage 6 tracks mobile visual viewport for the keyboard", async () => {
  const [viewport, room] = await Promise.all([
    readFile(viewportPath, "utf8"),
    readFile(roomPath, "utf8"),
  ])

  assert.match(viewport, /window\.visualViewport/)
  assert.match(viewport, /addEventListener\("resize"/)
  assert.match(viewport, /addEventListener\("scroll"/)
  assert.match(room, /useChatVisualViewportHeight/)
  assert.match(room, /--u1-chat-viewport-height/)
  assert.match(room, /data-chat-room-stage="8"/)
})

test("stage 6 stamps one canonical role state without rendering header quick actions", async () => {
  const [room, composer] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(composerPath, "utf8"),
  ])

  assert.match(room, /data-chat-room-final-stage="6"/)
  assert.match(room, /data-viewer-role=\{model\.viewer\.role\}/)
  assert.match(room, /data-identity-kind=\{presentation\.identityKind\}/)
  assert.match(room, /<ChatRoomHeader model=\{model\} \/>/)
  assert.doesNotMatch(room, /showQuickActions=/)
  assert.match(composer, /chatRoomPresentationState\(model\)/)
  assert.match(composer, /presentation\.showPersonaSelector/)
  assert.match(composer, /presentation\.canCompose/)
})

test("stage 6 role matrix keeps player, GM, observer and archive behavior distinct", async () => {
  const module = await import(presentationPath.href)
  const state = module.chatRoomPresentationState

  const base = {
    roomId: "room",
    roomTitle: "Scene",
    roomType: "scene",
    readOnly: false,
    canManage: false,
    canWrite: true,
    viewer: {
      campaignId: "campaign",
      userId: "user",
      role: "player",
      isOwner: false,
      playerCharacterId: "pc",
    },
    identity: {
      kind: "character",
      character: {
        id: "pc",
        name: "William",
        className: "Warlock",
        level: 5,
        avatarUrl: null,
        currentHp: 31,
        maxHp: 38,
        tempHp: 0,
      },
    },
    context: {
      campaignDay: 12,
      dayPeriod: "night",
      locationName: "Tavern",
    },
    quickActions: {
      hasCharacter: true,
      hasEquippedWeapon: true,
    },
  }

  assert.deepEqual(state(base), {
    identityKind: "character",
    canCompose: true,
    showQuickActions: true,
    showPersonaSelector: false,
    canOpenGameActions: true,
  })

  assert.deepEqual(
    state({
      ...base,
      canManage: true,
      viewer: { ...base.viewer, role: "gm", playerCharacterId: null },
      identity: { kind: "narrator", name: "Рассказчик" },
      quickActions: { hasCharacter: false, hasEquippedWeapon: false },
    }),
    {
      identityKind: "narrator",
      canCompose: true,
      showQuickActions: false,
      showPersonaSelector: true,
      canOpenGameActions: true,
    },
  )

  assert.deepEqual(
    state({
      ...base,
      canWrite: false,
      viewer: { ...base.viewer, playerCharacterId: null },
      identity: null,
      quickActions: { hasCharacter: false, hasEquippedWeapon: false },
    }),
    {
      identityKind: "observer",
      canCompose: false,
      showQuickActions: false,
      showPersonaSelector: false,
      canOpenGameActions: false,
    },
  )

  assert.equal(
    state({
      ...base,
      readOnly: true,
      canWrite: false,
    }).canCompose,
    false,
  )
})

test("stage 6 locks the room and isolated action panel to compact mobile geometry", async () => {
  const [css, panelCss] = await Promise.all([
    readFile(cssPath, "utf8"),
    readFile(panelCssPath, "utf8"),
  ])

  assert.match(css, /Reference rebuild — final pixel pass stage 6/)
  assert.match(css, /--u1-chat-gutter: 10px/)
  assert.match(css, /--u1-chat-control: 40px/)
  assert.match(css, /--u1-chat-actor: 48px/)
  assert.match(css, /data-chat-room-final-stage="6"[\s\S]*min-height: calc\(46px/)
  assert.match(panelCss, /\.u1-chat-action-panel/)
  assert.match(panelCss, /width: min\(90vw, 640px\)/)
  assert.match(panelCss, /@media \(max-width: 480px\)/)
  assert.match(css, /@media \(max-width: 360px\)/)
  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(max-height: 560px\) and \(orientation: landscape\)/)
})
