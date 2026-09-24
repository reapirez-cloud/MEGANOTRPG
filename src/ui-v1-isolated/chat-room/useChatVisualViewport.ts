import { useEffect, useState } from "react"

export type ChatVisualViewportMetrics = {
  height: number | null
  keyboardOpen: boolean
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
    if (!viewport) return

    let frame = 0

    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const layoutHeight = Math.max(
          document.documentElement.clientHeight,
          window.innerHeight,
        )
        const rawHeight = Math.max(1, viewport.height)
        const offsetTop = Math.max(0, viewport.offsetTop)
        const shrink = Math.max(0, layoutHeight - rawHeight)
        const keyboardOpen =
          shrink >= 120 ||
          (activeTextControl() && shrink >= 60)

        // Anchor the shell bottom to the actual visible viewport bottom.
        // Do not clamp to the old 280px floor: on Android/Telegram the
        // keyboard can legitimately leave less space than that.
        const visibleBottom = Math.max(
          160,
          Math.round(rawHeight + offsetTop),
        )

        setMetrics((current) =>
          current.height === visibleBottom &&
          current.keyboardOpen === keyboardOpen
            ? current
            : { height: visibleBottom, keyboardOpen },
        )
      })
    }

    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)

    return () => {
      window.cancelAnimationFrame(frame)
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
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
