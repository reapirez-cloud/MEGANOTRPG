import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const html = fs.readFileSync("index.html", "utf8")
const aliasHtml = fs.readFileSync("ui-v1.html", "utf8")
const legacyHtml = fs.readFileSync("legacy.html", "utf8")
const entry = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const app = fs.readFileSync("src/ui-v1-isolated/UiV1App.tsx", "utf8")
const styles = fs.readFileSync("src/ui-v1-isolated/styles.css", "utf8")
const legacyApp = fs.readFileSync("src/App.tsx", "utf8")

test("UI v1 is now the default application entry", () => {
  assert.match(html, /src\/ui-v1-isolated\/main\.tsx/)
  assert.match(aliasHtml, /src\/ui-v1-isolated\/main\.tsx/)
  assert.match(legacyHtml, /src\/main\.tsx/)
  assert.match(entry, /\.\/UiV1App/)
  assert.match(entry, /\.\/styles\.css/)
  assert.doesNotMatch(entry + app, /\.\.\/App|pages\/|components\/app|CharacterContext/i)
})

test("UI v1 does not load the legacy stylesheet graph", () => {
  assert.doesNotMatch(entry + app + styles, /App\.css|social\.css|ui-v2\.css|gm-workspace\.css|character-profile/i)
})

test("legacy app does not import the isolated UI v1 tree", () => {
  assert.doesNotMatch(legacyApp, /ui-v1-isolated/)
})

test("UI v1 start page keeps the approved grayscale visual direction", () => {
  assert.match(styles, /--u1-canvas:\s*#090a0b/)
  assert.match(styles, /--u1-steel:/)
  assert.match(styles, /--u1-stone:/)
  assert.doesNotMatch(styles, /145, 104, 185|72, 105, 113|76, 122, 101/)
  assert.doesNotMatch(app, /Главная\s*<br\s*\/>\s*картина/)\n  assert.match(app, /Последние события/)
})

test("every deferred UI v1 destination has a stable placeholder route", () => {
  for (const path of [
    "workspace",
    "chats",
    "whats-new",
    "world",
    "society-news",
    "achievements",
    "art",
    "updates",
  ]) {
    assert.match(app, new RegExp(path))
  }

  assert.match(app, /function Placeholder/)
  assert.doesNotMatch(app, /<Feed|<World|<Chats|<GmWorkspace|<CharacterProfileV2/)
})


test("UI v1 dock has a raised central crown instead of a flat rectangular bar", () => {
  assert.match(app, /u1-dock__crown/)
  assert.match(styles, /\.u1-dock__crown/)
  assert.match(styles, /height:\s*78px/)
  assert.match(styles, /margin-top:\s*-11px/)
})


test("dock active state stays inside its own segment and mobile tap flash is disabled", () => {
  assert.doesNotMatch(app, /layoutId="ui-v1-dock-selection"/)
  assert.match(app, /initial=\{\{ opacity: 0, scale: 0\.96 \}\}/)
  assert.match(styles, /-webkit-tap-highlight-color:\s*transparent/)
})

test("home previews use the compact proportions and achievements label fits intentionally", () => {
  assert.match(styles, /min-height:\s*clamp\(218px, 58vw, 320px\)/)
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1\.2fr\) minmax\(0, 0\.8fr\)/)
  assert.match(styles, /\.u1-preview--achievements \.u1-preview__caption strong/)
  assert.match(styles, /white-space:\s*nowrap/)
})


test("root spaces support deliberate horizontal swipe navigation with soft haptics", () => {
  assert.match(app, /rootSpaceOrder: RootSpace\[\] = \["workspace", "home", "chats"\]/)
  assert.match(app, /horizontalDistance >= 54/)
  assert.match(app, /horizontalDistance > verticalDistance \* 1\.35/)
  assert.match(app, /onPointerDown=\{onPointerDown\}/)
  assert.match(app, /onPointerUp=\{finishSwipe\}/)
  assert.match(app, /impactOccurred\("soft"\)/)
  assert.match(app, /navigator\.vibrate\(8\)/)
  assert.match(styles, /touch-action:\s*pan-y/)
})

test("dock uses local glow instead of a selected-state frame", () => {
  assert.match(styles, /radial-gradient\(/)
  assert.match(styles, /text-shadow:\s*0 0 13px/)
  assert.match(styles, /data-active="home"/)
  assert.doesNotMatch(styles, /\.u1-dock__selection[\s\S]*?box-shadow:\s*inset 0 0 0 1px/)
})


test("dock navigation is icon-only and keeps accessible names", () => {
  assert.match(app, /aria-label=\{item\.label\}/)
  assert.match(app, /u1-dock__glyph/)
  assert.doesNotMatch(app, /u1-dock__label/)
  assert.match(styles, /nav-icons\/me\.svg/)
  assert.match(styles, /nav-icons\/home\.svg/)
  assert.match(styles, /nav-icons\/chats\.svg/)
})

test("home puts real latest events before section previews", () => {
  const homeData = fs.readFileSync("src/ui-v1-isolated/useHomeData.ts", "utf8")
  assert.match(app, /<LatestEvents events=\{events\}/)
  assert.ok(app.indexOf("<LatestEvents") < app.indexOf('<section className="u1-grid"'))
  assert.match(homeData, /from\("feed_items"\)/)
  assert.match(homeData, /neq\("source_type", "art"\)/)
  assert.match(homeData, /postgres_changes/)
  assert.match(homeData, /meganotrpg:v1:campaign-id/)
})
