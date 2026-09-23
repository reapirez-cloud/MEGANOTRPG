import { useEffect, useState, type CSSProperties } from "react"

import ChatComposer from "./ChatComposer"
import ChatGmDrawer from "./ChatGmDrawer"
import ChatFeed from "./ChatFeed"
import ChatRoomFrame from "./ChatRoomFrame"
import ChatRoomHeader from "./ChatRoomHeader"
import { navigateAppBack, pushAppHash } from "../navigationGestures"
import { chatRoomPresentationState } from "./chatRoomPresentation"
import { useChatRoomShell } from "./useChatRoomShell"
import { useChatVisualViewportHeight } from "./useChatVisualViewport"
import "./chat-room.css"

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}

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
  const [gmDrawerOpen, setGmDrawerOpen] = useState(false)
  const visualViewportHeight = useChatVisualViewportHeight()
  const viewportStyle = visualViewportHeight
    ? ({
        "--u1-chat-viewport-height": visualViewportHeight + "px",
      } as CSSProperties)
    : undefined

  useEffect(() => {
    setGmDrawerOpen(false)
  }, [roomId])

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
              if (!navigateAppBack()) pushAppHash("chats")
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

  const presentation = chatRoomPresentationState(model)

  return (
    <main
      className="u1-room-shell"
      data-chat-room-stage="8"
      data-chat-room-layout-stage="1"
      data-chat-room-header-stage="3"
      data-chat-room-final-stage="6"
      data-room-type={model.roomType}
      data-viewer-role={model.viewer.role}
      data-owner={model.viewer.isOwner || undefined}
      data-manager={model.canManage || undefined}
      data-identity-kind={presentation.identityKind}
      data-has-identity={Boolean(model.identity) || undefined}
      data-observer={presentation.identityKind === "observer" || undefined}
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
            if (!navigateAppBack()) pushAppHash("chats")
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
        <ChatRoomHeader model={model} />
        </div>

        <div className="u1-room-frame__feed" data-room-slot="feed">
          <ChatFeed
            roomId={roomId}
            viewerUserId={model.viewer.userId}
            campaignId={model.viewer.campaignId}
          />
        </div>
        <div className="u1-room-frame__controls" data-room-slot="controls">
          <ChatComposer model={model} />
        </div>
      </ChatRoomFrame>

      {model.canManage && !gmDrawerOpen ? (
        <button
          type="button"
          className="u1-gm-drawer-trigger"
          aria-label="Открыть панель ГМ"
          aria-expanded="false"
          onClick={() => setGmDrawerOpen(true)}
        >
          <span>GM</span>
          <i aria-hidden="true">‹</i>
        </button>
      ) : null}

      {gmDrawerOpen && model.canManage ? (
        <ChatGmDrawer
          model={model}
          onClose={() => setGmDrawerOpen(false)}
          onChanged={() => reload()}
          onOpenCharacter={(characterId) => {
            setGmDrawerOpen(false)
            pushAppHash("workspace/character/" + characterId)
          }}
        />
      ) : null}
    </main>
  )
}
