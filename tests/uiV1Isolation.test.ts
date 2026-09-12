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
const whatsNew = fs.readFileSync("src/ui-v1-isolated/WhatsNew.tsx", "utf8")
const chronicleData = fs.readFileSync("src/ui-v1-isolated/useChronicleData.ts", "utf8")
const chronicleStyles = fs.readFileSync("src/ui-v1-isolated/whats-new.css", "utf8")
const worldPreviewAsset = "public/ui-v1/world/world-preview.webp"
const sectionScreens = fs.readFileSync("src/ui-v1-isolated/SectionScreens.tsx", "utf8")
const sectionData = fs.readFileSync("src/ui-v1-isolated/useUiV1SectionData.ts", "utf8")
const sectionRegistry = fs.readFileSync("src/ui-v1-isolated/sectionRegistry.ts", "utf8")
const sectionStyles = fs.readFileSync("src/ui-v1-isolated/section-screens.css", "utf8")
const locationNavigator = fs.readFileSync("src/ui-v1-isolated/LocationNavigator.tsx", "utf8")
const locationData = fs.readFileSync("src/ui-v1-isolated/useUiV1Locations.ts", "utf8")

test("World preview artwork is committed with UI v1", () => {
  assert.equal(fs.existsSync(worldPreviewAsset), true)
  assert.ok(fs.statSync(worldPreviewAsset).size < 100_000)
})

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
  assert.doesNotMatch(app, /Главная\s*<br\s*\/>\s*картина/)
  assert.match(app, /Последние события/)
})

test("UI v1 routes real content sections without importing legacy screens", () => {
  for (const path of [
    "workspace",
    "chats",
    "whats-new",
    "world",
    "knowledge-base",
    "society-news",
    "achievements",
    "art",
    "updates",
  ]) {
    assert.match(app, new RegExp(path))
  }

  assert.match(app, /<WorldSectionScreen subsection=\{route\.subsection\} path=\{route\.tail\}/)
  assert.match(app, /<KnowledgeBaseScreen subsection=\{route\.subsection\}/)
  assert.match(app, /<SocietyNewsScreen \/>/)
  assert.match(app, /<AchievementsScreen \/>/)
  assert.doesNotMatch(app + sectionScreens, /src\/pages|components\/world|ReferenceGuide|CharacterContext/)
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

test("home uses mixed editorial entry types instead of a uniform preview grid", () => {
  assert.doesNotMatch(app, /function SectionPreview/)
  assert.doesNotMatch(app, /function WhatsNewHero/)
  assert.match(app, /function WorldPreview/)
  assert.match(app, /function KnowledgeBaseEntry/)
  assert.match(app, /function SocietyNewsEntry/)
  assert.match(app, /function AchievementEntry/)
  assert.match(app, /function ArtPreviewStrip/)
  assert.doesNotMatch(app, /go\("home\/updates"\)/)
  assert.match(styles, /min-height:\s*clamp\(138px, 34vw, 184px\)/)
  assert.match(styles, /\.u1-knowledge-entry/)
  assert.match(styles, /\.u1-editorial-entry/)
  assert.match(styles, /\.u1-art-entry__strip/)
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
  assert.match(styles, /nav-icons\/me\.png/)
  assert.match(styles, /nav-icons\/home\.png/)
  assert.match(styles, /nav-icons\/chats\.png/)
})

test("home puts campaign destinations before the compact recent-event stream", () => {
  const homeData = fs.readFileSync("src/ui-v1-isolated/useHomeData.ts", "utf8")
  assert.match(app, /<LatestEvents events=\{events\}/)
  assert.ok(app.indexOf('<section className="u1-home-sections"') < app.indexOf("<LatestEvents"))
  assert.ok(app.indexOf("<WorldPreview") < app.indexOf("<KnowledgeBaseEntry"))
  assert.ok(app.indexOf("<KnowledgeBaseEntry") < app.indexOf("<SocietyNewsEntry"))
  assert.doesNotMatch(app, /<WhatsNewHero/)
  assert.match(homeData, /from\("feed_items"\)/)
  assert.match(homeData, /neq\("source_type", "art"\)/)
  assert.match(homeData, /neq\("source_type", "update"\)/)
  assert.match(homeData, /from\("campaign_art_items"\)/)
  assert.match(homeData, /from\("achievements"\)/)
  assert.match(homeData, /cover_url/)
  assert.match(homeData, /postgres_changes/)
  assert.match(homeData, /meganotrpg:v1:campaign-id/)
})


test("Location navigator keeps the full ancestor chain and separates direct children from transitions", () => {
  assert.match(app, /tail: string\[\]/)
  assert.match(app, /\.\.\.tail/)
  assert.match(sectionScreens, /<LocationNavigator/)
  assert.match(locationNavigator, /u1-location-path/)
  assert.match(locationNavigator, /Подзоны/)
  assert.match(locationNavigator, /Переходы/)
  assert.match(locationNavigator, /location\.parent_location_id === selected\.id/)
  assert.match(locationNavigator, /source_location_id === selected\.id/)
  assert.match(locationNavigator, /layoutId=\{\`ui-v1-location:/)
  assert.match(sectionStyles, /u1-location-tile\[data-mode="child"\][\s\S]*?width:\s*90%/)
  assert.doesNotMatch(locationNavigator, /WorldMapView/)
})

test("Location management uses Oracle to reach Larisa and keeps manager actions extensible", () => {
  assert.match(locationData, /oracle\.world\.createLocation/)
  assert.match(locationData, /oracle\.world\.updateLocation/)
  assert.match(locationData, /oracle\.world\.deleteLocation/)
  assert.match(locationData, /oracle\.world\.createLocationSection/)
  assert.match(locationData, /oracle\.world\.createLocationLink/)
  assert.match(locationData, /createEngineCommandContext/)
  assert.match(locationData, /authority: "gm"/)
  assert.match(locationNavigator, /type LocationAction =/)
  assert.match(locationNavigator, /Открыть зону/)
  assert.match(locationNavigator, /Добавить подзону/)
  assert.match(locationNavigator, /Добавить переход/)
  assert.match(locationNavigator, /Редактировать/)
  assert.match(locationNavigator, /Удалить/)
  assert.match(locationNavigator, /managerOnly/)
})

test("Location previews support long press, a reserved detail icon seam and root-zone creation", () => {
  assert.match(locationNavigator, /}, 520\)/)
  assert.match(locationNavigator, /u1-location-open-button/)
  assert.match(locationNavigator, /\/detail/)
  assert.match(locationNavigator, /Добавить главную зону/)
  assert.match(sectionStyles, /u1-location-open-button__glyph/)
})

test("World and Knowledge Base use extensible registries and keep Map intentionally shallow", () => {
  assert.match(sectionRegistry, /worldHubSections/)
  assert.match(sectionRegistry, /knowledgeBaseSections/)
  assert.match(sectionRegistry, /id: "locations"/)
  assert.match(sectionRegistry, /id: "characters"/)
  assert.match(sectionRegistry, /id: "lore"/)
  assert.match(sectionRegistry, /id: "map"/)
  assert.match(sectionRegistry, /id: "spells"/)
  assert.match(sectionRegistry, /id: "classes"/)
  assert.match(sectionRegistry, /id: "invocations"/)
  assert.match(sectionRegistry, /id: "bestiary"/)
  assert.match(sectionScreens, /Саму карту сейчас намеренно не строим/)
  assert.doesNotMatch(sectionScreens, /WorldMapView/)
  assert.match(sectionStyles, /min-height:\s*clamp\(138px, 34vw, 184px\)/)
})

test("Achievements render as narrow title-only previews and remain character-linked", () => {
  assert.match(sectionData, /from\("achievements"\)/)
  assert.match(sectionData, /character_id/)
  assert.match(sectionScreens, /className="u1-achievement-tile"/)
  assert.match(sectionScreens, /<strong>\{item\.title\}<\/strong>/)
  assert.doesNotMatch(sectionScreens, /achievement.*description|Что даёт|За что получено/is)
  assert.match(sectionStyles, /min-height:\s*clamp\(82px, 23vw, 100px\)/)
})

test("Society News uses manager-only announcements backed by campaign_updates", () => {
  const homeData = fs.readFileSync("src/ui-v1-isolated/useHomeData.ts", "utf8")
  assert.match(sectionData, /from\("campaign_updates"\)/)
  assert.match(sectionData, /eq\("kind", "announcement"\)/)
  assert.match(sectionData, /membership\.role === "gm" \|\| membership\.is_owner === true/)
  assert.match(sectionScreens, /news\.canManage \? \(/)
  assert.match(sectionScreens, /aria-label="Новая публикация"/)
  assert.match(homeData, /from\("campaign_updates"\)/)
  assert.match(homeData, /eq\("kind", "announcement"\)/)
  assert.doesNotMatch(homeData, /gm_note|gm_post/)
})

test("What’s New is a real chronology screen rather than a placeholder", () => {
  assert.match(app, /route\.section === "whats-new"\) return <WhatsNew \/>/)
  assert.match(whatsNew, /Хроника кампании/)
  assert.match(whatsNew, /Что нового/)
  assert.match(whatsNew, /groupEvents/)
  assert.match(chronicleStyles, /position:\s*sticky/)
  assert.match(chronicleStyles, /grid-template-columns:\s*56px minmax\(0, 1fr\)/)
})

test("chronicle aggregates full non-art feed content and keeps future connection slots", () => {
  assert.match(chronicleData, /from\("feed_items"\)/)
  assert.match(chronicleData, /neq\("source_type", "art"\)/)
  assert.match(chronicleData, /title, body, media_url, published_at/)
  assert.match(chronicleData, /from\("characters"\)/)
  assert.match(chronicleData, /from\("profiles"\)/)
  assert.match(chronicleData, /from\("campaign_members"\)/)
  assert.match(chronicleData, /postgres_changes/)
  assert.doesNotMatch(whatsNew, /slice\(/)
  assert.match(whatsNew, /ChronicleSourceAction/)
  assert.match(whatsNew, /data-source-type/)
  assert.match(whatsNew, /gm_note/)
  assert.match(whatsNew, /zone/)
  assert.match(whatsNew, /npc/)
})


test("dock no longer references SVG navigation assets", () => {
  assert.doesNotMatch(styles, /nav-icons\/[^"')]+\.svg/)
  assert.match(styles, /nav-icons\/me\.png/)
  assert.match(styles, /nav-icons\/home\.png/)
  assert.match(styles, /nav-icons\/chats\.png/)
})


test("PNG navigation assets replace the SVG masks", () => {
  assert.match(styles, /nav-icons\/me\.png/)
  assert.match(styles, /nav-icons\/home\.png/)
  assert.match(styles, /nav-icons\/chats\.png/)
  assert.doesNotMatch(styles, /nav-icons\/(?:me|home|chats)\.svg/)
  assert.doesNotMatch(styles, /mask-image:\s*url\("\/ui-v1\/nav-icons\//)
})
