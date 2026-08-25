import { useState } from "react"
import type { FormEvent } from "react"

import { useRooms } from "../hooks/useRooms"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import ContextActionSheet, {
  type ContextAction,
} from "../components/common/ContextActionSheet"
import type { ChatRoom } from "../types/chat"
import { useLongPressItem } from "../hooks/useLongPressItem"

type Props = { onOpenRoom: (id: string) => void }

function RoomList({
  items,
  onOpenRoom,
  onManage,
}: {
  items: ChatRoom[]
  onOpenRoom: (id: string) => void
  onManage: (room: ChatRoom) => void
}) {
  const bindLongPress = useLongPressItem<ChatRoom>((room) => {
    onManage(room)
  })

  return (
    <div className="chat-section surface">
      {items.length === 0 && <div className="empty-row">Здесь пока нет чатов</div>}
      {items.map((room) => (
        <article
          {...bindLongPress(room)}
          key={room.id}
          className="chat-row-wrap"
          style={{ touchAction: "pan-y" }}
        >
          <button type="button" className="chat-row" onClick={() => onOpenRoom(room.id)}>
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
            {room.unread_count > 0 && <span className="chat-unread-badge">{room.unread_count > 99 ? "99+" : room.unread_count}</span>}
          </button>
          <button
            className="chat-row-menu"
            type="button"
            aria-label={`Действия: ${room.title}`}
            onClick={() => onManage(room)}
          >
            •••
          </button>
        </article>
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
    renameRoom,
    deleteRoom,
  } = useRooms()

  const [creating, setCreating] = useState(false)
  const [newRoomTitle, setNewRoomTitle] = useState("")
  const [createError, setCreateError] = useState("")
  const [saving, setSaving] = useState(false)
  const [managedRoom, setManagedRoom] = useState<ChatRoom | null>(null)
  const [roomMenu, setRoomMenu] = useState<ChatRoom | null>(null)
  const [managedTitle, setManagedTitle] = useState("")
  const [manageError, setManageError] = useState("")

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
        ? `ГМ (${profile.display_name})`
        : "Персонаж не назначен"

  const roleAvatar = activeCharacter ?? (
    isOwner
      ? { name: "Владелец", avatar_url: null }
      : isGm
        ? { name: "ГМ", avatar_url: null }
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

  function openRoomMenu(room: ChatRoom) {
    setRoomMenu(room)
  }

  function openRoomEditor(room: ChatRoom) {
    setManagedRoom(room)
    setManagedTitle(room.title)
    setManageError("")
  }

  async function saveManagedRoom(event: FormEvent) {
    event.preventDefault()
    if (!managedRoom) return
    setSaving(true)
    const result = await renameRoom(managedRoom.id, managedTitle)
    setSaving(false)
    if (!result.ok) {
      setManageError(result.error || "Не удалось переименовать чат.")
      return
    }
    setManagedRoom(null)
  }

  async function removeManagedRoom() {
    if (!managedRoom) return
    if (!window.confirm(`Удалить чат «${managedRoom.title}» вместе с сообщениями?`)) return
    setSaving(true)
    const result = await deleteRoom(managedRoom.id)
    setSaving(false)
    if (!result.ok) {
      setManageError(result.error || "Не удалось удалить чат.")
      return
    }
    setManagedRoom(null)
  }

  async function removeRoom(room: ChatRoom) {
    if (!window.confirm(`Удалить чат «${room.title}» вместе с сообщениями?`)) return
    setSaving(true)
    setManageError("")
    const result = await deleteRoom(room.id)
    setSaving(false)
    if (!result.ok) {
      setManageError(result.error || "Не удалось удалить чат.")
    }
  }

  function roomActions(room: ChatRoom): ContextAction[] {
    return [
      {
        id: "open",
        label: "Открыть чат",
        detail: room.category === "flood" ? "Перейти во флуд" : "Перейти в игровую сцену",
        icon: "↗",
        onSelect: () => onOpenRoom(room.id),
      },
      ...(canManage && room.category === "game"
        ? [
            {
              id: "rename",
              label: "Переименовать",
              detail: "Изменить название комнаты",
              icon: "✎",
              onSelect: () => openRoomEditor(room),
            },
            {
              id: "delete",
              label: "Удалить чат",
              detail: "Комната и сообщения будут удалены",
              icon: "×",
              danger: true,
              onSelect: () => removeRoom(room),
            },
          ]
        : []),
    ]
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
          <RoomList items={floodRooms} onOpenRoom={onOpenRoom} onManage={openRoomMenu} />
        </section>

        <section className="section chat-room-section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Игра</h3>
              <p className="item-meta">Игровые чаты создаёт ГМ</p>
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
          <RoomList items={gameRooms} onOpenRoom={onOpenRoom} onManage={openRoomMenu} />
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

      {managedRoom && (
        <div className="sheet-backdrop" onMouseDown={() => setManagedRoom(null)}>
          <form className="bottom-sheet compact-editor-sheet" onSubmit={saveManagedRoom} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div><h3 className="sheet-title">Управление чатом</h3><p className="sheet-copy">Комната и её сообщения удалятся вместе.</p></div>
              <button className="sheet-close" type="button" onClick={() => setManagedRoom(null)}>×</button>
            </div>
            <label className="field-label" htmlFor="managed-room-title">Название</label>
            <input id="managed-room-title" className="app-input" value={managedTitle} onChange={(event) => setManagedTitle(event.target.value)} maxLength={100} autoFocus />
            {manageError && <div className="auth-error">{manageError}</div>}
            <div className="editor-action-row">
              <button className="danger-mini-button" type="button" onClick={() => void removeManagedRoom()} disabled={saving}>Удалить чат</button>
              <button className="sheet-save" type="submit" disabled={saving || !managedTitle.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</button>
            </div>
          </form>
        </div>
      )}

      {roomMenu && (
        <ContextActionSheet
          title={roomMenu.title}
          subtitle="Долгое нажатие открывает действия с чатом"
          actions={roomActions(roomMenu)}
          onClose={() => setRoomMenu(null)}
        />
      )}
    </>
  )
}
