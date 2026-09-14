import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import type { SnakeAction, SnakeEntityRef, SnakePoint } from "../../../snake-engine"
import { useSnake } from "../SnakeContext"

export function SnakeTrigger({
  entity,
  actions,
  children,
}: {
  entity: SnakeEntityRef
  actions: SnakeAction[]
  children: ReactNode
}) {
  const snake = useSnake()
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<SnakePoint | null>(null)
  const touchGestureRef = useRef<{
    point: SnakePoint
    startedAt: number
    cancelled: boolean
  } | null>(null)
  const consumedUntilRef = useRef(0)
  const suppressClickUntilRef = useRef(0)

  const longPressMs = 520
  const touchContextWindowMs = 1800

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function open(point: SnakePoint) {
    snake.openMenu({ entity, actions, point })
  }

  function markConsumed() {
    consumedUntilRef.current = performance.now() + 1200
    suppressClickUntilRef.current = performance.now() + 650
  }

  function pointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return

    if (event.pointerType === "mouse") {
      touchGestureRef.current = null
      return
    }

    clearTimer()
    const point = { x: event.clientX, y: event.clientY }
    startRef.current = point
    touchGestureRef.current = {
      point,
      startedAt: performance.now(),
      cancelled: false,
    }

    timerRef.current = window.setTimeout(() => {
      const gesture = touchGestureRef.current
      if (!gesture || gesture.cancelled) return

      markConsumed()
      open(gesture.point)
      timerRef.current = null
    }, longPressMs)
  }

  function pointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const start = startRef.current
    if (!start) return

    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      clearTimer()
      startRef.current = null
      if (touchGestureRef.current) {
        touchGestureRef.current.cancelled = true
      }
    }
  }

  function pointerEnd() {
    const wasPendingLongPress = timerRef.current !== null
    clearTimer()
    startRef.current = null

    if (wasPendingLongPress && touchGestureRef.current) {
      touchGestureRef.current.cancelled = true
    }
  }

  function contextMenu(event: ReactMouseEvent<HTMLSpanElement>) {
    event.preventDefault()

    const now = performance.now()
    const point = { x: event.clientX, y: event.clientY }
    const touch = touchGestureRef.current
    const isRecentTouch =
      Boolean(touch) &&
      now - (touch?.startedAt || 0) <= touchContextWindowMs &&
      Math.hypot(
        point.x - (touch?.point.x || 0),
        point.y - (touch?.point.y || 0),
      ) < 36

    if (isRecentTouch) {
      event.stopPropagation()

      if (now < consumedUntilRef.current) return
      if (!touch || touch.cancelled) return
      if (now - touch.startedAt < longPressMs) return

      markConsumed()
      open(touch.point)
      return
    }

    open(point)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <span
      className="u1-snake-trigger"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onContextMenu={contextMenu}
      onClickCapture={(event) => {
        if (performance.now() >= suppressClickUntilRef.current) return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {children}
    </span>
  )
}
