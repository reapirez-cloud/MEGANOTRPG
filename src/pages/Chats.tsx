import { useRooms } from "../hooks/useRooms"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import type { ChatRoom } from "../types/chat"

type Props = { onOpenRoom: (id: string) => void }

function RoomList({ title, items, onOpenRoom }: {
  title: string
  items: ChatRoom[]
  onOpenRoom: (id: string) => void
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h3 className="section-title">{title}</h3>
        {title === "Игра" && <button className="section-link" type="button" disabled>+ Новый</button>}
      </div>

      <div className="chat-section surface">
        {items.length === 0 && <div className="empty-row">Здесь пока нет комнат</div>}
        {items.map((room) => (
          <button key={room.id} type="button" className="chat-row" onClick={() => onOpenRoom(room.id)}>
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
  const { profile } = useAuth()
  const { activeCharacter, isGm, isOwner } = useCharacters()
  const { rooms, campaignTitle, loading, error, reload } = useRooms()

  const gameRooms = rooms.filter((room) => room.category === "game")
  const floodRooms = rooms.filter((room) => room.category === "flood")

  if (loading) {
    return <div className="center-state"><span className="status-spinner" /><div>Загружаем комнаты…</div></div>
  }

  if (error) {
    return (
      <div className="center-state">
        <strong>Не удалось загрузить чаты</strong>
        <span>{error}</span>
        <button type="button" className="primary-mini-button" onClick={() => void reload()}>Повторить</button>
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

  return (
    <div className="page-stack">
      <div className="campaign-strip campaign-strip--character">
        <div>
          <div className="campaign-strip__label">Кампания</div>
          <div className="campaign-strip__title">{campaignTitle}</div>
        </div>

        <div className="assigned-character-chip">
          <CharacterAvatar character={roleAvatar} size="small" />
          <span><small>В игре</small><strong>{identity}</strong></span>
        </div>
      </div>

      <RoomList title="Игра" items={gameRooms} onOpenRoom={onOpenRoom} />
      <RoomList title="Флуд" items={floodRooms} onOpenRoom={onOpenRoom} />
    </div>
  )
}
