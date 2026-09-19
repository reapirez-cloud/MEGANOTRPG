import { createPortal } from "react-dom"

import { useAIViewContextLayer } from "../../../ai/AIProvider"
import type { SnakeActionInput } from "../../../snake-engine"
import type { SnakeSurfaceSession } from "../runtime"
import { SnakeFlowWindow } from "./SnakeFlowWindow"
import { SnakeMediaSurface } from "./SnakeMediaSurface"
import { SnakeSingleWindow } from "./SnakeSingleWindow"

export function SnakeWindowHost({
  session,
  busy,
  onClose,
  onSubmit,
}: {
  session: SnakeSurfaceSession
  busy: boolean
  onClose: () => void
  onSubmit: (input?: SnakeActionInput) => void
}) {
  useAIViewContextLayer(
    "snake-surface",
    {
      screen: "snake-surface",
      title: session.request.title,
      text: "Открыто универсальное окно Snake поверх текущего экрана.",
      entity: session.entity
        ? {
            type: session.entity.type,
            id: session.entity.id,
            label: session.request.title,
          }
        : null,
      facts: {
        surfaceKind: session.request.kind,
        eyebrow: session.request.eyebrow || null,
        actionId: session.action?.id || null,
        pathDepth: session.path?.length || 0,
      },
    },
    90,
  )

  return createPortal(
    <div
      className="u1-snake-window-layer"
      data-media={session.request.kind === "media" ? "true" : undefined}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation()
      }}
      onPointerUp={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        if (!busy) onClose()
      }}
    >
      {session.request.kind === "media" ? (
        <SnakeMediaSurface
          key={session.id}
          session={session}
          request={session.request}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : session.request.kind === "flow" ? (
        <SnakeFlowWindow
          session={session}
          request={session.request}
          busy={busy}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : (
        <SnakeSingleWindow
          session={session}
          busy={busy}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </div>,
    document.body,
  )
}
