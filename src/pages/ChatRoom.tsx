import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useChatMessages } from "../hooks/useChatMessages"
import CharacterAvatar from "../components/characters/CharacterAvatar"

type Props = { roomId: string; onBack: () => void }

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

export default function ChatRoom({ roomId, onBack }: Props) {
  const { user, profile } = useAuth()
  const { characters, activeCharacter } = useCharacters()
  const [roomTitle, setRoomTitle] = useState("Чат")
  const [draft, setDraft] = useState("")
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const { messages, loading, sending, error, realtime, sendMessage } = useChatMessages(roomId)

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )

  const realtimeLabel =
    realtime === "live" ? "онлайн" :
    realtime === "connecting" ? "подключение" : "офлайн"

  useEffect(() => {
    void supabase
      .from("chat_rooms")
      .select("title")
      .eq("id", roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.title) setRoomTitle(data.title)
      })
  }, [roomId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!activeCharacter) return
    const sent = await sendMessage(draft)
    if (sent) setDraft("")
  }

  const activeLabel = activeCharacter
    ? `${activeCharacter.name} (${profile.display_name})`
    : "Нет персонажа"

  return (
    <div className="screen">
      <header className="screen-header screen-header--with-character">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>

        <div className="room-heading">
          <h1 className="screen-header__title">{roomTitle}</h1>
          <div className={`live-state live-state--${realtime}`}><span />{realtimeLabel}</div>
        </div>

        <div className="chat-active-character">
          <CharacterAvatar character={activeCharacter} size="small" />
          <strong>{activeLabel}</strong>
        </div>
      </header>

      <div className="message-list message-list--avatars">
        {loading && <div className="chat-state">Загружаем сообщения…</div>}

        {!loading && messages.length === 0 && (
          <div className="chat-state">Здесь пока пусто. Первое сообщение может быть твоим.</div>
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
            <div className={`message-row ${own ? "message-row--self" : ""}`} key={message.id}>
              {!own && <CharacterAvatar character={avatarCharacter} size="small" />}
              <article className={`message ${own ? "message--self" : ""}`}>
                <div className="message__author">{message.author_name}</div>
                <p className="message__text">{message.body}</p>
                <div className="message__time">{formatTime(message.created_at)}</div>
              </article>
              {own && <CharacterAvatar character={avatarCharacter} size="small" />}
            </div>
          )
        })}

        {error && <div className="chat-error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {!activeCharacter && (
        <div className="chat-character-warning">
          GM должен прикрепить персонажа к твоему профилю и сделать его активным.
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <button className="icon-button composer__icon" type="button">◇</button>
        <input
          className="composer__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={activeCharacter ? `От лица ${activeCharacter.name}…` : "Нет активного персонажа"}
          maxLength={4000}
          autoComplete="off"
          disabled={!activeCharacter}
        />
        <button className="send-button" type="submit" disabled={!activeCharacter || !draft.trim() || sending} aria-label="Отправить">
          <svg viewBox="0 0 24 24" fill="none"><path d="m5 12 13-7-4 14-3-5-6-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="m11 14 7-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </form>
    </div>
  )
}
