import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

type Props = {
  disabled?: boolean
  onOpen: () => void
}

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  dragging: boolean
}

const OPEN_THRESHOLD_PX = 52
const START_THRESHOLD_PX = 7

export function ChatContextEdgeSwipe({ disabled = false, onOpen }: Props) {
  const gestureRef = useRef<Gesture | null>(null)
  const [progress, setProgress] = useState(0)

  if (disabled) return null

  function begin(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    const distance = Math.max(0, -dx)

    if (!gesture.dragging) {
      const horizontal =
        distance > START_THRESHOLD_PX &&
        distance > Math.abs(dy) * 1.15
      if (!horizontal) return
      gesture.dragging = true
    }

    event.preventDefault()
    setProgress(Math.min(1, distance / OPEN_THRESHOLD_PX))
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    const shouldOpen =
      gesture.dragging &&
      -dx >= OPEN_THRESHOLD_PX &&
      -dx > Math.abs(dy) * 1.15

    gestureRef.current = null
    setProgress(0)

    if (shouldOpen) onOpen()
  }

  return (
    <div
      className="u1-chat-context-edge"
      data-active={progress > 0 || undefined}
      style={{ "--u1-chat-edge-progress": progress } as CSSProperties}
      aria-hidden="true"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span />
    </div>
  )
}
