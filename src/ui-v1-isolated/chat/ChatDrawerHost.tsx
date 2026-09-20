import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { useAIViewContextLayer } from "../../ai/AIProvider"
import type { ChatDrawerSession } from "./useChatDrawerRuntime"

type Props = {
  session: ChatDrawerSession | null
  onClose: () => void
  children: ReactNode
}

type SwipeGesture = {
  pointerId: number
  startX: number
  startY: number
  dragging: boolean
  latestX: number
}

const SWIPE_START_PX = 7
const SWIPE_CLOSE_MIN_PX = 68
const SWIPE_CLOSE_RATIO = 0.22

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
  const swipeRef = useRef<SwipeGesture | null>(null)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)

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
            phase: session.phase,
          },
        }
      : null,
    65,
  )

  useEffect(() => {
    if (!session || session.phase === "closing") return

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
  }, [onClose, session?.id, session?.phase])

  useEffect(() => {
    if (!session || session.phase === "closing") return
    setDragX(0)
    setDragging(false)
    swipeRef.current = null
  }, [session?.id, session?.phase])

  if (!session) return null

  const titleId = "u1-chat-drawer-title-" + session.id

  function beginSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (session?.phase === "closing") return
    if (event.pointerType === "mouse" && event.button !== 0) return

    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      latestX: event.clientX,
      dragging: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = swipeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    gesture.latestX = event.clientX

    if (!gesture.dragging) {
      const horizontal = dx > SWIPE_START_PX && dx > Math.abs(dy) * 1.15
      if (!horizontal) return
      gesture.dragging = true
      setDragging(true)
    }

    event.preventDefault()
    setDragX(Math.max(0, dx))
  }

  function endSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = swipeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const panelWidth = panelRef.current?.getBoundingClientRect().width || 0
    const threshold = Math.max(
      SWIPE_CLOSE_MIN_PX,
      panelWidth * SWIPE_CLOSE_RATIO,
    )
    const shouldClose = gesture.dragging && dragX >= threshold

    swipeRef.current = null
    setDragging(false)

    if (shouldClose) {
      onClose()
      return
    }

    setDragX(0)
  }

  const style = {
    "--u1-chat-drawer-drag-x": `${dragX}px`,
  } as CSSProperties

  return (
    <div
      className="u1-chat-drawer-layer"
      data-chat-drawer-layer="true"
      data-closing={session.phase === "closing" || undefined}
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
        data-closing={session.phase === "closing" || undefined}
        data-dragging={dragging || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={style}
      >
        <div
          className="u1-chat-drawer__swipe-edge"
          aria-hidden="true"
          onPointerDown={beginSwipe}
          onPointerMove={moveSwipe}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
        >
          <i />
        </div>
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
