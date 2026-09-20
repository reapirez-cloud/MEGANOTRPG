import type { CSSProperties } from "react"

import ChatComposer from "./ChatComposer"
import ChatFeed from "./ChatFeed"
import ChatRoomFrame from "./ChatRoomFrame"
import ChatRoomHeader from "./ChatRoomHeader"
import { useChatRoomShell } from "./useChatRoomShell"
import { useChatVisualViewportHeight } from "./useChatVisualViewport"
import "./chat-room.css"

function LoadingShell() {
  return (
    <main className="u1-room-shell u1-room-shell--loading" aria-busy="true">
      <div className="u1-room-topbar">
        <span className="u1-room-skeleton u1-room-skeleton--back" />
        <span className="u1-room-skeleton u1-room-skeleton--title" />
      </div>
      <div className="u1-room-skeleton u1-room-skeleton--hero" />
      <div className="u1-room-skeleton u1-room-skeleton--feed" aria-hidden="true" />
    </main>
  )
}

export default function ChatRoomScreen({ roomId }: { roomId: string }) {
  const { model, loading, error, reload } = useChatRoomShell(roomId)
  const visualViewportHeight = useChatVisualViewportHeight()
  const viewportStyle = visualViewportHeight
    ? ({
        "--u1-chat-viewport-height": visualViewportHeight + "px",
      } as CSSProperties)
    : undefined

  if (loading) return <LoadingShell />

  if (!model || error) {
    return (
      <main
        className="u1-room-shell"
        data-chat-room-stage="8"
        style={viewportStyle}
      >
        <div className="u1-room-topbar">
          <button
            type="button"
            className="u1-room-back"
            aria-label="Назад к чатам"
            onClick={() => {
              window.location.hash = "#/chats"
            }}
          >
            <BackIcon />
          </button>
          <span className="u1-room-topbar__title">Чат</span>
        </div>

        <section className="u1-room-error" role="alert">
          <span aria-hidden="true">◇</span>
          <strong>Комната не загрузилась</strong>
          <p>{error || "Комната недоступна."}</p>
          <button type="button" onClick={() => void reload()}>
            Повторить
          </button>
        </section>
      </main>
    )
  }

  const hasCharacterIdentity =
    model.canWrite &&
    model.identity?.kind === "character" &&
    model.quickActions.hasCharacter

  return (
    <main
      className="u1-room-shell"
      data-chat-room-stage="8"
      data-chat-room-layout-stage="1"
      data-chat-room-header-stage="3"
      data-room-type={model.roomType}
      data-has-identity={Boolean(model.identity) || undefined}
      data-observer={!model.identity || undefined}
      data-read-only={model.readOnly || undefined}
      style={viewportStyle}
    >
      <ChatRoomFrame>
      <header className="u1-room-topbar">
        <button
          type="button"
          className="u1-room-back"
          aria-label="Назад к чатам"
          onClick={() => {
            window.location.hash = "#/chats"
          }}
        >
          <BackIcon />
        </button>

        <div className="u1-room-topbar__copy">
          <span>
            {model.roomType === "character"
              ? "Личная история"
              : model.roomType === "scene"
                ? "Сцена"
                : "Флуд"}
          </span>
          <strong title={model.roomTitle}>{model.roomTitle}</strong>
        </div>

        {model.readOnly ? (
          <span className="u1-room-readonly">Архив</span>
        ) : null}
      </header>

      <div className="u1-room-frame__head" data-room-slot="fixed-head">
        <ChatRoomHeader
          model={model}
          showQuickActions={hasCharacterIdentity}
        />
      </div>

      <div className="u1-room-frame__feed" data-room-slot="feed">
        <ChatFeed roomId={roomId} />
      </div>
      <div className="u1-room-frame__controls" data-room-slot="controls">
        <ChatComposer model={model} />
      </div>
      </ChatRoomFrame>
    </main>
  )
}
