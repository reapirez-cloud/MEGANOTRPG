import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const actionHostPath = new URL("../src/ui-v1-isolated/chat-room/ChatActionHost.tsx", import.meta.url)
const hookPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const contractsPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomContracts.ts", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)
const presentationPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomPresentation.ts", import.meta.url)

test("stage 2 resolves header identity from the room-scoped viewer contract", async () => {
  const [hook, contracts] = await Promise.all([
    readFile(hookPath, "utf8"),
    readFile(contractsPath, "utf8"),
  ])

  assert.match(hook, /rpc\("get_chat_room_viewer_context_v1"/)
  assert.match(hook, /viewerContext\.can_manage/)
  assert.match(hook, /viewerContext\.viewer_character_id/)
  assert.match(hook, /from\("chat_actor_bindings"\)/)
  assert.match(hook, /chatSpeakerStorageKey/)
  assert.match(hook, /kind: "narrator", name: "Рассказчик"/)
  assert.match(contracts, /ChatRoomHeaderIdentity/)
})

test("stage 2 keeps player identity room-scoped instead of choosing another participant", async () => {
  const hook = await readFile(hookPath, "utf8")

  assert.match(hook, /viewerContext\.viewer_character_id/)
  assert.doesNotMatch(hook, /resolvePlayerCharacterId/)
  assert.doesNotMatch(hook, /from\("scene_participants"\)/)
  assert.doesNotMatch(hook, /from\("chat_room_members"\)/)
})

test("stage 2 action contract feeds the compact composer launcher instead of header navigation", async () => {
  const [room, header, composer, actionHost, css] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(headerPath, "utf8"),
    readFile(composerPath, "utf8"),
    readFile(actionHostPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  for (const label of ["Инвентарь", "Способности", "Заклинания", "Атака"]) {
    assert.match(composer, new RegExp(label))
  }

  assert.match(composer, /ACTION_MENU_ITEMS/)
  assert.match(composer, /data-action-mode=\{item\.mode\}/)
  assert.match(composer, /<ChatActionHost/)
  assert.match(actionHost, /useResolvedCharacterRuntime/)
  assert.match(actionHost, /genaSession/)
  assert.doesNotMatch(room + header + composer, /window\.location\.hash.*inventory|ChatDrawer/)
  assert.match(css, /\.u1-chat-composer__action-menu/)
  assert.match(css, /u1-chat-action-menu-in/)
})

test("stage 2 shows attack only for a resolved equipped weapon", async () => {
  const hook = await readFile(hookPath, "utf8")

  assert.match(hook, /from\("character_inventory_items"\)/)
  assert.match(hook, /\.eq\("equipped", true\)/)
  assert.match(hook, /\.in\("equipment_slot", \["main_hand", "off_hand"\]\)/)
  assert.match(hook, /itemMechanicsContainWeaponAction/)
  assert.match(hook, /definitionHasWeaponRole/)
  assert.match(hook, /semanticRole\.startsWith\("weapon\."\)/)
})

test("stage 2 keeps the action launcher disabled for a non-manager observer", async () => {
  const [room, composer, presentation] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(composerPath, "utf8"),
    readFile(presentationPath, "utf8"),
  ])

  assert.match(room, /chatRoomPresentationState\(model\)/)
  assert.match(room, /<ChatRoomHeader/)
  assert.match(composer, /const canCompose = presentation\.canCompose/)
  assert.match(composer, /disabled=\{!canCompose\}/)
  assert.match(presentation, /identityKind === "character"/)
  assert.match(presentation, /model\.quickActions\.hasCharacter/)
  assert.match(
    presentation,
    /model\.canWrite && \(model\.canManage \|\| identityKind === "character"\)/,
  )
  assert.match(presentation, /canOpenGameActions: canCompose/)
})
