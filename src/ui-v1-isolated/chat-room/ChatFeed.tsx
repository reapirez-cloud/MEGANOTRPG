import { useEffect, useRef } from "react"

import {
  chatEventTypeLabel,
  type UiChatEvent,
} from "./chatEventModel"
import { useChatRoomEvents } from "./useChatRoomEvents"

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function AuthorAvatar({ event }: { event: UiChatEvent }) {
  if (event.author.avatarUrl) {
    return (
      <img
        className="u1-room-event__avatar"
        src={event.author.avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    )
  }

  return (
    <span className="u1-room-event__avatar u1-room-event__avatar--fallback" aria-hidden="true">
      {(event.author.name.trim()[0] || "◇").toLocaleUpperCase("ru-RU")}
    </span>
  )
}

function GameEvent({ event }: { event: UiChatEvent }) {
  return (
    <article
      className="u1-room-game-event"
      data-event-type={event.type}
      aria-label={chatEventTypeLabel(event.type)}
    >
      <span className="u1-room-game-event__rail" aria-hidden="true" />
      <div className="u1-room-game-event__body">
        <div className="u1-room-game-event__meta">
          <span>{chatEventTypeLabel(event.type)}</span>
          <time>{formatMessageTime(event.createdAt)}</time>
        </div>
        <strong>{event.game?.label || event.body || chatEventTypeLabel(event.type)}</strong>
        {event.game?.detail ? <small>{event.game.detail}</small> : null}
        {event.body && event.body !== event.game?.label ? (
          <p>{event.body}</p>
        ) : null}
        <em>{event.author.name}</em>
      </div>
    </article>
  )
}

function SystemEvent({ event }: { event: UiChatEvent }) {
  return (
    <div className="u1-room-system-event" role="note">
      <span>{event.body || "Системное событие"}</span>
      <time>{formatMessageTime(event.createdAt)}</time>
    </div>
  )
}

function MessageEvent({ event }: { event: UiChatEvent }) {
  const gmNarration = event.type === "gm_message"

  return (
    <article
      className="u1-room-event"
      data-event-type={event.type}
      data-gm={gmNarration || undefined}
    >
      <AuthorAvatar event={event} />
      <div className="u1-room-event__content">
        <header>
          <strong>{event.author.name}</strong>
          {gmNarration ? <span>GM</span> : null}
          <time>{formatMessageTime(event.createdAt)}</time>
        </header>

        {event.body ? <p>{event.body}</p> : null}

        {event.media ? (
          <figure className="u1-room-event__media">
            <img
              src={event.media.url}
              alt={event.body ? "" : "Изображение в чате"}
              loading="lazy"
              decoding="async"
            />
          </figure>
        ) : null}

        {event.editedAt ? <small>изменено</small> : null}
      </div>
    </article>
  )
}

function EventRow({ event }: { event: UiChatEvent }) {
  if (event.type === "system") return <SystemEvent event={event} />

  if (
    event.type === "roll" ||
    event.type === "spell" ||
    event.type === "attack" ||
    event.type === "item" ||
    event.type === "class_ability"
  ) {
    return <GameEvent event={event} />
  }

  return <MessageEvent event={event} />
}

export default function ChatFeed({ roomId }: { roomId: string }) {
  const { events, loading, error, reload } = useChatRoomEvents(roomId)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const initialPositionedRef = useRef(false)

  useEffect(() => {
    if (loading || initialPositionedRef.current || !feedRef.current) return

    feedRef.current.scrollTop = feedRef.current.scrollHeight
    initialPositionedRef.current = true
  }, [loading])

  if (loading) {
    return (
      <section className="u1-room-feed u1-room-feed--loading" aria-busy="true" aria-label="Загрузка сообщений">
        <div className="u1-room-feed-skeleton"><i /><i /><i /><i /></div>
      </section>
    )
  }

  if (error && events.length === 0) {
    return (
      <section className="u1-room-feed u1-room-feed--state" role="alert">
        <strong>Сообщения не загрузились</strong>
        <span>{error}</span>
        <button type="button" onClick={() => void reload()}>Повторить</button>
      </section>
    )
  }

  if (events.length === 0) {
    return (
      <section className="u1-room-feed u1-room-feed--state" aria-label="Лента чата">
        <strong>Здесь пока тихо</strong>
        <span>Первое сообщение появится здесь без лишнего театра.</span>
      </section>
    )
  }

  return (
    <section
      ref={feedRef}
      className="u1-room-feed"
      aria-label="Лента чата"
      data-event-count={events.length}
    >
      {error ? (
        <div className="u1-room-feed__warning" role="status">
          Не удалось обновить ленту. Показываю последние данные.
        </div>
      ) : null}

      <div className="u1-room-feed__list">
        {events.map((event) => <EventRow key={event.id} event={event} />)}
      </div>
    </section>
  )
}
