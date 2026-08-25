import { useCallback, useRef } from "react"
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react"

export function useLongPressItem<T>(
  onLongPress: (item: T) => void,
  delay = 480,
) {
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return useCallback(
    (item: T) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return

        clearTimer()
        suppressClickRef.current = false
        startRef.current = { x: event.clientX, y: event.clientY }

        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          suppressClickRef.current = true
          navigator.vibrate?.(18)
          onLongPress(item)
        }, delay)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const start = startRef.current
        if (!start) return

        if (
          Math.hypot(
            event.clientX - start.x,
            event.clientY - start.y,
          ) > 12
        ) {
          clearTimer()
        }
      },
      onPointerUp: () => {
        clearTimer()
        startRef.current = null
      },
      onPointerCancel: () => {
        clearTimer()
        startRef.current = null
      },
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
        event.preventDefault()
        clearTimer()
        suppressClickRef.current = true
        onLongPress(item)
      },
      onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
        if (!suppressClickRef.current) return
        event.preventDefault()
        event.stopPropagation()
        suppressClickRef.current = false
      },
    }),
    [clearTimer, delay, onLongPress],
  )
}
