import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/UiV1ChatRoom.tsx", import.meta.url)
const workspacePath = new URL("../src/ui-v1-isolated/chat/ChatActionWorkspace.tsx", import.meta.url)
const actorPath = new URL("../src/ui-v1-isolated/chat/useUiV1ChatActorRuntime.ts", import.meta.url)
const snakeContextPath = new URL("../src/ui-v1-isolated/snake/SnakeContext.ts", import.meta.url)
const snakeProviderPath = new URL("../src/ui-v1-isolated/SnakeProvider.tsx", import.meta.url)
const gameplayPath = new URL("../src/chat-runtime/gameplayActions.ts", import.meta.url)
const presentationPath = new URL("../src/chat-runtime/presentation.ts", import.meta.url)
const sharedModelPath = new URL("../src/chat-runtime/actionModel.ts", import.meta.url)
const legacyModelPath = new URL("../src/components/chat/chatActionModel.ts", import.meta.url)
const stylePath = new URL("../src/ui-v1-isolated/chat/chat-action-workspace.css", import.meta.url)

test("stage 4 resolves the chat actor through Shapoklyak and the shared Character Runtime", async () => {
  const actor = await readFile(actorPath, "utf8")
  assert.match(actor, /shapoklyak\.getEntity/)
  assert.match(actor, /useResolvedCharacterRuntime\(character\)/)
  assert.match(actor, /buildChatActionModel\(resolved\.contract/)
  assert.doesNotMatch(actor, /resolveCharacterContract\(/)
})

test("stage 4 exposes Snake execution as the only UI command seam", async () => {
  const [context, provider, workspace] = await Promise.all([
    readFile(snakeContextPath, "utf8"),
    readFile(snakeProviderPath, "utf8"),
    readFile(workspacePath, "utf8"),
  ])
  assert.match(context, /executeAction:/)
  assert.match(provider, /executeAction\(action, entity, input, path = \[\]\)/)
  assert.match(workspace, /snake\.executeAction/)
  assert.doesNotMatch(workspace, /genaSession|supabase\.rpc|supabase\.from/)
})

test("stage 4 gameplay executors enter the existing GENA gateway", async () => {
  const gameplay = await readFile(gameplayPath, "utf8")
  assert.match(gameplay, /genaSession\.sendRoll/)
  assert.match(gameplay, /genaSession\.sendTemplateAction/)
  assert.match(gameplay, /genaSession\.sendTemplateSpell/)
  assert.match(gameplay, /genaSession\.useInventoryItem/)
  assert.match(gameplay, /genaSession\.sendSpellWithModifiers/)
  assert.doesNotMatch(gameplay, /supabase\.rpc|supabase\.from/)
})

test("stage 4 alternative action costs use the selected resolved cost option", async () => {
  const gameplay = await readFile(gameplayPath, "utf8")
  assert.match(gameplay, /const selectedCostOption = action\.costOptions\.length/)
  assert.match(gameplay, /selectedCostOption\?\.costs \?\? action\.resourceCosts/)
  assert.match(gameplay, /resourceCostInputs\(runtime\.contract, resolvedCosts\)/)
  assert.doesNotMatch(gameplay, /Альтернативная оплата этого действия пока не имеет авторитетного маршрута/)
})

test("stage 4 has five real CE-backed workspace interfaces", async () => {
  const workspace = await readFile(workspacePath, "utf8")
  assert.match(workspace, /section === "roll"/)
  assert.match(workspace, /section === "skill"/)
  assert.match(workspace, /section === "action"/)
  assert.match(workspace, /section === "item"/)
  assert.match(workspace, /<SpellPanel/)
  assert.match(workspace, /runtime\.contract/)
  assert.match(workspace, /runtime\.model\.spells/)
})

test("spell UI follows resolved access, methods and resource options without a class-name branch", async () => {
  const presentation = await readFile(presentationPath, "utf8")
  assert.match(presentation, /for \(const access of spell\.accesses\)/)
  assert.match(presentation, /for \(const method of access\.methods\)/)
  assert.match(presentation, /method\.resourceOptions/)
  assert.doesNotMatch(presentation.toLowerCase(), /warlock|колдун/)
})

test("UI 1.0 shares the chat action classifier rather than copying legacy mechanics", async () => {
  const [shared, legacy] = await Promise.all([
    readFile(sharedModelPath, "utf8"),
    readFile(legacyModelPath, "utf8"),
  ])
  assert.match(shared, /export function buildChatActionModel/)
  assert.match(legacy, /export \* from "\.\.\/\.\.\/chat-runtime\/actionModel\.ts"/)
})

test("stage 4 workspace uses dedicated vector icons and graphite styling", async () => {
  const [workspace, css] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(stylePath, "utf8"),
  ])
  assert.match(workspace, /<svg/)
  assert.match(workspace, /stroke: "currentColor"/)
  assert.match(css, /#0c0e10/)
  assert.match(css, /var\(--u1-surface-1\)/)
  assert.doesNotMatch(css, /#7c3aed|#8d66d0|#c4b5fd/i)
})

test("launcher availability and counts come from the resolved actor", async () => {
  const room = await readFile(roomPath, "utf8")
  assert.match(room, /const actionSections = CHAT_ACTION_SECTIONS\.map/)
  assert.match(room, /contract\?\.actions/)
  assert.match(room, /contract\?\.spells\.length/)
  assert.match(room, /disabled: noActor \|\| gameplay\.loading \|\| count === 0/)
  assert.match(room, /data-chat-room-stage="5"/)
})
