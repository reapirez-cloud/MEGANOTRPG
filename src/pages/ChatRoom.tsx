import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { useChatMessages } from "../hooks/useChatMessages"

type Props = {
  roomId: string
  onBack: () => void
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function ChatRoom({ roomId, onBack }: Props) {
  const { profile } = useAuth()
  const [roomTitle, setRoomTitle] = useState("Чат")
  const [draft, setDraft] = useState("")
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const {
    messages,
    loading,
    sending,
    error,
    realtime,
    userId,
    sendMessage,
  } = useChatMessages(roomId)

  const realtimeLabel = useMemo(() => {
    if (realtime === "live") return "онлайн"
    if (realtime === "connecting") return "подключение"
    return "офлайн"
  }, [realtime])

  useEffect(() => {
    async function loadRoomTitle() {
      const { data } = await supabase
        .from("chat_rooms")
        .select("title")
        .eq("id", roomId)
        .maybeSingle()

      if (data?.title) setRoomTitle(data.title)
    }

    void loadRoomTitle()
  }, [roomId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  async function submit(event: FormEvent) {
    event.preventDefault()

    const sent = await sendMessage(draft)
    if (sent) setDraft("")
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <button
          className="icon-button"
          type="button"
          onClick={onBack}
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
          </div>
        </div>

        <div className="profile-link profile-link--static">
          {profile.display_name}
        </div>
      </header>

      <div className="message-list">
        {loading && (
          <div className="chat-state">Загружаем сообщения…</div>
        )}

        {!loading && messages.length === 0 && (
          <div className="chat-state">
            Здесь пока пусто. Первое сообщение может быть твоим.
          </div>
        )}

        {messages.map((message) => {
          const own =
            message.user_id === userId ||
            (message.user_id === null && message.client_id === userId)

          return (
            <article
              className={`message ${own ? "message--self" : ""}`}
              key={message.id}
            >
              <div className="message__author">{message.author_name}</div>
              <p className="message__text">{message.body}</p>
              <div className="message__time">
                {formatTime(message.created_at)}
              </div>
            </article>
          )
        })}

        {error && <div className="chat-error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <button
          className="icon-button composer__icon"
          type="button"
          aria-label="Бросок кубика"
        >
          ◇
        </button>

        <input
          className="composer__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Сообщение…"
          maxLength={4000}
          autoComplete="off"
        />

        <button
          className="send-button"
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Отправить"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    </div>
  )
}
