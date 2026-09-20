import { useMemo, useState, type CSSProperties } from "react"

import {
  filterChatCatalogRooms,
  type ChatCatalogFilter,
} from "../chat/catalogFilters"
import {
  formatRoomActivity,
  formatRoomCompletion,
  formatUnreadCount,
  roomContextParts,
  roomStatus,
} from "../chat/catalogPresentation"
import type { ChatRoom } from "../types/chat"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { createChatRoomSnakeActions } from "./chatSnakeActions"
import { useUiV1ChatCatalog } from "./useUiV1ChatCatalog"
import "./chat-catalog.css"

type ExpandedSections = Record<"personal" | "events" | "completed", boolean>

const PERSONAL_PREVIEW_LIMIT = 4
const EVENT_PREVIEW_LIMIT = 3
const COMPLETED_PREVIEW_LIMIT = 3

const filters: Array<{ value: ChatCatalogFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "personal", label: "Личные" },
  { value: "events", label: "События" },
  { value: "flood", label: "Флуд" },
  { value: "completed", label: "Завершённые" },
  { value: "unread", label: "Непрочитанные" },
]

function roomTypeLabel(room: ChatRoom) {
  if (room.room_type === "character") return "История"
  if (room.room_type === "scene") return "Событие"
  return "Флуд"
}

function ChatArt({
  room,
  fallback,
  className = "u1-chat-art",
  usePresentation = false,
}: {
  room: ChatRoom
  fallback: string
  className?: string
  usePresentation?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const crop = usePresentation ? room.avatar_presentation?.crop : null
  const imageStyle: CSSProperties | undefined = crop
    ? {
        position: "absolute",
        width: `${100 / crop.width}%`,
        height: `${100 / crop.height}%`,
        left: `${(-100 * crop.x) / crop.width}%`,
        top: `${(-100 * crop.y) / crop.height}%`,
        right: "auto",
        bottom: "auto",
        maxWidth: "none",
        objectFit: "fill",
      }
    : undefined

  return (
    <span className={className} aria-hidden="true">
      {room.avatar_url && !failed ? (
        <img
          src={room.avatar_url}
          alt=""
          decoding="async"
          loading="lazy"
          style={imageStyle}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="u1-chat-art__fallback">{fallback}</span>
      )}
    </span>
  )
}

function Skeleton() {
  return (
    <main className="u1-chat u1-chat--loading" aria-busy="true" aria-label="Загрузка чатов">
      <div className="u1-chat-skeleton u1-chat-skeleton--toolbar" />
      <div className="u1-chat-skeleton u1-chat-skeleton--heading" />
      <div className="u1-chat-skeleton u1-chat-skeleton--hero" />
      <div className="u1-chat-skeleton u1-chat-skeleton--flood" />
      <div className="u1-chat-skeleton u1-chat-skeleton--heading" />
      <div className="u1-chat-skeleton-rail">
        <i /><i /><i /><i />
      </div>
      <div className="u1-chat-skeleton u1-chat-skeleton--heading" />
      <div className="u1-chat-skeleton-list"><i /><i /><i /></div>
    </main>
  )
}

export default function ChatCatalog({ onOpenRoom }: { onOpenRoom: (roomId: string) => void }) {
  const data = useUiV1ChatCatalog()
  const snake = useSnake()
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<ChatCatalogFilter>("all")
  const [expanded, setExpanded] = useState<ExpandedSections>({
    personal: false,
    events: false,
    completed: false,
  })

  const characterMap = useMemo(
    () => new Map(data.characters.map((character) => [character.id, character])),
    [data.characters],
  )

  const query = searchQuery.trim()
  const browsing = Boolean(query) || filter !== "all"

  function characterIdentity(room: ChatRoom) {
    if (!room.character_id) return ""
    const character = characterMap.get(room.character_id)
    if (!character) return ""
    return [
      character.character_class || "Без класса",
      character.level ? character.level + " ур." : "",
    ].filter(Boolean).join(" · ")
  }

  function roomMeta(room: ChatRoom) {
    const context = roomContextParts(room)
    if (room.room_type === "character") {
      return [characterIdentity(room), ...context].filter(Boolean).join(" · ") || "Личная история"
    }
    if (room.room_type === "scene") {
      return [...context, roomStatus(room).label].filter(Boolean).join(" · ")
    }
    return roomStatus(room).label
  }

  function roomSearchText(room: ChatRoom) {
    return [roomTypeLabel(room), characterIdentity(room), roomMeta(room)]
      .filter(Boolean)
      .join(" ")
  }

  const visiblePersonal = filterChatCatalogRooms({
    rooms: data.catalog.personalActive,
    query,
    filter,
    section: "personal",
    extraText: roomSearchText,
  })
  const visibleEvents = filterChatCatalogRooms({
    rooms: data.catalog.eventsActive,
    query,
    filter,
    section: "events",
    extraText: roomSearchText,
  })
  const visibleCompleted = filterChatCatalogRooms({
    rooms: data.catalog.completed,
    query,
    filter,
    section: "completed",
    extraText: roomSearchText,
  })
  const visibleFlood = filterChatCatalogRooms({
    rooms: data.catalog.flood ? [data.catalog.flood] : [],
    query,
    filter,
    section: "flood",
    extraText: roomSearchText,
  })[0] ?? null

  const totalMatches =
    visiblePersonal.length +
    visibleEvents.length +
    visibleCompleted.length +
    (visibleFlood ? 1 : 0)

  const personalShown =
    browsing || expanded.personal
      ? visiblePersonal
      : visiblePersonal.slice(0, PERSONAL_PREVIEW_LIMIT)
  const eventsShown =
    browsing || expanded.events
      ? visibleEvents
      : visibleEvents.slice(0, EVENT_PREVIEW_LIMIT)
  const completedShown =
    browsing || expanded.completed
      ? visibleCompleted
      : visibleCompleted.slice(0, COMPLETED_PREVIEW_LIMIT)

  function resetBrowsing() {
    setSearchQuery("")
    setSearchOpen(false)
    setFilter("all")
    setFilterOpen(false)
  }

  function openRoom(room: ChatRoom) {
    onOpenRoom(room.id)
  }

  function roomSnakeActions(room: ChatRoom) {
    const details = [
      roomMeta(room),
      room.preview || "Пока без сообщений",
      formatRoomActivity(room) ? "Последняя активность · " + formatRoomActivity(room) : "",
    ].filter(Boolean).join("\n\n")

    return createChatRoomSnakeActions({
      room,
      details,
      canManage: data.canManage,
      openRoom: () => openRoom(room),
      setPreview: (input) => data.setRoomPreview(room, input),
      deleteScene: () => data.deleteScene(room),
    })
  }

  function openCreateEvent() {
    snake.openSurface({
      kind: "placeholder",
      eyebrow: "События",
      title: "Новое событие",
      body: "Создание события подключается отдельным потоком. Личные истории создаются только автоматически по жизненному циклу персонажа.",
      size: { width: "compact", height: "content" },
    })
  }

  function sectionControl(
    section: keyof ExpandedSections,
    count: number,
    limit: number,
  ) {
    if (browsing || count <= limit) {
      return <span className="u1-chat-section__count">{count}</span>
    }

    const open = expanded[section]
    return (
      <button
        type="button"
        className="u1-chat-section__link"
        aria-expanded={open}
        onClick={() =>
          setExpanded((current) => ({ ...current, [section]: !current[section] }))
        }
      >
        {open ? "Свернуть" : "Все (" + count + ")"}
        <span aria-hidden="true">{open ? "⌃" : "›"}</span>
      </button>
    )
  }

  function portraitCard(
    room: ChatRoom,
    variant: "personal" | "event" | "completed",
  ) {
    const activity = formatRoomActivity(room)
    const meta =
      variant === "personal"
        ? characterIdentity(room) || "Личная история"
        : variant === "completed"
          ? formatRoomCompletion(room)
          : roomMeta(room)
    const fallback =
      variant === "personal" ? "◇" : variant === "event" ? "✦" : "◆"

    return (
      <SnakeTrigger
        key={room.id}
        entity={{ type: "chat_room", id: room.id }}
        actions={roomSnakeActions(room)}
      >
        <button
          type="button"
          className={"u1-chat-card u1-chat-card--" + variant}
          data-tone={roomStatus(room).tone}
          onClick={() => openRoom(room)}
          title={room.title}
        >
          <span className="u1-chat-card__media">
            <ChatArt room={room} fallback={fallback} usePresentation />
          </span>
          <span className="u1-chat-card__shade" aria-hidden="true" />

          <span className="u1-chat-card__top">
            <small>{roomTypeLabel(room)}</small>
            {activity && <time>{activity}</time>}
          </span>

          <span className="u1-chat-card__copy">
            <strong>{room.title}</strong>
            {meta && <span className="u1-chat-card__meta">{meta}</span>}
            <span className="u1-chat-card__preview">
              {room.preview || "Пока без сообщений"}
            </span>
          </span>

          {room.unread_count > 0 && (
            <b
              className="u1-chat-card__badge"
              aria-label={"Непрочитанных: " + room.unread_count}
            >
              {formatUnreadCount(room.unread_count)}
            </b>
          )}
        </button>
      </SnakeTrigger>
    )
  }

  function row(room: ChatRoom, variant: "event" | "completed" | "flood") {
    const activity = formatRoomActivity(room)
    const meta = variant === "completed" ? formatRoomCompletion(room) : roomMeta(room)

    return (
      <SnakeTrigger
        key={room.id}
        entity={{ type: "chat_room", id: room.id }}
        actions={roomSnakeActions(room)}
      >
      <button
        type="button"
        className={"u1-chat-row u1-chat-row--" + variant}
        data-tone={roomStatus(room).tone}
        onClick={() => openRoom(room)}
        title={room.title}
      >
        <ChatArt room={room} fallback={variant === "flood" ? "☵" : variant === "event" ? "✦" : "◇"} />
        <span className="u1-chat-row__copy">
          <span className="u1-chat-row__title">
            <strong>{room.title}</strong>
            {variant === "completed" && <small>{roomTypeLabel(room)}</small>}
          </span>
          {meta && <span className="u1-chat-row__meta">{meta}</span>}
          <span className="u1-chat-row__preview">{room.preview || "Пока без сообщений"}</span>
        </span>
        <span className="u1-chat-row__side">
          {activity && <time>{activity}</time>}
          {room.unread_count > 0 ? (
            <b aria-label={"Непрочитанных: " + room.unread_count}>
              {formatUnreadCount(room.unread_count)}
            </b>
          ) : (
            variant !== "flood" && <span aria-hidden="true">›</span>
          )}
        </span>
      </button>
      </SnakeTrigger>
    )
  }

  if (data.loading) return <Skeleton />

  if (data.error && data.rooms.length === 0) {
    return (
      <main className="u1-chat">
        <section className="u1-chat-state" role="alert">
          <span aria-hidden="true">!</span>
          <h1>Чаты не загрузились</h1>
          <p>Каталог временно недоступен. Комнаты и сообщения не изменены.</p>
          <button type="button" onClick={() => void data.reload()}>Повторить</button>
        </section>
      </main>
    )
  }

  const hero = !browsing ? data.catalog.currentStory : null
  const catalogEmpty = data.rooms.length === 0

  return (
    <main className="u1-chat" data-chat-catalog-stage="8">
      {data.error && (
        <div className="u1-chat-warning" role="status">
          <span>Не удалось обновить каталог. Показываю последние данные.</span>
          <button type="button" onClick={() => void data.reload()}>Повторить</button>
        </div>
      )}

      <header className="u1-chat-toolbar">
        <div>
          <span>MEGANOT / CHATS</span>
          <strong>{data.campaignTitle || "Чаты"}</strong>
          <small>Люди · миры · истории</small>
        </div>
        <div className="u1-chat-toolbar__actions">
          <button
            type="button"
            aria-label="Поиск"
            data-active={searchOpen || Boolean(query) || undefined}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false)
                setSearchQuery("")
              } else {
                setSearchOpen(true)
              }
            }}
          >⌕</button>
          <button
            type="button"
            aria-label="Фильтр"
            data-active={filterOpen || filter !== "all" || undefined}
            onClick={() => setFilterOpen((current) => !current)}
          >≡</button>
          {data.canManage && (
            <button
              type="button"
              className="u1-chat-toolbar__add"
              aria-label="Создать событие"
              onClick={openCreateEvent}
            >+</button>
          )}
        </div>
      </header>

      {(searchOpen || filterOpen || filter !== "all") && (
        <div className="u1-chat-browse">
          {searchOpen && (
            <label className="u1-chat-search">
              <span aria-hidden="true">⌕</span>
              <input
                autoFocus
                autoComplete="off"
                value={searchQuery}
                placeholder="Название, персонаж, зона, сообщение…"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {query && (
                <button type="button" aria-label="Очистить поиск" onClick={() => setSearchQuery("")}>
                  ×
                </button>
              )}
            </label>
          )}
          {(filterOpen || filter !== "all") && (
            <div className="u1-chat-filters" aria-label="Фильтр чатов">
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={filter === option.value || undefined}
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {catalogEmpty && !browsing && (
        <section className="u1-chat-state">
          <span aria-hidden="true">◇</span>
          <h1>Здесь пока тихо</h1>
          <p>Комнаты появятся автоматически или после создания события мастером.</p>
        </section>
      )}

      {!catalogEmpty && !browsing && (
        <section className="u1-chat-section">
          <div className="u1-chat-section__head">
            <h2>Текущая история</h2>
          </div>
          {hero ? (
            <SnakeTrigger
              entity={{ type: "chat_room", id: hero.id }}
              actions={roomSnakeActions(hero)}
            >
              <button type="button" className="u1-chat-hero" onClick={() => openRoom(hero)}>
                <ChatArt room={hero} fallback="✦" className="u1-chat-hero__media" />
                <span className="u1-chat-hero__shade" aria-hidden="true" />
                <span className="u1-chat-hero__copy">
                  <small>{roomTypeLabel(hero)}</small>
                  <strong>{hero.title}</strong>
                  <span>{hero.preview || "Пока без сообщений"}</span>
                  <em>{roomMeta(hero)}</em>
                </span>
                <span className="u1-chat-hero__state">
                  <b>{roomStatus(hero).label}</b>
                  <small>{formatRoomActivity(hero)}</small>
                </span>
                {hero.unread_count > 0 && (
                  <i className="u1-chat-badge">{formatUnreadCount(hero.unread_count)}</i>
                )}
              </button>
            </SnakeTrigger>
          ) : (
            <div className="u1-chat-empty">Активной игровой истории пока нет.</div>
          )}
        </section>
      )}

      {!catalogEmpty && (!browsing || visibleFlood) && visibleFlood && (
        <section className="u1-chat-section u1-chat-section--flood">
          {row(visibleFlood, "flood")}
        </section>
      )}

      {!catalogEmpty && (!browsing || visiblePersonal.length > 0) && (
        <section className="u1-chat-section">
          <div className="u1-chat-section__head">
            <span>
              <h2>Личные истории</h2>
              <small>Истории персонажей</small>
            </span>
            {sectionControl("personal", visiblePersonal.length, PERSONAL_PREVIEW_LIMIT)}
          </div>
          {visiblePersonal.length ? (
            <div
              className={
                "u1-chat-card-rail" +
                (expanded.personal || browsing ? " is-expanded" : "")
              }
            >
              {personalShown.map((room) => portraitCard(room, "personal"))}
            </div>
          ) : (
            <div className="u1-chat-empty">Личных историй пока нет.</div>
          )}
        </section>
      )}

      {!catalogEmpty && (!browsing || visibleEvents.length > 0) && (
        <section className="u1-chat-section">
          <div className="u1-chat-section__head">
            <span>
              <h2>События</h2>
              <small>Сюжетные ветки · кампании · временные игры</small>
            </span>
            {sectionControl("events", visibleEvents.length, EVENT_PREVIEW_LIMIT)}
          </div>
          {eventsShown.length ? (
            <div
              className={
                "u1-chat-card-rail" +
                (expanded.events || browsing ? " is-expanded" : "")
              }
            >
              {eventsShown.map((room) => portraitCard(room, "event"))}
            </div>
          ) : (
            <div className="u1-chat-empty">Активных событий пока нет.</div>
          )}
        </section>
      )}

      {!catalogEmpty && (!browsing || visibleCompleted.length > 0) && (
        <section className="u1-chat-section">
          <div className="u1-chat-section__head">
            <span>
              <h2>Завершённые</h2>
              <small>Истории остаются с нами</small>
            </span>
            {sectionControl("completed", visibleCompleted.length, COMPLETED_PREVIEW_LIMIT)}
          </div>
          {completedShown.length ? (
            <div
              className={
                "u1-chat-card-rail" +
                (expanded.completed || browsing ? " is-expanded" : "")
              }
            >
              {completedShown.map((room) => portraitCard(room, "completed"))}
            </div>
          ) : (
            <div className="u1-chat-empty">Завершённых историй пока нет.</div>
          )}
        </section>
      )}

      {browsing && totalMatches === 0 && (
        <div className="u1-chat-no-results" role="status">
          <strong>Ничего не найдено</strong>
          <span>Поиск и фильтры не нашли подходящих комнат.</span>
          <button type="button" onClick={resetBrowsing}>Сбросить поиск и фильтр</button>
        </div>
      )}
    </main>
  )
}
