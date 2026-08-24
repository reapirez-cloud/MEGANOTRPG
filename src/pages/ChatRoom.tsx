import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useChatMessages } from "../hooks/useChatMessages"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import ChatActionSheet from "../components/chat/ChatActionSheet"
import ChatRoomSettings from "../components/chat/ChatRoomSettings"

type Props = {
  roomId: string
  onBack: () => void
  onOpenCharacter: (characterId: string) => void
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function ChatRoom({
  roomId,
  onBack,
  onOpenCharacter,
}: Props) {
  const { user, profile } = useAuth()
  const {
    characters,
    members,
    activeCharacter,
    isGm,
    isOwner,
    canManage,
  } = useCharacters()

  const [roomTitle, setRoomTitle] = useState("Чат")
  const [roomCategory, setRoomCategory] = useState<"game" | "flood">("game")
  const [canWriteRoom, setCanWriteRoom] = useState(false)
  const [draft, setDraft] = useState("")
  const [actionsOpen, setActionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const {
    messages,
    loading,
    sending,
    error,
    realtime,
    sendMessage,
  } = useChatMessages(roomId)

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )

  const realtimeLabel =
    realtime === "live"
      ? "онлайн"
      : realtime === "connecting"
        ? "подключение"
        : "офлайн"

  const canSendWithoutCharacter = isGm || isOwner
  const hasIdentity = Boolean(activeCharacter || canSendWithoutCharacter)
  const canSend = canWriteRoom && hasIdentity

  useEffect(() => {
    let cancelled = false

    async function loadRoomMeta() {
      const { data: room, error: roomError } = await supabase
        .from("chat_rooms")
        .select("id, title, category")
        .eq("id", roomId)
        .maybeSingle()

      if (cancelled || roomError || !room) return

      setRoomTitle(room.title)
      setRoomCategory(room.category === "flood" ? "flood" : "game")

      if (room.category === "flood" || canManage) {
        setCanWriteRoom(true)
        return
      }

      const { data: accessRow } = await supabase
        .from("chat_room_members")
        .select("can_write")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (!cancelled) setCanWriteRoom(Boolean(accessRow?.can_write))
    }

    void loadRoomMeta()
    return () => {
      cancelled = true
    }
  }, [canManage, roomId, user.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSend) return
    const sent = await sendMessage(draft)
    if (sent) setDraft("")
  }

  const activeLabel = activeCharacter
    ? `${activeCharacter.name} (${profile.display_name})`
    : isOwner
      ? `Владелец (${profile.display_name})`
      : isGm
        ? `GM (${profile.display_name})`
        : "Нет персонажа"

  const roleAvatar = activeCharacter ?? (
    isOwner
      ? { name: "Владелец", avatar_url: null }
      : isGm
        ? { name: "GM", avatar_url: null }
        : null
  )

  const placeholder = !canWriteRoom
    ? "В этой комнате у тебя только чтение"
    : activeCharacter
      ? `От лица ${activeCharacter.name}…`
      : isOwner
        ? "Сообщение от владельца…"
        : isGm
          ? "Сообщение от GM…"
          : "Нет активного персонажа"

  return (
    <div className="screen chat-v11-screen">
      <header className="screen-header chat-v11-header">
        <button
          className="icon-button"
          type="button"
          onClick={onBack}
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="m15 5-7 7 7 7"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="room-heading">
          <h1 className="screen-header__title">{roomTitle}</h1>
          <div className={`live-state live-state--${realtime}`}>
            <span />
            {realtimeLabel}
            {roomCategory === "game" ? " · игра" : " · флуд"}
          </div>
        </div>

        {canManage && roomCategory === "game" ? (
          <button
            className="chat-settings-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки чата"
          >
            ⚙
          </button>
        ) : (
          <span className="chat-header-spacer" />
        )}
      </header>

      <div className="message-list message-list--avatars">
        {loading && <div className="chat-state">Загружаем сообщения…</div>}

        {!loading && messages.length === 0 && (
          <div className="chat-state">
            Здесь пока пусто. Первое сообщение может быть твоим.
          </div>
        )}

        {messages.map((message) => {
          const own = message.user_id === user.id
          const linkedCharacter = message.character_id
            ? characterById.get(message.character_id) ?? null
            : null
          const avatarCharacter = linkedCharacter ?? {
            name: message.author_name,
            avatar_url: message.author_avatar_url,
          }

          return (
            <div
              className={`message-row ${own ? "message-row--self" : ""}`}
              key={message.id}
            >
              {!own && (
                <CharacterAvatar character={avatarCharacter} size="small" />
              )}
              <article className={`message ${own ? "message--self" : ""}`}>
                <div className="message__author">{message.author_name}</div>
                <p className="message__text">{message.body}</p>
                <div className="message__time">
                  {formatTime(message.created_at)}
                </div>
              </article>
              {own && (
                <CharacterAvatar character={avatarCharacter} size="small" />
              )}
            </div>
          )
        })}

        {error && <div className="chat-error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {activeCharacter ? (
        <button
          className="chat-character-bar"
          type="button"
          onClick={() => onOpenCharacter(activeCharacter.id)}
        >
          <CharacterAvatar character={activeCharacter} size="small" />
          <span className="chat-character-bar__copy">
            <small>Твой персонаж · нажми, чтобы открыть</small>
            <strong>{activeLabel}</strong>
          </span>
          <span className="chat-character-bar__chevron">›</span>
        </button>
      ) : canSendWithoutCharacter ? (
        <div className="chat-character-bar chat-character-bar--role">
          <CharacterAvatar character={roleAvatar} size="small" />
          <span className="chat-character-bar__copy">
            <small>Ты пишешь от роли</small>
            <strong>{activeLabel}</strong>
          </span>
        </div>
      ) : (
        <div className="chat-character-warning">
          К твоему Telegram-профилю пока не прикреплён активный персонаж.
        </div>
      )}

      {!canWriteRoom && (
        <div className="chat-readonly-line">
          Ты можешь читать этот чат, но GM не дал право писать.
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <button
          className="icon-button composer__icon chat-action-button"
          type="button"
          onClick={() => setActionsOpen(true)}
          disabled={!canWriteRoom}
          aria-label="Действия"
        >
          +
        </button>

        <input
          className="composer__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          maxLength={4000}
          autoComplete="off"
          disabled={!canSend}
        />

        <button
          className="send-button"
          type="submit"
          disabled={!canSend || !draft.trim() || sending}
          aria-label="Отправить"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="m5 12 13-7-4 14-3-5-6-2Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="m11 14 7-9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </form>

      {actionsOpen && (
        <ChatActionSheet
          roomId={roomId}
          characterId={activeCharacter?.id || null}
          onClose={() => setActionsOpen(false)}
        />
      )}

      {settingsOpen && (
        <ChatRoomSettings
          roomId={roomId}
          roomTitle={roomTitle}
          members={members}
          characters={characters}
          onClose={() => setSettingsOpen(false)}
          onSaved={(nextTitle) => setRoomTitle(nextTitle)}
        />
      )}
    </div>
  )
}
