import type { UiChatEvent, UiChatEventType } from "./chatEventModel"
import { presentGameEvent } from "./chatGameEventPresentation"

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function GameIcon({ type }: { type: UiChatEventType }) {
  if (type === "roll") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.7 7.3 4.2v8.2L12 21.3l-7.3-6.2V6.9L12 2.7Z" />
        <path d="m4.7 6.9 7.3 4.3 7.3-4.3M12 11.2v10.1" />
        <path d="m8.2 5 3.8 6.2L15.8 5" />
      </svg>
    )
  }

  if (type === "spell") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 4.2c3.2-1 5.7-.4 7.5 1.6v14c-1.8-2-4.3-2.6-7.5-1.6v-14Z" />
        <path d="M19.5 4.2c-3.2-1-5.7-.4-7.5 1.6v14c1.8-2 4.3-2.6 7.5-1.6v-14Z" />
        <path d="m16.4 8.2.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6.6-1.3Z" />
      </svg>
    )
  }

  if (type === "attack") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 19 4-4M8 16l8.8-8.8 2 2L10 18l-2-2Z" />
        <path d="m15.7 5.9 2.5-2.5 2.4 2.4-2.5 2.5M4 20h5" />
      </svg>
    )
  }

  if (type === "item") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8.5V6.8A5 5 0 0 1 12 2a5 5 0 0 1 5 4.8v1.7" />
        <path d="M4.5 8.5h15l-1 12h-13l-1-12Z" />
        <path d="M9 12h6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8 15 9l6.2 3-6.2 3-3 6.2L9 15l-6.2-3L9 9l3-6.2Z" />
      <circle cx="12" cy="12" r="2.1" />
    </svg>
  )
}

export default function ChatGameEventCard({ event }: { event: UiChatEvent }) {
  const presentation = presentGameEvent(event)

  return (
    <article
      className="u1-room-game-card"
      data-event-type={event.type}
      aria-label={presentation.eyebrow}
    >
      <div className="u1-room-game-card__icon">
        <GameIcon type={event.type} />
      </div>

      <div className="u1-room-game-card__content">
        <header className="u1-room-game-card__header">
          <span>{presentation.eyebrow}</span>
          <time>{formatMessageTime(event.createdAt)}</time>
        </header>

        <div className="u1-room-game-card__title">
          <strong>{presentation.title}</strong>
          {presentation.subtitle ? <small>{presentation.subtitle}</small> : null}
        </div>

        {presentation.chips.length ? (
          <div className="u1-room-game-card__chips">
            {presentation.chips.map((chip) => <span key={chip}>{chip}</span>)}
          </div>
        ) : null}

        {presentation.stats.length ? (
          <div
            className="u1-room-game-card__stats"
            data-stat-count={presentation.stats.length}
          >
            {presentation.stats.map((stat) => (
              <div
                key={stat.label}
                data-emphasis={stat.emphasis || undefined}
              >
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {presentation.resources.length ? (
          <div className="u1-room-game-card__resources">
            {presentation.resources.map((resource, index) => (
              <div key={resource.label + ":" + index}>
                <span>{resource.label}</span>
                <strong>
                  {resource.amount !== null ? "−" + resource.amount : "Расход"}
                </strong>
                {resource.current !== null && resource.max !== null ? (
                  <small>{resource.current} / {resource.max}</small>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {presentation.note ? (
          <p className="u1-room-game-card__note">{presentation.note}</p>
        ) : null}

        <footer className="u1-room-game-card__footer">
          <span>{event.author.name}</span>
          {event.editedAt ? <small>изменено</small> : null}
        </footer>
      </div>
    </article>
  )
}
