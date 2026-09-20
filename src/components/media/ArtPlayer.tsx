import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react"

import CampaignImage from "../common/CampaignImage"

export type ArtPlayerItem = {
  id: string
  src: string
  title?: string
  caption?: string
  alt?: string
  facts?: Record<string, unknown>
}

export type ArtPlayerSnapshot = {
  item: ArtPlayerItem | null
  index: number
  count: number
  scale: number
}

type Point = { x: number; y: number }

type DragState = {
  pointerId: number
  startX: number
  startY: number
  startOffsetX: number
  startOffsetY: number
  moved: boolean
}

type PinchState = {
  distance: number
  scale: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function mediaHaptic() {
  const telegram = (window as Window & {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          impactOccurred?: (style: "light" | "soft") => void
        }
      }
    }
  }).Telegram?.WebApp?.HapticFeedback

  try {
    if (telegram?.impactOccurred) {
      telegram.impactOccurred("soft")
      return
    }
  } catch {
    // Browser vibration is a quiet fallback outside Telegram.
  }

  if (typeof navigator.vibrate === "function") navigator.vibrate(6)
}

export default function ArtPlayer({
  items,
  initialIndex = 0,
  title,
  eyebrow,
  onClose,
  onStateChange,
}: {
  items: ArtPlayerItem[]
  initialIndex?: number
  title: string
  eyebrow?: string
  onClose: () => void
  onStateChange?: (snapshot: ArtPlayerSnapshot) => void
}) {
  const count = items.length
  const [index, setIndex] = useState(() =>
    clamp(Math.trunc(initialIndex || 0), 0, Math.max(0, count - 1)),
  )
  const [chromeVisible, setChromeVisible] = useState(true)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })

  const pointersRef = useRef(new Map<number, Point>())
  const dragRef = useRef<DragState | null>(null)
  const pinchRef = useRef<PinchState | null>(null)
  const suppressTapRef = useRef(false)
  const lastTapRef = useRef(0)
  const tapTimerRef = useRef<number | null>(null)

  const active = items[index] || items[0] || null
  const sourceSrc = active?.src || ""

  const resetTransform = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const showIndex = useCallback((next: number) => {
    if (!count) return
    const target = clamp(next, 0, count - 1)
    if (target === index) return
    setIndex(target)
    resetTransform()
    mediaHaptic()
  }, [count, index, resetTransform])

  useEffect(() => {
    resetTransform()
  }, [sourceSrc, resetTransform])

  useEffect(() => {
    onStateChange?.({
      item: active,
      index,
      count,
      scale,
    })
  }, [active, count, index, onStateChange, scale])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        showIndex(index - 1)
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        showIndex(index + 1)
      } else if (event.key === "0") {
        event.preventDefault()
        resetTransform()
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        setScale((current) => clamp(current + 0.25, 1, 5))
      } else if (event.key === "-") {
        event.preventDefault()
        setScale((current) => {
          const next = clamp(current - 0.25, 1, 5)
          if (next <= 1.001) setOffset({ x: 0, y: 0 })
          return next
        })
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [index, onClose, resetTransform, showIndex])

  useEffect(() => () => {
    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current)
  }, [])

  const updatePinch = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return false

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    const points = [...pointersRef.current.values()]
    if (points.length < 2) return false

    const pinch = pinchRef.current
    if (!pinch) return true

    const nextScale = clamp(
      pinch.scale * (pointDistance(points[0], points[1]) / pinch.distance),
      1,
      5,
    )
    setScale(nextScale)
    if (nextScale <= 1.001) setOffset({ x: 0, y: 0 })
    return true
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return

    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    const points = [...pointersRef.current.values()]
    if (points.length >= 2) {
      pinchRef.current = {
        distance: Math.max(1, pointDistance(points[0], points[1])),
        scale,
      }
      dragRef.current = null
      suppressTapRef.current = true
      return
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
      moved: false,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (updatePinch(event)) return

    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true

    if (scale <= 1.02) return

    const rect = event.currentTarget.getBoundingClientRect()
    const maxX = (rect.width * (scale - 1)) / 2
    const maxY = (rect.height * (scale - 1)) / 2

    setOffset({
      x: clamp(drag.startOffsetX + dx, -maxX, maxX),
      y: clamp(drag.startOffsetY + dy, -maxY, maxY),
    })
  }

  const releasePointer = (
    event: ReactPointerEvent<HTMLElement>,
    cancelled = false,
  ) => {
    const drag = dragRef.current
    const wasPinching = pinchRef.current !== null
    pointersRef.current.delete(event.pointerId)

    if (wasPinching) {
      suppressTapRef.current = true
      pinchRef.current = null
      dragRef.current = null
      if (scale <= 1.001) resetTransform()
      return
    }

    if (!cancelled && drag && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY

      if (
        scale <= 1.02 &&
        Math.abs(dx) >= 58 &&
        Math.abs(dx) > Math.abs(dy) * 1.2
      ) {
        showIndex(index + (dx < 0 ? 1 : -1))
        suppressTapRef.current = true
      } else if (drag.moved) {
        suppressTapRef.current = true
      }
    }

    dragRef.current = null
  }

  const handleTap = () => {
    if (suppressTapRef.current) {
      suppressTapRef.current = false
      return
    }

    const now = performance.now()
    if (now - lastTapRef.current <= 270) {
      lastTapRef.current = 0
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current)
        tapTimerRef.current = null
      }

      if (scale > 1.02) {
        resetTransform()
      } else {
        setScale(2.25)
        setOffset({ x: 0, y: 0 })
      }
      mediaHaptic()
      return
    }

    lastTapRef.current = now
    tapTimerRef.current = window.setTimeout(() => {
      setChromeVisible((visible) => !visible)
      tapTimerRef.current = null
    }, 220)
  }

  const onWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.14 : 0.88
    setScale((current) => {
      const next = clamp(current * factor, 1, 5)
      if (next <= 1.001) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  if (!sourceSrc) {
    return (
      <section
        className="u1-art-player u1-art-player--empty"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="u1-art-player__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        <span>Нет изображения</span>
      </section>
    )
  }

  return (
    <section
      className="u1-art-player"
      data-chrome={chromeVisible ? "true" : "false"}
      data-zoomed={scale > 1.02 ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label={active?.title || title}
    >
      <div
        className="u1-art-player__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => releasePointer(event)}
        onPointerCancel={(event) => releasePointer(event, true)}
        onWheel={onWheel}
        onClick={(event) => {
          event.stopPropagation()
          handleTap()
        }}
      >
        <CampaignImage
          key={active?.id || sourceSrc}
          value={sourceSrc}
          alt={active?.alt || active?.title || title}
          className="u1-art-player__image"
          draggable={false}
          style={{
            transform:
              `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          }}
        />
      </div>

      <header className="u1-art-player__top">
        <div className="u1-art-player__title">
          {eyebrow && <i>{eyebrow}</i>}
          <strong>{active?.title || title}</strong>
        </div>
        <button
          type="button"
          className="u1-art-player__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      </header>

      {count > 1 && scale <= 1.02 && index > 0 && (
        <button
          type="button"
          className="u1-art-player__nav u1-art-player__nav--prev"
          onClick={() => showIndex(index - 1)}
          aria-label="Предыдущее изображение"
        >
          ‹
        </button>
      )}

      {count > 1 && scale <= 1.02 && index < count - 1 && (
        <button
          type="button"
          className="u1-art-player__nav u1-art-player__nav--next"
          onClick={() => showIndex(index + 1)}
          aria-label="Следующее изображение"
        >
          ›
        </button>
      )}

      <footer className="u1-art-player__bottom">
        <span className="u1-art-player__caption">
          {active?.caption || ""}
        </span>
        <span className="u1-art-player__zoom" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        {count > 1 && (
          <span className="u1-art-player__counter" aria-live="polite">
            {index + 1} / {count}
          </span>
        )}
      </footer>
    </section>
  )
}
