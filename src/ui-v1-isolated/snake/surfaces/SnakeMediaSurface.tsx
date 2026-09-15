import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { useAIViewContextLayer } from "../../../ai/AIProvider"
import CampaignImage from "../../../components/common/CampaignImage"
import type { MediaPresentation } from "../../../media/presentation"
import type { SnakeActionInput, SnakeMediaRequest } from "../../../snake-engine"
import type { SnakeSurfaceSession } from "../runtime"

type Point = { x: number; y: number }
type Size = { width: number; height: number }

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

function composeAspect(request: SnakeMediaRequest) {
  if (!request.compose) return 1
  if (request.compose.shape === "circle" || request.compose.shape === "square") return 1
  return clamp(request.compose.aspectRatio || 1, 0.1, 12)
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

export function SnakeMediaSurface({
  session,
  request,
  onClose,
  onSubmit,
}: {
  session: SnakeSurfaceSession
  request: SnakeMediaRequest
  onClose: () => void
  onSubmit: (input?: SnakeActionInput) => void
}) {
  const count = request.items.length
  const initialIndex = clamp(
    Math.trunc(request.initialIndex || 0),
    0,
    Math.max(0, count - 1),
  )
  const [index, setIndex] = useState(initialIndex)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [naturalSize, setNaturalSize] = useState<Size | null>(null)
  const [frameSize, setFrameSize] = useState<Size | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [localUrl, setLocalUrl] = useState<string | null>(null)

  const pointersRef = useRef(new Map<number, Point>())
  const dragRef = useRef<DragState | null>(null)
  const pinchRef = useRef<PinchState | null>(null)
  const suppressTapRef = useRef(false)
  const lastTapRef = useRef(0)
  const tapTimerRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const initialPresentationAppliedRef = useRef(false)

  const compose = request.compose || null
  const composing = Boolean(compose)
  const active = request.items[index] || request.items[0] || null
  const sourceSrc = localUrl || active?.src || ""
  const aspect = composeAspect(request)

  const resetTransform = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const showIndex = useCallback((next: number) => {
    if (!count || composing) return
    const target = clamp(next, 0, count - 1)
    if (target === index) return
    setIndex(target)
    setNaturalSize(null)
    resetTransform()
    mediaHaptic()
  }, [composing, count, index, resetTransform])

  useEffect(() => {
    initialPresentationAppliedRef.current = false
    setNaturalSize(null)
    resetTransform()
  }, [resetTransform, sourceSrc])

  useEffect(() => {
    if (!composing || !frameRef.current) return
    const element = frameRef.current
    const update = () => {
      const rect = element.getBoundingClientRect()
      setFrameSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      })
    }
    update()

    if (typeof ResizeObserver !== "function") return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [aspect, composing, sourceSrc])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && !composing) {
        event.preventDefault()
        showIndex(index - 1)
      } else if (event.key === "ArrowRight" && !composing) {
        event.preventDefault()
        showIndex(index + 1)
      } else if (event.key === "0") {
        resetTransform()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [composing, index, resetTransform, showIndex])

  useEffect(() => () => {
    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current)
  }, [])

  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl)
  }, [localUrl])

  const composeMetrics = useMemo(() => {
    if (!composing || !naturalSize || !frameSize) return null
    const baseScale = Math.max(
      frameSize.width / naturalSize.width,
      frameSize.height / naturalSize.height,
    )
    const renderedWidth = naturalSize.width * baseScale * scale
    const renderedHeight = naturalSize.height * baseScale * scale
    return {
      baseScale,
      renderedWidth,
      renderedHeight,
      maxX: Math.max(0, (renderedWidth - frameSize.width) / 2),
      maxY: Math.max(0, (renderedHeight - frameSize.height) / 2),
    }
  }, [composing, frameSize, naturalSize, scale])

  useEffect(() => {
    if (!composeMetrics) return
    setOffset((current) => ({
      x: clamp(current.x, -composeMetrics.maxX, composeMetrics.maxX),
      y: clamp(current.y, -composeMetrics.maxY, composeMetrics.maxY),
    }))
  }, [composeMetrics])

  useEffect(() => {
    if (
      !compose?.initialPresentation ||
      selectedFile ||
      !naturalSize ||
      !frameSize ||
      !composeMetrics ||
      initialPresentationAppliedRef.current
    ) {
      return
    }

    const crop = compose.initialPresentation.crop
    const renderedWidth = frameSize.width / Math.max(0.000001, crop.width)
    const nextScale = clamp(
      renderedWidth /
        Math.max(0.000001, naturalSize.width * composeMetrics.baseScale),
      1,
      5,
    )
    const renderedHeight =
      naturalSize.height * composeMetrics.baseScale * nextScale
    const nextX =
      (0.5 - (crop.x + crop.width / 2)) * renderedWidth
    const nextY =
      (0.5 - (crop.y + crop.height / 2)) * renderedHeight

    initialPresentationAppliedRef.current = true
    setScale(nextScale)
    setOffset({
      x: clamp(
        nextX,
        -Math.max(0, (renderedWidth - frameSize.width) / 2),
        Math.max(0, (renderedWidth - frameSize.width) / 2),
      ),
      y: clamp(
        nextY,
        -Math.max(0, (renderedHeight - frameSize.height) / 2),
        Math.max(0, (renderedHeight - frameSize.height) / 2),
      ),
    })
  }, [compose, composeMetrics, frameSize, naturalSize, selectedFile])

  const currentPresentation = useMemo<MediaPresentation | null>(() => {
    if (!compose || !frameSize || !composeMetrics) return null

    const cropWidth = clamp(
      frameSize.width / composeMetrics.renderedWidth,
      0.000001,
      1,
    )
    const cropHeight = clamp(
      frameSize.height / composeMetrics.renderedHeight,
      0.000001,
      1,
    )
    const centerX = 0.5 - offset.x / composeMetrics.renderedWidth
    const centerY = 0.5 - offset.y / composeMetrics.renderedHeight

    return {
      version: 1,
      shape: compose.shape,
      aspectRatio: aspect,
      crop: {
        x: clamp(centerX - cropWidth / 2, 0, 1 - cropWidth),
        y: clamp(centerY - cropHeight / 2, 0, 1 - cropHeight),
        width: cropWidth,
        height: cropHeight,
      },
    }
  }, [aspect, compose, composeMetrics, frameSize, offset])

  useAIViewContextLayer(
    "snake-media",
    {
      screen: composing ? "snake-media-compose" : "snake-media",
      title: active?.title || request.title,
      text: composing
        ? "Открыт универсальный графический редактор MEGANOT RPG."
        : active?.caption || "Открыт медиаплеер MEGANOT RPG.",
      entity: session.entity
        ? {
            type: session.entity.type,
            id: session.entity.id,
            label: active?.title || request.title,
          }
        : null,
      facts: {
        mediaId: active?.id || null,
        mediaSource: active?.src || null,
        mediaIndex: index + 1,
        mediaCount: count,
        mediaTitle: active?.title || request.title,
        mediaCaption: active?.caption || null,
        zoom: Number(scale.toFixed(3)),
        mode: composing ? "compose" : "view",
        target: compose
          ? {
              label: compose.label || request.title,
              shape: compose.shape,
              aspectRatio: aspect,
            }
          : null,
        presentation: currentPresentation,
        itemFacts: active?.facts || {},
      },
    },
    96,
  )

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

    if (composing && composeMetrics) {
      setOffset({
        x: clamp(
          drag.startOffsetX + dx,
          -composeMetrics.maxX,
          composeMetrics.maxX,
        ),
        y: clamp(
          drag.startOffsetY + dy,
          -composeMetrics.maxY,
          composeMetrics.maxY,
        ),
      })
      return
    }

    if (scale > 1.02) {
      const rect = event.currentTarget.getBoundingClientRect()
      const maxX = (rect.width * (scale - 1)) / 2
      const maxY = (rect.height * (scale - 1)) / 2
      setOffset({
        x: clamp(drag.startOffsetX + dx, -maxX, maxX),
        y: clamp(drag.startOffsetY + dy, -maxY, maxY),
      })
    }
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
        !composing &&
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
    if (!composing) {
      tapTimerRef.current = window.setTimeout(() => {
        setChromeVisible((visible) => !visible)
        tapTimerRef.current = null
      }, 220)
    }
  }

  const chooseFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return
    if (localUrl) URL.revokeObjectURL(localUrl)

    setSelectedFile(file)
    setLocalUrl(URL.createObjectURL(file))
    setNaturalSize(null)
    initialPresentationAppliedRef.current = true
    resetTransform()
    mediaHaptic()
  }

  const submitComposition = () => {
    if (!compose || !sourceSrc || !naturalSize || !currentPresentation) return

    onSubmit({
      mediaId: active?.id || null,
      mediaSource: active?.src || null,
      itemFacts: active?.facts || {},
      file: selectedFile || undefined,
      sourceWidth: naturalSize.width,
      sourceHeight: naturalSize.height,
      presentation: currentPresentation,
    })
  }

  if (!sourceSrc && !composing) {
    return (
      <section
        className="u1-snake-media u1-snake-media--empty"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="u1-snake-media__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        <span>Нет изображения</span>
      </section>
    )
  }

  const composeImageStyle: CSSProperties | undefined =
    composing && composeMetrics
      ? {
          position: "absolute",
          left: "50%",
          top: "50%",
          width: composeMetrics.renderedWidth,
          height: composeMetrics.renderedHeight,
          maxWidth: "none",
          maxHeight: "none",
          transform:
            `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0)`,
        }
      : undefined

  return (
    <section
      className="u1-snake-media"
      data-chrome={chromeVisible ? "true" : "false"}
      data-zoomed={scale > 1.02 ? "true" : "false"}
      data-compose={composing ? "true" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={active?.title || request.title}
    >
      {composing ? (
        <div className="u1-snake-media__stage u1-snake-media__stage--compose">
          {sourceSrc ? (
            <div
              ref={frameRef}
              className="u1-snake-media__compose-frame"
              data-shape={compose?.shape}
              style={{ aspectRatio: String(aspect) }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => releasePointer(event)}
              onPointerCancel={(event) => releasePointer(event, true)}
              onClick={(event) => {
                event.stopPropagation()
                handleTap()
              }}
            >
              <CampaignImage
                key={sourceSrc}
                value={sourceSrc}
                alt={active?.alt || active?.title || request.title}
                className="u1-snake-media__compose-image"
                draggable={false}
                style={composeImageStyle}
                onLoad={(event) => {
                  setNaturalSize({
                    width: Math.max(1, event.currentTarget.naturalWidth),
                    height: Math.max(1, event.currentTarget.naturalHeight),
                  })
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="u1-snake-media__empty-source"
              onClick={() => fileInputRef.current?.click()}
            >
              <strong>{compose?.label || request.title}</strong>
              <span>Выбрать изображение</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className="u1-snake-media__stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => releasePointer(event)}
          onPointerCancel={(event) => releasePointer(event, true)}
          onClick={(event) => {
            event.stopPropagation()
            handleTap()
          }}
        >
          <CampaignImage
            key={active?.id || sourceSrc}
            value={sourceSrc}
            alt={active?.alt || active?.title || request.title}
            className="u1-snake-media__image"
            draggable={false}
            style={{
              transform:
                `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            }}
            onLoad={(event) => {
              setNaturalSize({
                width: Math.max(1, event.currentTarget.naturalWidth),
                height: Math.max(1, event.currentTarget.naturalHeight),
              })
            }}
          />
        </div>
      )}

      <header className="u1-snake-media__top">
        <div className="u1-snake-media__title">
          {request.eyebrow && <i>{request.eyebrow}</i>}
          <strong>{active?.title || request.title}</strong>
          {compose && (
            <small>
              {compose.label ||
                `${compose.shape} · ${aspect.toFixed(2)}:1`}
            </small>
          )}
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

      {!composing && count > 1 && scale <= 1.02 && index > 0 && (
        <button
          type="button"
          className="u1-snake-media__nav u1-snake-media__nav--prev"
          onClick={() => showIndex(index - 1)}
          aria-label="Предыдущее изображение"
        >
          ‹
        </button>
      )}

      {!composing && count > 1 && scale <= 1.02 && index < count - 1 && (
        <button
          type="button"
          className="u1-snake-media__nav u1-snake-media__nav--next"
          onClick={() => showIndex(index + 1)}
          aria-label="Следующее изображение"
        >
          ›
        </button>
      )}

      <footer
        className="u1-snake-media__bottom"
        data-compose={composing ? "true" : undefined}
      >
        {composing ? (
          <>
            <div className="u1-snake-media__compose-actions">
              {compose?.allowFilePick !== false && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {compose?.fileLabel ||
                    (sourceSrc ? "Другое изображение" : "Выбрать изображение")}
                </button>
              )}
              <button type="button" onClick={onClose}>
                {compose?.cancelLabel || "Отмена"}
              </button>
            </div>
            <button
              type="button"
              className="u1-snake-media__apply"
              disabled={
                !sourceSrc ||
                !naturalSize ||
                !currentPresentation ||
                Boolean(compose?.requireFile && !selectedFile)
              }
              onClick={submitComposition}
            >
              {compose?.submitLabel || "Применить"}
            </button>
          </>
        ) : (
          <>
            <span className="u1-snake-media__caption">
              {active?.caption || ""}
            </span>
            {count > 1 && (
              <span className="u1-snake-media__counter" aria-live="polite">
                {index + 1} / {count}
              </span>
            )}
          </>
        )}
      </footer>

      {composing && (
        <input
          ref={fileInputRef}
          className="u1-snake-media__file"
          type="file"
          accept="image/*"
          onChange={(event) => {
            chooseFile(event.currentTarget.files?.[0] || null)
            event.currentTarget.value = ""
          }}
        />
      )}
    </section>
  )
}
