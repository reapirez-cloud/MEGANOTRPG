import { useEffect, useState } from "react"

export type ChatVisualViewportMetrics = {
  height: number | null
  keyboardOpen: boolean
}

type VirtualKeyboardLike = {
  boundingRect?: {
    y?: number
    top?: number
    height?: number
  }
  addEventListener?: (type: "geometrychange", listener: () => void) => void
  removeEventListener?: (type: "geometrychange", listener: () => void) => void
}

function activeTextControl() {
  const active = document.activeElement
  return active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "range"].includes(active.type))
}

export function useChatVisualViewport() {
  const [metrics, setMetrics] = useState<ChatVisualViewportMetrics>({
    height: null,
    keyboardOpen: false,
  })

  useEffect(() => {
    const viewport = window.visualViewport
    const virtualKeyboard = (
      navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike }
    ).virtualKeyboard

    let frame = 0

    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const offsetTop = Math.max(0, viewport?.offsetTop || 0)
        const viewportHeight = Math.max(
          1,
          viewport?.height || window.innerHeight || document.documentElement.clientHeight,
        )
        const viewportBottom = offsetTop + viewportHeight
        const innerBottom = offsetTop + Math.max(1, window.innerHeight || viewportHeight)

        const keyboardRect = virtualKeyboard?.boundingRect
        const keyboardHeight = Math.max(0, Number(keyboardRect?.height) || 0)
        const keyboardTopRaw = Number(keyboardRect?.y ?? keyboardRect?.top)
        const keyboardTop =
          keyboardHeight >= 24 && Number.isFinite(keyboardTopRaw)
            ? Math.max(0, keyboardTopRaw)
            : Number.POSITIVE_INFINITY

        // This value is a bottom coordinate in layout-viewport space, not just
        // visualViewport.height. Android WebView can either resize, pan, or
        // overlay the IME depending on Telegram/device settings. Use whichever
        // boundary is highest so the composer never ends up behind the keyboard.
        const visibleBottom = Math.max(
          160,
          Math.round(Math.min(viewportBottom, innerBottom, keyboardTop)),
        )
        const layoutHeight = Math.max(
          document.documentElement.clientHeight,
          window.innerHeight,
          viewportBottom,
        )
        const shrink = Math.max(0, layoutHeight - visibleBottom)
        const keyboardOpen =
          keyboardHeight >= 60 ||
          shrink >= 120 ||
          (activeTextControl() && shrink >= 60)

        setMetrics((current) =>
          current.height === visibleBottom &&
          current.keyboardOpen === keyboardOpen
            ? current
            : { height: visibleBottom, keyboardOpen },
        )
      })
    }

    update()
    viewport?.addEventListener("resize", update)
    viewport?.addEventListener("scroll", update)
    virtualKeyboard?.addEventListener?.("geometrychange", update)
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)

    return () => {
      window.cancelAnimationFrame(frame)
      viewport?.removeEventListener("resize", update)
      viewport?.removeEventListener("scroll", update)
      virtualKeyboard?.removeEventListener?.("geometrychange", update)
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", update)
    }
  }, [])

  return metrics
}

// Backward-compatible helper for any older isolated-room callers.
export function useChatVisualViewportHeight() {
  return useChatVisualViewport().height
}
