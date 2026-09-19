import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { formatUnreadCount } from "../src/chat/catalogPresentation.ts"

const pagePath = new URL("../src/pages/Chats.tsx", import.meta.url)
const stylePath = new URL("../src/chats-v3.css", import.meta.url)

test("stage 7 caps unread badges instead of letting three-digit counts wreck geometry", () => {
  assert.equal(formatUnreadCount(0), "0")
  assert.equal(formatUnreadCount(1), "1")
  assert.equal(formatUnreadCount(99), "99")
  assert.equal(formatUnreadCount(100), "99+")
  assert.equal(formatUnreadCount(9999), "99+")
})

test("stage 7 has geometry-preserving loading and retryable error states", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /data-chat-catalog-stage="8"/)
  assert.match(source, /function ChatCatalogSkeleton\(\)/)
  assert.match(source, /aria-busy="true"/)
  assert.match(source, /chat-catalog__skeleton-hero/)
  assert.match(source, /Чаты не загрузились/)
  assert.match(source, /void rooms\.reload\(\)/)
  assert.match(source, /Не удалось обновить каталог/)
})

test("stage 7 uses one consolidated empty state and a resettable no-results state", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /const catalogEmpty = rooms\.rooms\.length === 0/)
  assert.match(source, /Здесь пока тихо/)
  assert.match(source, /function resetBrowsing\(\)/)
  assert.match(source, /Сбросить поиск и фильтр/)
  assert.match(source, /totalMatches === 0/)
})

test("stage 7 artwork always has a fallback even when a stored media value fails", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /function CatalogArtwork/)
  assert.match(source, /failedValue === room\.avatar_url/)
  assert.match(source, /fallback=\{fallbackNode\}/)
  assert.match(source, /onError=\{\(\) => setFailedValue\(room\.avatar_url\)\}/)
})

test("stage 7 CSS survives long labels, large lists and narrow screens", async () => {
  const css = await readFile(stylePath, "utf8")

  assert.match(css, /overflow-wrap:\s*anywhere/)
  assert.match(css, /\.chat-catalog__personal-strip\.is-expanded\s*\{[\s\S]*display:\s*grid/)
  assert.match(css, /content-visibility:\s*auto/)
  assert.match(css, /contain-intrinsic-block-size:\s*76px/)
  assert.match(css, /@media \(max-width: 340px\)/)
  assert.match(css, /@media \(max-width: 320px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /@keyframes chat-catalog-skeleton/)
})
