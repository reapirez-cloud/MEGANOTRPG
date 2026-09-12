import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const home = fs.readFileSync("src/ui-v1/screens/HomeFoundation.tsx", "utf8")
const css = fs.readFileSync("src/ui-v1/screens/home-foundation.css", "utf8")
const dock = fs.readFileSync("src/ui-v1/shell/MeganotDock.tsx", "utf8")

test("Home uses six semantic section previews instead of generic cards", () => {
  for (const label of [
    "Что нового",
    "Мир",
    "Новости общества",
    "Достижения",
    "Арты",
    "Обновления",
  ]) {
    assert.match(home, new RegExp(label))
  }

  assert.match(home, /SectionPreview/)
  assert.doesNotMatch(home, /<Surface/)
})

test("section labels remain readable over arbitrary preview artwork", () => {
  assert.match(css, /mg-section-preview__scrim/)
  assert.match(css, /rgba\(3, 3, 5, \.9\)/)
  assert.match(css, /text-shadow:/)
  assert.match(css, /color: #fff/)
})

test("Dock order is Workspace 25, Home 50, Chats 25", () => {
  const workspaceIndex = dock.indexOf('{ id: "workspace", label: "Я" }')
  const homeIndex = dock.indexOf('{ id: "home", label: "Главная" }')
  const chatsIndex = dock.indexOf('{ id: "chats", label: "Чаты" }')

  assert.ok(workspaceIndex >= 0)
  assert.ok(homeIndex > workspaceIndex)
  assert.ok(chatsIndex > homeIndex)
})
