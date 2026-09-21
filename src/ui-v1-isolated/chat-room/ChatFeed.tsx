import { useCallback, useEffect, useRef, useState } from "react"

import { CHAT_MESSAGE_SENT_EVENT } from "./chatRoomContracts"
import ChatFeedItem from "./ChatFeedItem"
import { useChatRoomEvents } from "./useChatRoomEvents"

const BOTTOM_THRESHOLD = 96
const LOAD_OLDER_THRESHOLD = 72

export default function ChatFeed({
  roomId,
  viewerUserId,
}: {
  roomId: string
  viewerUserId: string
}) {
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
      data-chat-feed-stage="4"
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
        {events.map((event) => {
          const isOwn = Boolean(
            event.author.userId && event.author.userId === viewerUserId,
          )
          const side =
            event.type === "system" ? "system" : isOwn ? "own" : "other"

          return (
            <div
              className="u1-room-feed__entry"
              data-feed-entry-type={event.type}
              data-feed-entry-side={side}
              key={event.id}
            >
              <ChatFeedItem
                event={event}
                isOwn={isOwn}
                onMediaLoad={() => {
                  if (pinnedToBottomRef.current) scrollToBottom("auto")
                }}
              />
            </div>
          )
        })}
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
