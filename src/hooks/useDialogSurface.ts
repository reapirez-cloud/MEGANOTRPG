import { useEffect, useRef } from "react"

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",")

let scrollLockDepth = 0
let previousBodyOverflow = ""

function lockBodyScroll() {
  if (scrollLockDepth === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
  scrollLockDepth += 1
}

function unlockBodyScroll() {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1)
  if (scrollLockDepth === 0) {
    document.body.style.overflow = previousBodyOverflow
    previousBodyOverflow = ""
  }
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) =>
    element.getAttribute("aria-hidden") !== "true" && element.tabIndex !== -1,
  )
}

/**
 * Shared presentation behavior for modal/bottom-sheet surfaces.
 * Keeps keyboard focus inside the active dialog, restores the invoking focus on close,
 * closes on Escape and prevents the background document from scrolling underneath it.
 */
export function useDialogSurface<T extends HTMLElement>(
  onClose: () => void,
  initialFocusSelector?: string,
) {
  const dialogRef = useRef<T>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const mountedDialog = dialogRef.current
    if (!mountedDialog) return
    const dialog: HTMLElement = mountedDialog

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockBodyScroll()

    const frame = window.requestAnimationFrame(() => {
      const preferred = initialFocusSelector
        ? dialog.querySelector<HTMLElement>(initialFocusSelector)
        : null
      const target = preferred ?? focusableElements(dialog)[0] ?? dialog
      target.focus({ preventScroll: true })
    })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        closeRef.current()
        return
      }

      if (event.key !== "Tab") return
      const focusable = focusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
        return
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener("keydown", onKeyDown)
      unlockBodyScroll()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [initialFocusSelector])

  return dialogRef
}
