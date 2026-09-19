import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pagePath = new URL("../src/pages/Chats.tsx", import.meta.url)
const stylePath = new URL("../src/chats-v3.css", import.meta.url)

test("stage 3 matches the approved chat landing-page anatomy without opening rooms", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /data-chat-catalog-stage="6"/)
  assert.match(source, /chat-catalog__toolbar/)
  assert.match(source, /aria-label="Поиск"/)
  assert.match(source, /aria-label="Фильтр"/)
  assert.match(source, /chat-catalog__toolbar-add/)
  assert.match(source, /Текущая история/)
  assert.match(source, /chat-catalog__flood-label">Флуд/)
  assert.match(source, /chat-catalog__personal-strip/)
  assert.match(source, /sectionControl\("personal", visiblePersonal\.length, PERSONAL_PREVIEW_LIMIT\)/)
  assert.match(source, /Сюжетные ветки · кампании · временные игры/)
  assert.match(source, /Истории остаются с нами/)
  assert.doesNotMatch(source, /Новая история/)
  assert.doesNotMatch(source, /onOpenRoom\s*\(/)
})

test("stage 3 uses a panoramic hero, portrait story rail and two distinct list densities", async () => {
  const css = await readFile(stylePath, "utf8")

  assert.match(css, /\.chat-catalog__hero\s*\{[\s\S]*aspect-ratio:\s*2\.48 \/ 1/)
  assert.match(css, /\.chat-catalog__hero-media\s*\{[\s\S]*position:\s*absolute/)
  assert.match(css, /\.chat-catalog__personal-card\s*\{[\s\S]*flex:\s*0 0 108px/)
  assert.match(css, /\.chat-catalog__personal-media > \.chat-catalog__art\s*\{[\s\S]*border-radius:\s*999px/)
  assert.match(css, /\.chat-catalog__row--event\s*\{[\s\S]*min-height:\s*76px/)
  assert.match(css, /\.chat-catalog__row--completed\s*\{[\s\S]*min-height:\s*56px/)
  assert.match(css, /@media \(max-width: 390px\)/)
  assert.match(css, /@media \(max-width: 350px\)/)
})

test("stage 3 toolbar geometry survives later catalog interaction stages", async () => {
  const source = await readFile(pagePath, "utf8")

  assert.match(source, /aria-label="Поиск"/)
  assert.match(source, /aria-label="Фильтр"/)
  assert.match(source, /chat-catalog__toolbar-add/)
  assert.match(source, /\{canManage && \(/)
  assert.doesNotMatch(source, /onOpenRoom\s*\(/)
})
