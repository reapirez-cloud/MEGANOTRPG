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

export default function Chats({ onOpenRoom }: Props) {
  // Stage 1 deliberately keeps the route contract alive while the new catalog
  // is isolated from ChatRoom. Catalog navigation is connected in a later stage.
  void onOpenRoom

  const { characters } = useCharacters()
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

  function roomArtwork(room: ChatRoom, fallback: string) {
    return (
      <span className="chat-catalog__art" aria-hidden="true">
        {room.avatar_url
          ? <CampaignImage value={room.avatar_url} alt="" />
          : <span>{fallback}</span>}
      </span>
    )
  }

  function compactRoom(room: ChatRoom, fallback: string) {
    return (
      <article className="chat-catalog__row" key={room.id} data-room-id={room.id}>
        {roomArtwork(room, fallback)}
        <span className="chat-catalog__row-copy">
          <span className="chat-catalog__row-title">
            <strong>{room.title}</strong>
            <small>{roomTypeLabel(room)}</small>
          </span>
          <span className="chat-catalog__meta">{roomMeta(room)}</span>
          <span className="chat-catalog__preview">{room.preview || "Пока без сообщений"}</span>
        </span>
        <span className="chat-catalog__row-side">
          <time>{room.time}</time>
          {room.unread_count > 0 && (
            <b aria-label={"Непрочитанных: " + room.unread_count}>
              {room.unread_count > 99 ? "99+" : room.unread_count}
            </b>
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
    <div className="chats-v3 chat-catalog" data-chat-catalog-stage="2">
      {rooms.error && <div className="auth-error">{rooms.error}</div>}

      <header className="chat-catalog__page-head">
        <div>
          <span>Кампания</span>
          <h2>Чаты</h2>
        </div>
        <small>Игровой каталог</small>
      </header>

      <section className="chat-catalog__section chat-catalog__section--hero" aria-labelledby="chat-current-title">
        <header className="chat-catalog__section-head">
          <div>
            <span>Продолжить</span>
            <h3 id="chat-current-title">Текущая история</h3>
          </div>
          {catalog.currentStory && <small>{roomTypeLabel(catalog.currentStory)}</small>}
        </header>

        {catalog.currentStory ? (
          <article className="chat-catalog__hero" data-room-id={catalog.currentStory.id}>
            {roomArtwork(catalog.currentStory, "✦")}
            <div className="chat-catalog__hero-copy">
              <span className="chat-catalog__meta">{roomMeta(catalog.currentStory)}</span>
              <h4>{catalog.currentStory.title}</h4>
              <p>{catalog.currentStory.preview || "История пока ждёт первого сообщения."}</p>
            </div>
            {catalog.currentStory.unread_count > 0 && (
              <b className="chat-catalog__hero-unread">
                {catalog.currentStory.unread_count > 99 ? "99+" : catalog.currentStory.unread_count}
              </b>
            )}
          </article>
        ) : (
          <div className="chat-catalog__empty">Активной игровой истории пока нет.</div>
        )}
      </section>

      <section className="chat-catalog__flood" aria-label="Флуд">
        {catalog.flood ? (
          compactRoom(catalog.flood, "◌")
        ) : (
          <div className="chat-catalog__empty">Флуд пока не создан.</div>
        )}
      </section>

      <section className="chat-catalog__section" aria-labelledby="chat-personal-title">
        <header className="chat-catalog__section-head">
          <div>
            <span>Персонажи</span>
            <h3 id="chat-personal-title">Личные истории</h3>
          </div>
          <small>{catalog.personalActive.length}</small>
        </header>

        {catalog.personalActive.length > 0 ? (
          <div className="chat-catalog__personal-strip">
            {catalog.personalActive.map((room) => (
              <article className="chat-catalog__personal-card" key={room.id} data-room-id={room.id}>
                {roomArtwork(room, "◇")}
                <span className="chat-catalog__personal-copy">
                  <strong>{room.title}</strong>
                  <small>{roomMeta(room)}</small>
                  <span>{room.preview || "Пока без сообщений"}</span>
                </span>
                {room.unread_count > 0 && (
                  <b>{room.unread_count > 99 ? "99+" : room.unread_count}</b>
                )}
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
            <span>Игра</span>
            <h3 id="chat-events-title">События</h3>
          </div>
          <small>{catalog.eventsActive.length}</small>
        </header>

        <div className="chat-catalog__list">
          {catalog.eventsActive.map((room) => compactRoom(room, "✦"))}
          {!catalog.eventsActive.length && (
            <div className="chat-catalog__empty">Активных событий пока нет.</div>
          )}
        </div>
      </section>

      <section className="chat-catalog__section chat-catalog__section--completed" aria-labelledby="chat-completed-title">
        <header className="chat-catalog__section-head">
          <div>
            <span>Архив</span>
            <h3 id="chat-completed-title">Завершённые</h3>
          </div>
          <small>{catalog.completed.length}</small>
        </header>

        <div className="chat-catalog__list">
          {catalog.completed.map((room) => compactRoom(room, room.room_type === "character" ? "◇" : "✦"))}
          {!catalog.completed.length && (
            <div className="chat-catalog__empty">Завершённых историй и событий пока нет.</div>
          )}
        </div>
      </section>

      <p className="chat-catalog__stage-note">
        Данные каталога подключены; экран диалога пока остаётся отключён.
      </p>
    </div>
  )
}
