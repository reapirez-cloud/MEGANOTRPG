import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const entryPath = new URL("../src/ui-v1-isolated/main.tsx", import.meta.url)
const catalogPath = new URL("../src/ui-v1-isolated/ChatCatalog.tsx", import.meta.url)
const dataPath = new URL("../src/ui-v1-isolated/useUiV1ChatCatalog.ts", import.meta.url)
const stylePath = new URL("../src/ui-v1-isolated/chat-catalog.css", import.meta.url)

test("ui v1 chats root renders its isolated Stage 8 catalog instead of the development placeholder", async () => {
  const [app, catalog] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(catalogPath, "utf8"),
  ])

  assert.match(app, /import ChatCatalog from "\.\/ChatCatalog"/)
  assert.match(app, /return <ChatCatalog \/>/)
  assert.doesNotMatch(app, /pages\/Chats|Новый интерфейс чатов будет построен отдельно/)
  assert.match(catalog, /data-chat-catalog-stage="8"/)
  assert.match(catalog, /Текущая история/)
  assert.match(catalog, /Личные истории/)
  assert.match(catalog, /События/)
  assert.match(catalog, /Завершённые/)
})

test("ui v1 chat adapter uses shared read models without importing legacy CharacterContext", async () => {
  const [entry, data] = await Promise.all([
    readFile(entryPath, "utf8"),
    readFile(dataPath, "utf8"),
  ])

  assert.doesNotMatch(entry + data, /CharacterContext|pages\//)
  assert.match(data, /get_campaign_chat_rooms/)
  assert.match(data, /buildChatCatalogModel/)
  assert.match(data, /membership\.role === "gm" \|\| membership\.is_owner === true/)
  assert.match(data, /meganotrpg:v1:campaign-id/)
})

test("ui v1 chat adapter keeps all certified realtime refresh sources", async () => {
  const data = await readFile(dataPath, "utf8")

  for (const table of [
    "chat_rooms",
    "chat_messages",
    "characters",
    "character_world_state",
    "locations",
    "scene_participants",
  ]) {
    assert.match(data, new RegExp('table: "' + table + '"'))
  }
})

test("ui v1 chat unavailable actions use Snake placeholder surfaces", async () => {
  const [catalog, actions] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(
      new URL("../src/ui-v1-isolated/chatSnakeActions.ts", import.meta.url),
      "utf8",
    ),
  ])

  assert.match(catalog, /useSnake\(\)/)
  assert.match(catalog, /kind: "placeholder"/)
  assert.match(actions, /kind: "placeholder"/)
  assert.match(actions, /Внутренний игровой диалог подключается отдельным этапом/)
  assert.match(catalog, /Создание события подключается отдельным потоком/)
  assert.doesNotMatch(catalog, /onOpenRoom|<ChatRoom|pages\/ChatRoom/)
})

test("ui v1 chat visual surface stays isolated and supports narrow screens", async () => {
  const css = await readFile(stylePath, "utf8")

  assert.match(css, /var\(--u1-canvas\)/)
  assert.match(css, /var\(--u1-line\)/)
  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(max-width: 340px\)/)
  assert.match(css, /content-visibility:\s*auto/)
  assert.doesNotMatch(css, /--chat-|chats-v3|App\.css/)
})


test("ui v1 chat rooms are Snake-managed persistent objects", async () => {
  const catalog = await readFile(catalogPath, "utf8")
  const actions = await readFile(
    new URL("../src/ui-v1-isolated/chatSnakeActions.ts", import.meta.url),
    "utf8",
  )

  assert.match(catalog, /SnakeTrigger/)
  assert.match(catalog, /entity=\{\{ type: "chat_room", id: room\.id \}\}/)
  assert.match(catalog, /entity=\{\{ type: "chat_room", id: hero\.id \}\}/)
  assert.ok((catalog.match(/<SnakeTrigger/g) || []).length >= 3)
  assert.match(catalog, /createChatRoomSnakeActions/)
  assert.match(actions, /label: "Открыть"/)
  assert.match(actions, /label: "Сведения"/)
  assert.match(actions, /Назначить превью|Заменить превью/)
  assert.match(actions, /aspectRatio:\s*9 \/ 16/)
  assert.match(actions, /label: "Удалить сцену"/)
  assert.match(actions, /canManage && room\.room_type === "scene"/)
  assert.match(actions, /chatRoomOpenSurface/)
})

test("chat catalog uses unified 9:16 full-bleed cards with a real text overlay", async () => {
  const [catalog, css] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylePath, "utf8"),
  ])

  assert.match(css, /Portrait chat cards: one 9:16 visual language/)
  assert.match(
    css,
    /\.u1-chat-card\s*\{[\s\S]*?aspect-ratio:\s*9\s*\/\s*16/,
  )
  assert.match(
    css,
    /\.u1-chat-card__media,[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%/,
  )
  assert.match(css, /\.u1-chat-card__shade/)
  assert.match(css, /\.u1-chat-card__copy/)
  assert.match(css, /object-fit:\s*cover/)
  assert.match(catalog, /portraitCard\(room, "personal"\)/)
  assert.match(catalog, /portraitCard\(room, "event"\)/)
  assert.match(catalog, /portraitCard\(room, "completed"\)/)
  assert.match(css, /\.u1-chat-row--flood\s*\{[\s\S]*?min-height:\s*52px/)
  assert.doesNotMatch(css, /Panoramic chat artwork: full-bleed room previews/)
})

test("chat Snake mutations keep scene deletion behind Oracle Larisa and personal histories non-deletable", async () => {
  const [data, actions, oracleEngine, oracleTypes, larisaTypes, larisaStorage, migration] =
    await Promise.all([
      readFile(dataPath, "utf8"),
      readFile(
        new URL("../src/ui-v1-isolated/chatSnakeActions.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/oracle-engine/engine.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/oracle-engine/types.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/location-engine/types.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/location-engine/supabase.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/20260920134000_chat_catalog_portrait_snake_actions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ])

  assert.match(data, /oracle\.world\.deleteScene/)
  assert.match(data, /bind_chat_room_preview_upload_v1/)
  assert.match(actions, /canManage && room\.room_type === "scene"/)
  assert.doesNotMatch(actions, /room\.room_type === "character"[\s\S]{0,120}delete-scene/)
  assert.match(oracleEngine, /deleteScene:[\s\S]*world\.scene_delete/)
  assert.match(oracleTypes, /deleteScene\(context: OracleContext, roomId: string\)/)
  assert.match(larisaTypes, /kind: "world\.scene_delete"/)
  assert.match(larisaStorage, /delete_game_scene_v1/)
  assert.match(migration, /if v_room\.room_type <> 'scene'/)
  assert.match(migration, /Only scene rooms can be deleted/)
  assert.match(migration, /target_type = 'chat_room'/)
  assert.match(migration, /target_field = 'preview'/)
})
