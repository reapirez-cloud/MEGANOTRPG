import { useEffect, useRef, type ReactNode } from "react"

import { useAIViewContextLayer } from "../../ai/AIProvider"
import type { ChatDrawerSession } from "./useChatDrawerRuntime"

type Props = {
  session: ChatDrawerSession | null
  onClose: () => void
  children: ReactNode
}

function focusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

export function ChatDrawerHost({ session, onClose, children }: Props) {
  const panelRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useAIViewContextLayer(
    "chat-drawer",
    session
      ? {
          screen: "chat-drawer",
          title: session.title,
          text: session.mode === "context"
            ? "Открыта правая контекстная панель игрового чата."
            : "Открыта почти полноэкранная панель выбранного игрового действия.",
          facts: {
            mode: session.mode,
            sessionId: session.id,
          },
        }
      : null,
    65,
  )

  useEffect(() => {
    if (!session) return

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== "Tab" || !panelRef.current) return
      const focusable = focusableElements(panelRef.current)
      if (!focusable.length) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("keydown", onKeyDown)
      previousFocus?.focus()
    }
  }, [onClose, session])

  if (!session) return null

  const titleId = "u1-chat-drawer-title-" + session.id

  return (
    <div
      className="u1-chat-drawer-layer"
      data-chat-drawer-layer="true"
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
        onClose()
      }}
    >
      <aside
        ref={panelRef}
        className="u1-chat-drawer"
        data-mode={session.mode}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="u1-chat-drawer__head">
          <div className="u1-chat-drawer__copy">
            <small>{session.eyebrow}</small>
            <strong id={titleId}>{session.title}</strong>
            {session.subtitle && <span>{session.subtitle}</span>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="u1-chat-drawer__close"
            aria-label="Закрыть панель"
            onClick={onClose}
          >×</button>
        </header>
        <div className="u1-chat-drawer__body">{children}</div>
      </aside>
    </div>
  )
}
