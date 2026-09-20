import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const html = fs.readFileSync("index.html", "utf8")
const aliasHtml = fs.readFileSync("ui-v1.html", "utf8")
const entry = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const app = fs.readFileSync("src/ui-v1-isolated/UiV1App.tsx", "utf8")
const styles = fs.readFileSync("src/ui-v1-isolated/styles.css", "utf8")
const workspace = fs.readFileSync("src/ui-v1-isolated/Workspace.tsx", "utf8")
const workspaceData = fs.readFileSync("src/ui-v1-isolated/useWorkspaceData.ts", "utf8")
const workspaceStyles = fs.readFileSync("src/ui-v1-isolated/workspace.css", "utf8")
const workspaceIdentityRules = fs.readFileSync("src/ui-v1-isolated/workspaceIdentityRules.ts", "utf8")
const agentShell = fs.readFileSync("src/ai/AgentShell.tsx", "utf8")
const whatsNew = fs.readFileSync("src/ui-v1-isolated/WhatsNew.tsx", "utf8")
const chronicleData = fs.readFileSync("src/ui-v1-isolated/useChronicleData.ts", "utf8")
const chronicleStyles = fs.readFileSync("src/ui-v1-isolated/whats-new.css", "utf8")
const approvedPanelAssets = [
  "public/ui-v1/panels/world.webp",
  "public/ui-v1/panels/world-locations.webp",
  "public/ui-v1/panels/world-characters.webp",
  "public/ui-v1/panels/world-lore.webp",
  "public/ui-v1/panels/art.webp",
  "public/ui-v1/panels/kb-spells.webp",
  "public/ui-v1/panels/kb-classes.webp",
  "public/ui-v1/panels/kb-invocations.webp",
  "public/ui-v1/panels/kb-bestiary.webp",
  "public/ui-v1/panels/kb-chaos.webp",
]
const approvedClassPanelAssets = [
  "public/ui-v1/classes/fighter.webp",
  "public/ui-v1/classes/warlock.webp",
  "public/ui-v1/classes/cleric.webp",
  "public/ui-v1/classes/druid.webp",
  "public/ui-v1/classes/bard.webp",
  "public/ui-v1/classes/paladin.webp",
  "public/ui-v1/classes/sorcerer.webp",
  "public/ui-v1/classes/wizard.webp",
  "public/ui-v1/classes/rogue.webp",
  "public/ui-v1/classes/monk.webp",
]
const approvedNavAssets = [
  "public/ui-v1/nav-icons/character.png",
  "public/ui-v1/nav-icons/home.png",
  "public/ui-v1/nav-icons/chats.png",
]
const sectionScreens = fs.readFileSync("src/ui-v1-isolated/SectionScreens.tsx", "utf8")
const classReferencePresentation = fs.readFileSync("src/ui-v1-isolated/classReferencePresentation.ts", "utf8")
const sectionData = fs.readFileSync("src/ui-v1-isolated/useUiV1SectionData.ts", "utf8")
const sectionRegistry = fs.readFileSync("src/ui-v1-isolated/sectionRegistry.ts", "utf8")
const sectionStyles = fs.readFileSync("src/ui-v1-isolated/section-screens.css", "utf8")
const locationNavigator = fs.readFileSync("src/ui-v1-isolated/LocationNavigator.tsx", "utf8")
const locationData = fs.readFileSync("src/ui-v1-isolated/useUiV1Locations.ts", "utf8")
const snakeProvider = fs.readFileSync("src/ui-v1-isolated/SnakeProvider.tsx", "utf8")
const snakeMenuRuntime = fs.readFileSync("src/ui-v1-isolated/snake/menuRuntime.ts", "utf8")
const snakeContextMenu = fs.readFileSync("src/ui-v1-isolated/snake/interaction/SnakeContextMenu.tsx", "utf8")
const snakeTrigger = fs.readFileSync("src/ui-v1-isolated/snake/interaction/SnakeTrigger.tsx", "utf8")
const snakePositioning = fs.readFileSync("src/ui-v1-isolated/snake/interaction/positioning.ts", "utf8")
const snakeEditorSurface = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeEditorSurface.tsx", "utf8")
const snakePickerSurface = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakePickerSurface.tsx", "utf8")
const snakeWindowFrame = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeWindowFrame.tsx", "utf8")
const snakeFlowWindow = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeFlowWindow.tsx", "utf8")
const snakeSingleWindow = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeSingleWindow.tsx", "utf8")
const snakeWindowHost = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeWindowHost.tsx", "utf8")
const snakeUiRuntime = [
  snakeProvider,
  snakeMenuRuntime,
  snakeContextMenu,
  snakeTrigger,
  snakePositioning,
  snakeEditorSurface,
  snakePickerSurface,
  snakeWindowFrame,
  snakeFlowWindow,
  snakeSingleWindow,
  snakeWindowHost,
].join("\n")
const snakeTypes = fs.readFileSync("src/snake-engine/types.ts", "utf8")
const snakeAgent = fs.readFileSync("src/snake-engine/agent.ts", "utf8")
const locationSnakeActions = fs.readFileSync("src/ui-v1-isolated/locationSnakeActions.ts", "utf8")
const characterSnakeActions = fs.readFileSync("src/ui-v1-isolated/characterSnakeActions.ts", "utf8")
const snakeStyles = fs.readFileSync("src/ui-v1-isolated/snake.css", "utf8")
const currentStateDoc = fs.readFileSync("docs/UI_V1_CURRENT_STATE_2026-09-13.md", "utf8")
const historicalIsolationDoc = fs.readFileSync("docs/UI_V1_HARD_ISOLATION_2026-09-12.md", "utf8")
const historicalFoundationDoc = fs.readFileSync("docs/UI_V1_STAGE_02_FOUNDATION_2026-09-12.md", "utf8")
const historicalVisualDirectionDoc = fs.readFileSync("docs/UI_V1_VISUAL_DIRECTION_2026-09-12.md", "utf8")
const characterUxAuditDoc = fs.readFileSync("docs/CHARACTER_UX_REDESIGN_AUDIT.md", "utf8")

test("approved UI v1 panel artwork is committed and lightweight", () => {
  for (const asset of approvedPanelAssets) {
    assert.equal(fs.existsSync(asset), true, asset)
    assert.ok(fs.statSync(asset).size < 20_000, asset)
  }
})

test("approved class preview artwork is committed for the supplied class cards", () => {
  for (const asset of approvedClassPanelAssets) {
    assert.equal(fs.existsSync(asset), true, asset)
    assert.ok(fs.statSync(asset).size < 100_000, asset)
  }
})

test("approved navigation PNG artwork is committed and lightweight", () => {
  for (const asset of approvedNavAssets) {
    assert.equal(fs.existsSync(asset), true, asset)
    assert.ok(fs.statSync(asset).size < 10_000, asset)
  }
})

test("legacy application surface is physically removed", () => {
  assert.equal(fs.existsSync("legacy.html"), false)
  assert.equal(fs.existsSync("src/main.tsx"), false)
  assert.equal(fs.existsSync("src/App.tsx"), false)
  assert.equal(fs.existsSync("src/App.css"), false)
  assert.equal(fs.existsSync("src/components/app/BottomNav.tsx"), false)
})

test("UI v1 is now the default application entry", () => {
  assert.match(html, /src\/ui-v1-isolated\/main\.tsx/)
  assert.match(aliasHtml, /src\/ui-v1-isolated\/main\.tsx/)
  assert.match(entry, /\.\/UiV1App/)
  assert.match(entry, /\.\/styles\.css/)
  assert.doesNotMatch(entry + app, /\.\.\/App|pages\/|components\/app|CharacterContext/i)
})

test("UI v1 does not load the legacy stylesheet graph", () => {
  assert.doesNotMatch(entry + app + styles, /App\.css|social\.css|ui-v2\.css|gm-workspace\.css|character-profile/i)
})

test("canonical UI v1 has no legacy application fallback", () => {
  assert.doesNotMatch(entry + app + styles, /legacy\.html|src\/main\.tsx|src\/App\.tsx/)
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


test("UI v1 dock is a maximally thin edge-to-edge bottom navigation bar", () => {
  assert.doesNotMatch(app + styles, /u1-dock__glass|backdrop-filter:\s*blur\(12px\)/)
  assert.match(styles, /--u1-dock-height:\s*44px/)
  assert.match(styles, /\.u1-dock \{[\s\S]*?left:\s*0;[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;/)
  assert.match(styles, /border-top:\s*1px solid/)
  assert.match(styles, /min-height:\s*44px/)
})


test("dock active state is restrained and does not resurrect the floating glass treatment", () => {
  assert.match(styles, /\.u1-dock__item\[data-selected\]/)
  assert.match(styles, /\.u1-dock__item\[data-selected\] \.u1-dock__icon/)
  assert.doesNotMatch(styles, /\.u1-dock__item\[data-selected\]::before/)
  assert.doesNotMatch(app + styles, /u1-dock__glass|u1-dock__filament|layoutId="ui-v1-dock-selection"/)
  assert.doesNotMatch(styles, /\.u1-dock::after|left 230ms cubic-bezier|filter:\s*blur\(1\.6px\)/)
})

test("home uses mixed editorial entry types instead of a uniform preview grid", () => {
  assert.doesNotMatch(app, /function SectionPreview/)
  assert.doesNotMatch(app, /function WhatsNewHero/)
  assert.match(app, /function WorldPreview/)
  assert.match(app, /function KnowledgeBaseEntry/)
  assert.match(app, /function SocietyNewsEntry/)
  assert.match(app, /function AchievementEntry/)
  assert.match(app, /function ArtEntry/)
  assert.doesNotMatch(app, /ArtPreviewStrip|artPreviews/)
  assert.doesNotMatch(app, /go\("home\/updates"\)/)
  assert.match(styles, /min-height:\s*clamp\(138px, 34vw, 184px\)/)
  assert.match(styles, /\.u1-knowledge-entry/)
  assert.match(styles, /\.u1-editorial-entry/)
  assert.match(styles, /\.u1-art-entry__copy/)
  assert.match(app, /\/ui-v1\/panels\/art\.webp/)
})


test("the five supplied artworks are wired to World, Locations, Characters, Lore and Art", () => {
  assert.match(app, /\/ui-v1\/panels\/world\.webp/)
  assert.match(app, /\/ui-v1\/panels\/art\.webp/)
  assert.match(sectionRegistry, /image: "\/ui-v1\/panels\/world-locations\.webp"/)
  assert.match(sectionRegistry, /image: "\/ui-v1\/panels\/world-characters\.webp"/)
  assert.match(sectionRegistry, /image: "\/ui-v1\/panels\/world-lore\.webp"/)
  assert.match(sectionScreens, /className="u1-hub-card__image"/)
  assert.match(sectionStyles, /\.u1-hub-card__image/)
})

test("the five supplied Knowledge Base artworks are wired to their exact panels", () => {
  assert.match(sectionRegistry, /id: "spells"[\s\S]*?image: "\/ui-v1\/panels\/kb-spells\.webp"/)
  assert.match(sectionRegistry, /id: "classes"[\s\S]*?image: "\/ui-v1\/panels\/kb-classes\.webp"/)
  assert.match(sectionRegistry, /id: "invocations"[\s\S]*?image: "\/ui-v1\/panels\/kb-invocations\.webp"/)
  assert.match(sectionRegistry, /id: "bestiary"[\s\S]*?image: "\/ui-v1\/panels\/kb-bestiary\.webp"/)
  assert.match(sectionRegistry, /id: "chaos"[\s\S]*?image: "\/ui-v1\/panels\/kb-chaos\.webp"[\s\S]*?state: "placeholder"/)
})

test("root navigation gestures stay on the bottom bar instead of hijacking the screen edge", () => {
  assert.doesNotMatch(app, /event\.clientX <= 26|restoreAfterBackRef|scrollPositionsRef|currentScrollRoot/)
  assert.match(app, /className="u1-dock"[\s\S]*?onPointerDown=\{onPointerDown\}/)
  assert.match(app, /className="u1-dock"[\s\S]*?onPointerUp=\{finishSwipe\}/)
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

test("dock selection stays icon-only without a redundant hairline accent", () => {
  assert.match(styles, /\.u1-dock__item\[data-selected\]\s*\{[\s\S]*?color:/)
  assert.match(styles, /\.u1-dock__item\[data-selected\] \.u1-dock__icon\s*\{[\s\S]*?opacity:\s*1/)
  assert.doesNotMatch(styles, /\.u1-dock__item\[data-selected\]::before/)
  assert.doesNotMatch(styles, /data-active="home"|data-active="chats"|left 230ms cubic-bezier/)
})


test("dock uses only the approved transparent PNG icons while keeping accessible names", () => {
  assert.match(app, /aria-label=\{item\.label\}/)
  assert.match(app, /\/ui-v1\/nav-icons\/character\.png/)
  assert.match(app, /\/ui-v1\/nav-icons\/home\.png/)
  assert.match(app, /\/ui-v1\/nav-icons\/chats\.png/)
  assert.match(app, /className="u1-dock__icon"/)
  assert.doesNotMatch(app + styles, /u1-dock__label/)
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
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
  assert.doesNotMatch(homeData, /from\("campaign_art_items"\)|artPreviews|refreshArtPreviews/)
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
  assert.match(locationNavigator, /u1-entity-detail/)
  assert.match(locationNavigator, /world\.sections\.filter/)
  assert.match(locationNavigator, /location\.description/)
  assert.match(sectionStyles, /\.u1-entity-detail__hero/)
  assert.match(sectionStyles, /\.u1-entity-detail__section/)
})

test("Location management executes real Larisa commands through Snake", () => {
  assert.match(locationData, /oracle\.world/)
  assert.match(locationData, /createEngineCommandContext/)
  assert.doesNotMatch(locationNavigator, /LocationEditorSheet|TransitionEditorSheet|DeleteLocationSheet/)
  assert.match(locationNavigator, /SnakeTrigger/)
  assert.match(locationNavigator, /createLocationSnakeActions/)
  assert.match(locationNavigator, /createLocationCreateAction/)
  assert.match(locationSnakeActions, /Открыть локацию/)
  assert.match(locationSnakeActions, /Добавить вложенную локацию/)
  assert.match(locationSnakeActions, /Добавить переход/)
  assert.match(locationSnakeActions, /Редактировать/)
  assert.match(locationSnakeActions, /В архив/)
  assert.match(locationSnakeActions, /Удалить навсегда/)
  assert.doesNotMatch(locationSnakeActions, /kind: "placeholder"/)
  assert.match(locationData, /oracle\.world\.createLocation/)
  assert.match(locationData, /oracle\.world\.updateLocation/)
  assert.match(locationData, /oracle\.world\.createLocationLink/)
  assert.match(locationData, /oracle\.world\.updateLocationLink/)
  assert.match(locationData, /oracle\.world\.deleteLocationLink/)
  assert.match(locationNavigator, /createLocationTransitionActions/)
  assert.match(locationSnakeActions, /id: "edit-transition"/)
  assert.match(locationSnakeActions, /id: "delete-transition"/)
  assert.match(locationData, /oracle\.world\.setLocationArchived/)
  assert.match(locationData, /oracle\.world\.deleteLocation/)
  assert.doesNotMatch(snakeProvider, /if \(.*location|switch \(.*type/is)
})

test("Snake UI runtime is split into orchestration, interaction and reusable surfaces", () => {
  assert.match(snakeProvider, /SnakeContextMenu/)
  assert.match(snakeProvider, /SnakeWindowHost/)
  assert.doesNotMatch(snakeProvider, /window\.setTimeout|createPortal|kind === "editor"|Math\.hypot/)
  assert.match(snakeTrigger, /window\.setTimeout/)
  assert.match(snakeTrigger, /consumedUntilRef/)
  assert.match(snakeContextMenu, /createPortal/)
  assert.match(snakePositioning, /positionSnakeMenu/)
  assert.match(snakeEditorSurface, /SnakeEditorSurface/)
  assert.match(snakePickerSurface, /SnakePickerSurface/)
  assert.match(snakeFlowWindow, /SnakeFlowWindow/)
  assert.match(snakeSingleWindow, /SnakeSingleWindow/)
  assert.match(snakeWindowHost, /createPortal/)
  assert.match(snakeProvider, /useSnakeMenuRuntime/)
  assert.match(snakeProvider, /setViewContext/)
  assert.match(snakeProvider, /"snake-menu"/)
  assert.match(snakeProvider, /"snake-surface"/)
  assert.match(snakeProvider, /<SnakeContext\.Provider/)
})

test("Snake owns long press, right click, duplicate suppression and universal windows", () => {
  assert.match(entry, /SnakeProvider/)
  assert.match(entry, /\.\/snake\.css/)
  assert.match(snakeUiRuntime, /window\.setTimeout\(\(\) =>/)
  assert.match(snakeUiRuntime, /const longPressMs = 520/)
  assert.match(snakeUiRuntime, /}, longPressMs\)/)
  assert.match(snakeUiRuntime, /consumedUntilRef/)
  assert.match(snakeUiRuntime, /onContextMenu=\{contextMenu\}/)
  assert.match(snakeUiRuntime, /Math\.hypot/)
  assert.match(snakeUiRuntime, /--u1-snake-origin-x/)
  assert.match(snakeUiRuntime, /point\.x - position\.x/)
  assert.match(snakeUiRuntime, /createPortal/)
  assert.match(snakeUiRuntime, /kind === "editor"/)
  assert.match(snakeUiRuntime, /kind === "picker"/)
  assert.match(snakeUiRuntime, /kind === "confirm"/)
  assert.match(snakeUiRuntime, /kind === "placeholder"/)
  assert.match(snakeUiRuntime, /SnakeFlowWindow/)
  assert.match(snakeUiRuntime, /data-width=\{size\.width\}/)
  assert.match(snakeUiRuntime, /data-height=\{size\.height\}/)
  assert.match(snakeTypes, /type SnakeSurfaceRequest/)
  assert.match(snakeTypes, /type SnakeFlowRequest/)
  assert.match(snakeTypes, /type SnakeFlowStep/)
  assert.match(snakeTypes, /"compact"[\s\S]*?"wide"[\s\S]*?"full"/)
  assert.match(snakeAgent, /class SnakeAgent/)
  assert.match(snakeAgent, /resolveBranch/)
  assert.match(snakeMenuRuntime, /resolveBranch/)
  assert.match(snakeMenuRuntime, /frames\.slice\(0, -1\)/)
  assert.match(snakeTypes, /SnakeActionPathEntry/)
  assert.match(snakeTypes, /SnakeBranchResolver/)
  assert.match(snakeMenuRuntime, /frames:/)
  assert.match(snakeContextMenu, /data-branch/)
  assert.match(snakeStyles, /\.u1-snake-menu/)
  assert.match(snakeStyles, /\.u1-snake-window/)
  assert.match(snakeStyles, /data-width="compact"/)
  assert.match(snakeStyles, /data-width="wide"/)
  assert.match(snakeStyles, /data-height="full"/)
  assert.match(snakeStyles, /u1-snake-flow-step/)
  assert.match(snakeStyles, /transform-origin:[\s\S]*?--u1-snake-origin-x/)
  assert.match(snakeStyles, /clip-path: inset\(44% 44% 44% 44% round 6px\)/)
  assert.match(snakeStyles, /u1-snake-window-ignite/)
  assert.match(snakeStyles, /width 220ms cubic-bezier/)
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
  assert.match(app, /route\.section === "whats-new"\) return <WhatsNew(?:\s+onBack=\{[^\n]+\})? \/>/)
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


test("dock depends only on the current three navigation PNG assets", () => {
  for (const asset of approvedNavAssets) {
    assert.equal(fs.existsSync(asset), true, asset)
  }
  assert.match(app, /nav-icons\/character\.png/)
  assert.match(app, /nav-icons\/home\.png/)
  assert.match(app, /nav-icons\/chats\.png/)
  assert.doesNotMatch(app + styles, /nav-icons\/me\.|nav-icons\/.*\.svg/)
})


test("Workspace is a real role-aware identity surface instead of a dashboard placeholder", () => {
  assert.match(app, /<Workspace/)
  assert.match(app, /workspace\/character\//)
  assert.match(app, /workspace\/manage/)
  assert.match(workspace, /Кто говорит сейчас/)
  assert.match(workspace, /Мои персонажи/)
  assert.match(workspace, /Рассказчик/)
  assert.match(workspace, /Голос мира/)
  assert.match(workspace, /Управление/)
  assert.match(workspace, /Персонажи игроков/)
  assert.match(workspace, /function CharacterShelf/)
  assert.match(workspace, /defaultOpen=\{!data\.canManage\}/)
  assert.match(workspaceData, /from\("campaign_members"\)/)
  assert.match(workspaceData, /from\("characters"\)/)
  assert.match(workspaceData, /life_state/)
  assert.match(workspaceData, /from\("campaign_members"\)/)
  assert.match(workspaceData, /active_character_id/)
  assert.match(workspaceData, /membership\?\.role === "gm" \|\| membership\?\.is_owner === true/)
  assert.match(workspaceData, /meganotrpg:v1:speaking-identity:/)
  assert.doesNotMatch(workspaceData, /set_campaign_active_character|chat_actor_bindings/)
  assert.match(workspaceStyles, /grid-template-columns:\s*minmax\(0, 7fr\) minmax\(96px, 3fr\)/)
  assert.match(workspaceStyles, /min-height:\s*clamp\(150px, 29vh, 226px\)/)
})

test("global AgentMark replaces the inactive VI profile placeholder", () => {
  assert.doesNotMatch(app, /PlayerProfileMark/)
  assert.match(app, /<AgentShell \/>/)
  assert.match(agentShell, /className="u1-agent-orb"/)
  assert.match(agentShell, /\`Свернуть \$\{assistantName\}\`/)
  assert.match(agentShell, /\`\$\{assistantName\} работает в фоне\`/)
  assert.match(agentShell, /\`Открыть \$\{assistantName\}\`/)
})


test("Snake touch context menu cannot bypass the long-press threshold", () => {
  const snakeTrigger = fs.readFileSync("src/ui-v1-isolated/snake/interaction/SnakeTrigger.tsx", "utf8")
  const snakeContract = fs.readFileSync("docs/SNAKE_INTERACTION_CONTRACT.md", "utf8")
  assert.match(snakeTrigger, /const longPressMs = 520/)
  assert.match(snakeTrigger, /touchGestureRef/)
  assert.match(snakeTrigger, /lastMousePointerDownRef/)
  assert.match(snakeTrigger, /if \(isRecentTouch\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?return/)
  assert.match(snakeTrigger, /hasRecentMousePointer/)
  assert.match(snakeTrigger, /if \(!hasRecentMousePointer\)/)
  assert.match(snakeTrigger, /const wasPendingLongPress = timerRef\.current !== null/)
  assert.match(snakeTrigger, /touchGestureRef\.current\.cancelled = true/)
  assert.match(snakeTrigger, /useEffect\(\(\) => \{[\s\S]*?window\.clearTimeout/)
  assert.match(snakeContract, /contextmenu.*never sufficient evidence.*long press/i)
})

test("Workspace stats expand locally while character long-press uses dynamic Snake branches", () => {
  assert.match(workspaceData, /from\("character_sheets"\)/)
  assert.match(workspaceData, /skill_proficiencies/)
  assert.match(workspaceData, /Скрытность/)
  assert.match(workspace, /u1-active-identity__stats/)
  assert.match(workspace, /u1-active-identity__stat-reveal/)
  assert.match(workspace, /aria-expanded=\{open\}/)
  assert.match(workspace, /<SnakeTrigger/)
  assert.match(workspace, /createCharacterSnakeActions/)
  assert.match(characterSnakeActions, /label: "Аватар"/)
  assert.match(characterSnakeActions, /kind: "branch"/)
  assert.match(characterSnakeActions, /Аватар персонажа/)
  assert.match(characterSnakeActions, /Аватар панели/)
  assert.doesNotMatch(workspace, /window\.setTimeout|onContextMenu|timerRef/)
  assert.match(workspaceStyles, /u1-active-identity__stats/)
  assert.match(workspaceStyles, /u1-active-identity__stat-reveal/)
})


test("Workspace protects player character ownership and separates view-only party PCs from speaker choices", () => {
  assert.match(workspace, /Персонажи игроков/)
  assert.match(workspace, /Мои персонажи/)
  assert.match(workspace, /Персонажи мира/)
  assert.match(workspace, /data-dead/)
  assert.match(workspaceData, /playerCharacters/)
  assert.match(workspaceData, /ownCharacters/)
  assert.match(workspaceData, /worldSpeakerCharacters/)
  assert.match(workspaceData, /canSelectWorkspaceSpeaker/)
  assert.match(workspaceData, /activeOtherPlayerCharacterIds/)
  assert.match(workspaceIdentityRules, /assignedUserId !== currentUserId/)
  assert.match(workspaceIdentityRules, /characterType === "npc" && character\.assignedUserId === null/)
  assert.match(workspaceIdentityRules, /lifeState !== "alive"/)
  assert.match(workspaceStyles, /u1-character-shelf/)
  assert.match(workspaceStyles, /u1-actor-strip\[data-dead\]/)
})


test("Knowledge Base classes use panoramic 3:1 art-ready panels", () => {
  assert.match(sectionScreens, /function ClassCatalogPanels/)
  assert.match(sectionScreens, /\/ui-v1\/classes\/\$\{entry\.id\}\.webp/)
  assert.match(sectionScreens, /className="u1-class-panel__image"/)
  assert.match(sectionScreens, /subsection === "classes"[\s\S]*?<ClassCatalogPanels/)
  assert.match(sectionStyles, /\.u1-class-panel/)
  assert.match(sectionStyles, /aspect-ratio:\s*3\s*\/\s*1/)
  assert.match(sectionStyles, /object-fit:\s*cover/)
})

test("Knowledge Base class pages keep the class/subclass axis and add content modes", () => {
  assert.match(app, /<KnowledgeBaseScreen subsection=\{route\.subsection\} path=\{route\.tail\}/)
  assert.match(sectionScreens, /function ClassModeTabs/)
  assert.match(sectionScreens, /className="u1-class-mode-tabs"/)
  assert.match(sectionScreens, /Класс/)
  assert.match(sectionScreens, /Подклассы <small>\{entry\.subclasses\.length\}<\/small>/)
  assert.match(sectionScreens, /type ReferenceDetailMode = "features" \| "proficiencies" \| "mechanics"/)
  assert.match(sectionScreens, /label: "Умения"/)
  assert.match(sectionScreens, /label: "Владения"/)
  assert.match(sectionScreens, /label: "Механика"/)
  assert.match(sectionStyles, /\.u1-reference-detail-tabs/)
})

test("Knowledge Base story features are authored first instead of exposing every Character Engine grant", () => {
  assert.match(classReferencePresentation, /storyFeatures:/)
  assert.match(classReferencePresentation, /authoredClassFeatures/)
  assert.match(classReferencePresentation, /authored\.length[\s\S]*?authored\.map/)
  assert.match(classReferencePresentation, /runtimeStoryFeatures/)
  assert.match(classReferencePresentation, /genericProgressionMarker/)
  assert.match(classReferencePresentation, /ability-score-improvement/)
  assert.match(classReferencePresentation, /epic-boon/)
  assert.match(classReferencePresentation, /key\.endsWith\("-subclass"\)/)
  assert.match(sectionScreens, /presentation\.storyFeatures/)
  assert.doesNotMatch(sectionScreens, /presentation\.features/)
})

test("UI v1 Druid stories cannot fall back to legacy druidReference prose", () => {
  assert.doesNotMatch(classReferencePresentation, /classes\/druidReference/)
  assert.match(classReferencePresentation, /getDruidBaseVossNarration/)
  assert.match(classReferencePresentation, /getDruidSubclassFeatureVossNarration/)
})

test("Feature list previews authored Voss story while full rules stay in feature detail", () => {
  assert.match(sectionScreens, /className="u1-feature-row__story"/)
  assert.match(sectionScreens, /\{feature\.vossExplanation\}/)
  assert.match(sectionStyles, /\.u1-feature-row__story/)
  assert.match(sectionStyles, /-webkit-line-clamp:\s*2/)
  assert.match(sectionScreens, /<ReferenceCopyBlock label="Восс объясняет">/)
  assert.match(sectionScreens, /<ReferenceCopyBlock label="Точное правило">/)
  assert.match(sectionScreens, /<ReferenceCopyBlock label="Комментарий Восса">/)
  assert.match(sectionScreens, /<span>Механика<\/span>/)
})

test("Voss comment is visible beside the story instead of hidden below mechanics", () => {
  assert.match(sectionScreens, /function VossCommentBlock/)
  assert.match(sectionScreens, /<VossCommentBlock text=\{presentation\.vossComment\} \/>/)
  assert.doesNotMatch(sectionScreens, /VossCommentDisclosure|<details className="u1-voss-comment/)
  assert.match(
    sectionScreens,
    /label="Восс объясняет"[\s\S]*?label="Комментарий Восса"[\s\S]*?label="Точное правило"/,
  )
  assert.match(sectionStyles, /\.u1-voss-comment-block/)
})

test("Class reference keeps runtime data mounted while switching class and subclass routes", () => {
  assert.match(app, /route\.section === "knowledge-base" && route\.subsection === "classes"/)
  assert.match(app, /return "section:knowledge-base:classes"/)
  assert.match(sectionScreens, /onBeforeNavigate=\{\(\) => setMode\("features"\)\}/)
})

test("Class overview Voss prose is compact by default and explicitly expandable", () => {
  assert.match(sectionScreens, /function ExpandableVossIntro/)
  assert.match(sectionScreens, /Показать полностью ↓/)
  assert.match(sectionScreens, /Свернуть ↑/)
  assert.match(sectionStyles, /\.u1-voss-intro:not\(\[data-expanded\]\) \.u1-voss-intro__text/)
  assert.match(sectionStyles, /-webkit-line-clamp:\s*4/)
  assert.match(sectionScreens, /<ReferenceDetailTabs active=\{mode\}/)
})

test("Proficiencies and runtime mechanics have their own player-facing read models", () => {
  assert.match(classReferencePresentation, /proficiencies: buildProficiencies/)
  assert.match(classReferencePresentation, /mechanics: mechanics\.length \? mechanics : mechanicsFallback/)
  assert.match(classReferencePresentation, /mechanic\.target !== "proficiency"/)
  assert.match(classReferencePresentation, /choice\.target !== "proficiency"/)
  assert.match(classReferencePresentation, /classifyProficiency/)
  assert.match(sectionScreens, /function ProficiencyView/)
  assert.match(sectionScreens, /function MechanicsView/)
  assert.match(sectionScreens, /className="u1-mechanic-row"/)
  assert.doesNotMatch(sectionScreens, />grantOperation<|>priority<|>sourceKey</)
})

test("Class and subclass detail reserve clean 16:9 artwork slots without stretching 3:1 catalog art", () => {
  assert.match(sectionScreens, /function ReferenceHeroPlaceholder/)
  assert.match(sectionScreens, /kind="class"/)
  assert.match(sectionScreens, /kind="subclass"/)
  assert.match(sectionScreens, /kind="feature"/)
  assert.match(sectionStyles, /\.u1-reference-hero-placeholder/)
  assert.match(sectionStyles, /aspect-ratio:\s*16\s*\/\s*9/)
  assert.doesNotMatch(sectionScreens, /subclassDetailArtPath|classHeroFallbackPath|u1-subclass-hero/)
})

test("Subclass art cards stay minimal", () => {
  assert.match(sectionScreens, /title: subclass\.name,[\s\S]*?meta: undefined/)
  assert.doesNotMatch(sectionScreens, /meta: subclass\.summary/)
})

