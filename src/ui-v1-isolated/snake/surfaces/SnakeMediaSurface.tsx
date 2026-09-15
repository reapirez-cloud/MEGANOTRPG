import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { useAIViewContextLayer } from "../../../ai/AIProvider"
import CampaignImage from "../../../components/common/CampaignImage"
import type { SnakeMediaRequest } from "../../../snake-engine"
import type { SnakeSurfaceSession } from "../runtime"

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
    // Browser vibration is a quiet fallback for non-Telegram shells.
  }

  if (typeof navigator.vibrate === "function") navigator.vibrate(6)
}

export function SnakeMediaSurface({
  session,
  request,
  onClose,
}: {
  session: SnakeSurfaceSession
  request: SnakeMediaRequest
  onClose: () => void
}) {
  const count = request.items.length
  const initialIndex = clamp(Math.trunc(request.initialIndex || 0), 0, Math.max(0, count - 1))
  const [index, setIndex] = useState(initialIndex)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const pointersRef = useRef(new Map<number, Point>())
  const dragRef = useRef<DragState | null>(null)
  const pinchRef = useRef<PinchState | null>(null)
  const suppressTapRef = useRef(false)
  const lastTapRef = useRef(0)
  const tapTimerRef = useRef<number | null>(null)

  const active = request.items[index] || request.items[0] || null

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        showIndex(index - 1)
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        showIndex(index + 1)
      } else if (event.key === "0") {
        resetTransform()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [index, resetTransform, showIndex])

  useEffect(() => () => {
    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current)
  }, [])

  useAIViewContextLayer(
    "snake-media",
    active
      ? {
          screen: "snake-media",
          title: active.title || request.title,
          text: active.caption || "Открыт медиаплеер MEGANOT RPG.",
          entity: session.entity
            ? {
                type: session.entity.type,
                id: session.entity.id,
                label: active.title || request.title,
              }
            : null,
          facts: {
            mediaId: active.id,
            mediaSource: active.src,
            mediaIndex: index + 1,
            mediaCount: count,
            mediaTitle: active.title || request.title,
            mediaCaption: active.caption || null,
            zoom: Number(scale.toFixed(2)),
            itemFacts: active.facts || {},
          },
        }
      : null,
    96,
  )

  const releasePointer = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const drag = dragRef.current
    const wasPinching = pinchRef.current !== null

    pointersRef.current.delete(event.pointerId)

    if (wasPinching) {
      suppressTapRef.current = true
      pinchRef.current = null
      dragRef.current = null
      if (scale <= 1.02) resetTransform()
      return
    }

    if (!cancelled && drag && drag.pointerId === event.pointerId && scale <= 1.02) {
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (Math.abs(dx) >= 58 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        showIndex(index + (dx < 0 ? 1 : -1))
        suppressTapRef.current = true
      } else if (drag.moved) {
        suppressTapRef.current = true
      }
    }

    dragRef.current = null
  }

  if (!active) {
    return (
      <section className="u1-snake-media u1-snake-media--empty" role="dialog" aria-modal="true">
        <button type="button" className="u1-snake-media__close" onClick={onClose} aria-label="Закрыть">×</button>
        <span>Нет изображения</span>
      </section>
    )
  }

  return (
    <section
      className="u1-snake-media"
      data-chrome={chromeVisible ? "true" : "false"}
      data-zoomed={scale > 1.02 ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label={active.title || request.title}
    >
      <div
        className="u1-snake-media__stage"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return

          event.currentTarget.setPointerCapture?.(event.pointerId)
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

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
        }}
        onPointerMove={(event) => {
          if (!pointersRef.current.has(event.pointerId)) return
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

          const points = [...pointersRef.current.values()]
          if (points.length >= 2) {
            const pinch = pinchRef.current
            if (!pinch) return
            const nextScale = clamp(
              pinch.scale * (pointDistance(points[0], points[1]) / pinch.distance),
              1,
              4.5,
            )
            setScale(nextScale)
            if (nextScale <= 1.02) setOffset({ x: 0, y: 0 })
            return
          }

          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return

          const dx = event.clientX - drag.startX
          const dy = event.clientY - drag.startY
          if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true

          if (scale > 1.02) {
            const rect = event.currentTarget.getBoundingClientRect()
            const maxX = (rect.width * (scale - 1)) / 2
            const maxY = (rect.height * (scale - 1)) / 2
            setOffset({
              x: clamp(drag.startOffsetX + dx, -maxX, maxX),
              y: clamp(drag.startOffsetY + dy, -maxY, maxY),
            })
          }
        }}
        onPointerUp={(event) => releasePointer(event)}
        onPointerCancel={(event) => releasePointer(event, true)}
        onClick={(event) => {
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

          event.stopPropagation()
        }}
      >
        <CampaignImage
          key={active.id}
          value={active.src}
          alt={active.alt || active.title || request.title}
          className="u1-snake-media__image"
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          }}
        />
      </div>

      <header className="u1-snake-media__top">
        <div className="u1-snake-media__title">
          {request.eyebrow && <i>{request.eyebrow}</i>}
          <strong>{active.title || request.title}</strong>
        </div>
        <button
          type="button"
          className="u1-snake-media__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      </header>

      {count > 1 && index > 0 && (
        <button
          type="button"
          className="u1-snake-media__nav u1-snake-media__nav--prev"
          onClick={() => showIndex(index - 1)}
          aria-label="Предыдущее изображение"
        >
          ‹
        </button>
      )}

      {count > 1 && index < count - 1 && (
        <button
          type="button"
          className="u1-snake-media__nav u1-snake-media__nav--next"
          onClick={() => showIndex(index + 1)}
          aria-label="Следующее изображение"
        >
          ›
        </button>
      )}

      <footer className="u1-snake-media__bottom">
        <span className="u1-snake-media__caption">{active.caption || ""}</span>
        {count > 1 && (
          <span className="u1-snake-media__counter" aria-live="polite">
            {index + 1} / {count}
          </span>
        )}
      </footer>
    </section>
  )
}
