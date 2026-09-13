import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { createPortal } from "react-dom"

import type { SnakeAction, SnakeMenuRequest } from "../../../snake-engine"
import { positionSnakeMenu } from "./positioning"

export function SnakeContextMenu({
  request,
  canGoBack,
  busy,
  onBack,
  onClose,
  onAction,
}: {
  request: SnakeMenuRequest
  canGoBack: boolean
  busy: boolean
  onBack: () => void
  onClose: () => void
  onAction: (action: SnakeAction) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState(request.point)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const next = positionSnakeMenu(
      request.point,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    )

    setPosition(next.position)
    setOrigin(next.origin)
  }, [request])

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      if (!busy) onClose()
    }

    window.addEventListener("pointerdown", closeOnPointerDown, true)
    return () => window.removeEventListener("pointerdown", closeOnPointerDown, true)
  }, [busy, onClose])

  let previousGroup: string | undefined
  const levelKey = `${request.title || "root"}:${request.actions.map((action) => action.id).join("|")}`

  return createPortal(
    <div
      ref={ref}
      className="u1-snake-menu"
      role="menu"
      aria-label={request.title || "Действия"}
      style={{
        left: position.x,
        top: position.y,
        "--u1-snake-origin-x": `${origin.x}px`,
        "--u1-snake-origin-y": `${origin.y}px`,
      } as CSSProperties}
    >
      {canGoBack && (
        <header className="u1-snake-menu__head">
          <button
            type="button"
            aria-label="Назад"
            disabled={busy}
            onClick={onBack}
          >
            ←
          </button>
          <strong>{request.title}</strong>
        </header>
      )}

      <div className="u1-snake-menu__level" key={levelKey}>
        {request.actions.map((action, index) => {
          const separator =
            index > 0 &&
            action.group !== undefined &&
            action.group !== previousGroup
          previousGroup = action.group
          const branch = action.kind === "branch" || Boolean(action.children)

          return (
            <div className="u1-snake-menu__row" key={action.id}>
              {separator && (
                <span className="u1-snake-menu__separator" aria-hidden="true" />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={busy || action.enabled === false}
                data-tone={action.tone || "normal"}
                data-branch={branch || undefined}
                aria-haspopup={branch ? "menu" : undefined}
                title={action.enabled === false ? action.disabledReason : undefined}
                onClick={() => onAction(action)}
              >
                <span>{action.label}</span>
                {branch && <i aria-hidden="true">›</i>}
              </button>
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
