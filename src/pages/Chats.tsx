import { useState } from "react"
import { useRooms } from "../hooks/useRooms"
import { getDemoAuthorName, setDemoAuthorName } from "../lib/demoIdentity"
import type { ChatRoom } from "../types/chat"

type Props = {
  onOpenRoom: (id: string) => void
}

function RoomList({
  title,
  items,
  onOpenRoom,
}: {
  title: string
  items: ChatRoom[]
  onOpenRoom: (id: string) => void
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h3 className="section-title">{title}</h3>
        {title === "Игра" && (
          <button className="section-link" type="button" disabled>
            + Новый
          </button>
        )}
      </div>

      <div className="chat-section surface">
        {items.length === 0 && (
          <div className="empty-row">Здесь пока нет комнат</div>
        )}

        {items.map((room) => (
          <button
            key={room.id}
            type="button"
            className="chat-row"
            onClick={() => onOpenRoom(room.id)}
          >
            <div className="avatar">{room.title.slice(0, 1)}</div>

            <div className="chat-row__content">
              <div className="chat-row__top">
                <span className="chat-row__title">{room.title}</span>
                <span className="chat-row__time">{room.time}</span>
              </div>
              <div className="chat-row__preview">{room.preview}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Chats({ onOpenRoom }: Props) {
  const { rooms, campaignTitle, loading, error, reload } = useRooms()
  const [identityOpen, setIdentityOpen] = useState(false)
  const [name, setName] = useState(() => getDemoAuthorName())

  const gameRooms = rooms.filter((room) => room.category === "game")
  const floodRooms = rooms.filter((room) => room.category === "flood")

  function saveIdentity() {
    const cleaned = name.trim()
    if (!cleaned) return

    setDemoAuthorName(cleaned)
    setIdentityOpen(false)
  }

  if (loading) {
    return (
      <div className="center-state">
        <span className="status-spinner" />
        <div>Загружаем комнаты…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="center-state">
        <strong>Не удалось загрузить чаты</strong>
        <span>{error}</span>
        <button type="button" className="primary-mini-button" onClick={() => void reload()}>
          Повторить
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="page-stack">
        <div className="campaign-strip">
          <div>
            <div className="campaign-strip__label">Кампания</div>
            <div className="campaign-strip__title">{campaignTitle}</div>
          </div>

          <button
            type="button"
            className="identity-chip"
            onClick={() => setIdentityOpen(true)}
          >
            Вы: {getDemoAuthorName()}
          </button>
        </div>

        <RoomList title="Игра" items={gameRooms} onOpenRoom={onOpenRoom} />
        <RoomList title="Флуд" items={floodRooms} onOpenRoom={onOpenRoom} />
      </div>

      {identityOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setIdentityOpen(false)}>
          <div className="bottom-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <h3 className="sheet-title">Тестовый профиль</h3>
            <p className="sheet-copy">
              Пока Telegram-вход не подключён, имя хранится только в этом браузере.
            </p>

            <label className="field-label" htmlFor="demo-name">
              Имя в чате
            </label>
            <input
              id="demo-name"
              className="app-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoFocus
            />

            <button type="button" className="sheet-save" onClick={saveIdentity}>
              Сохранить
            </button>
          </div>
        </div>
      )}
    </>
  )
}
