import { useState } from "react"
import type { FormEvent } from "react"

import { useRooms } from "../hooks/useRooms"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import type { ChatRoom } from "../types/chat"

type Props = { onOpenRoom: (id: string) => void }

function RoomList({
  items,
  onOpenRoom,
}: {
  items: ChatRoom[]
  onOpenRoom: (id: string) => void
}) {
  return (
    <div className="chat-section surface">
      {items.length === 0 && <div className="empty-row">Здесь пока нет чатов</div>}
      {items.map((room) => (
        <button
          key={room.id}
          type="button"
          className="chat-row"
          onClick={() => onOpenRoom(room.id)}
        >
          <div className={`avatar chat-room-avatar chat-room-avatar--${room.category}`}>
            {room.category === "flood" ? "F" : room.title.slice(0, 1)}
          </div>
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
  )
}

export default function Chats({ onOpenRoom }: Props) {
  const { profile } = useAuth()
  const { activeCharacter, isGm, isOwner, canManage } = useCharacters()
  const {
    rooms,
    campaignTitle,
    loading,
    error,
    reload,
    createGameRoom,
  } = useRooms()

  const [creating, setCreating] = useState(false)
  const [newRoomTitle, setNewRoomTitle] = useState("")
  const [createError, setCreateError] = useState("")
  const [saving, setSaving] = useState(false)

  const floodRooms = rooms.filter((room) => room.category === "flood").slice(0, 1)
  const gameRooms = rooms.filter((room) => room.category === "game")

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
        <button
          type="button"
          className="primary-mini-button"
          onClick={() => void reload()}
        >
          Повторить
        </button>
      </div>
    )
  }

  const identity = activeCharacter
    ? `${activeCharacter.name} (${profile.display_name})`
    : isOwner
      ? `Владелец (${profile.display_name})`
      : isGm
        ? `GM (${profile.display_name})`
        : "Персонаж не назначен"

  const roleAvatar = activeCharacter ?? (
    isOwner
      ? { name: "Владелец", avatar_url: null }
      : isGm
        ? { name: "GM", avatar_url: null }
        : null
  )

  async function submitRoom(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setCreateError("")
    const result = await createGameRoom(newRoomTitle)
    setSaving(false)

    if (!result.ok) {
      setCreateError(result.error || "Не удалось создать чат.")
      return
    }

    setCreating(false)
    setNewRoomTitle("")
    if (result.id) onOpenRoom(result.id)
  }

  return (
    <>
      <div className="page-stack">
        <div className="campaign-strip campaign-strip--character">
          <div>
            <div className="campaign-strip__label">Кампания</div>
            <div className="campaign-strip__title">{campaignTitle}</div>
          </div>

          <div className="assigned-character-chip">
            <CharacterAvatar character={roleAvatar} size="small" />
            <span>
              <small>В игре</small>
              <strong>{identity}</strong>
            </span>
          </div>
        </div>

        <section className="section chat-room-section chat-room-section--flood">
          <div className="section-head">
            <div>
              <h3 className="section-title">Флуд</h3>
              <p className="item-meta">Всегда доступен всем участникам кампании</p>
            </div>
          </div>
          <RoomList items={floodRooms} onOpenRoom={onOpenRoom} />
        </section>

        <section className="section chat-room-section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Игра</h3>
              <p className="item-meta">Игровые чаты создаёт GM</p>
            </div>
            {canManage && (
              <button
                className="section-link"
                type="button"
                onClick={() => {
                  setCreateError("")
                  setNewRoomTitle("")
                  setCreating(true)
                }}
              >
                + Новый
              </button>
            )}
          </div>
          <RoomList items={gameRooms} onOpenRoom={onOpenRoom} />
        </section>
      </div>

      {creating && (
        <div className="sheet-backdrop" onMouseDown={() => setCreating(false)}>
          <form
            className="bottom-sheet compact-editor-sheet"
            onSubmit={submitRoom}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">Новый игровой чат</h3>
                <p className="sheet-copy">
                  После создания открой настройки внутри чата и добавь игроков.
                </p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setCreating(false)}
              >
                ×
              </button>
            </div>

            <label className="field-label" htmlFor="new-game-room-title">
              Название
            </label>
            <input
              id="new-game-room-title"
              className="app-input"
              value={newRoomTitle}
              onChange={(event) => setNewRoomTitle(event.target.value)}
              placeholder="Например: Таверна «Старый Грифон»"
              maxLength={100}
              autoFocus
            />

            {createError && <div className="auth-error">{createError}</div>}
            <button className="sheet-save" type="submit" disabled={saving}>
              {saving ? "Создаём…" : "Создать и открыть"}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
