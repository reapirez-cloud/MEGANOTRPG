import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const shellPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const eventsPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomEvents.ts", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const contractsPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomContracts.ts", import.meta.url)
const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)
const speakersPath = new URL("../src/ui-v1-isolated/chat-room/useChatSpeakerOptions.ts", import.meta.url)
const presentationPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomPresentation.ts", import.meta.url)

test("stage 7 derives room access from one server viewer context", async () => {
  const [shell, events] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(eventsPath, "utf8"),
  ])

  assert.match(shell, /rpc\("get_chat_room_viewer_context_v1"/)
  assert.match(events, /rpc\("get_chat_room_viewer_context_v1"/)
  assert.doesNotMatch(shell, /resolveMembership/)
  assert.doesNotMatch(shell, /meganotrpg:v1:campaign-id/)
  assert.doesNotMatch(events, /meganotrpg:v1:campaign-id/)
})

test("stage 7 uses server-selected viewer character instead of guessing scene participants", async () => {
  const shell = await readFile(shellPath, "utf8")

  assert.match(shell, /viewerContext\.viewer_character_id/)
  assert.match(shell, /viewerContext\.can_manage/)
  assert.match(shell, /viewerContext\.can_write/)
  assert.doesNotMatch(shell, /resolvePlayerCharacterId/)
  assert.doesNotMatch(shell, /from\("scene_participants"\)/)
  assert.doesNotMatch(shell, /from\("chat_room_members"\)/)
})

test("stage 7 gates composer by server write permission", async () => {
  const [composer, contracts, presentation] = await Promise.all([
    readFile(composerPath, "utf8"),
    readFile(contractsPath, "utf8"),
    readFile(presentationPath, "utf8"),
  ])

  assert.match(contracts, /canWrite: boolean/)
  assert.match(presentation, /const canCompose =/)
  assert.match(presentation, /model\.canWrite &&/)
  assert.match(composer, /const canCompose = presentation\.canCompose/)
  assert.match(composer, /disabled=\{speakers\.loading \|\| !model\.canWrite\}/)
  assert.match(composer, /Нет права писать в этот чат/)
})

test("stage 7 keeps GM identities restricted to bound living NPCs", async () => {
  const speakers = await readFile(speakersPath, "utf8")

  assert.match(speakers, /from\("chat_actor_bindings"\)/)
  assert.match(speakers, /\.eq\("character_type", "npc"\)/)
  assert.match(speakers, /\.eq\("life_state", "alive"\)/)
})

test("stage 7 preserves real HP, world state and equipped-weapon data", async () => {
  const shell = await readFile(shellPath, "utf8")

  assert.match(shell, /from\("character_sheets"\)/)
  assert.match(shell, /current_hp, max_hp, temp_hp/)
  assert.match(shell, /from\("character_world_state"\)/)
  assert.match(shell, /from\("character_inventory_items"\)/)
  assert.match(shell, /semanticRole\.startsWith\("weapon\."\)/)
})

test("stage 7 adds no action panels", async () => {
  const room = await readFile(roomPath, "utf8")

  assert.match(room, /data-chat-room-stage="8"/)
  assert.doesNotMatch(room, /ChatDrawer|ActionLauncher|ActionPanel|right-panel/i)
})
