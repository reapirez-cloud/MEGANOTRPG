import ChatGameEventCard from "./ChatGameEventCard"
import ChatRollRequestCard from "./ChatRollRequestCard"
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

type DialogueGroupPosition = "single" | "first" | "middle" | "last"

function DialogueMessage({
  event,
  isOwn,
  groupPosition,
  onMediaLoad,
}: {
  event: UiChatEvent
  isOwn: boolean
  groupPosition: DialogueGroupPosition
  onMediaLoad: () => void
}) {
  const gmNarration = event.type === "gm_message"
  const gmAuthored = event.author.isGm
  const showAuthor = groupPosition === "single" || groupPosition === "first"

  return (
    <article
      className="u1-chat-line"
      data-chat-dialogue-stage="2"
      data-message-kind={gmNarration ? "narration" : "dialogue"}
      data-event-type={event.type}
      data-author-role={gmAuthored ? "gm" : "player"}
      data-message-side={isOwn ? "own" : "other"}
      data-message-group={groupPosition}
    >
      {showAuthor ? (
        <AuthorAvatar event={event} />
      ) : (
        <span className="u1-chat-line__avatar-spacer" aria-hidden="true" />
      )}

      <div className="u1-chat-line__content">
        <header className="u1-chat-line__meta" data-author-visible={showAuthor || undefined}>
          {showAuthor ? <strong>{event.author.name}</strong> : null}
          {showAuthor && gmAuthored ? (
            <span
              className="u1-chat-line__role"
              data-role="gm"
            >
              {gmNarration ? "GM · Рассказчик" : "GM"}
            </span>
          ) : null}
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
  isOwn,
  groupPosition,
  onMediaLoad,
  viewerUserId,
  campaignId,
}: {
  event: UiChatEvent
  isOwn: boolean
  groupPosition: DialogueGroupPosition
  onMediaLoad: () => void
  viewerUserId: string
  campaignId: string
}) {
  if (event.type === "system") {
    return <SystemEvent event={event} />
  }

  if (event.type === "roll_request") {
    return (
      <ChatRollRequestCard
        event={event}
        viewerUserId={viewerUserId}
        campaignId={campaignId}
      />
    )
  }

  if (isGameEvent(event)) {
    return <ChatGameEventCard event={event} />
  }

  return (
    <DialogueMessage
      event={event}
      isOwn={isOwn}
      groupPosition={groupPosition}
      onMediaLoad={onMediaLoad}
    />
  )
}
