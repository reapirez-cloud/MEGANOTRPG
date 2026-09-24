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

type TelegramWebAppLike = {
  viewportHeight?: number
  viewportStableHeight?: number
  onEvent?: (event: "viewportChanged", listener: () => void) => void
  offEvent?: (event: "viewportChanged", listener: () => void) => void
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
    const telegram = (
      window as Window & {
        Telegram?: { WebApp?: TelegramWebAppLike }
      }
    ).Telegram?.WebApp

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
        const telegramHeight = Math.max(0, Number(telegram?.viewportHeight) || 0)
        const telegramStableHeight = Math.max(
          0,
          Number(telegram?.viewportStableHeight) || 0,
        )
        const telegramBottom =
          telegramHeight >= 160
            ? offsetTop + telegramHeight
            : Number.POSITIVE_INFINITY

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
          Math.round(
            Math.min(
              viewportBottom,
              innerBottom,
              telegramBottom,
              keyboardTop,
            ),
          ),
        )
        const layoutHeight = Math.max(
          document.documentElement.clientHeight,
          window.innerHeight,
          viewportBottom,
          telegramStableHeight ? offsetTop + telegramStableHeight : 0,
        )
        const shrink = Math.max(0, layoutHeight - visibleBottom)
        const telegramShrink =
          telegramHeight && telegramStableHeight
            ? Math.max(0, telegramStableHeight - telegramHeight)
            : 0
        const keyboardOpen =
          keyboardHeight >= 60 ||
          telegramShrink >= 60 ||
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
    telegram?.onEvent?.("viewportChanged", update)
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)

    return () => {
      window.cancelAnimationFrame(frame)
      viewport?.removeEventListener("resize", update)
      viewport?.removeEventListener("scroll", update)
      virtualKeyboard?.removeEventListener?.("geometrychange", update)
      telegram?.offEvent?.("viewportChanged", update)
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
