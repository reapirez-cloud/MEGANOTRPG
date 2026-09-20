import { useEffect, useRef, useState } from "react"

import type { ChatMessage } from "../types/chat"
import { useSnake } from "./SnakeProvider"
import { ChatActionLauncher, CHAT_ACTION_SECTIONS, type ChatActionSectionId } from "./chat/ChatActionLauncher"
import { ChatActionWorkspace } from "./chat/ChatActionWorkspace"
import { useUiV1ChatActorRuntime } from "./chat/useUiV1ChatActorRuntime"
import { ChatDrawerHost } from "./chat/ChatDrawerHost"
import { ChatContextEdgeSwipe } from "./chat/ChatContextEdgeSwipe"
import { ChatRoomContextPanel } from "./chat/ChatRoomContextPanel"
import { useChatDrawerRuntime } from "./chat/useChatDrawerRuntime"
import { useUiV1ChatParticipants } from "./chat/useUiV1ChatParticipants"
import { useUiV1ChatRoom, type UiV1ChatRoomSummary } from "./useUiV1ChatRoom"
import "./chat-room.css"

type Props = {
  roomId: string
  onBack: () => void
}

function roomKind(room: UiV1ChatRoomSummary) {
  if (room.room_type === "character") return "Личная история"
  if (room.room_type === "scene") return "Сцена"
  return "Флуд"
}

function roomState(room: UiV1ChatRoomSummary) {
  if (room.is_read_only) return "Только чтение"
  if (room.room_state === "closed" || room.scene_state === "closed") return "Завершено"
  if (room.room_state === "gm_only") return "Пишет ГМ"
  return "Активно"
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date)
}

function eventLabel(message: ChatMessage) {
  const payload = message.event_payload || {}
  const label = typeof payload.label === "string" ? payload.label : ""
  if (label) return label
  if (message.event_kind === "roll") return "Бросок"
  if (message.event_kind === "spell") return "Заклинание"
  return "Игровое действие"
}

function avatarLetter(message: ChatMessage) {
  const value = message.author_name.trim()
  return value ? value.slice(0, 1).toLocaleUpperCase("ru-RU") : "?"
}

function MessageAvatar({ message }: { message: ChatMessage }) {
  return (
    <span className="u1-room-message__avatar" aria-hidden="true">
      {message.author_avatar_url ? (
        <img src={message.author_avatar_url} alt="" loading="lazy" decoding="async" />
      ) : (
        avatarLetter(message)
      )}
    </span>
  )
}

function MessageBubble({ message, own }: { message: ChatMessage; own: boolean }) {
  return (
    <article
      className={"u1-room-message" + (own ? " is-own" : "")}
      data-event={message.event_kind || undefined}
    >
      {!own && <MessageAvatar message={message} />}
      <div className="u1-room-message__body">
        <div className="u1-room-message__meta">
          <strong>{message.author_name || "Без имени"}</strong>
          <time>{formatTime(message.created_at)}</time>
        </div>

        {message.attachment_url && (
          <img
            className="u1-room-message__image"
            src={message.attachment_url}
            alt="Вложение чата"
            loading="lazy"
            decoding="async"
          />
        )}

        {message.event_kind ? (
          <div className="u1-room-message__event">
            <span aria-hidden="true">
              {message.event_kind === "roll" ? "◈" : message.event_kind === "spell" ? "✧" : "◇"}
            </span>
            <div>
              <small>
                {message.event_kind === "roll" ? "Бросок" : message.event_kind === "spell" ? "Магия" : "Действие"}
              </small>
              <strong>{eventLabel(message)}</strong>
            </div>
          </div>
        ) : (
          message.body && <p>{message.body}</p>
        )}

        {message.edited_at && <small className="u1-room-message__edited">изменено</small>}
      </div>
      {own && <MessageAvatar message={message} />}
    </article>
  )
}

function LoadingState() {
  return (
    <main className="u1-room u1-room--loading" aria-busy="true">
      <div className="u1-room-loading__head" />
      <div className="u1-room-loading__messages"><i /><i /><i /><i /></div>
      <div className="u1-room-loading__composer" />
    </main>
  )
}

export default function UiV1ChatRoom({ roomId, onBack }: Props) {
  const snake = useSnake()
  const drawers = useChatDrawerRuntime()
  const [launcherOpen, setLauncherOpen] = useState(false)
  const messagesRef = useRef<HTMLElement | null>(null)
  const stickToBottomRef = useRef(true)
  const data = useUiV1ChatRoom(roomId)
  const gameplay = useUiV1ChatActorRuntime(launcherOpen || drawers.session?.mode === "workspace")
  const participants = useUiV1ChatParticipants(data.room, drawers.session?.mode === "context")
  const lastMessageId = data.messages.at(-1)?.id || 0

  useEffect(() => {
    const root = messagesRef.current
    if (!root || !stickToBottomRef.current) return

    const frame = window.requestAnimationFrame(() => {
      root.scrollTop = root.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [lastMessageId, roomId])

  if (data.loading && !data.room) return <LoadingState />

  if (!data.room) {
    return (
      <main className="u1-room" data-chat-room-stage="5">
        <section className="u1-room-state" role="alert">
          <span aria-hidden="true">!</span>
          <strong>Чат не открылся</strong>
          <p>{data.error || "Комната недоступна."}</p>
          <div>
            <button type="button" onClick={onBack}>← К чатам</button>
            <button type="button" onClick={() => void data.reload()}>Повторить</button>
          </div>
        </section>
      </main>
    )
  }

  const room = data.room

  const openRoomContext = () => {
    setLauncherOpen(false)
    drawers.openContext({
      eyebrow: roomKind(room),
      title: "Контекст комнаты",
      subtitle: room.title,
      contentKey: "room",
    })
  }

  const actionSections = CHAT_ACTION_SECTIONS.map((item) => {
    if (item.id === "roll") return { ...item }

    const contract = gameplay.contract
    const noActor = !gameplay.characterId
    const count = item.id === "skill"
      ? Object.keys(contract?.skills || {}).length
      : item.id === "action"
        ? (contract?.actions || []).filter((action) =>
            !action.sources.some((ref) =>
              ref.source.sourceType === "inventory_item" ||
              ref.source.id.startsWith("item:"),
            ) &&
            !action.tags.includes("spell_modifier"),
          ).length
        : item.id === "item"
          ? (contract?.actions || []).filter((action) =>
              action.sources.some((ref) =>
                ref.source.sourceType === "inventory_item" ||
                ref.source.id.startsWith("item:"),
              ),
            ).length
          : contract?.spells.length || 0

    return {
      ...item,
      count,
      disabled: noActor || gameplay.loading || count === 0,
      disabledReason: noActor
        ? "Сначала выберите персонажа."
        : gameplay.loading
          ? "Собираем данные персонажа."
          : count === 0
            ? "В resolved-персонаже этот раздел пуст."
            : undefined,
    }
  })

  const openDeferred = (title: string, body: string) => {
    snake.openSurface({
      kind: "placeholder",
      eyebrow: roomKind(room),
      title,
      body,
      size: { width: "compact", height: "content" },
    })
  }

  return (
    <main className="u1-room" data-chat-room-stage="5">
      <header className="u1-room-header">
        <button type="button" className="u1-room-header__back" aria-label="Назад к чатам" onClick={onBack}>‹</button>
        <div className="u1-room-header__copy">
          <small>{roomKind(room)}</small>
          <strong>{room.title}</strong>
          <span>{roomState(room)}</span>
        </div>
        <button
          type="button"
          className="u1-room-header__context"
          aria-label="Контекст комнаты"
          onClick={openRoomContext}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14M5 12h14M5 17h14" />
            <circle cx="9" cy="7" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="11" cy="17" r="1.6" />
          </svg>
        </button>
      </header>

      <section
        ref={messagesRef}
        className="u1-room-messages"
        aria-label="Сообщения"
        onScroll={(event) => {
          const root = event.currentTarget
          const distance =
            root.scrollHeight - root.scrollTop - root.clientHeight
          stickToBottomRef.current = distance < 88
        }}
      >
        {data.error && (
          <button type="button" className="u1-room-warning" onClick={() => void data.reload()}>
            Не удалось обновить чат · Повторить
          </button>
        )}
        {data.messages.length === 0 ? (
          <div className="u1-room-empty">
            <span aria-hidden="true">◇</span>
            <strong>Здесь пока тихо</strong>
            <small>Сообщения этой комнаты появятся здесь.</small>
          </div>
        ) : (
          data.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              own={Boolean(data.viewerUserId && message.user_id === data.viewerUserId)}
            />
          ))
        )}
      </section>

      <form className="u1-room-composer" onSubmit={(event) => event.preventDefault()}>
        <button
          type="button"
          className="u1-room-composer__actor"
          aria-label="Личность"
          onClick={() => openDeferred(
            "Личность",
            "Выбор говорящего персонажа подключается отдельным этапом без копирования старого picker.",
          )}
        >◌</button>
        <button
          type="button"
          className="u1-room-composer__plus"
          aria-label="Игровые действия"
          aria-haspopup="menu"
          aria-expanded={launcherOpen}
          aria-controls="u1-chat-action-launcher"
          data-open={launcherOpen ? "true" : undefined}
          disabled={room.is_read_only || room.room_state === "closed" || room.scene_state === "closed"}
          onClick={() => setLauncherOpen((value) => !value)}
        >+</button>
        <button
          type="button"
          className="u1-room-composer__attach"
          aria-label="Прикрепить изображение"
          onClick={() => openDeferred(
            "Вложение",
            "Прикрепление изображения будет подключено к новой строке ввода без отдельной громоздкой панели.",
          )}
        >▧</button>
        <input className="u1-room-composer__input" aria-label="Сообщение" readOnly placeholder="Сообщение…" />
        <button type="submit" className="u1-room-composer__send" aria-label="Отправить" disabled>➤</button>
      </form>

      <ChatContextEdgeSwipe
        disabled={Boolean(drawers.session) || launcherOpen}
        onOpen={openRoomContext}
      />

      <ChatActionLauncher
        open={launcherOpen}
        items={actionSections}
        onClose={() => setLauncherOpen(false)}
        onSelect={(section: ChatActionSectionId) => {
          const item = actionSections.find((candidate) => candidate.id === section)
          if (!item) return
          setLauncherOpen(false)
          drawers.openWorkspace({
            eyebrow: "Игровые действия",
            title: item.label,
            subtitle: room.title,
            contentKey: item.id,
          })
        }}
      />

      <ChatDrawerHost session={drawers.session} onClose={drawers.close}>
        {drawers.session?.mode === "context"
          ? <ChatRoomContextPanel
              room={room}
              participants={participants.participants}
              loading={participants.loading}
              error={participants.error}
              targetCharacterId={
                drawers.session.contentKey?.startsWith("character:")
                  ? drawers.session.contentKey.slice("character:".length)
                  : undefined
              }
              campaignId={gameplay.campaignId}
              userId={gameplay.userId}
              canManage={gameplay.canManage}
              onOpenParticipant={(participant) => {
                drawers.openContext({
                  eyebrow: "Персонаж",
                  title: participant.name,
                  subtitle: participant.characterClass
                    ? participant.characterClass + " · " + participant.level + " ур."
                    : participant.level + " ур.",
                  contentKey: "character:" + participant.id,
                })
              }}
              onBackToRoom={() => {
                drawers.openContext({
                  eyebrow: roomKind(room),
                  title: "Контекст комнаты",
                  subtitle: room.title,
                  contentKey: "room",
                })
              }}
              onOpenSheet={(characterId) => {
                drawers.close()
                window.location.hash = "#/workspace/character/" + characterId
              }}
              onOpenInventory={(characterId) => {
                drawers.close()
                window.location.hash = "#/workspace/character/" + characterId + "/inventory"
              }}
            />
          : <ChatActionWorkspace
              roomId={roomId}
              sectionId={drawers.session?.contentKey}
              runtime={gameplay}
              onExecuted={drawers.close}
            />}
      </ChatDrawerHost>
    </main>
  )
}
