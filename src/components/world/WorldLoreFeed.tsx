import { useMemo, useState } from "react"

import type { WorldLoreCategory, WorldLoreEntry } from "../../types/world"

type LoreFilter = "all" | WorldLoreCategory

const FILTERS: Array<{ key: LoreFilter; label: string }> = [
  { key: "all", label: "Всё" },
  { key: "news", label: "Новости" },
  { key: "world_event", label: "События" },
  { key: "chronicle", label: "Хроника" },
  { key: "history", label: "История" },
  { key: "rumor", label: "Слухи" },
]

const CATEGORY_LABEL: Record<WorldLoreCategory, string> = {
  news: "Новости",
  chronicle: "Хроника",
  history: "История",
  world_event: "Событие мира",
  rumor: "Слух",
}

const PERIOD_LABEL: Record<string, string> = {
  dawn: "Рассвет",
  morning: "Утро",
  day: "День",
  afternoon: "После полудня",
  evening: "Вечер",
  night: "Ночь",
}

function whenLabel(entry: WorldLoreEntry) {
  if (entry.campaign_day) {
    const period = entry.day_period ? PERIOD_LABEL[entry.day_period] : ""
    return `День ${entry.campaign_day}${period ? ` · ${period}` : ""}`
  }

  const date = new Date(entry.occurred_at)
  if (Number.isNaN(date.getTime())) return "В хронике мира"
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

function sourceLabel(entry: WorldLoreEntry) {
  if (entry.source_kind === "background_event") return "Мир развивается"
  if (entry.category === "news") return "Известия"
  if (entry.source_kind === "memory_fact") return "Канон кампании"
  return "Хроника"
}

export default function WorldLoreFeed({
  entries,
}: {
  entries: WorldLoreEntry[]
}) {
  const [filter, setFilter] = useState<LoreFilter>("all")

  const visible = useMemo(
    () => filter === "all" ? entries : entries.filter((entry) => entry.category === filter),
    [entries, filter],
  )

  return (
    <section className="world-lore-feed">
      <header className="world-lore-feed__head">
        <div>
          <small>Живой мир</small>
          <h2>Лор и хроника</h2>
          <p>Новости, крупные события и изменения мира, которые стали известны персонажам.</p>
        </div>
      </header>

      <nav className="world-lore-filters" aria-label="Фильтр лора">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={filter === item.key ? "is-active" : ""}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {visible.length ? (
        <div className="world-lore-timeline">
          {visible.map((entry) => (
            <article className="world-lore-entry" key={entry.id}>
              <div className="world-lore-entry__rail" aria-hidden="true">
                <span />
              </div>
              <div className="world-lore-entry__card">
                <header>
                  <div className="world-lore-entry__meta">
                    <span>{CATEGORY_LABEL[entry.category]}</span>
                    <small>{whenLabel(entry)}</small>
                  </div>
                  <small className="world-lore-entry__source">{sourceLabel(entry)}</small>
                </header>
                <h3>{entry.title}</h3>
                <p>{entry.summary}</p>
                {entry.body && entry.body.trim() !== entry.summary.trim() && (
                  <div className="world-lore-entry__body">{entry.body}</div>
                )}
                {entry.tags.length > 0 && (
                  <footer>
                    {entry.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
                  </footer>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="world-v2-empty world-lore-empty">
          <span>✦</span>
          <strong>Хроника пока пуста</strong>
          <p>Когда в мире появятся известные новости или значимые события, младший ГМ добавит их сюда автоматически.</p>
        </div>
      )}
    </section>
  )
}
