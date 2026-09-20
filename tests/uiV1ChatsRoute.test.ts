import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const entryPath = new URL("../src/ui-v1-isolated/main.tsx", import.meta.url)
const catalogPath = new URL("../src/ui-v1-isolated/ChatCatalog.tsx", import.meta.url)
const dataPath = new URL("../src/ui-v1-isolated/useUiV1ChatCatalog.ts", import.meta.url)

test("ui v1 chats root mounts the isolated catalog instead of a future placeholder", async () => {
  const [app, catalog] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(catalogPath, "utf8"),
  ])

  assert.match(app, /import ChatCatalog from "\.\/ChatCatalog"/)
  assert.match(app, /return <ChatCatalog onOpenRoom=/)
  assert.doesNotMatch(app, /pages\/Chats|Новый интерфейс чатов будет построен отдельно/)
  assert.match(catalog, /data-chat-catalog-stage="8"/)
})

test("ui v1 chat route stays hard-isolated from legacy page and CharacterContext trees", async () => {
  const [entry, app, catalog, data] = await Promise.all([
    readFile(entryPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(catalogPath, "utf8"),
    readFile(dataPath, "utf8"),
  ])

  assert.doesNotMatch(entry + app + catalog + data, /pages\/|CharacterContext|chats-v3\.css/)
  assert.match(data, /get_campaign_chat_rooms/)
  assert.match(data, /buildChatCatalogModel/)
})
