import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { useHomeData, type HomeArtPreview, type HomeEvent, type HomeSocietyNews } from "./useHomeData"
import { WhatsNew } from "./WhatsNew"

type RootSpace = "home" | "workspace" | "chats"
type SectionId =
  | "whats-new"
  | "world"
  | "society-news"
  | "achievements"
  | "art"
  | "updates"

type Route =
  | { type: "root"; space: RootSpace }
  | { type: "section"; section: SectionId }

const sectionIds: SectionId[] = [
  "whats-new",
  "world",
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
    body: "Зоны, NPC, лор и карта будут собраны здесь как новая самостоятельная система. Пока это точка подключения.",
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
  if (path === "chats") return { type: "root", space: "chats" }

  const section = path.startsWith("home/") ? path.slice("home/".length) : ""
  if (sectionIds.includes(section as SectionId)) {
    return { type: "section", section: section as SectionId }
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
  return route.type === "root" ? `root:${route.space}` : `section:${route.section}`
}

function activeRoot(route: Route): RootSpace {
  if (route.type === "root") return route.space
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
  const items: Array<{ id: RootSpace; label: string; icon: "me" | "home" | "chats" }> = [
    { id: "workspace", label: "Я", icon: "me" },
    { id: "home", label: "Главная", icon: "home" },
    { id: "chats", label: "Чаты", icon: "chats" },
  ]

  return (
    <nav className="u1-dock" aria-label="Основная навигация" data-active={active}>
      <span className="u1-dock__hull" aria-hidden="true" />
      <span className="u1-dock__crown" aria-hidden="true" />
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
          >
            {selected && (
              <motion.span
                className="u1-dock__selection"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span
              className={`u1-dock__glyph u1-dock__glyph--${item.icon}`}
              aria-hidden="true"
            />
          </button>
        )
      })}
    </nav>
  )
}

function EntryMedia({ src }: { src: string | null }) {
  if (!src) return <span className="u1-entry-media u1-entry-media--fallback" aria-hidden="true" />

  return <img className="u1-entry-media" src={src} alt="" loading="lazy" aria-hidden="true" />
}

function WhatsNewHero({
  event,
  imageUrl,
  loading,
}: {
  event: HomeEvent | null
  imageUrl: string | null
  loading: boolean
}) {
  return (
    <motion.button
      type="button"
      className="u1-home-hero"
      onClick={() => go("home/whats-new")}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: 0.14 }}
    >
      <EntryMedia src={imageUrl} />
      <span className="u1-entry-scrim" aria-hidden="true" />
      <span className="u1-home-hero__copy">
        <small>Хроника кампании</small>
        <strong>Что нового</strong>
        <span>
          {loading
            ? "Загружаю последние события…"
            : event
              ? eventHeadline(event)
              : "Кампания только начинается"}
        </span>
      </span>
    </motion.button>
  )
}

function WorldPreview({ coverUrl }: { coverUrl: string | null }) {
  return (
    <motion.button
      type="button"
      className="u1-world-entry"
      onClick={() => go("home/world")}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: 0.14 }}
    >
      <EntryMedia src={coverUrl} />
      <span className="u1-entry-scrim u1-entry-scrim--soft" aria-hidden="true" />
      <span className="u1-world-entry__copy">
        <strong>Мир</strong>
        <small>Зоны · NPC · Лор · Карта</small>
      </span>
    </motion.button>
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

function ArtPreviewStrip({ items }: { items: HomeArtPreview[] }) {
  return (
    <motion.button
      type="button"
      className="u1-art-entry"
      onClick={() => go("home/art")}
      whileTap={{ scale: 0.994 }}
      transition={{ duration: 0.14 }}
    >
      <span className="u1-art-entry__head">
        <strong>Арты</strong>
        <small>{items.length ? "Последние работы" : "Галерея кампании"}</small>
        <span aria-hidden="true">→</span>
      </span>

      <span className="u1-art-entry__strip" aria-hidden="true">
        {items.length > 0 ? (
          items.slice(0, 3).map((item) => (
            <span className="u1-art-entry__thumb" key={item.id}>
              <img src={item.imageUrl} alt="" loading="lazy" />
            </span>
          ))
        ) : (
          <>
            <span className="u1-art-entry__thumb u1-art-entry__thumb--empty" />
            <span className="u1-art-entry__thumb u1-art-entry__thumb--empty" />
            <span className="u1-art-entry__thumb u1-art-entry__thumb--empty" />
          </>
        )}
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

function eventHeadline(event: HomeEvent) {
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
    campaignCoverUrl,
    events,
    artPreviews,
    achievementCount,
    latestAchievementTitle,
    societyNews,
    loading,
    error,
  } = useHomeData()

  const latestEvent = events[0] || null
  const heroImageUrl = latestEvent?.media_url || campaignCoverUrl

  return (
    <main className="u1-home">
      <header className="u1-header">
        <div className="u1-brand">
          <span>MEGANOT / CAMPAIGN</span>
          <strong>{campaignTitle || "Мунтар"}</strong>
        </div>

        <button
          className="u1-avatar"
          type="button"
          aria-label="Открыть пространство Я"
          onClick={() => {
            softHaptic()
            go("workspace")
          }}
        >
          VI
        </button>
      </header>

      <div className="u1-rule" aria-hidden="true" />

      <section className="u1-home-sections" aria-label="Разделы кампании">
        <WhatsNewHero event={latestEvent} imageUrl={heroImageUrl} loading={loading} />
        <WorldPreview coverUrl={campaignCoverUrl} />
        <SocietyNewsEntry news={societyNews} />
        <AchievementEntry
          count={achievementCount}
          latestTitle={latestAchievementTitle}
        />
        <ArtPreviewStrip items={artPreviews} />
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

    const copy = sectionCopy[route.section]
    return <Placeholder {...copy} backToHome />
  }

  if (route.space === "home") return <Home />

  if (route.space === "workspace") {
    return (
      <Placeholder
        eyebrow="Будущее пространство"
        title="Я"
        body="Здесь будет новый интерфейс игрока и отдельное управление мастера. Сейчас только финальный маршрут и заглушка, без старого UI."
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

export default function UiV1App() {
  const [route, setRoute] = useState<Route>(() => parseRoute())
  const swipeRef = useRef<SwipeState | null>(null)
  const suppressClickUntilRef = useRef(0)

  const navigateRoot = useCallback((space: RootSpace) => {
    if (route.type === "root" && route.space === space) return

    softHaptic()
    go(space)
  }, [route])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (route.type !== "root" || event.pointerType === "mouse") return

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
    const swipe = swipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) return

    swipe.lastX = event.clientX
    swipe.lastY = event.clientY
  }, [])

  const finishSwipe = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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

    const sync = () => setRoute(parseRoute())
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
