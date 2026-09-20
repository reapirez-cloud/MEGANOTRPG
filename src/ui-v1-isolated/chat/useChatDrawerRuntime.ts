import { useCallback, useEffect, useRef, useState } from "react"

export type ChatDrawerMode = "context" | "workspace"
export type ChatDrawerPhase = "open" | "closing"

export type ChatDrawerDescriptor = {
  eyebrow: string
  title: string
  subtitle?: string
  contentKey?: string
}

export type ChatDrawerSession = ChatDrawerDescriptor & {
  id: number
  mode: ChatDrawerMode
  phase: ChatDrawerPhase
}

const CLOSE_MS = 155

export function useChatDrawerRuntime() {
  const [session, setSession] = useState<ChatDrawerSession | null>(null)
  const idRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  useEffect(() => clearCloseTimer, [clearCloseTimer])

  const open = useCallback((
    mode: ChatDrawerMode,
    descriptor: ChatDrawerDescriptor,
  ) => {
    clearCloseTimer()
    idRef.current += 1
    setSession({
      id: idRef.current,
      mode,
      phase: "open",
      ...descriptor,
    })
  }, [clearCloseTimer])

  const openContext = useCallback(
    (descriptor: ChatDrawerDescriptor) => open("context", descriptor),
    [open],
  )

  const openWorkspace = useCallback(
    (descriptor: ChatDrawerDescriptor) => open("workspace", descriptor),
    [open],
  )

  const close = useCallback(() => {
    clearCloseTimer()
    setSession((current) => {
      if (!current || current.phase === "closing") return current
      return { ...current, phase: "closing" }
    })
    closeTimerRef.current = window.setTimeout(() => {
      setSession(null)
      closeTimerRef.current = null
    }, CLOSE_MS)
  }, [clearCloseTimer])

  return {
    session,
    openContext,
    openWorkspace,
    close,
  }
}
