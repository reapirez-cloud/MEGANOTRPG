import {
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
  const consumedUntilRef = useRef(0)
  const suppressClickUntilRef = useRef(0)

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function open(point: SnakePoint) {
    snake.openMenu({ entity, actions, point })
  }

  function pointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse") return
    if (event.button !== 0) return

    clearTimer()
    startRef.current = { x: event.clientX, y: event.clientY }

    timerRef.current = window.setTimeout(() => {
      const point = startRef.current
      if (!point) return

      consumedUntilRef.current = performance.now() + 1200
      suppressClickUntilRef.current = performance.now() + 650
      open(point)
      timerRef.current = null
    }, 520)
  }

  function pointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const start = startRef.current
    if (!start) return

    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      clearTimer()
      startRef.current = null
    }
  }

  function pointerEnd() {
    clearTimer()
    startRef.current = null
  }

  function contextMenu(event: ReactMouseEvent<HTMLSpanElement>) {
    event.preventDefault()

    const point = { x: event.clientX, y: event.clientY }
    const start = startRef.current
    const duplicate =
      performance.now() < consumedUntilRef.current &&
      (!start || Math.hypot(point.x - start.x, point.y - start.y) < 36)

    if (duplicate) {
      event.stopPropagation()
      return
    }

    open(point)
  }

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
