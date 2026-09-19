import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const entryPath = new URL("../src/ui-v1-isolated/main.tsx", import.meta.url)

test("ui v1 chats root renders the certified catalog instead of the old development placeholder", async () => {
  const source = await readFile(appPath, "utf8")

  assert.match(source, /import Chats from "\.\.\/pages\/Chats"/)
  assert.match(source, /<Chats/)
  assert.doesNotMatch(
    source,
    /Новый интерфейс чатов будет построен отдельно\. Этот экран существует только как чистая точка подключения\./,
  )
})

test("ui v1 supplies the CharacterProvider required by the chat catalog read model", async () => {
  const source = await readFile(entryPath, "utf8")

  assert.match(source, /import \{ CharacterProvider \} from "\.\.\/context\/CharacterContext"/)
  assert.match(source, /<AuthGate>[\s\S]*<CharacterProvider>[\s\S]*<AIProvider>/)
})

test("ui v1 keeps the Stage 8 room-navigation boundary after mounting Chats", async () => {
  const source = await readFile(appPath, "utf8")

  assert.match(source, /onOpenRoom=\{\(\) => \{/)
  assert.match(source, /Stage 8 landing catalog intentionally keeps room navigation disconnected/)
  assert.doesNotMatch(source, /go\("chat\//)
})
