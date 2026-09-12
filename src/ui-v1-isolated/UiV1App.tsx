import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"

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

type PreviewItem = {
  section: SectionId
  title: string
  note: string
  shape: "lead" | "world" | "portrait" | "square" | "small" | "wide"
  tone: "graphite" | "steel" | "ash" | "stone" | "smoke" | "charcoal"
}

const previewItems: PreviewItem[] = [
  {
    section: "whats-new",
    title: "Что нового",
    note: "Хроника кампании",
    shape: "lead",
    tone: "graphite",
  },
  {
    section: "world",
    title: "Мир",
    note: "Зоны · NPC · Лор · Карта",
    shape: "world",
    tone: "steel",
  },
  {
    section: "society-news",
    title: "Новости общества",
    note: "Важное для всех",
    shape: "portrait",
    tone: "ash",
  },
  {
    section: "achievements",
    title: "Достижения",
    note: "История партии",
    shape: "square",
    tone: "stone",
  },
  {
    section: "art",
    title: "Арты",
    note: "Галерея кампании",
    shape: "small",
    tone: "smoke",
  },
  {
    section: "updates",
    title: "Обновления",
    note: "Изменения приложения",
    shape: "wide",
    tone: "charcoal",
  },
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
  if (previewItems.some((item) => item.section === section)) {
    return { type: "section", section: section as SectionId }
  }

  return { type: "root", space: "home" }
}

function go(path: string) {
  window.location.hash = path.startsWith("#") ? path : `#/${path}`
}

function routeKey(route: Route) {
  return route.type === "root" ? `root:${route.space}` : `section:${route.section}`
}

function activeRoot(route: Route): RootSpace {
  if (route.type === "root") return route.space
  return "home"
}

function Dock({ route }: { route: Route }) {
  const active = activeRoot(route)
  const items: Array<{ id: RootSpace; label: string; path: string }> = [
    { id: "workspace", label: "Я", path: "workspace" },
    { id: "home", label: "Главная", path: "home" },
    { id: "chats", label: "Чаты", path: "chats" },
  ]

  return (
    <nav className="u1-dock" aria-label="Основная навигация">
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
            aria-current={selected ? "page" : undefined}
            onClick={() => go(item.path)}
          >
            {selected && (
              <motion.span
                className="u1-dock__selection"
                layoutId="ui-v1-dock-selection"
                transition={{ type: "spring", stiffness: 430, damping: 40 }}
              />
            )}
            <span className="u1-dock__label">{item.label}</span>
            {item.id === "home" && <span className="u1-dock__home-mark" aria-hidden="true" />}
          </button>
        )
      })}
    </nav>
  )
}

function SectionPreview({ item }: { item: PreviewItem }) {
  return (
    <motion.button
      type="button"
      className={`u1-preview u1-preview--${item.shape} u1-preview--${item.tone}`}
      onClick={() => go(`home/${item.section}`)}
      whileTap={{ scale: 0.989 }}
      transition={{ duration: 0.14 }}
    >
      <span className="u1-preview__field" aria-hidden="true">
        <span className="u1-preview__line u1-preview__line--a" />
        <span className="u1-preview__line u1-preview__line--b" />
        <span className="u1-preview__index">
          {String(previewItems.indexOf(item) + 1).padStart(2, "0")}
        </span>
      </span>
      <span className="u1-preview__scrim" aria-hidden="true" />
      <span className="u1-preview__caption">
        <strong>{item.title}</strong>
        <small>{item.note}</small>
      </span>
    </motion.button>
  )
}

function Home() {
  return (
    <main className="u1-home">
      <header className="u1-header">
        <div className="u1-brand">
          <span>MEGANOT / CAMPAIGN</span>
          <strong>Мунтар</strong>
        </div>

        <button
          className="u1-avatar"
          type="button"
          aria-label="Открыть пространство Я"
          onClick={() => go("workspace")}
        >
          VI
        </button>
      </header>

      <div className="u1-rule" aria-hidden="true" />

      <section className="u1-intro">
        <span>Сейчас в кампании</span>
        <h1>
          Главная
          <br />
          картина
        </h1>
        <p>Короткий вход во всё важное, без панели управления на пол-экрана.</p>
      </section>

      <section className="u1-grid" aria-label="Разделы кампании">
        <SectionPreview item={previewItems[0]} />
        <SectionPreview item={previewItems[1]} />

        <div className="u1-grid__row u1-grid__row--first">
          <SectionPreview item={previewItems[2]} />
          <SectionPreview item={previewItems[3]} />
        </div>

        <div className="u1-grid__row u1-grid__row--second">
          <SectionPreview item={previewItems[4]} />
          <SectionPreview item={previewItems[5]} />
        </div>
      </section>

      <section className="u1-events-placeholder" aria-label="Последние события">
        <div className="u1-events-placeholder__head">
          <span>Последние события</span>
          <small>Подключение позже</small>
        </div>
        <div className="u1-events-placeholder__rail" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
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

export default function UiV1App() {
  const [route, setRoute] = useState<Route>(() => parseRoute())

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
      <div className="u1-stage">
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

        <Dock route={route} />
      </div>
    </div>
  )
}
