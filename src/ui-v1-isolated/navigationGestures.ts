import { useEffect, useRef } from "react"

const APP_HISTORY_KEY = "__meganot_ui_v1_history"
const MIN_SWIPE_DISTANCE = 64
const MAX_SWIPE_DURATION_MS = 900
const HORIZONTAL_DOMINANCE = 1.35

type AppHistoryMarker = {
  depth: number
}

type AppHistoryState = Record<string, unknown> & {
  [APP_HISTORY_KEY]?: AppHistoryMarker
}

export type SwipeBackSample = {
  startX: number
  startY: number
  endX: number
  endY: number
  durationMs: number
  viewportWidth: number
}

type ActiveSwipe = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  startedAt: number
}

function currentState(): AppHistoryState {
  const state = window.history.state
  return state && typeof state === "object"
    ? state as AppHistoryState
    : {}
}

function currentMarker() {
  const marker = currentState()[APP_HISTORY_KEY]
  return marker && Number.isFinite(marker.depth)
    ? marker
    : null
}

function stateWithDepth(depth: number): AppHistoryState {
  return {
    ...currentState(),
    [APP_HISTORY_KEY]: {
      depth: Math.max(0, Math.trunc(depth)),
    },
  }
}

function toHash(path: string) {
  return path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`
}

function notifyRouteChange() {
  window.dispatchEvent(new Event("hashchange"))
}

export function ensureAppHistoryEntry() {
  const marker = currentMarker()
  const nextHash = window.location.hash || "#/home"

  if (marker && window.location.hash) return

  window.history.replaceState(
    stateWithDepth(marker?.depth ?? 0),
    "",
    nextHash,
  )
}

export function pushAppHash(path: string) {
  const nextHash = toHash(path)
  if (window.location.hash === nextHash) return

  const depth = currentMarker()?.depth ?? 0
  window.history.pushState(stateWithDepth(depth + 1), "", nextHash)
  notifyRouteChange()
}

function replaceAppHash(path: string) {
  const nextHash = toHash(path)
  window.history.replaceState(stateWithDepth(0), "", nextHash)
  notifyRouteChange()
}

export function fallbackBackPath(hash: string): string | null {
  const raw = hash.replace(/^#\/?/, "").split("?")[0]
  const parts = raw.split("/").filter(Boolean)

  if (parts.length === 0) return null

  if (parts[0] === "chats") {
    return parts.length > 1 ? "chats" : null
  }

  if (parts[0] === "workspace") {
    if (parts[1] === "character" && parts[2]) return "workspace"
    if (parts[1] === "manage" && parts.length > 2) return "workspace/manage"
    if (parts[1] === "manage") return "workspace"
    return null
  }

  if (parts[0] === "home") {
    if (parts.length <= 1) return null
    if (parts.length === 2) return "home"
    return parts.slice(0, -1).join("/")
  }

  return null
}

export function canNavigateBack() {
  const marker = currentMarker()
  return Boolean((marker && marker.depth > 0) || fallbackBackPath(window.location.hash))
}

export function navigateAppBack() {
  const marker = currentMarker()

  if (marker && marker.depth > 0) {
    window.history.back()
    return true
  }

  const fallback = fallbackBackPath(window.location.hash)
  if (!fallback) return false

  replaceAppHash(fallback)
  return true
}

export function swipeBackEdgeWidth(viewportWidth: number) {
  return Math.max(24, Math.min(36, viewportWidth * 0.08))
}

export function isSwipeBackGesture(sample: SwipeBackSample) {
  const deltaX = sample.endX - sample.startX
  const deltaY = sample.endY - sample.startY
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)

  return (
    sample.startX <= swipeBackEdgeWidth(sample.viewportWidth) &&
    deltaX >= MIN_SWIPE_DISTANCE &&
    horizontalDistance > verticalDistance * HORIZONTAL_DOMINANCE &&
    sample.durationMs <= MAX_SWIPE_DURATION_MS
  )
}

function targetBlocksSwipeBack(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(target.closest([
    ".u1-dock",
    "[data-swipe-back='ignore']",
    "[data-swipe-navigation='ignore']",
    "[role='slider']",
    "[aria-roledescription='carousel']",
    "[role='dialog']",
    "[aria-modal='true']",
  ].join(",")))
}

export function useSwipeBackNavigation({
  enabled,
  onBack,
}: {
  enabled: boolean
  onBack: () => void
}) {
  const onBackRef = useRef(onBack)

  useEffect(() => {
    onBackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!enabled) return

    let active: ActiveSwipe | null = null
    let suppressClickUntil = 0

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.isPrimary === false) return
      if (targetBlocksSwipeBack(event.target)) return

      const viewportWidth = window.visualViewport?.width || window.innerWidth
      if (event.clientX > swipeBackEdgeWidth(viewportWidth)) return

      active = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startedAt: performance.now(),
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!active || active.pointerId !== event.pointerId) return

      active.lastX = event.clientX
      active.lastY = event.clientY

      const deltaX = active.lastX - active.startX
      const deltaY = active.lastY - active.startY

      if (deltaX < -10 || (Math.abs(deltaY) > 56 && Math.abs(deltaY) > Math.abs(deltaX))) {
        active = null
      }
    }

    const finishSwipe = (event: PointerEvent) => {
      const swipe = active
      active = null

      if (!swipe || swipe.pointerId !== event.pointerId) return

      const viewportWidth = window.visualViewport?.width || window.innerWidth
      const triggered = isSwipeBackGesture({
        startX: swipe.startX,
        startY: swipe.startY,
        endX: event.clientX,
        endY: event.clientY,
        durationMs: performance.now() - swipe.startedAt,
        viewportWidth,
      })

      if (!triggered) return

      suppressClickUntil = performance.now() + 360
      event.preventDefault()
      onBackRef.current()
    }

    const cancelSwipe = () => {
      active = null
    }

    const suppressGestureClick = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntil) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("pointermove", onPointerMove, true)
    window.addEventListener("pointerup", finishSwipe, true)
    window.addEventListener("pointercancel", cancelSwipe, true)
    window.addEventListener("blur", cancelSwipe)
    window.addEventListener("click", suppressGestureClick, true)

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("pointermove", onPointerMove, true)
      window.removeEventListener("pointerup", finishSwipe, true)
      window.removeEventListener("pointercancel", cancelSwipe, true)
      window.removeEventListener("blur", cancelSwipe)
      window.removeEventListener("click", suppressGestureClick, true)
    }
  }, [enabled])
}
