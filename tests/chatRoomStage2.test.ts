import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const hookPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const contractsPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomContracts.ts", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

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

test("stage 2 adds final quick-action geometry but no navigation or panels", async () => {
  const [room, header, css] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(headerPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  for (const label of ["Инвентарь", "Классовые умения", "Заклинания", "Атака"]) {
    assert.match(header, new RegExp(label))
  }

  assert.match(header, /data-placeholder="true"/)
  assert.match(header, /onClick=\{\(\) => undefined\}/)
  assert.match(header, /hasEquippedWeapon/)
  assert.doesNotMatch(room + header, /window\.location\.hash.*inventory|openSurface|ChatDrawer|ActionLauncher/)
  assert.match(css, /\.u1-room-quick-actions/)
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(css, /transform: scale\(\.965\)/)
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

test("stage 2 hides character quick actions when no character identity is present", async () => {
  const [room, header] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(headerPath, "utf8"),
  ])

  assert.match(room, /model\.identity\?\.kind === "character"/)
  assert.match(room, /model\.quickActions\.hasCharacter/)
  assert.match(room, /showQuickActions=\{hasCharacterIdentity\}/)
  assert.match(room, /<ChatRoomHeader/)
  assert.match(header, /showQuickActions \?/)
})
