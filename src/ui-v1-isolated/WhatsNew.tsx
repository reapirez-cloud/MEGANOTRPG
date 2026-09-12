import "./whats-new.css"

import type { ChronicleEvent, ChronicleKind } from "./useChronicleData"
import { useChronicleData } from "./useChronicleData"

const kindLabel: Record<ChronicleKind, string> = {
  gm: "GM / Хроника",
  diary: "Дневник",
  achievement: "Достижение",
  moment: "Событие",
  world: "Мир",
  system: "Обновление",
  future: "Событие",
}

const futureSourceLabels: Record<string, string> = {
  gm_note: "GM / Хроника",
  gm_post: "GM / Хроника",
  announcement: "GM / Объявление",
  world: "Мир",
  zone: "Мир / Зона",
  npc: "Мир / NPC",
  lore: "Мир / Лор",
  system: "Система",
}

function dayKey(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dayLabel(value: string) {
  const date = new Date(value)
  const today = startOfLocalDay(new Date())
  const target = startOfLocalDay(date)
  const distance = Math.round(
    (today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000),
  )

  if (distance === 0) return "Сегодня"
  if (distance === 1) return "Вчера"

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  })
    .format(date)
    .replace(" г.", "")
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function eventLabel(event: ChronicleEvent) {
  return futureSourceLabels[event.sourceType] || kindLabel[event.kind]
}

function eventAuthor(event: ChronicleEvent) {
  if (event.kind === "diary" || event.kind === "achievement") {
    return event.characterName || event.authorName
  }

  if (event.kind === "gm") {
    return event.authorName
  }

  return event.characterName || event.authorName
}

function groupEvents(events: ChronicleEvent[]) {
  const groups: Array<{
    key: string
    label: string
    events: ChronicleEvent[]
  }> = []

  for (const event of events) {
    const key = dayKey(event.publishedAt)
    const current = groups[groups.length - 1]

    if (!current || current.key !== key) {
      groups.push({
        key,
        label: dayLabel(event.publishedAt),
        events: [event],
      })
      continue
    }

    current.events.push(event)
  }

  return groups
}

function ChronicleSourceAction({ event }: { event: ChronicleEvent }) {
  if (!event.sourceId) return null

  // Stable connection slot: when the new UI receives dedicated diary,
  // achievement, world/NPC/zone or update detail screens, this component
  // becomes the route adapter without changing the chronology layout.
  return (
    <span
      className="u1-chronicle-entry__source-slot"
      data-source-type={event.sourceType}
      data-source-id={event.sourceId}
      aria-hidden="true"
    />
  )
}

function ChronicleEntry({ event }: { event: ChronicleEvent }) {
  const author = eventAuthor(event)
  const title = event.title.trim()
  const body = event.body.trim()

  return (
    <article
      className={`u1-chronicle-entry u1-chronicle-entry--${event.kind}`}
      data-source-type={event.sourceType}
    >
      <time className="u1-chronicle-entry__time" dateTime={event.publishedAt}>
        {timeLabel(event.publishedAt)}
      </time>

      <div className="u1-chronicle-entry__content">
        <div className="u1-chronicle-entry__kicker">
          {event.kind === "achievement" && (
            <span className="u1-chronicle-entry__achievement-mark" aria-hidden="true" />
          )}
          <span>{eventLabel(event)}</span>
          {author && <span className="u1-chronicle-entry__author">/ {author}</span>}
        </div>

        {title && <h2>{title}</h2>}

        {body && (
          <p className="u1-chronicle-entry__body">
            {body}
          </p>
        )}

        {event.mediaUrl && (
          <figure className="u1-chronicle-entry__media">
            <img
              src={event.mediaUrl}
              alt={title || "Изображение события"}
              loading="lazy"
            />
          </figure>
        )}

        {!title && !body && (
          <p className="u1-chronicle-entry__empty-copy">
            Событие пока не содержит текста.
          </p>
        )}

        <ChronicleSourceAction event={event} />
      </div>
    </article>
  )
}

export function WhatsNew() {
  const {
    campaignTitle,
    events,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  } = useChronicleData()

  const groups = groupEvents(events)

  return (
    <main className="u1-chronicle">
      <header className="u1-chronicle__header">
        <span>Хроника кампании</span>
        <h1>Что нового</h1>
        <p>{campaignTitle || "Кампания"}</p>
      </header>

      <div className="u1-chronicle__rule" aria-hidden="true" />

      {loading ? (
        <div className="u1-chronicle__loading" aria-label="Загрузка хроники">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : error ? (
        <section className="u1-chronicle__state">
          <strong>Хроника временно недоступна</strong>
          <p>{error}</p>
          <button type="button" onClick={() => void refresh()}>
            Повторить
          </button>
        </section>
      ) : groups.length === 0 ? (
        <section className="u1-chronicle__state">
          <strong>Пока тихо</strong>
          <p>Новые события кампании появятся здесь автоматически.</p>
        </section>
      ) : (
        <div className="u1-chronicle__stream">
          {groups.map((group) => (
            <section className="u1-chronicle-day" key={group.key}>
              <h2 className="u1-chronicle-day__label">{group.label}</h2>
              <div className="u1-chronicle-day__events">
                {group.events.map((event) => (
                  <ChronicleEntry key={event.id} event={event} />
                ))}
              </div>
            </section>
          ))}

          {hasMore && (
            <button
              className="u1-chronicle__older"
              type="button"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Загружаю…" : "Показать более ранние события"}
            </button>
          )}
        </div>
      )}
    </main>
  )
}
