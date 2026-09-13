import { createPortal } from "react-dom"

import type { SnakeActionInput } from "../../../snake-engine"
import type { SnakeSurfaceSession } from "../runtime"
import { SnakeFlowWindow } from "./SnakeFlowWindow"
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
  return createPortal(
    <div
      className="u1-snake-window-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      {session.request.kind === "flow" ? (
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
