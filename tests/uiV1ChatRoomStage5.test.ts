import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const roomPath = new URL("../src/ui-v1-isolated/UiV1ChatRoom.tsx", import.meta.url)
const participantsPath = new URL("../src/ui-v1-isolated/chat/useUiV1ChatParticipants.ts", import.meta.url)
const contextPath = new URL("../src/ui-v1-isolated/chat/ChatRoomContextPanel.tsx", import.meta.url)
const recoveryPath = new URL("../src/chat-runtime/participantActions.ts", import.meta.url)
const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const characterViewPath = new URL("../src/ui-v1-isolated/CharacterView.tsx", import.meta.url)
const contextCssPath = new URL("../src/ui-v1-isolated/chat/chat-context-panel.css", import.meta.url)

test("stage 5 loads real personal/scene participants under the existing RLS surface", async () => {
  const source = await readFile(participantsPath, "utf8")
  assert.match(source, /room\.room_type === "character"/)
  assert.match(source, /from\("scene_participants"\)/)
  assert.match(source, /from\("characters"\)/)
  assert.match(source, /filter: "room_id=eq\." \+ room\.id/)
  assert.doesNotMatch(source, /service_role|serviceRole/)
})

test("stage 5 opens one participant context inside the shared room drawer", async () => {
  const room = await readFile(roomPath, "utf8")
  assert.match(room, /useUiV1ChatParticipants/)
  assert.match(room, /<ChatRoomContextPanel/)
  assert.match(room, /contentKey: "character:" \+ participant\.id/)
  assert.match(room, /contentKey: "room"/)
  assert.match(room, /data-chat-room-stage="6"/)
  assert.doesNotMatch(room, /PlayerChat|GMChat|AdminChat/)
})

test("stage 5 player permissions expose private character surfaces only for self", async () => {
  const context = await readFile(contextPath, "utf8")
  assert.match(context, /const isOwn = participant\.assignedUserId === userId/)
  assert.match(context, /const canOpenPrivateSurfaces = canManage \|\| isOwn/)
  assert.match(context, /canOpenPrivateSurfaces \?/)
  assert.match(context, /Игрок видит участника сцены, но не получает его лист, инвентарь или управляющие действия/)
})

test("stage 5 keeps recovery GM-only and targets the tapped character explicitly", async () => {
  const [context, recovery] = await Promise.all([
    readFile(contextPath, "utf8"),
    readFile(recoveryPath, "utf8"),
  ])
  assert.match(context, /\{canManage && \(/)
  assert.match(context, /targetCharacterId: participant\.id/)
  assert.match(recovery, /enabled: canManage && Boolean\(campaignId\) && Boolean\(requestedBy\)/)
  assert.match(recovery, /oracle\.characters\.recover/)
  assert.match(recovery, /actorCharacterId: targetCharacterId/)
  assert.match(recovery, /authority: "gm"/)
  assert.doesNotMatch(recovery, /active_character_id|selectedCharacter|speakerCharacter/)
})

test("stage 5 recovery still enters through Snake instead of direct React mutation", async () => {
  const [context, recovery] = await Promise.all([
    readFile(contextPath, "utf8"),
    readFile(recoveryPath, "utf8"),
  ])
  assert.match(context, /snake\.executeAction/)
  assert.doesNotMatch(context, /oracle\.characters\.recover|supabase\.rpc|supabase\.from/)
  assert.doesNotMatch(recovery, /supabase\.rpc|supabase\.from/)
})

test("stage 5 reuses CharacterView for sheet and inventory instead of cloning either into chat", async () => {
  const [room, app, view] = await Promise.all([
    readFile(roomPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(characterViewPath, "utf8"),
  ])
  assert.match(room, /#\/workspace\/character\/".*characterId/)
  assert.match(room, /"\/inventory"/)
  assert.match(app, /surface\?: "inventory"/)
  assert.match(app, /initialInterface=\{route\.surface === "inventory" \? "inventory" : null\}/)
  assert.match(view, /initialInterface\?: "inventory" \| null/)
  assert.doesNotMatch(room, /CharacterInventoryInterface|CharacterSheetShell/)
})

test("stage 5 context remains graphite and compact rather than becoming a second character sheet", async () => {
  const css = await readFile(contextCssPath, "utf8")
  assert.match(css, /var\(--u1-surface-1\)/)
  assert.match(css, /#0d0f11/)
  assert.match(css, /u1-chat-character-actions/)
  assert.doesNotMatch(css, /#7c3aed|#8d66d0|#c4b5fd/i)
})
