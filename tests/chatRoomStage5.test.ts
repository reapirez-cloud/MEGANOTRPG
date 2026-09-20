import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const hostPath = new URL("../src/ui-v1-isolated/chat-room/ChatActionHost.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const speakersPath = new URL("../src/ui-v1-isolated/chat-room/useChatSpeakerOptions.ts", import.meta.url)
const shellPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const contractsPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomContracts.ts", import.meta.url)
const actionSheetPath = new URL("../src/components/chat/ChatActionSheet.tsx", import.meta.url)
const modifierSheetPath = new URL("../src/components/chat/ChatSpellModifierSheet.tsx", import.meta.url)
const actionCssPath = new URL("../src/components/chat/ChatActionSheet.css", import.meta.url)
const roomCssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("stage 5 keeps GM persona selection and the player path identity-safe", async () => {
  const [composer, speakers, contracts] = await Promise.all([
    readFile(composerPath, "utf8"),
    readFile(speakersPath, "utf8"),
    readFile(contractsPath, "utf8"),
  ])

  assert.match(composer, /presentation\.showPersonaSelector \?/)
  assert.match(composer, /selectedCharacterId/)
  assert.match(composer, /speakers\.selected\.kind === "character"/)
  assert.match(speakers, /from\("chat_actor_bindings"\)/)
  assert.match(speakers, /name: "Рассказчик"/)
  assert.match(speakers, /chatSpeakerStorageKey/)
  assert.match(contracts, /ChatSpeakerOption/)
})

test("stage 5 plus opens a compact five-item action menu instead of a placeholder", async () => {
  const [composer, css] = await Promise.all([
    readFile(composerPath, "utf8"),
    readFile(roomCssPath, "utf8"),
  ])

  for (const label of ["Бросок", "Умение", "Заклинание", "Предмет", "Действие"]) {
    assert.match(composer, new RegExp(label))
  }

  assert.match(composer, /ACTION_MENU_ITEMS/)
  assert.match(composer, /aria-label="Игровые действия"/)
  assert.match(composer, /u1-chat-composer__action-menu/)
  assert.match(composer, /setActionMode\(mode\)/)
  assert.doesNotMatch(composer, /data-placeholder="true"/)
  assert.doesNotMatch(composer, /onClick=\{\(\) => undefined\}/)
  assert.match(css, /Reference rebuild — composer\/action launcher stage 5/)
  assert.match(css, /bottom: calc\(100% \+ 8px\)/)
})

test("stage 5 direct header actions and plus menu share one request contract", async () => {
  const [header, composer, contracts] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(composerPath, "utf8"),
    readFile(contractsPath, "utf8"),
  ])

  assert.match(contracts, /CHAT_ACTION_REQUEST_EVENT/)
  assert.match(contracts, /ChatActionLauncherMode/)
  assert.match(header, /new CustomEvent\(CHAT_ACTION_REQUEST_EVENT/)
  assert.match(header, /mode: "item"/)
  assert.match(header, /mode: "ability"/)
  assert.match(header, /mode: "spell"/)
  assert.match(header, /mode: "action"/)
  assert.match(composer, /addEventListener\(CHAT_ACTION_REQUEST_EVENT/)
})

test("stage 5 opens the full action interface as a right-side near-full-screen panel", async () => {
  const [host, actionSheet, modifierSheet, css] = await Promise.all([
    readFile(hostPath, "utf8"),
    readFile(actionSheetPath, "utf8"),
    readFile(modifierSheetPath, "utf8"),
    readFile(actionCssPath, "utf8"),
  ])

  assert.match(host, /presentation="side"/)
  assert.match(host, /initialTab=\{modeTab\(mode\)\}/)
  assert.match(host, /scope=\{modeScope\(mode\)\}/)
  assert.match(actionSheet, /data-presentation=\{presentation\}/)
  assert.match(modifierSheet, /data-presentation=\{presentation\}/)
  assert.match(css, /width:min\(90vw,720px\)/)
  assert.match(css, /height:100dvh/)
  assert.match(css, /justify-content:flex-end/)
  assert.match(css, /translateX\(28px\)/)
})

test("stage 5 action host reuses CE and GENA instead of inventing local game mechanics", async () => {
  const host = await readFile(hostPath, "utf8")

  assert.match(host, /useResolvedCharacterRuntime/)
  assert.match(host, /resourceCostInputs/)
  assert.match(host, /templateMechanicIdForChatAction/)
  assert.match(host, /templateMechanicIdForSpellAccess/)
  assert.match(host, /genaSession\.sendRoll/)
  assert.match(host, /genaSession\.sendTemplateRoll/)
  assert.match(host, /genaSession\.sendTemplateAction/)
  assert.match(host, /genaSession\.sendTemplateSpell/)
  assert.match(host, /genaSession\.sendSpellWithModifiers/)
  assert.match(host, /genaSession\.useInventoryItem/)
  assert.match(host, /CHAT_MESSAGE_SENT_EVENT/)
})

test("stage 5 item entry point filters the resolved unique surface to inventory sources", async () => {
  const actionSheet = await readFile(actionSheetPath, "utf8")

  assert.match(actionSheet, /scope === "item"/)
  assert.match(actionSheet, /group\.sourceType === "inventory_item"/)
  assert.match(actionSheet, /group\.id\.startsWith\("item:"\)/)
  assert.match(actionSheet, /scope === "item" \? "Предметы" : "Уникальное"/)
})

test("stage 5 text composer stays multiline and keyboard-friendly", async () => {
  const composer = await readFile(composerPath, "utf8")

  assert.match(composer, /<textarea/)
  assert.match(composer, /rows=\{1\}/)
  assert.match(composer, /Math\.min\(textarea\.scrollHeight, 108\)/)
  assert.match(composer, /event\.key === "Enter"/)
  assert.match(composer, /!event\.shiftKey/)
  assert.match(composer, /requestSubmit\(\)/)
  assert.match(composer, /from\("chat_messages"\)/)
})

test("stage 5 speaker change still refreshes the header without full-screen loading", async () => {
  const shell = await readFile(shellPath, "utf8")

  assert.match(shell, /CHAT_SPEAKER_CHANGED_EVENT/)
  assert.match(shell, /void load\(true\)/)
  assert.match(shell, /if \(!silent\) setLoading\(true\)/)
})
