import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const hostPath = new URL("../src/ui-v1-isolated/chat-room/ChatActionHost.tsx", import.meta.url)
const headerPath = new URL("../src/ui-v1-isolated/chat-room/ChatRoomHeader.tsx", import.meta.url)
const panelPath = new URL("../src/ui-v1-isolated/chat-room/ChatActionPanel.tsx", import.meta.url)
const modifierPath = new URL("../src/ui-v1-isolated/chat-room/ChatSpellModifierPanel.tsx", import.meta.url)
const panelCssPath = new URL("../src/ui-v1-isolated/chat-room/chat-action-panel.css", import.meta.url)
const speakersPath = new URL("../src/ui-v1-isolated/chat-room/useChatSpeakerOptions.ts", import.meta.url)
const shellPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)

test("stage 5 keeps GM persona selection and player identity safe", async () => {
  const [composer, speakers] = await Promise.all([
    readFile(composerPath, "utf8"),
    readFile(speakersPath, "utf8"),
  ])

  assert.match(composer, /presentation\.showPersonaSelector \?/)
  assert.match(composer, /selectedCharacterId/)
  assert.match(composer, /speakers\.selected\.kind === "character"/)
  assert.match(speakers, /from\("chat_actor_bindings"\)/)
  assert.match(speakers, /name: "Рассказчик"/)
  assert.match(speakers, /chatSpeakerStorageKey/)
})

test("stage 5 makes plus the single visible launcher for game actions", async () => {
  const [composer, header] = await Promise.all([
    readFile(composerPath, "utf8"),
    readFile(headerPath, "utf8"),
  ])

  for (const label of ["Бросок", "Способности", "Заклинания", "Инвентарь", "Атака"]) {
    assert.match(composer, new RegExp(label))
  }

  assert.match(composer, /ACTION_MENU_ITEMS/)
  assert.match(composer, /aria-label="Игровые действия"/)
  assert.match(composer, /u1-chat-composer__action-menu/)
  assert.doesNotMatch(header, /QuickActions|Инвентарь|Заклинания|Классовые умения/)
})

test("stage 5 uses an isolated graphite action panel instead of legacy chat sheets", async () => {
  const [host, panel, modifier, css] = await Promise.all([
    readFile(hostPath, "utf8"),
    readFile(panelPath, "utf8"),
    readFile(modifierPath, "utf8"),
    readFile(panelCssPath, "utf8"),
  ])

  assert.match(host, /import ChatActionPanel/)
  assert.match(host, /import ChatSpellModifierPanel/)
  assert.doesNotMatch(host, /ChatActionSheet|ChatSpellModifierSheet/)
  assert.doesNotMatch(panel + modifier, /ChatActionSheet\.css|chat-action-flow|action-v2-|action-v3-/)
  assert.match(panel, /u1-chat-action-backdrop/)
  assert.match(panel, /u1-chat-action-panel/)
  assert.match(css, /width: min\(90vw, 640px\)/)
  assert.match(css, /background:[\s\S]*#0a0c0e/)
})

test("stage 5 keeps roll large enough to use but compact in its initial state", async () => {
  const [panel, css] = await Promise.all([
    readFile(panelPath, "utf8"),
    readFile(panelCssPath, "utf8"),
  ])

  assert.match(panel, /Свободный бросок/)
  assert.match(panel, /standardDice/)
  assert.match(panel, /<details className="u1-chat-skills">/)
  assert.match(css, /\.u1-chat-roll__card/)
  assert.match(css, /\.u1-chat-roll__dice[\s\S]*grid-template-columns: repeat\(7/)
  assert.match(css, /\.u1-chat-roll__controls[\s\S]*grid-template-columns: repeat\(3/)
})

test("stage 5 action host reuses CE and GENA instead of inventing local mechanics", async () => {
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
})

test("stage 5 inventory entry filters the resolved surface to inventory sources", async () => {
  const panel = await readFile(panelPath, "utf8")

  assert.match(panel, /group\.sourceType === "inventory_item"/)
  assert.match(panel, /group\.id\.startsWith\("item:"\)/)
  assert.match(panel, /title: "Инвентарь"/)
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

test("stage 5 speaker change refreshes the header without full-screen loading", async () => {
  const shell = await readFile(shellPath, "utf8")

  assert.match(shell, /CHAT_SPEAKER_CHANGED_EVENT/)
  assert.match(shell, /void load\(true\)/)
  assert.match(shell, /if \(!silent\) setLoading\(true\)/)
})
