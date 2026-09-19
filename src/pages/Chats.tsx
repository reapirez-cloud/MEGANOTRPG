import { useMemo, useState } from "react"

import {
  filterChatCatalogRooms,
  type ChatCatalogFilter,
} from "../chat/catalogFilters"
import {
  formatRoomActivity,
  formatRoomActivityDate,
  formatRoomCompletion,
  formatUnreadCount,
  roomContextParts,
  roomStatus,
} from "../chat/catalogPresentation"
import CampaignImage from "../components/common/CampaignImage"
import { useCharacters } from "../context/CharacterContext"
import { useRooms } from "../hooks/useRooms"
import type { ChatRoom } from "../types/chat"
import "../chats-v3.css"

type Props = { onOpenRoom: (id: string) => void }

type ExpandedSections = Record<"personal" | "events" | "completed", boolean>

type CatalogPlaceholder =
  | { kind: "room"; title: string; roomType: string }
  | { kind: "create-event"; title: string }
  | null

const PERSONAL_PREVIEW_LIMIT = 4
const EVENT_PREVIEW_LIMIT = 3
const COMPLETED_PREVIEW_LIMIT = 3

const filterOptions: Array<{ value: ChatCatalogFilter; label: string }> = [
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

function sectionMatchesBrowsing(
  browsing: boolean,
  rooms: ChatRoom[],
) {
  return !browsing || rooms.length > 0
}

function CatalogArtwork({
  room,
  fallback,
  className = "chat-catalog__art",
}: {
  room: ChatRoom
  fallback: string
  className?: string
}) {
  const [failedValue, setFailedValue] = useState<string | null>(null)
  const mediaFailed = Boolean(room.avatar_url && failedValue === room.avatar_url)
  const fallbackNode = <span className="chat-catalog__art-fallback">{fallback}</span>

  return (
    <span className={className} aria-hidden="true">
      {room.avatar_url && !mediaFailed ? (
        <CampaignImage
          value={room.avatar_url}
          alt=""
          decoding="async"
          fallback={fallbackNode}
          onError={() => setFailedValue(room.avatar_url)}
        />
      ) : fallbackNode}
    </span>
  )
}

function ChatCatalogSkeleton() {
  return (
    <div
      className="chats-v3 chat-catalog chat-catalog--loading"
      data-chat-catalog-stage="7"
      aria-busy="true"
      aria-label="Загрузка чатов"
    >
      <header className="chat-catalog__toolbar chat-catalog__skeleton-toolbar" aria-hidden="true">
        <span className="chat-catalog__skeleton-line chat-catalog__skeleton-line--brand" />
        <span className="chat-catalog__skeleton-tools">
          <i /><i /><i />
        </span>
      </header>

      <section aria-hidden="true">
        <span className="chat-catalog__skeleton-line chat-catalog__skeleton-line--heading" />
        <div className="chat-catalog__skeleton-hero" />
      </section>

      <div className="chat-catalog__skeleton-flood" aria-hidden="true" />

      <section aria-hidden="true">
        <span className="chat-catalog__skeleton-line chat-catalog__skeleton-line--heading" />
        <div className="chat-catalog__skeleton-personal">
          {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
        </div>
      </section>

      <section aria-hidden="true">
        <span className="chat-catalog__skeleton-line chat-catalog__skeleton-line--heading" />
        <div className="chat-catalog__skeleton-list">
          <i /><i /><i />
        </div>
      </section>
    </div>
  )
}

export default function Chats({ onOpenRoom }: Props) {
  // Stage 6 intentionally stops at the catalog boundary. The retained route
  // contract is for the later dialog stage, not for this interaction pass.
  void onOpenRoom

  const { characters, canManage } = useCharacters()
  const rooms = useRooms()
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<ChatCatalogFilter>("all")
  const [expanded, setExpanded] = useState<ExpandedSections>({
    personal: false,
    events: false,
    completed: false,
  })
  const [placeholder, setPlaceholder] = useState<CatalogPlaceholder>(null)

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )

  const catalog = rooms.catalog
  const query = searchQuery.trim()
  const browsing = Boolean(query) || filter !== "all"

  function characterIdentity(room: ChatRoom) {
    if (!room.character_id) return ""
    const character = characterMap.get(room.character_id)
    if (!character) return ""
    return (character.character_class || "Без класса") + " · " + character.level + " ур."
  }

  function roomMeta(room: ChatRoom) {
    const context = roomContextParts(room)

    if (room.room_type === "character") {
      const identity = characterIdentity(room)
      return [identity, ...context].filter(Boolean).join(" · ") || "Личная история"
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
    rooms: catalog.personalActive,
    query,
    filter,
    section: "personal",
    extraText: roomSearchText,
  })
  const visibleEvents = filterChatCatalogRooms({
    rooms: catalog.eventsActive,
    query,
    filter,
    section: "events",
    extraText: roomSearchText,
  })
  const visibleCompleted = filterChatCatalogRooms({
    rooms: catalog.completed,
    query,
    filter,
    section: "completed",
    extraText: roomSearchText,
  })
  const visibleFlood = filterChatCatalogRooms({
    rooms: catalog.flood ? [catalog.flood] : [],
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

  function toggleExpanded(section: keyof ExpandedSections) {
    setExpanded((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  function resetBrowsing() {
    setSearchQuery("")
    setSearchOpen(false)
    setFilter("all")
    setFilterOpen(false)
  }

  function sectionControl(
    section: keyof ExpandedSections,
    count: number,
    limit: number,
  ) {
    if (browsing || count <= limit) {
      return <span className="chat-catalog__section-count">{count}</span>
    }

    return (
      <button
        className="chat-catalog__section-link"
        type="button"
        onClick={() => toggleExpanded(section)}
        aria-expanded={expanded[section]}
      >
        {expanded[section] ? "Свернуть" : "Все (" + count + ")"}
        <b aria-hidden="true">{expanded[section] ? "⌃" : "›"}</b>
      </button>
    )
  }

  function openRoomStub(room: ChatRoom) {
    setPlaceholder({
      kind: "room",
      title: room.title,
      roomType: roomTypeLabel(room),
    })
  }

  function openCreateEventStub() {
    setPlaceholder({
      kind: "create-event",
      title: "Новое событие",
    })
  }

  function roomArtwork(room: ChatRoom, fallback: string, className = "chat-catalog__art") {
    return <CatalogArtwork room={room} fallback={fallback} className={className} />
  }

  function rowRoom(room: ChatRoom, fallback: string, variant: "event" | "completed" | "flood") {
    const status = roomStatus(room)
    const meta = variant === "completed" ? formatRoomCompletion(room) : roomMeta(room)
    const activity = formatRoomActivity(room)

    return (
      <button
        className={"chat-catalog__row chat-catalog__row--" + variant}
        key={room.id}
        type="button"
        data-room-id={room.id}
        data-room-status={status.tone}
        aria-label={roomTypeLabel(room) + ": " + room.title}
        title={room.title}
        onClick={() => openRoomStub(room)}
      >
        {roomArtwork(room, fallback)}
        <span className="chat-catalog__row-copy">
          <span className="chat-catalog__row-title">
            <strong>{room.title}</strong>
            {variant === "completed" && <small>{roomTypeLabel(room)}</small>}
          </span>
          {meta && <span className="chat-catalog__meta">{meta}</span>}
          <span className="chat-catalog__preview">{room.preview || "Пока без сообщений"}</span>
        </span>
        <span className="chat-catalog__row-side">
          {activity && <time>{activity}</time>}
          {room.unread_count > 0 ? (
            <b aria-label={"Непрочитанных: " + room.unread_count}>
              {formatUnreadCount(room.unread_count)}
            </b>
          ) : (
            variant !== "flood" && <span className="chat-catalog__chevron" aria-hidden="true">›</span>
          )}
        </span>
      </button>
    )
  }

  const hero = !browsing ? catalog.currentStory : null
  const heroStatus = hero ? roomStatus(hero) : null
  const heroActivity = hero ? formatRoomActivity(hero) : ""
  const catalogEmpty = rooms.rooms.length === 0

  if (rooms.loading) return <ChatCatalogSkeleton />

  if (rooms.error && catalogEmpty) {
    return (
      <div className="chats-v3 chat-catalog" data-chat-catalog-stage="7">
        <section className="chat-catalog__state chat-catalog__state--error" role="alert">
          <span className="chat-catalog__state-mark" aria-hidden="true">!</span>
          <h3>Чаты не загрузились</h3>
          <p>Каталог временно недоступен. Сообщения и комнаты не изменены.</p>
          <button type="button" onClick={() => void rooms.reload()}>Повторить</button>
        </section>
      </div>
    )
  }

  return (
    <div className="chats-v3 chat-catalog" data-chat-catalog-stage="7">
      {rooms.error && (
        <div className="chat-catalog__refresh-warning" role="status">
          <span>Не удалось обновить каталог. Показываю последние загруженные данные.</span>
          <button type="button" onClick={() => void rooms.reload()}>Повторить</button>
        </div>
      )}

      <header className="chat-catalog__toolbar">
        <div className="chat-catalog__toolbar-copy">
          <span>Люди · миры · истории</span>
          <p>Все игровые разговоры одной кампании</p>
        </div>

        <div className="chat-catalog__toolbar-actions" aria-label="Инструменты каталога">
          <button
            type="button"
            aria-label="Поиск"
            aria-pressed={searchOpen || Boolean(query)}
            className={searchOpen || query ? "is-active" : ""}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false)
                setSearchQuery("")
              } else {
                setSearchOpen(true)
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Фильтр"
            aria-pressed={filterOpen || filter !== "all"}
            className={filterOpen || filter !== "all" ? "is-active" : ""}
            onClick={() => setFilterOpen((current) => !current)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 7h14M8 12h8M10.5 17h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          {canManage && (
            <button
              className="chat-catalog__toolbar-add"
              type="button"
              aria-label="Создать событие"
              onClick={openCreateEventStub}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {(searchOpen || filterOpen || filter !== "all") && (
        <div className="chat-catalog__browse-tools">
          {searchOpen && (
            <label className="chat-catalog__search">
              <span className="sr-only">Поиск по чатам</span>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Название, персонаж, зона, сообщение…"
                autoComplete="off"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => setSearchQuery("")}
                >
                  ×
                </button>
              )}
            </label>
          )}

          {(filterOpen || filter !== "all") && (
            <div className="chat-catalog__filters" aria-label="Фильтр чатов">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={filter === option.value ? "is-active" : ""}
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

      {placeholder && (
        <section
          className="chat-catalog__placeholder"
          data-placeholder-kind={placeholder.kind}
          aria-live="polite"
        >
          <span className="chat-catalog__placeholder-mark" aria-hidden="true">
            {placeholder.kind === "create-event" ? "+" : "◇"}
          </span>
          <span>
            <small>
              {placeholder.kind === "create-event"
                ? "События"
                : placeholder.roomType}
            </small>
            <strong>{placeholder.title}</strong>
            <p>
              {placeholder.kind === "create-event"
                ? "Создание события будет подключено отдельным потоком. Личные истории здесь не создаются вручную."
                : "Экран диалога пока не подключён к новому каталогу. Комната остаётся на месте, сообщения и данные не изменяются."}
            </p>
          </span>
          <button
            type="button"
            aria-label="Закрыть заглушку"
            onClick={() => setPlaceholder(null)}
          >
            ×
          </button>
        </section>
      )}

      {catalogEmpty && !browsing && (
        <section className="chat-catalog__state chat-catalog__state--empty" aria-live="polite">
          <span className="chat-catalog__state-mark" aria-hidden="true">◇</span>
          <h3>Здесь пока тихо</h3>
          <p>Комнаты кампании появятся автоматически или после создания события мастером.</p>
        </section>
      )}

      {!catalogEmpty && !browsing && (
        <section className="chat-catalog__hero-section" aria-labelledby="chat-current-title">
          <header className="chat-catalog__section-head chat-catalog__section-head--hero">
            <h3 id="chat-current-title">Текущая история</h3>
          </header>

          {hero && heroStatus ? (
            <button
              className="chat-catalog__hero"
              type="button"
              data-room-id={hero.id}
              data-room-status={heroStatus.tone}
              aria-label={roomTypeLabel(hero) + ": " + hero.title}
              title={hero.title}
              onClick={() => openRoomStub(hero)}
            >
              {roomArtwork(hero, "✦", "chat-catalog__hero-media")}
              <span className="chat-catalog__hero-shade" aria-hidden="true" />
              <span className="chat-catalog__hero-copy">
                <span className="chat-catalog__hero-kicker">{roomTypeLabel(hero)}</span>
                <strong className="chat-catalog__hero-title">{hero.title}</strong>
                <span className="chat-catalog__hero-preview">{hero.preview || "Пока без сообщений"}</span>
                {roomMeta(hero) && <span className="chat-catalog__hero-meta">{roomMeta(hero)}</span>}
              </span>
              <span className="chat-catalog__hero-status">
                <span data-tone={heroStatus.tone}><i /> {heroStatus.label}</span>
                {heroActivity && <small>Последняя активность · {heroActivity}</small>}
              </span>
              {hero.unread_count > 0 && (
                <b className="chat-catalog__hero-unread">
                  {formatUnreadCount(hero.unread_count)}
                </b>
              )}
              <span className="chat-catalog__hero-chevron" aria-hidden="true">›</span>
            </button>
          ) : (
            <div className="chat-catalog__empty chat-catalog__empty--hero">
              Активной игровой истории пока нет.
            </div>
          )}
        </section>
      )}

      {!catalogEmpty && sectionMatchesBrowsing(browsing, visibleFlood ? [visibleFlood] : []) && (
        <section className="chat-catalog__flood" aria-label="Флуд">
          {visibleFlood ? (
            <>
              <span className="chat-catalog__flood-label">Флуд</span>
              {rowRoom(visibleFlood, "◌", "flood")}
            </>
          ) : (
            !browsing && <div className="chat-catalog__empty">Флуд пока не создан.</div>
          )}
        </section>
      )}

      {!catalogEmpty && sectionMatchesBrowsing(browsing, visiblePersonal) && (
        <section className="chat-catalog__section" aria-labelledby="chat-personal-title">
          <header className="chat-catalog__section-head">
            <div>
              <span className="chat-catalog__section-icon" aria-hidden="true">♟</span>
              <h3 id="chat-personal-title">Личные истории</h3>
            </div>
            {sectionControl("personal", visiblePersonal.length, PERSONAL_PREVIEW_LIMIT)}
          </header>

          {visiblePersonal.length > 0 ? (
            <div className={"chat-catalog__personal-strip" + (expanded.personal && !browsing ? " is-expanded" : "")}>
              {personalShown.map((room) => {
                const context = roomContextParts(room)
                const activityDate = formatRoomActivityDate(room)
                return (
                  <button
                    className="chat-catalog__personal-card"
                    key={room.id}
                    type="button"
                    data-room-id={room.id}
                    aria-label={"Личная история: " + room.title}
                    title={room.title}
                    onClick={() => openRoomStub(room)}
                  >
                    <span className="chat-catalog__personal-media">
                      {roomArtwork(room, "◇")}
                      {room.unread_count > 0 && (
                        <b aria-label={"Непрочитанных: " + room.unread_count}>
                          {formatUnreadCount(room.unread_count)}
                        </b>
                      )}
                    </span>
                    <span className="chat-catalog__personal-copy">
                      <strong>{room.title}</strong>
                      <small>{[characterIdentity(room), ...context].filter(Boolean).join(" · ") || "Личная история"}</small>
                      <span className="chat-catalog__personal-preview">{room.preview || "Пока без сообщений"}</span>
                      {activityDate && <time className="chat-catalog__personal-time">{activityDate}</time>}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="chat-catalog__empty">У живых персонажей пока нет личных историй.</div>
          )}
        </section>
      )}

      {!catalogEmpty && sectionMatchesBrowsing(browsing, visibleEvents) && (
        <section className="chat-catalog__section" aria-labelledby="chat-events-title">
          <header className="chat-catalog__section-head">
            <div>
              <span className="chat-catalog__section-icon" aria-hidden="true">⚔</span>
              <span>
                <h3 id="chat-events-title">События</h3>
                <small>Сюжетные ветки · кампании · временные игры</small>
              </span>
            </div>
            {sectionControl("events", visibleEvents.length, EVENT_PREVIEW_LIMIT)}
          </header>

          <div className="chat-catalog__list chat-catalog__list--events">
            {eventsShown.map((room) => rowRoom(room, "✦", "event"))}
            {!visibleEvents.length && (
              <div className="chat-catalog__empty">Активных событий пока нет.</div>
            )}
          </div>
        </section>
      )}

      {!catalogEmpty && sectionMatchesBrowsing(browsing, visibleCompleted) && (
        <section className="chat-catalog__section chat-catalog__section--completed" aria-labelledby="chat-completed-title">
          <header className="chat-catalog__section-head">
            <div>
              <span className="chat-catalog__section-icon" aria-hidden="true">▣</span>
              <span>
                <h3 id="chat-completed-title">Завершённые</h3>
                <small>Истории остаются с нами</small>
              </span>
            </div>
            {sectionControl("completed", visibleCompleted.length, COMPLETED_PREVIEW_LIMIT)}
          </header>

          <div className="chat-catalog__list chat-catalog__list--completed">
            {completedShown.map((room) =>
              rowRoom(room, room.room_type === "character" ? "◇" : "✦", "completed"),
            )}
            {!visibleCompleted.length && (
              <div className="chat-catalog__empty">Завершённых историй и событий пока нет.</div>
            )}
          </div>
        </section>
      )}

      {browsing && totalMatches === 0 && (
        <div className="chat-catalog__empty chat-catalog__empty--browse" role="status">
          <strong>Ничего не найдено</strong>
          <span>Поиск и фильтры не нашли подходящих комнат.</span>
          <button type="button" onClick={resetBrowsing}>Сбросить поиск и фильтр</button>
        </div>
      )}

      <p className="chat-catalog__stage-note">
        Каталог устойчив к загрузке, ошибкам и большим спискам; экран диалога подключается отдельным роадмапом.
      </p>
    </div>
  )
}
