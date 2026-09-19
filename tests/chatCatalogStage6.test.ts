import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pagePath = new URL("../src/pages/Chats.tsx", import.meta.url)
const stylePath = new URL("../src/chats-v3.css", import.meta.url)

test("stage 6 activates search, filters and manager event stub without opening ChatRoom", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /data-chat-catalog-stage="6"/)
  assert.match(source, /setSearchQuery/)
  assert.match(source, /setFilter/)
  assert.match(source, /placeholder="Название, персонаж, зона, сообщение…"/)
  assert.match(source, /Непрочитанные/)
  assert.match(source, /openCreateEventStub/)
  assert.match(source, /Создание события будет подключено отдельным потоком/)
  assert.match(source, /\{canManage && \(/)
  assert.doesNotMatch(source, /onOpenRoom\s*\(/)
})

test("stage 6 All controls expand sections inline instead of navigating", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /PERSONAL_PREVIEW_LIMIT = 4/)
  assert.match(source, /EVENT_PREVIEW_LIMIT = 3/)
  assert.match(source, /COMPLETED_PREVIEW_LIMIT = 3/)
  assert.match(source, /toggleExpanded/)
  assert.match(source, /aria-expanded=\{expanded\[section\]\}/)
  assert.match(source, /visiblePersonal\.slice\(0, PERSONAL_PREVIEW_LIMIT\)/)
  assert.match(source, /visibleEvents\.slice\(0, EVENT_PREVIEW_LIMIT\)/)
  assert.match(source, /visibleCompleted\.slice\(0, COMPLETED_PREVIEW_LIMIT\)/)
})

test("stage 6 room taps share one non-mutating catalog placeholder", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /function openRoomStub\(room: ChatRoom\)/)
  assert.match(source, /data-placeholder-kind=\{placeholder\.kind\}/)
  assert.match(source, /Экран диалога пока не подключён к новому каталогу/)
  assert.match(source, /onClick=\{\(\) => openRoomStub\(hero\)\}/)
  assert.match(source, /onClick=\{\(\) => openRoomStub\(room\)\}/)
})

test("stage 6 interaction surfaces retain MegANOT responsive geometry", async () => {
  const css = await readFile(stylePath, "utf8")

  assert.match(css, /\.chat-catalog__browse-tools/)
  assert.match(css, /\.chat-catalog__search/)
  assert.match(css, /\.chat-catalog__filters/)
  assert.match(css, /\.chat-catalog__placeholder/)
  assert.match(css, /\.chat-catalog__personal-strip\.is-expanded/)
})
