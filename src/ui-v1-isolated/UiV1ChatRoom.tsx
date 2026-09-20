import type { ChatMessage } from "../types/chat"
import { useSnake } from "./SnakeProvider"
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
  const data = useUiV1ChatRoom(roomId)

  if (data.loading && !data.room) return <LoadingState />

  if (!data.room) {
    return (
      <main className="u1-room" data-chat-room-stage="1">
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
    <main className="u1-room" data-chat-room-stage="1">
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
          onClick={() => openDeferred(
            "Панель комнаты",
            "Контекст комнаты, участники и инструменты ГМ появятся здесь во втором этапе как отдельная правая панель.",
          )}
        >◇</button>
      </header>

      <section className="u1-room-messages" aria-label="Сообщения">
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
          onClick={() => openDeferred(
            "Игровые действия",
            "Плюс откроет компактный список действий. Полноценный интерфейс выбранного действия будет выезжать справа и занимать почти весь экран.",
          )}
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
    </main>
  )
}
