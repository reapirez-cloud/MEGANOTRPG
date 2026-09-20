import { useCallback, useEffect, useRef, useState } from "react"

import {
  CHAT_MESSAGE_SENT_EVENT,
} from "./chatRoomContracts"
import ChatGameEventCard from "./ChatGameEventCard"
import type { UiChatEvent } from "./chatEventModel"
import { useChatRoomEvents } from "./useChatRoomEvents"

const BOTTOM_THRESHOLD = 96
const LOAD_OLDER_THRESHOLD = 72

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

function SystemEvent({ event }: { event: UiChatEvent }) {
  return (
    <div className="u1-room-system-event" role="note">
      <span>{event.body || "Системное событие"}</span>
      <time>{formatMessageTime(event.createdAt)}</time>
    </div>
  )
}

function MessageEvent({
  event,
  onMediaLoad,
}: {
  event: UiChatEvent
  onMediaLoad: () => void
}) {
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
              onLoad={onMediaLoad}
            />
          </figure>
        ) : null}

        {event.editedAt ? <small>изменено</small> : null}
      </div>
    </article>
  )
}

function EventRow({
  event,
  onMediaLoad,
}: {
  event: UiChatEvent
  onMediaLoad: () => void
}) {
  if (event.type === "system") return <SystemEvent event={event} />

  if (
    event.type === "roll" ||
    event.type === "spell" ||
    event.type === "attack" ||
    event.type === "item" ||
    event.type === "class_ability"
  ) {
    return <ChatGameEventCard event={event} />
  }

  return <MessageEvent event={event} onMediaLoad={onMediaLoad} />
}

export default function ChatFeed({ roomId }: { roomId: string }) {
  const {
    events,
    loading,
    refreshing,
    loadingOlder,
    hasMore,
    error,
    reload,
    loadOlder,
    markRead,
  } = useChatRoomEvents(roomId)

  const feedRef = useRef<HTMLDivElement | null>(null)
  const initialPositionedRef = useRef(false)
  const pinnedToBottomRef = useRef(true)
  const forceFollowNextRef = useRef(false)
  const previousLastIdRef = useRef<number | null>(null)
  const pendingRestoreRef = useRef<{
    scrollHeight: number
    scrollTop: number
  } | null>(null)
  const [unseenCount, setUnseenCount] = useState(0)
  const lastMarkedReadRef = useRef<number | null>(null)

  const markLatestRead = useCallback(() => {
    const lastId = events.length ? events[events.length - 1].id : null
    if (!lastId || lastMarkedReadRef.current === lastId) return

    lastMarkedReadRef.current = lastId
    void markRead(lastId).then((ok) => {
      if (!ok && lastMarkedReadRef.current === lastId) {
        lastMarkedReadRef.current = null
      }
    })
  }, [events, markRead])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const feed = feedRef.current
    if (!feed) return

    feed.scrollTo({
      top: feed.scrollHeight,
      behavior,
    })
    pinnedToBottomRef.current = true
    setUnseenCount(0)
  }, [])

  const requestOlder = useCallback(async () => {
    const feed = feedRef.current
    if (!feed || loadingOlder || !hasMore) return

    pendingRestoreRef.current = {
      scrollHeight: feed.scrollHeight,
      scrollTop: feed.scrollTop,
    }
    const loaded = await loadOlder()
    if (!loaded) pendingRestoreRef.current = null
  }, [hasMore, loadOlder, loadingOlder])

  useEffect(() => {
    if (loading || initialPositionedRef.current || !feedRef.current) return

    feedRef.current.scrollTop = feedRef.current.scrollHeight
    pinnedToBottomRef.current = true
    initialPositionedRef.current = true
    previousLastIdRef.current = events.length ? events[events.length - 1].id : null
    markLatestRead()
  }, [events, loading, markLatestRead])

  useEffect(() => {
    const restore = pendingRestoreRef.current
    const feed = feedRef.current
    if (!restore || !feed) return

    pendingRestoreRef.current = null
    window.requestAnimationFrame(() => {
      const heightDelta = feed.scrollHeight - restore.scrollHeight
      feed.scrollTop = restore.scrollTop + Math.max(0, heightDelta)
    })
  }, [events.length])

  useEffect(() => {
    if (!initialPositionedRef.current) return

    const previousLastId = previousLastIdRef.current
    const lastId = events.length ? events[events.length - 1].id : null
    if (lastId === null) return

    if (previousLastId === null) {
      previousLastIdRef.current = lastId
      return
    }

    if (lastId <= previousLastId) return

    const newCount = events.filter((event) => event.id > previousLastId).length
    previousLastIdRef.current = lastId

    if (pendingRestoreRef.current) return

    if (pinnedToBottomRef.current || forceFollowNextRef.current) {
      forceFollowNextRef.current = false
      window.requestAnimationFrame(() => {
        scrollToBottom("smooth")
        markLatestRead()
      })
      return
    }

    setUnseenCount((current) => current + newCount)
  }, [events, markLatestRead, scrollToBottom])

  useEffect(() => {
    const handleOwnMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string }>).detail
      if (detail?.roomId !== roomId) return

      forceFollowNextRef.current = true
      scrollToBottom("smooth")
      markLatestRead()
    }

    window.addEventListener(CHAT_MESSAGE_SENT_EVENT, handleOwnMessage)
    return () => {
      window.removeEventListener(CHAT_MESSAGE_SENT_EVENT, handleOwnMessage)
    }
  }, [markLatestRead, roomId, scrollToBottom])

  const handleScroll = () => {
    const feed = feedRef.current
    if (!feed) return

    const distanceFromBottom =
      feed.scrollHeight - feed.scrollTop - feed.clientHeight
    const pinned = distanceFromBottom <= BOTTOM_THRESHOLD
    pinnedToBottomRef.current = pinned

    if (pinned) {
      if (unseenCount) setUnseenCount(0)
      markLatestRead()
    }

    if (
      feed.scrollTop <= LOAD_OLDER_THRESHOLD &&
      hasMore &&
      !loadingOlder
    ) {
      void requestOlder()
    }
  }

  if (loading) {
    return (
      <section
        className="u1-room-feed u1-room-feed--loading"
        aria-busy="true"
        aria-label="Загрузка сообщений"
      >
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
      data-refreshing={refreshing || undefined}
      onScroll={handleScroll}
    >
      {loadingOlder ? (
        <div className="u1-room-feed__older" role="status">
          <i aria-hidden="true" />
          <span>Загружаю более ранние сообщения</span>
        </div>
      ) : hasMore ? (
        <button
          type="button"
          className="u1-room-feed__older-button"
          onClick={() => void requestOlder()}
        >
          Показать более ранние
        </button>
      ) : null}

      {error ? (
        <div className="u1-room-feed__warning" role="status">
          Не удалось обновить ленту. Показываю последние данные.
        </div>
      ) : null}

      <div className="u1-room-feed__list">
        {events.map((event) => (
          <div className="u1-room-feed__entry" key={event.id}>
            <EventRow
              event={event}
              onMediaLoad={() => {
                if (pinnedToBottomRef.current) scrollToBottom("auto")
              }}
            />
          </div>
        ))}
      </div>

      {unseenCount > 0 ? (
        <button
          type="button"
          className="u1-room-feed__new"
          onClick={() => {
            scrollToBottom("smooth")
            markLatestRead()
          }}
          aria-label={"Новых сообщений: " + unseenCount + ". Перейти вниз"}
        >
          <span>{unseenCount}</span>
          <strong>Новые сообщения</strong>
        </button>
      ) : null}
    </section>
  )
}
