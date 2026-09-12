import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"

type RootView = "home" | "workspace" | "chats"

const previews = [
  { key: "chronicle", title: "Что нового", note: "Хроника кампании", size: "lead" },
  { key: "world", title: "Мир", note: "Зоны · NPC · Лор · Карта", size: "world" },
  { key: "society", title: "Новости общества", note: "Важное для всех", size: "tall" },
  { key: "achievements", title: "Достижения", note: "История партии", size: "small" },
  { key: "art", title: "Арты", note: "Галерея", size: "small" },
  { key: "updates", title: "Обновления", note: "Изменения и релизы", size: "wide" },
] as const

const events = [
  ["Событие", "Группа покинула Южные ворота"],
  ["Дневник", "Добавлена новая запись Ниеля"],
  ["Достижение", "Открыта новая зона"],
]

function routeFromHash(): RootView {
  const value = window.location.hash.replace(/^#\/?/, "")
  if (value === "workspace") return "workspace"
  if (value === "chats") return "chats"
  return "home"
}

function navigate(view: RootView) {
  window.location.hash = view === "home" ? "#/home" : `#/${view}`
}

function Dock({ active }: { active: RootView }) {
  const items: Array<{ id: RootView; label: string }> = [
    { id: "workspace", label: "Я" },
    { id: "home", label: "Главная" },
    { id: "chats", label: "Чаты" },
  ]

  return (
    <nav className="u1-dock" aria-label="Основная навигация">
      {items.map((item) => {
        const selected = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            className={`u1-dock__item u1-dock__item--${item.id}`}
            data-selected={selected || undefined}
            onClick={() => navigate(item.id)}
          >
            {selected && (
              <motion.span
                className="u1-dock__selection"
                layoutId="u1-dock-selection"
                transition={{ type: "spring", stiffness: 420, damping: 38 }}
              />
            )}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function Preview({
  item,
}: {
  item: (typeof previews)[number]
}) {
  return (
    <motion.button
      type="button"
      className={`u1-preview u1-preview--${item.size} u1-preview--${item.key}`}
      whileTap={{ scale: 0.988 }}
      transition={{ duration: 0.14 }}
    >
      <span className="u1-preview__art" aria-hidden="true" />
      <span className="u1-preview__veil" aria-hidden="true" />
      <span className="u1-preview__caption">
        <strong>{item.title}</strong>
        <span>{item.note}</span>
      </span>
    </motion.button>
  )
}

function Home() {
  return (
    <main className="u1-home">
      <header className="u1-header">
        <div className="u1-header__brand">
          <span>MEGANOT</span>
          <strong>Мунтар</strong>
        </div>
        <button className="u1-avatar" type="button" onClick={() => navigate("workspace")}>
          VI
        </button>
      </header>

      <section className="u1-intro">
        <span>Кампания продолжается</span>
        <h1>Что происходит?</h1>
      </section>

      <section className="u1-layout" aria-label="Разделы кампании">
        <Preview item={previews[0]} />
        <Preview item={previews[1]} />

        <div className="u1-layout__split u1-layout__split--first">
          <Preview item={previews[2]} />
          <Preview item={previews[3]} />
        </div>

        <div className="u1-layout__split u1-layout__split--second">
          <Preview item={previews[4]} />
          <Preview item={previews[5]} />
        </div>
      </section>

      <section className="u1-events">
        <div className="u1-events__heading">
          <span>Последние события</span>
          <button type="button">Все</button>
        </div>
        <div className="u1-events__list">
          {events.map(([kind, text]) => (
            <button type="button" className="u1-event" key={text}>
              <span>{kind}</span>
              <strong>{text}</strong>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

function Placeholder({ view }: { view: Exclude<RootView, "home"> }) {
  const copy = useMemo(
    () =>
      view === "workspace"
        ? {
            kicker: "Будущее пространство",
            title: "Я",
            body: "Здесь будет личное пространство игрока и управление для мастера. Сейчас маршрут подключён, но интерфейс намеренно не придуман вместо нас.",
          }
        : {
            kicker: "Будущий раздел",
            title: "Чаты",
            body: "Маршрут уже находится на своём месте. Новый интерфейс чатов появится отдельным этапом и не наследует старый экран.",
          },
    [view],
  )

  return (
    <main className="u1-placeholder">
      <div className="u1-placeholder__mark" aria-hidden="true" />
      <span>{copy.kicker}</span>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
    </main>
  )
}

export default function UiV1App() {
  const [view, setView] = useState<RootView>(() => routeFromHash())

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/home")
    const sync = () => setView(routeFromHash())
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  return (
    <div className="u1-app">
      <div className="u1-backdrop" aria-hidden="true" />
      <div className="u1-grain" aria-hidden="true" />
      <section className="u1-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className="u1-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === "home" ? <Home /> : <Placeholder view={view} />}
          </motion.div>
        </AnimatePresence>
        <Dock active={view} />
      </section>
    </div>
  )
}
