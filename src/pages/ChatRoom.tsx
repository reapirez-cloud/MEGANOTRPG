import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useChatMessages } from "../hooks/useChatMessages"
import { useLongPressItem } from "../hooks/useLongPressItem"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import ChatActionSheet from "../components/chat/ChatActionSheet"
import ChatRoomSettings from "../components/chat/ChatRoomSettings"
import ChatMessageActions from "../components/chat/ChatMessageActions"
import type { ChatMessage } from "../types/chat"
import { uploadCampaignImage } from "../lib/mediaUpload"
import CampaignImage from "../components/common/CampaignImage"

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
    campaignId,
  } = useCharacters()

  const [roomTitle, setRoomTitle] = useState("Чат")
  const [roomCategory, setRoomCategory] = useState<"game" | "flood">("game")
  const [canWriteRoom, setCanWriteRoom] = useState(false)
  const [draft, setDraft] = useState("")
  const [actionsOpen, setActionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState("")
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const attachmentRef = useRef<HTMLInputElement | null>(null)
  const nearBottomRef = useRef(true)
  const initialScrollDoneRef = useRef(false)
  const previousLastMessageIdRef = useRef<number | null>(null)

  const {
    messages,
    loading,
    sending,
    error,
    realtime,
    sendMessage,
    editMessage,
    deleteMessage,
    loadingOlder,
    hasOlder,
    loadOlder,
    markRead,
  } = useChatMessages(roomId)

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )

  function resolveMessageCharacterId(message: ChatMessage) {
    if (message.character_id) return message.character_id
    if (!message.user_id) return null

    const member = members.find((item) => item.user_id === message.user_id)
    if (!member || member.is_owner || member.role === "gm") return null

    return member.active_character_id
  }

  const bindMessageLongPress = useLongPressItem<ChatMessage>((message) => {
    setSelectedMessage(message)
  })

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
    initialScrollDoneRef.current = false
    previousLastMessageIdRef.current = null
    nearBottomRef.current = true
    setShowNewMessages(false)
  }, [roomId])

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
    if (loading) return

    const lastMessage = messages[messages.length - 1] ?? null
    const lastMessageId = lastMessage?.id ?? null

    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true
      previousLastMessageIdRef.current = lastMessageId
      window.requestAnimationFrame(() => {
        const list = messageListRef.current
        if (list) list.scrollTop = list.scrollHeight
      })
      if (lastMessageId != null) void markRead(lastMessageId)
      return
    }

    const previousLastMessageId = previousLastMessageIdRef.current
    previousLastMessageIdRef.current = lastMessageId
    if (lastMessageId == null || previousLastMessageId === lastMessageId) return

    const shouldFollow = nearBottomRef.current || lastMessage?.user_id === user.id
    if (shouldFollow) {
      setShowNewMessages(false)
      window.requestAnimationFrame(() => {
        const list = messageListRef.current
        if (list) list.scrollTop = list.scrollHeight
      })
      void markRead(lastMessageId)
    } else {
      setShowNewMessages(true)
    }
  }, [loading, markRead, messages, user.id])

  function handleMessageListScroll() {
    const list = messageListRef.current
    if (!list) return
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120
    nearBottomRef.current = nearBottom
    if (!nearBottom) return

    setShowNewMessages(false)
    const lastMessageId = messages[messages.length - 1]?.id
    if (lastMessageId != null) void markRead(lastMessageId)
  }

  async function handleLoadOlder() {
    const list = messageListRef.current
    const previousHeight = list?.scrollHeight ?? 0
    const previousTop = list?.scrollTop ?? 0
    const loadedCount = await loadOlder()
    if (!loadedCount || !list) return

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const nextList = messageListRef.current
        if (!nextList) return
        nextList.scrollTop = previousTop + (nextList.scrollHeight - previousHeight)
      })
    })
  }

  function jumpToLatest() {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
    nearBottomRef.current = true
    setShowNewMessages(false)
    const lastMessageId = messages[messages.length - 1]?.id
    if (lastMessageId != null) void markRead(lastMessageId)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSend) return
    setAttachmentError("")
    let attachmentUrl: string | null = null
    if (attachmentFile) {
      setUploadingAttachment(true)
      const upload = await uploadCampaignImage(attachmentFile, "chat", campaignId)
      setUploadingAttachment(false)
      if (!upload.ok) {
        setAttachmentError(upload.error)
        return
      }
      attachmentUrl = upload.url
    }
    const sent = await sendMessage(draft, attachmentUrl)
    if (sent) {
      setDraft("")
      setAttachmentFile(null)
    }
  }

  const activeLabel = activeCharacter
    ? `${activeCharacter.name} (${profile.display_name})`
    : isOwner
      ? `Владелец (${profile.display_name})`
      : isGm
        ? `ГМ (${profile.display_name})`
        : "Нет персонажа"

  const roleAvatar = activeCharacter ?? (
    isOwner
      ? { name: "Владелец", avatar_url: null }
      : isGm
        ? { name: "ГМ", avatar_url: null }
        : null
  )

  const placeholder = !canWriteRoom
    ? "В этой комнате у тебя только чтение"
    : activeCharacter
      ? `От лица ${activeCharacter.name}…`
      : isOwner
        ? "Сообщение от владельца…"
        : isGm
          ? "Сообщение от ГМ…"
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

      <div
        ref={messageListRef}
        className="message-list message-list--avatars"
        onScroll={handleMessageListScroll}
      >
        {loading && <div className="chat-state">Загружаем сообщения…</div>}

        {!loading && hasOlder && (
          <button className="chat-load-older" type="button" onClick={() => void handleLoadOlder()} disabled={loadingOlder}>
            {loadingOlder ? "Загружаем…" : "Показать более ранние сообщения"}
          </button>
        )}

        {!loading && messages.length === 0 && (
          <div className="chat-state">
            Здесь пока пусто. Первое сообщение может быть твоим.
          </div>
        )}

        {messages.map((message) => {
          const own = message.user_id === user.id
          const linkedCharacterId = resolveMessageCharacterId(message)
          const linkedCharacter = linkedCharacterId
            ? characterById.get(linkedCharacterId) ?? null
            : null
          const avatarCharacter = linkedCharacter ?? {
            name: message.author_name,
            avatar_url: message.author_avatar_url,
          }

          return (
            <div
              {...bindMessageLongPress(message)}
              className={`message-row ${own ? "message-row--self" : ""}`}
              key={message.id}
              style={{ touchAction: "pan-y" }}
            >
              {!own && (
                linkedCharacterId ? (
                  <button
                    type="button"
                    aria-label="Открыть персонажа"
                    onClick={() => onOpenCharacter(linkedCharacterId)}
                    style={avatarButtonStyle}
                  >
                    <CharacterAvatar character={avatarCharacter} size="small" />
                  </button>
                ) : (
                  <CharacterAvatar character={avatarCharacter} size="small" />
                )
              )}

              <article className={`message ${own ? "message--self" : ""}`}>
                {linkedCharacterId ? (
                  <button
                    type="button"
                    onClick={() => onOpenCharacter(linkedCharacterId)}
                    style={authorButtonStyle}
                  >
                    {message.author_name}
                  </button>
                ) : (
                  <div className="message__author">{message.author_name}</div>
                )}

                {message.attachment_url && (
                  <CampaignImage
                    className="message__attachment"
                    value={message.attachment_url}
                    alt="Вложение"
                    loading="lazy"
                  />
                )}
                {message.body && <p className="message__text">{message.body}</p>}
                <div className="message__time">
                  {formatTime(message.created_at)}
                  {message.edited_at ? " · изм." : ""}
                </div>
              </article>

              {own && (
                linkedCharacterId ? (
                  <button
                    type="button"
                    aria-label="Открыть персонажа"
                    onClick={() => onOpenCharacter(linkedCharacterId)}
                    style={avatarButtonStyle}
                  >
                    <CharacterAvatar character={avatarCharacter} size="small" />
                  </button>
                ) : (
                  <CharacterAvatar character={avatarCharacter} size="small" />
                )
              )}
            </div>
          )
        })}

        {error && <div className="chat-error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {showNewMessages && (
        <button type="button" onClick={jumpToLatest} style={newMessagesButtonStyle}>
          Новые сообщения ↓
        </button>
      )}

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
          Ты можешь читать этот чат, но ГМ не дал право писать.
        </div>
      )}

      {attachmentFile && (
        <div className="chat-attachment-preview">
          <span>▧ {attachmentFile.name}</span>
          <button type="button" onClick={() => setAttachmentFile(null)}>Убрать</button>
        </div>
      )}
      {attachmentError && <div className="chat-error chat-attachment-error">{attachmentError}</div>}

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

        <button
          className="icon-button composer__icon"
          type="button"
          onClick={() => attachmentRef.current?.click()}
          disabled={!canSend || uploadingAttachment}
          aria-label="Добавить изображение"
        >
          ▧
        </button>
        <input
          ref={attachmentRef}
          className="media-hidden-input"
          type="file"
          accept="image/*"
          onChange={(event) => {
            setAttachmentFile(event.target.files?.[0] || null)
            event.currentTarget.value = ""
          }}
        />

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
          disabled={!canSend || (!draft.trim() && !attachmentFile) || sending || uploadingAttachment}
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

      {selectedMessage && (
        <ChatMessageActions
          message={selectedMessage}
          characterId={resolveMessageCharacterId(selectedMessage)}
          own={selectedMessage.user_id === user.id}
          canManage={canManage}
          onOpenCharacter={onOpenCharacter}
          onClose={() => setSelectedMessage(null)}
          onEdit={editMessage}
          onDelete={deleteMessage}
        />
      )}
    </div>
  )
}

const avatarButtonStyle = {
  flex: "0 0 auto",
  width: "auto",
  height: "auto",
  padding: 0,
  border: 0,
  borderRadius: 999,
  background: "transparent",
}

const authorButtonStyle = {
  width: "max-content",
  maxWidth: "100%",
  padding: 0,
  border: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontWeight: 800,
  textAlign: "left" as const,
  textDecoration: "underline",
  textDecorationColor: "#4b3b63",
  textUnderlineOffset: 2,
}

const newMessagesButtonStyle = {
  position: "fixed" as const,
  zIndex: 40,
  left: "50%",
  bottom: 150,
  transform: "translateX(-50%)",
  minHeight: 36,
  padding: "0 14px",
  border: "1px solid #4b3b63",
  borderRadius: 999,
  background: "#17131d",
  color: "#ddd6fe",
  fontSize: 11,
  fontWeight: 800,
  boxShadow: "0 8px 24px rgba(0,0,0,.35)",
}
