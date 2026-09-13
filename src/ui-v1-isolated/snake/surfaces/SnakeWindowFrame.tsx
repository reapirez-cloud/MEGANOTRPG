import { useEffect, useRef, type ReactNode } from "react"

import type { SnakeWindowSize } from "../../../snake-engine"

export function SnakeWindowFrame({
  id,
  eyebrow,
  title,
  size,
  busy,
  onClose,
  children,
  stepMeta,
}: {
  id: number
  eyebrow?: string
  title: string
  size: Required<SnakeWindowSize>
  busy: boolean
  onClose: () => void
  children: ReactNode
  stepMeta?: string
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [id, title])

  return (
    <section
      className="u1-snake-window"
      data-width={size.width}
      data-height={size.height}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`u1-snake-window-title-${id}`}
    >
      <header className="u1-snake-window__head">
        <div>
          <span className="u1-snake-window__meta">
            {eyebrow && <i>{eyebrow}</i>}
            {stepMeta && <b>{stepMeta}</b>}
          </span>
          <h2 id={`u1-snake-window-title-${id}`}>{title}</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </header>
      <div className="u1-snake-window__body">{children}</div>
    </section>
  )
}
