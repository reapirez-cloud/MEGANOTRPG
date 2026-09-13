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
const snakeProvider = fs.readFileSync("src/ui-v1-isolated/SnakeProvider.tsx", "utf8")
const snakeTypes = fs.readFileSync("src/snake-engine/types.ts", "utf8")
const snakeAgent = fs.readFileSync("src/snake-engine/agent.ts", "utf8")
const locationSnakeActions = fs.readFileSync("src/ui-v1-isolated/locationSnakeActions.ts", "utf8")
const snakeStyles = fs.readFileSync("src/ui-v1-isolated/snake.css", "utf8")
const currentStateDoc = fs.readFileSync("docs/UI_V1_CURRENT_STATE_2026-09-13.md", "utf8")
const historicalIsolationDoc = fs.readFileSync("docs/UI_V1_HARD_ISOLATION_2026-09-12.md", "utf8")
const historicalFoundationDoc = fs.readFileSync("docs/UI_V1_STAGE_02_FOUNDATION_2026-09-12.md", "utf8")
const historicalVisualDirectionDoc = fs.readFileSync("docs/UI_V1_VISUAL_DIRECTION_2026-09-12.md", "utf8")
const characterUxAuditDoc = fs.readFileSync("docs/CHARACTER_UX_REDESIGN_AUDIT.md", "utf8")

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


test("UI v1 dock is an ultra-thin floating glass rail instead of a conventional tab bar", () => {
  assert.match(app, /u1-dock__glass/)
  assert.doesNotMatch(app, /u1-dock__crown|u1-dock__hull/)
  assert.match(styles, /\.u1-dock__glass/)
  assert.match(styles, /height:\s*18px/)
  assert.match(styles, /height:\s*44px/)
  assert.match(styles, /backdrop-filter:\s*blur\(12px\)/)
})


test("dock active state is carried only by PNG light and never by a detached filament", () => {
  assert.doesNotMatch(app + styles, /u1-dock__filament|layoutId="ui-v1-dock-selection"/)
  assert.match(styles, /drop-shadow\(0 0 3px rgba\(220, 233, 238, 0\.72\)\)/)
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

test("dock uses cold PNG glow instead of a selected-state bubble or line", () => {
  assert.match(styles, /drop-shadow\(0 0 9px rgba\(202, 220, 226, 0\.24\)\)/)
  assert.doesNotMatch(styles, /\.u1-dock__selection|\.u1-dock__crown|\.u1-dock__filament/)
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
  assert.match(locationNavigator, /Вложенные локации/)
  assert.match(locationNavigator, /Переходы/)
  assert.match(locationNavigator, /location\.parent_location_id === selected\.id/)
  assert.match(locationNavigator, /source_location_id === selected\.id/)
  assert.match(locationNavigator, /layoutId=\{\`ui-v1-location:/)
  assert.match(sectionStyles, /u1-location-tile\[data-mode="child"\][\s\S]*?width:\s*90%/)
  assert.doesNotMatch(locationNavigator, /WorldMapView/)
})

test("Location management now supplies actions to Snake and remains placeholder-only", () => {
  assert.doesNotMatch(locationData, /oracle\.world|createEngineCommandContext/)
  assert.doesNotMatch(locationNavigator, /LocationEditorSheet|TransitionEditorSheet|DeleteLocationSheet/)
  assert.match(locationNavigator, /SnakeTrigger/)
  assert.match(locationNavigator, /createLocationSnakeActions/)
  assert.match(locationSnakeActions, /Открыть локацию/)
  assert.match(locationSnakeActions, /Добавить вложенную локацию/)
  assert.match(locationSnakeActions, /Добавить переход/)
  assert.match(locationSnakeActions, /Редактировать/)
  assert.match(locationSnakeActions, /Удалить/)
  assert.match(locationSnakeActions, /kind: "placeholder"/)
  assert.doesNotMatch(snakeProvider, /if \(.*location|switch \(.*type/is)
})

test("Snake owns long press, right click, duplicate suppression and universal windows", () => {
  assert.match(entry, /SnakeProvider/)
  assert.match(entry, /\.\/snake\.css/)
  assert.match(snakeProvider, /window\.setTimeout\(\(\) =>/)
  assert.match(snakeProvider, /}, 520\)/)
  assert.match(snakeProvider, /consumedUntilRef/)
  assert.match(snakeProvider, /onContextMenu=\{contextMenu\}/)
  assert.match(snakeProvider, /Math\.hypot/)
  assert.match(snakeProvider, /createPortal/)
  assert.match(snakeProvider, /kind === "editor"/)
  assert.match(snakeProvider, /kind === "picker"/)
  assert.match(snakeProvider, /kind === "confirm"/)
  assert.match(snakeProvider, /kind === "placeholder"/)
  assert.match(snakeProvider, /SnakeFlowWindow/)
  assert.match(snakeProvider, /data-width=\{size\.width\}/)
  assert.match(snakeProvider, /data-height=\{size\.height\}/)
  assert.match(snakeTypes, /type SnakeSurfaceRequest/)
  assert.match(snakeTypes, /type SnakeFlowRequest/)
  assert.match(snakeTypes, /type SnakeFlowStep/)
  assert.match(snakeTypes, /"compact"[\s\S]*?"wide"[\s\S]*?"full"/)
  assert.match(snakeAgent, /class SnakeAgent/)
  assert.match(snakeStyles, /\.u1-snake-menu/)
  assert.match(snakeStyles, /\.u1-snake-window/)
  assert.match(snakeStyles, /data-width="compact"/)
  assert.match(snakeStyles, /data-width="wide"/)
  assert.match(snakeStyles, /data-height="full"/)
  assert.match(snakeStyles, /u1-snake-flow-step/)
  assert.doesNotMatch(locationNavigator, /timerRef|LocationInlineMenu|toggleActions|onContextMenu/)
  assert.doesNotMatch(sectionStyles, /u1-location-inline-menu|u1-location-inline-placeholder/)
})

test("World and Knowledge Base use extensible registries and keep Map intentionally shallow", () => {
  assert.match(sectionRegistry, /worldHubSections/)
  assert.match(sectionRegistry, /knowledgeBaseSections/)
  assert.match(sectionRegistry, /id: "locations", title: "Локации"/)
  assert.match(sectionRegistry, /id: "characters", title: "Персонажи"/)
  assert.match(locationNavigator, /<h1>Локации<\/h1>/)
  assert.match(sectionData, /eq\("character_type", "npc"\)/)
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

test("Society News reads campaign_updates but publishes through Oracle -> Larisa", () => {
  const homeData = fs.readFileSync("src/ui-v1-isolated/useHomeData.ts", "utf8")
  assert.match(sectionData, /from\("campaign_updates"\)/)
  assert.match(sectionData, /eq\("kind", "announcement"\)/)
  assert.match(sectionData, /membership\.role === "gm" \|\| membership\.is_owner === true/)
  assert.match(sectionData, /createEngineCommandContext/)
  assert.match(sectionData, /oracle\.world\.publishCampaignAnnouncement/)
  assert.doesNotMatch(sectionData, /from\("campaign_updates"\)[\s\S]{0,220}\.insert\(/)
  assert.match(sectionScreens, /news\.canManage \? \(/)
  assert.match(sectionScreens, /aria-label="Новая публикация"/)
  assert.match(homeData, /from\("campaign_updates"\)/)
  assert.match(homeData, /eq\("kind", "announcement"\)/)
  assert.doesNotMatch(homeData, /gm_note|gm_post/)
})


test("UI v1 documentation has one explicit current-state authority", () => {
  assert.match(currentStateDoc, /CANONICAL CURRENT STATE/)
  assert.match(currentStateDoc, /Локации \/ Персонажи \/ Лор \/ Карта/)
  assert.match(currentStateDoc, /index\.html -> src\/ui-v1-isolated\/main\.tsx/)
  assert.match(currentStateDoc, /Snake core is implemented and Locations are migrated to it/is)
  assert.match(historicalIsolationDoc, /SUPERSEDED HISTORICAL RECORD/)
  assert.match(historicalFoundationDoc, /PARTIALLY INVALIDATED BY THE HARD-ISOLATION RESET/)
  assert.match(historicalVisualDirectionDoc, /PARTIALLY SUPERSEDED DESIGN DIRECTION/)
  assert.match(historicalVisualDirectionDoc, /old dominant .*Что нового.* no longer/is)
  assert.match(characterUxAuditDoc, /DEFERRED REDESIGN AUDIT/)
  assert.match(characterUxAuditDoc, /not an instruction to start that work now/i)
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


test("dock uses the unified navigation asset family", () => {
  assert.match(styles, /nav-icons\/me\.png/)
  assert.match(styles, /nav-icons\/home\.png/)
  assert.match(styles, /nav-icons\/chats\.png/)
  assert.doesNotMatch(styles, /nav-icons\/(?:me|home|chats)\.svg/)
})


test("navigation assets render directly without legacy SVG masks", () => {
  assert.match(styles, /nav-icons\/me\.png/)
  assert.match(styles, /nav-icons\/home\.png/)
  assert.match(styles, /nav-icons\/chats\.png/)
  assert.doesNotMatch(styles, /mask-image:\s*url\("\/ui-v1\/nav-icons\//)
})
