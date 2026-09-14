import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { useHomeData, type HomeEvent, type HomeSocietyNews } from "./useHomeData"
import { WhatsNew } from "./WhatsNew"
import Workspace from "./Workspace"
import GMWorkshop from "./GMWorkshop"
import CharacterView from "./CharacterView"
import type { WorkshopSection } from "./useGMWorkshopData"
import PlayerProfileMark from "./PlayerProfileMark"
import {
  AchievementsScreen,
  KnowledgeBaseScreen,
  SocietyNewsScreen,
  WorldSectionScreen,
} from "./SectionScreens"

type RootSpace = "home" | "workspace" | "chats"
type SectionId =
  | "whats-new"
  | "world"
  | "knowledge-base"
  | "society-news"
  | "achievements"
  | "art"
  | "updates"

type Route =
  | { type: "root"; space: RootSpace }
  | { type: "section"; section: SectionId; subsection?: string; tail: string[] }
  | { type: "workspace"; page: "character"; characterId: string }
  | { type: "workspace"; page: "manage"; section?: WorkshopSection }

const workshopSections: WorkshopSection[] = ["draft", "party", "characters", "library", "materials"]

const sectionIds: SectionId[] = [
  "whats-new",
  "world",
  "knowledge-base",
  "society-news",
  "achievements",
  "art",
  "updates",
]

const sectionCopy: Record<SectionId, { eyebrow: string; title: string; body: string }> = {
  "whats-new": {
    eyebrow: "Будущий раздел",
    title: "Что нового",
    body: "Здесь будет новая хроника кампании. Маршрут уже подключён, а интерфейс появится отдельным этапом без использования старой ленты.",
  },
  world: {
    eyebrow: "Будущий раздел",
    title: "Мир",
    body: "Локации, персонажи, лор и карта собраны здесь как самостоятельные части мира.",
  },
  "knowledge-base": {
    eyebrow: "Будущий раздел",
    title: "База знаний",
    body: "Правила, предметы, заклинания и бестиарий будут собраны здесь как отдельная справочная система нового интерфейса. Пока это чистая точка подключения.",
  },
  "society-news": {
    eyebrow: "Будущий раздел",
    title: "Новости общества",
    body: "Отдельное место для важных новостей кампании. Контент-модель подключим позже, не смешивая её с хроникой.",
  },
  achievements: {
    eyebrow: "Будущий раздел",
    title: "Достижения",
    body: "Здесь появятся достижения партии и персонажей. Сейчас сохранён только финальный маршрут и место в навигации.",
  },
  art: {
    eyebrow: "Будущий раздел",
    title: "Арты",
    body: "Новая галерея и комиксы будут подключены сюда отдельным этапом. Старую галерею новый UI не наследует.",
  },
  updates: {
    eyebrow: "Будущий раздел",
    title: "Обновления",
    body: "Изменения приложения и кампании будут жить здесь. Пока раздел намеренно остаётся чистой точкой подключения.",
  },
}

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "")
  const path = raw.split("?")[0]

  if (path === "workspace") return { type: "root", space: "workspace" }
  if (path === "workspace/manage") return { type: "workspace", page: "manage" }
  if (path.startsWith("workspace/manage/")) {
    const workshopSection = path.slice("workspace/manage/".length) as WorkshopSection
    if (workshopSections.includes(workshopSection)) {
      return { type: "workspace", page: "manage", section: workshopSection }
    }
    return { type: "workspace", page: "manage" }
  }
  if (path.startsWith("workspace/character/")) {
    const characterId = path.slice("workspace/character/".length)
    if (characterId) return { type: "workspace", page: "character", characterId }
  }
  if (path === "chats") return { type: "root", space: "chats" }

  const sectionPath = path.startsWith("home/") ? path.slice("home/".length) : ""
  const [section, subsection, ...tail] = sectionPath.split("/").filter(Boolean)
  if (sectionIds.includes(section as SectionId)) {
    return {
      type: "section",
      section: section as SectionId,
      subsection: subsection || undefined,
      tail,
    }
  }

  return { type: "root", space: "home" }
}

function go(path: string) {
  window.location.hash = path.startsWith("#") ? path : `#/${path}`
}

type TelegramHapticWindow = Window & {
  Telegram?: {
    WebApp?: {
      HapticFeedback?: {
        impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void
      }
    }
  }
}

function softHaptic() {
  const telegramHaptics = (window as TelegramHapticWindow).Telegram?.WebApp?.HapticFeedback

  if (telegramHaptics?.impactOccurred) {
    try {
      telegramHaptics.impactOccurred("soft")
      return
    } catch {
      // Fall back to the browser vibration API below.
    }
  }

  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(8)
  }
}

function routeKey(route: Route) {
  if (route.type === "root") return `root:${route.space}`
  if (route.type === "section") {
    if (route.section === "knowledge-base" && route.subsection === "classes") {
      return "section:knowledge-base:classes"
    }
    return `section:${route.section}:${route.subsection || "index"}:${route.tail.join("/")}`
  }
  return route.page === "character"
    ? `workspace:character:${route.characterId}`
    : "workspace:manage:" + (route.section || "index")
}

function activeRoot(route: Route): RootSpace {
  if (route.type === "root") return route.space
  if (route.type === "workspace") return "workspace"
  return "home"
}

function Dock({
  route,
  onNavigate,
}: {
  route: Route
  onNavigate: (space: RootSpace) => void
}) {
  const active = activeRoot(route)
  const items: Array<{ id: RootSpace; label: string }> = [
    { id: "workspace", label: "Я" },
    { id: "home", label: "Главная" },
    { id: "chats", label: "Чаты" },
  ]

  return (
    <nav className="u1-dock" aria-label="Основная навигация" data-active={active}>
      <span className="u1-dock__glass" aria-hidden="true" />
      {items.map((item) => {
        const selected = item.id === active

        return (
          <button
            key={item.id}
            type="button"
            className={`u1-dock__item u1-dock__item--${item.id}`}
            data-selected={selected || undefined}
            aria-label={item.label}
            aria-current={selected ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          />
        )
      })}
    </nav>
  )
}

function EntryMedia({ src }: { src: string | null }) {
  if (!src) return <span className="u1-entry-media u1-entry-media--fallback" aria-hidden="true" />

  return <img className="u1-entry-media" src={src} alt="" loading="lazy" aria-hidden="true" />
}

function WorldPreview() {
  return (
    <motion.button
      type="button"
      className="u1-world-entry"
      onClick={() => go("home/world")}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: 0.14 }}
    >
      <EntryMedia src="/ui-v1/panels/world.webp" />
      <span className="u1-entry-scrim u1-entry-scrim--soft" aria-hidden="true" />
      <span className="u1-world-entry__copy">
        <strong>Мир</strong>
        <small>Локации · Персонажи · Лор · Карта</small>
      </span>
    </motion.button>
  )
}

function KnowledgeBaseEntry() {
  return (
    <button
      type="button"
      className="u1-knowledge-entry"
      onClick={() => go("home/knowledge-base")}
    >
      <span className="u1-knowledge-entry__label">База знаний</span>
      <span className="u1-knowledge-entry__topics">
        Правила <i aria-hidden="true">·</i> Предметы <i aria-hidden="true">·</i> Заклинания <i aria-hidden="true">·</i> Бестиарий
      </span>
      <span className="u1-knowledge-entry__arrow" aria-hidden="true">→</span>
    </button>
  )
}

function SocietyNewsEntry({ news }: { news: HomeSocietyNews | null }) {
  return (
    <button
      type="button"
      className="u1-editorial-entry u1-society-entry"
      onClick={() => go("home/society-news")}
    >
      <span className="u1-editorial-entry__label">Новости общества</span>
      <span className="u1-editorial-entry__value">
        {news ? eventHeadline(news) : "Пока без объявлений"}
      </span>
      <span className="u1-editorial-entry__arrow" aria-hidden="true">→</span>
    </button>
  )
}

function AchievementEntry({
  count,
  latestTitle,
}: {
  count: number
  latestTitle: string | null
}) {
  return (
    <button
      type="button"
      className="u1-editorial-entry u1-achievement-entry"
      onClick={() => go("home/achievements")}
    >
      <span className="u1-editorial-entry__label">Достижения</span>
      <span className="u1-editorial-entry__value">
        {latestTitle || "История партии"}
      </span>
      <span className="u1-achievement-entry__count">{count}</span>
      <span className="u1-editorial-entry__arrow" aria-hidden="true">→</span>
    </button>
  )
}

function ArtEntry() {
  return (
    <motion.button
      type="button"
      className="u1-art-entry"
      onClick={() => go("home/art")}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: 0.14 }}
    >
      <EntryMedia src="/ui-v1/panels/art.webp" />
      <span className="u1-entry-scrim u1-entry-scrim--soft" aria-hidden="true" />
      <span className="u1-art-entry__copy">
        <strong>Арты</strong>
        <small>Галерея кампании</small>
      </span>
    </motion.button>
  )
}

function eventTypeLabel(sourceType: HomeEvent["source_type"]) {
  if (sourceType === "achievement") return "Достижение"
  if (sourceType === "diary") return "Дневник"
  if (sourceType === "moment") return "Событие"
  if (sourceType === "gm_note" || sourceType === "gm_post" || sourceType === "announcement") {
    return "Общество"
  }
  if (sourceType === "world" || sourceType === "zone" || sourceType === "npc" || sourceType === "lore") {
    return "Мир"
  }
  return "Событие"
}

function formatEventTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(".", "")
}

function eventHeadline(event: Pick<HomeEvent, "title" | "body">) {
  const title = event.title.trim()
  if (title) return title

  const body = event.body.trim()
  if (!body) return "Новое событие"
  return body.length > 84 ? `${body.slice(0, 81)}…` : body
}

function LatestEvents({
  events,
  loading,
  error,
}: {
  events: HomeEvent[]
  loading: boolean
  error: string | null
}) {
  return (
    <section className="u1-latest" aria-labelledby="u1-latest-title">
      <div className="u1-latest__head">
        <h1 id="u1-latest-title">Последние события</h1>
        <button type="button" onClick={() => go("home/whats-new")}>
          Все
        </button>
      </div>

      {loading ? (
        <div className="u1-latest__skeleton" aria-label="Загрузка событий">
          <span />
          <span />
          <span />
        </div>
      ) : error ? (
        <button
          type="button"
          className="u1-latest__empty"
          onClick={() => go("home/whats-new")}
        >
          Хроника временно недоступна
        </button>
      ) : events.length === 0 ? (
        <div className="u1-latest__empty">События появятся здесь</div>
      ) : (
        <div className="u1-latest__list">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className="u1-latest__event"
              onClick={() => go("home/whats-new")}
            >
              <span className="u1-latest__meta">
                <strong>{eventTypeLabel(event.source_type)}</strong>
                <small>{formatEventTime(event.published_at)}</small>
              </span>
              <span className="u1-latest__copy">
                <strong>{eventHeadline(event)}</strong>
                {event.title.trim() && event.body.trim() && (
                  <small>
                    {event.body.length > 96
                      ? `${event.body.slice(0, 93)}…`
                      : event.body}
                  </small>
                )}
              </span>
              <span className="u1-latest__arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function Home() {
  const {
    campaignTitle,
    events,
    achievementCount,
    latestAchievementTitle,
    societyNews,
    loading,
    error,
  } = useHomeData()

  return (
    <main className="u1-home">
      <header className="u1-header">
        <div className="u1-brand">
          <span>MEGANOT / CAMPAIGN</span>
          <strong>{campaignTitle || "Мунтар"}</strong>
        </div>

        <PlayerProfileMark />
      </header>

      <div className="u1-rule" aria-hidden="true" />

      <section className="u1-home-sections" aria-label="Разделы кампании">
        <WorldPreview />
        <KnowledgeBaseEntry />
        <SocietyNewsEntry news={societyNews} />
        <AchievementEntry
          count={achievementCount}
          latestTitle={latestAchievementTitle}
        />
        <ArtEntry />
      </section>

      <LatestEvents events={events} loading={loading} error={error} />
    </main>
  )
}

function Placeholder({
  eyebrow,
  title,
  body,
  backToHome = false,
}: {
  eyebrow: string
  title: string
  body: string
  backToHome?: boolean
}) {
  return (
    <main className="u1-placeholder">
      <div className="u1-placeholder__serial">UI 1.0 / CONNECTED</div>
      <div className="u1-placeholder__body">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{body}</p>
        {backToHome && (
          <button type="button" onClick={() => go("home")}>
            ← Главная
          </button>
        )}
      </div>
    </main>
  )
}

function Screen({ route }: { route: Route }) {
  if (route.type === "section") {
    if (route.section === "whats-new") return <WhatsNew />
    if (route.section === "world") return <WorldSectionScreen subsection={route.subsection} path={route.tail} />
    if (route.section === "knowledge-base") return <KnowledgeBaseScreen subsection={route.subsection} path={route.tail} />
    if (route.section === "society-news") return <SocietyNewsScreen />
    if (route.section === "achievements") return <AchievementsScreen />

    const copy = sectionCopy[route.section]
    return <Placeholder {...copy} backToHome />
  }

  if (route.type === "workspace") {
    if (route.page === "manage") {
      return (
        <GMWorkshop
          section={route.section}
          onNavigate={(section) =>
            go(section ? "workspace/manage/" + section : "workspace/manage")
          }
          onOpenCharacter={(characterId) =>
            go("workspace/character/" + characterId)
          }
          onBack={() => go("workspace")}
        />
      )
    }

    return (
      <CharacterView
        characterId={route.characterId}
        onBack={() => {
          if (window.history.length > 1) window.history.back()
          else go("workspace")
        }}
      />
    )
  }

  if (route.space === "home") return <Home />

  if (route.space === "workspace") {
    return (
      <Workspace
        onOpenCharacter={(characterId) => go(`workspace/character/${characterId}`)}
        onOpenManagement={() => go("workspace/manage")}
      />
    )
  }

  return (
    <Placeholder
      eyebrow="Будущий раздел"
      title="Чаты"
      body="Новый интерфейс чатов будет построен отдельно. Этот экран существует только как чистая точка подключения."
    />
  )
}

const rootSpaceOrder: RootSpace[] = ["workspace", "home", "chats"]

type SwipeState = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  startedAt: number
}

type EdgeBackState = SwipeState

function currentScrollRoot() {
  return document.querySelector<HTMLElement>(
    ".u1-view .u1-workspace__actors, .u1-view .u1-gm-workshop, .u1-view .u1-home, .u1-view .u1-section-page, .u1-view .u1-placeholder",
  )
}

export default function UiV1App() {
  const [route, setRoute] = useState<Route>(() => parseRoute())
  const swipeRef = useRef<SwipeState | null>(null)
  const edgeBackRef = useRef<EdgeBackState | null>(null)
  const suppressClickUntilRef = useRef(0)
  const scrollPositionsRef = useRef(new Map<string, number>())
  const currentHashRef = useRef(window.location.hash || "#/home")
  const restoreAfterBackRef = useRef(false)

  const navigateRoot = useCallback((space: RootSpace) => {
    if (route.type === "root" && route.space === space) return

    softHaptic()
    go(space)
  }, [route])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return

    if (route.type !== "root" && event.clientX <= 26) {
      swipeRef.current = null
      edgeBackRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startedAt: performance.now(),
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }

    if (route.type !== "root") return

    edgeBackRef.current = null
    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: performance.now(),
    }

    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [route])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const edgeBack = edgeBackRef.current
    if (edgeBack?.pointerId === event.pointerId) {
      edgeBack.lastX = event.clientX
      edgeBack.lastY = event.clientY
      return
    }

    const swipe = swipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) return

    swipe.lastX = event.clientX
    swipe.lastY = event.clientY
  }, [])

  const finishSwipe = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const edgeBack = edgeBackRef.current
    edgeBackRef.current = null

    if (edgeBack?.pointerId === event.pointerId) {
      const deltaX = edgeBack.lastX - edgeBack.startX
      const deltaY = edgeBack.lastY - edgeBack.startY
      const elapsed = performance.now() - edgeBack.startedAt
      const requiredDistance = Math.min(120, window.innerWidth * 0.28)
      const isIntentionalBack =
        deltaX >= requiredDistance &&
        deltaX > Math.abs(deltaY) * 1.4 &&
        elapsed <= 1000

      if (!isIntentionalBack) return

      const scrollRoot = currentScrollRoot()
      if (scrollRoot) {
        scrollPositionsRef.current.set(currentHashRef.current, scrollRoot.scrollTop)
      }

      restoreAfterBackRef.current = true
      suppressClickUntilRef.current = performance.now() + 360
      softHaptic()
      window.history.back()
      return
    }

    const swipe = swipeRef.current
    swipeRef.current = null

    if (!swipe || swipe.pointerId !== event.pointerId || route.type !== "root") return

    const deltaX = swipe.lastX - swipe.startX
    const deltaY = swipe.lastY - swipe.startY
    const elapsed = performance.now() - swipe.startedAt
    const horizontalDistance = Math.abs(deltaX)
    const verticalDistance = Math.abs(deltaY)

    const isIntentionalSwipe =
      horizontalDistance >= 54 &&
      horizontalDistance > verticalDistance * 1.35 &&
      elapsed <= 850

    if (!isIntentionalSwipe) return

    const currentIndex = rootSpaceOrder.indexOf(route.space)
    const direction = deltaX < 0 ? 1 : -1
    const nextSpace = rootSpaceOrder[currentIndex + direction]

    if (!nextSpace) return

    suppressClickUntilRef.current = performance.now() + 320
    navigateRoot(nextSpace)
  }, [navigateRoot, route])

  const cancelSwipe = useCallback(() => {
    swipeRef.current = null
    edgeBackRef.current = null
  }, [])

  const suppressSwipeClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (performance.now() >= suppressClickUntilRef.current) return

    event.preventDefault()
    event.stopPropagation()
  }, [])

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/home")
    }

    currentHashRef.current = window.location.hash || "#/home"

    const sync = () => {
      const previousHash = currentHashRef.current
      const scrollRoot = currentScrollRoot()
      if (scrollRoot) {
        scrollPositionsRef.current.set(previousHash, scrollRoot.scrollTop)
      }

      const nextHash = window.location.hash || "#/home"
      const shouldRestore = restoreAfterBackRef.current
      restoreAfterBackRef.current = false
      currentHashRef.current = nextHash
      setRoute(parseRoute())

      if (shouldRestore) {
        const top = scrollPositionsRef.current.get(nextHash) || 0
        window.setTimeout(() => {
          const target = currentScrollRoot()
          if (target) target.scrollTop = top
        }, 230)
      }
    }

    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  return (
    <div className="u1-app">
      <div className="u1-backdrop" aria-hidden="true" />
      <div
        className="u1-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
        onClickCapture={suppressSwipeClick}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={routeKey(route)}
            className="u1-view"
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <Screen route={route} />
          </motion.div>
        </AnimatePresence>

        <Dock route={route} onNavigate={navigateRoot} />
      </div>
    </div>
  )
}
