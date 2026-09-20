import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const speakersPath = new URL("../src/ui-v1-isolated/chat-room/useChatSpeakerOptions.ts", import.meta.url)
const shellPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const contractsPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomContracts.ts", import.meta.url)
const roomPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomScreen.tsx", import.meta.url)

test("stage 5 gives GM a narrator + bound-character identity selector", async () => {
  const [composer, speakers, contracts] = await Promise.all([
    readFile(composerPath, "utf8"),
    readFile(speakersPath, "utf8"),
    readFile(contractsPath, "utf8"),
  ])

  assert.match(composer, /model\.canManage \?/)
  assert.match(speakers, /from\("chat_actor_bindings"\)/)
  assert.match(speakers, /name: "Рассказчик"/)
  assert.match(speakers, /chatSpeakerStorageKey/)
  assert.match(speakers, /CHAT_SPEAKER_CHANGED_EVENT/)
  assert.match(contracts, /ChatSpeakerOption/)
})

test("stage 5 keeps player composer free of identity controls", async () => {
  const composer = await readFile(composerPath, "utf8")

  assert.match(composer, /model\.canManage \?/)
  assert.match(composer, /playerHasCharacter/)
  assert.match(composer, /Нет персонажа в этой сцене/)
  assert.doesNotMatch(composer, /active_character_id/)
})

test("stage 5 plus remains a placeholder while text send is real", async () => {
  const composer = await readFile(composerPath, "utf8")

  assert.match(composer, /data-placeholder="true"/)
  assert.match(composer, /onClick=\{\(\) => undefined\}/)
  assert.match(composer, /from\("chat_messages"\)/)
  assert.match(composer, /\.insert\(/)
  assert.match(composer, /character_id: characterId/)
  assert.match(composer, /body,/)
})

test("stage 5 composer is multiline and keyboard-friendly", async () => {
  const composer = await readFile(composerPath, "utf8")

  assert.match(composer, /<textarea/)
  assert.match(composer, /rows=\{1\}/)
  assert.match(composer, /Math\.min\(textarea\.scrollHeight, 108\)/)
  assert.match(composer, /event\.key === "Enter"/)
  assert.match(composer, /!event\.shiftKey/)
  assert.match(composer, /requestSubmit\(\)/)
})

test("stage 5 speaker change refreshes header without full-screen loading", async () => {
  const shell = await readFile(shellPath, "utf8")

  assert.match(shell, /CHAT_SPEAKER_CHANGED_EVENT/)
  assert.match(shell, /void load\(true\)/)
  assert.match(shell, /if \(!silent\) setLoading\(true\)/)
})

test("stage 5 mounts the composer after the real feed", async () => {
  const room = await readFile(roomPath, "utf8")

  assert.match(room, /data-chat-room-stage="5"/)
  assert.match(room, /<ChatFeed roomId=\{roomId\} \/>[\s\S]*<ChatComposer model=\{model\} \/>/)
})
