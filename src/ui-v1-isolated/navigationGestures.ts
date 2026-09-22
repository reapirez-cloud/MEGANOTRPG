import { useEffect, useRef } from "react"

const APP_HISTORY_KEY = "__meganot_ui_v1_history"
const APP_EXIT_GUARD_KEY = "__meganot_ui_v1_exit_guard"
const APP_ROOT_PROTECTED_KEY = "__meganot_ui_v1_root_protected"
const MIN_SWIPE_DISTANCE = 64
const MAX_SWIPE_DURATION_MS = 900
const HORIZONTAL_DOMINANCE = 1.35

type AppHistoryMarker = {
  depth: number
}

type AppHistoryState = Record<string, unknown> & {
  [APP_HISTORY_KEY]?: AppHistoryMarker
  [APP_EXIT_GUARD_KEY]?: boolean
  [APP_ROOT_PROTECTED_KEY]?: boolean
}

export type SwipeBackSample = {
  startX: number
  startY: number
  endX: number
  endY: number
  durationMs: number
  viewportWidth: number
}

type SwipeBackEdge = "left" | "right"

type ActiveSwipe = {
  pointerId: number
  edge: SwipeBackEdge
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
  const state = { ...currentState() }
  delete state[APP_EXIT_GUARD_KEY]
  delete state[APP_ROOT_PROTECTED_KEY]

  return {
    ...state,
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

function isRootHash(hash: string) {
  const raw = hash.replace(/^#\/?/, "").split("?")[0]
  return raw === "home" || raw === "workspace" || raw === "chats"
}

export function isAppExitGuardState(state: unknown) {
  if (!state || typeof state !== "object") return false
  return (state as AppHistoryState)[APP_EXIT_GUARD_KEY] === true
}

export function ensureRootExitGuard() {
  const marker = currentMarker()
  const state = currentState()
  const hash = window.location.hash || "#/home"

  if (
    !marker ||
    marker.depth !== 0 ||
    !isRootHash(hash) ||
    state[APP_ROOT_PROTECTED_KEY] === true ||
    state[APP_EXIT_GUARD_KEY] === true
  ) {
    return false
  }

  const rootState = stateWithDepth(0)

  window.history.replaceState(
    { ...rootState, [APP_EXIT_GUARD_KEY]: true },
    "",
    hash,
  )
  window.history.pushState(
    { ...rootState, [APP_ROOT_PROTECTED_KEY]: true },
    "",
    hash,
  )
  return true
}

export function handleAppExitGuardPop() {
  if (!isAppExitGuardState(window.history.state)) return false

  window.history.forward()
  return true
}

export function ensureAppHistoryEntry() {
  const marker = currentMarker()
  const nextHash = window.location.hash || "#/home"

  if (!marker || !window.location.hash) {
    window.history.replaceState(
      stateWithDepth(marker?.depth ?? 0),
      "",
      nextHash,
    )
  }

  ensureRootExitGuard()
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
  ensureRootExitGuard()
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

export function swipeBackSystemInset(viewportWidth: number) {
  return Math.max(20, Math.min(28, viewportWidth * 0.06))
}

export function swipeBackEdgeWidth(viewportWidth: number) {
  return Math.max(68, Math.min(88, viewportWidth * 0.2))
}

export function swipeBackEdge(
  startX: number,
  viewportWidth: number,
): SwipeBackEdge | null {
  const systemInset = swipeBackSystemInset(viewportWidth)
  const edgeWidth = swipeBackEdgeWidth(viewportWidth)

  if (startX > systemInset && startX <= edgeWidth) return "left"
  if (
    startX < viewportWidth - systemInset &&
    startX >= viewportWidth - edgeWidth
  ) {
    return "right"
  }
  return null
}

export function isSwipeBackGesture(sample: SwipeBackSample) {
  const edge = swipeBackEdge(sample.startX, sample.viewportWidth)
  if (!edge) return false

  const deltaX = sample.endX - sample.startX
  const deltaY = sample.endY - sample.startY
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  const inwardDistance = edge === "left" ? deltaX : -deltaX

  return (
    inwardDistance >= MIN_SWIPE_DISTANCE &&
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
  disableLeftEdge = false,
  disableRightEdge = false,
}: {
  enabled: boolean
  onBack: () => void
  disableLeftEdge?: boolean
  disableRightEdge?: boolean
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
      const edge = swipeBackEdge(event.clientX, viewportWidth)
      if (!edge) return
      if (edge === "left" && disableLeftEdge) return
      if (edge === "right" && disableRightEdge) return

      active = {
        pointerId: event.pointerId,
        edge,
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

      const inwardDistance = active.edge === "left" ? deltaX : -deltaX

      if (
        inwardDistance < -10 ||
        (Math.abs(deltaY) > 56 && Math.abs(deltaY) > Math.abs(deltaX))
      ) {
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
  }, [disableLeftEdge, disableRightEdge, enabled])
}
