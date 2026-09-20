import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const hookPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const contractsPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomContracts.ts", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room-stage1.css", import.meta.url)

test("stage 2 resolves the header identity by viewer role instead of room population", async () => {
  const [hook, contracts] = await Promise.all([
    readFile(hookPath, "utf8"),
    readFile(contractsPath, "utf8"),
  ])

  assert.match(hook, /membership\.role === "gm" \|\| membership\.is_owner === true/)
  assert.match(hook, /from\("chat_actor_bindings"\)/)
  assert.match(hook, /chatSpeakerStorageKey/)
  assert.match(hook, /from\("scene_participants"\)/)
  assert.match(hook, /roomCharacter\?\.assigned_user_id === userId/)
  assert.match(hook, /identity: canManage/)
  assert.match(hook, /kind: "narrator", name: "Рассказчик"/)
  assert.match(hook, /: null,/)
  assert.match(contracts, /ChatRoomHeaderIdentity/)
})

test("stage 2 keeps player identity local to the player's own participating character", async () => {
  const hook = await readFile(hookPath, "utf8")

  assert.match(hook, /activeCharacterId/)
  assert.match(hook, /room\.room_type !== "scene" \|\| !activeCharacterId/)
  assert.match(hook, /\.eq\("room_id", room\.id\)/)
  assert.match(hook, /\.eq\("character_id", activeCharacterId\)/)
  assert.doesNotMatch(hook, /scene_participants[\s\S]*limit\(1\)[\s\S]*characterId =/)
})

test("stage 2 adds final quick-action geometry but no navigation or panels", async () => {
  const [room, css] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  for (const label of ["Инвентарь", "Классовые умения", "Заклинания", "Атака"]) {
    assert.match(room, new RegExp(label))
  }

  assert.match(room, /data-placeholder="true"/)
  assert.match(room, /onClick=\{\(\) => undefined\}/)
  assert.match(room, /hasEquippedWeapon/)
  assert.doesNotMatch(room, /window\.location\.hash.*inventory|openSurface|ChatDrawer|ActionLauncher/)
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
  const room = await readFile(roomPath, "utf8")

  assert.match(room, /model\.identity\?\.kind === "character"/)
  assert.match(room, /model\.quickActions\.hasCharacter/)
  assert.match(room, /hasCharacterIdentity \?/)
  assert.match(room, /<CharacterHeader model=\{model\}/)
})
