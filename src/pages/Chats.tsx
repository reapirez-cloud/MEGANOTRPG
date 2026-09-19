import { useMemo } from "react"

import CampaignImage from "../components/common/CampaignImage"
import { useCharacters } from "../context/CharacterContext"
import { useRooms } from "../hooks/useRooms"
import type { ChatRoom } from "../types/chat"
import "../chats-v3.css"

type Props = { onOpenRoom: (id: string) => void }

function periodLabel(value: ChatRoom["day_period"]) {
  const labels: Record<ChatRoom["day_period"], string> = {
    dawn: "рассвет",
    morning: "утро",
    day: "день",
    late_day: "после полудня",
    evening: "вечер",
    night: "ночь",
    deep_night: "глубокая ночь",
  }
  return labels[value]
}

function roomTypeLabel(room: ChatRoom) {
  if (room.room_type === "character") return "История"
  if (room.room_type === "scene") return "Событие"
  return "Флуд"
}

function unreadLabel(count: number) {
  return count > 99 ? "99+" : String(count)
}

export default function Chats({ onOpenRoom }: Props) {
  // Stage 3 is geometry-only. Catalog navigation remains intentionally
  // disconnected until the interaction stage.
  void onOpenRoom

  const { characters, canManage } = useCharacters()
  const rooms = useRooms()

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )

  const catalog = rooms.catalog

  function roomMeta(room: ChatRoom) {
    if (room.room_type === "character" && room.character_id) {
      const character = characterMap.get(room.character_id)
      if (!character) return "Личная история"
      return (character.character_class || "Без класса") + " · " + character.level + " ур."
    }

    if (room.room_type === "scene") {
      return "День " + room.campaign_day + " · " + periodLabel(room.day_period)
    }

    return "Общий разговор кампании"
  }

  function roomArtwork(room: ChatRoom, fallback: string, className = "chat-catalog__art") {
    return (
      <span className={className} aria-hidden="true">
        {room.avatar_url
          ? <CampaignImage value={room.avatar_url} alt="" />
          : <span>{fallback}</span>}
      </span>
    )
  }

  function rowRoom(room: ChatRoom, fallback: string, variant: "event" | "completed" | "flood") {
    return (
      <article
        className={"chat-catalog__row chat-catalog__row--" + variant}
        key={room.id}
        data-room-id={room.id}
      >
        {roomArtwork(room, fallback)}
        <span className="chat-catalog__row-copy">
          <span className="chat-catalog__row-title">
            <strong>{room.title}</strong>
            {variant === "completed" && <small>{roomTypeLabel(room)}</small>}
          </span>
          <span className="chat-catalog__meta">{roomMeta(room)}</span>
          <span className="chat-catalog__preview">{room.preview || "Пока без сообщений"}</span>
        </span>
        <span className="chat-catalog__row-side">
          <time>{room.time}</time>
          {room.unread_count > 0 ? (
            <b aria-label={"Непрочитанных: " + room.unread_count}>
              {unreadLabel(room.unread_count)}
            </b>
          ) : (
            variant !== "flood" && <span className="chat-catalog__chevron" aria-hidden="true">›</span>
          )}
        </span>
      </article>
    )
  }

  if (rooms.loading) {
    return (
      <div className="center-state">
        <span className="status-spinner" />
        <span>Загружаем чаты…</span>
      </div>
    )
  }

  return (
    <div className="chats-v3 chat-catalog" data-chat-catalog-stage="3">
      {rooms.error && <div className="auth-error">{rooms.error}</div>}

      <header className="chat-catalog__toolbar">
        <div className="chat-catalog__toolbar-copy">
          <span>Люди · миры · истории</span>
          <p>Все игровые разговоры одной кампании</p>
        </div>

        <div className="chat-catalog__toolbar-actions" aria-label="Инструменты каталога">
          <button type="button" aria-label="Поиск" disabled>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" aria-label="Фильтр" disabled>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 7h14M8 12h8M10.5 17h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          {canManage && (
            <button className="chat-catalog__toolbar-add" type="button" aria-label="Создать событие" disabled>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <section className="chat-catalog__hero-section" aria-labelledby="chat-current-title">
        <header className="chat-catalog__section-head chat-catalog__section-head--hero">
          <h3 id="chat-current-title">Текущая история</h3>
        </header>

        {catalog.currentStory ? (
          <article className="chat-catalog__hero" data-room-id={catalog.currentStory.id}>
            {roomArtwork(catalog.currentStory, "✦", "chat-catalog__hero-media")}
            <span className="chat-catalog__hero-shade" aria-hidden="true" />
            <div className="chat-catalog__hero-copy">
              <span className="chat-catalog__hero-kicker">{roomTypeLabel(catalog.currentStory)}</span>
              <h4>{catalog.currentStory.title}</h4>
              <p>{catalog.currentStory.preview || "История пока ждёт первого сообщения."}</p>
              <span className="chat-catalog__hero-meta">{roomMeta(catalog.currentStory)}</span>
            </div>
            <div className="chat-catalog__hero-status">
              <span><i /> Продолжается</span>
              {catalog.currentStory.time && <small>Последняя активность · {catalog.currentStory.time}</small>}
            </div>
            {catalog.currentStory.unread_count > 0 && (
              <b className="chat-catalog__hero-unread">
                {unreadLabel(catalog.currentStory.unread_count)}
              </b>
            )}
            <span className="chat-catalog__hero-chevron" aria-hidden="true">›</span>
          </article>
        ) : (
          <div className="chat-catalog__empty chat-catalog__empty--hero">
            Активной игровой истории пока нет.
          </div>
        )}
      </section>

      <section className="chat-catalog__flood" aria-label="Флуд">
        {catalog.flood ? (
          <>
            <span className="chat-catalog__flood-label">Флуд</span>
            {rowRoom(catalog.flood, "◌", "flood")}
          </>
        ) : (
          <div className="chat-catalog__empty">Флуд пока не создан.</div>
        )}
      </section>

      <section className="chat-catalog__section" aria-labelledby="chat-personal-title">
        <header className="chat-catalog__section-head">
          <div>
            <span className="chat-catalog__section-icon" aria-hidden="true">♟</span>
            <h3 id="chat-personal-title">Личные истории</h3>
          </div>
          <span className="chat-catalog__section-link">Все ({catalog.personalActive.length}) <b>›</b></span>
        </header>

        {catalog.personalActive.length > 0 ? (
          <div className="chat-catalog__personal-strip">
            {catalog.personalActive.map((room) => (
              <article className="chat-catalog__personal-card" key={room.id} data-room-id={room.id}>
                <div className="chat-catalog__personal-media">
                  {roomArtwork(room, "◇")}
                  {room.unread_count > 0 && (
                    <b aria-label={"Непрочитанных: " + room.unread_count}>
                      {unreadLabel(room.unread_count)}
                    </b>
                  )}
                </div>
                <span className="chat-catalog__personal-copy">
                  <strong>{room.title}</strong>
                  <small>{roomMeta(room)}</small>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="chat-catalog__empty">У живых персонажей пока нет личных историй.</div>
        )}
      </section>

      <section className="chat-catalog__section" aria-labelledby="chat-events-title">
        <header className="chat-catalog__section-head">
          <div>
            <span className="chat-catalog__section-icon" aria-hidden="true">⚔</span>
            <span>
              <h3 id="chat-events-title">События</h3>
              <small>Сюжетные ветки · кампании · временные игры</small>
            </span>
          </div>
          <span className="chat-catalog__section-link">Все ({catalog.eventsActive.length}) <b>›</b></span>
        </header>

        <div className="chat-catalog__list chat-catalog__list--events">
          {catalog.eventsActive.map((room) => rowRoom(room, "✦", "event"))}
          {!catalog.eventsActive.length && (
            <div className="chat-catalog__empty">Активных событий пока нет.</div>
          )}
        </div>
      </section>

      <section className="chat-catalog__section chat-catalog__section--completed" aria-labelledby="chat-completed-title">
        <header className="chat-catalog__section-head">
          <div>
            <span className="chat-catalog__section-icon" aria-hidden="true">▣</span>
            <span>
              <h3 id="chat-completed-title">Завершённые</h3>
              <small>Истории остаются с нами</small>
            </span>
          </div>
          <span className="chat-catalog__section-link">Все ({catalog.completed.length}) <b>›</b></span>
        </header>

        <div className="chat-catalog__list chat-catalog__list--completed">
          {catalog.completed.map((room) =>
            rowRoom(room, room.room_type === "character" ? "◇" : "✦", "completed"),
          )}
          {!catalog.completed.length && (
            <div className="chat-catalog__empty">Завершённых историй и событий пока нет.</div>
          )}
        </div>
      </section>

      <p className="chat-catalog__stage-note">
        Каталог собран; открытие комнат и инструменты подключаются позже.
      </p>
    </div>
  )
}
