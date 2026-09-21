import ChatGameEventCard from "./ChatGameEventCard"
import type { UiChatEvent } from "./chatEventModel"

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
        className="u1-chat-line__avatar"
        src={event.author.avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    )
  }

  return (
    <span
      className="u1-chat-line__avatar u1-chat-line__avatar--fallback"
      aria-hidden="true"
    >
      {(event.author.name.trim()[0] || "◇").toLocaleUpperCase("ru-RU")}
    </span>
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

function DialogueMessage({
  event,
  onMediaLoad,
}: {
  event: UiChatEvent
  onMediaLoad: () => void
}) {
  const gmNarration = event.type === "gm_message"
  const gmAuthored = event.author.isGm

  return (
    <article
      className="u1-chat-line"
      data-message-kind={gmNarration ? "narration" : "dialogue"}
      data-event-type={event.type}
      data-author-role={gmAuthored ? "gm" : "player"}
    >
      <AuthorAvatar event={event} />

      <div className="u1-chat-line__content">
        <header className="u1-chat-line__meta">
          <strong>{event.author.name}</strong>
          <span
            className="u1-chat-line__role"
            data-role={gmAuthored ? "gm" : "player"}
          >
            {gmAuthored ? (gmNarration ? "GM · Рассказчик" : "GM") : "Игрок"}
          </span>
          <time>{formatMessageTime(event.createdAt)}</time>
        </header>

        {event.body ? <p className="u1-chat-line__body">{event.body}</p> : null}

        {event.media ? (
          <figure className="u1-chat-line__media">
            <img
              src={event.media.url}
              alt={event.body ? "" : "Изображение в чате"}
              loading="lazy"
              decoding="async"
              onLoad={onMediaLoad}
            />
          </figure>
        ) : null}

        {event.editedAt ? (
          <small className="u1-chat-line__edited">изменено</small>
        ) : null}
      </div>
    </article>
  )
}

function isGameEvent(event: UiChatEvent) {
  return (
    event.type === "roll" ||
    event.type === "spell" ||
    event.type === "attack" ||
    event.type === "item" ||
    event.type === "class_ability"
  )
}

export default function ChatFeedItem({
  event,
  onMediaLoad,
}: {
  event: UiChatEvent
  onMediaLoad: () => void
}) {
  if (event.type === "system") {
    return <SystemEvent event={event} />
  }

  if (isGameEvent(event)) {
    return <ChatGameEventCard event={event} />
  }

  return <DialogueMessage event={event} onMediaLoad={onMediaLoad} />
}
