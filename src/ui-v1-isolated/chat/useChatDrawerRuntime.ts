import { useCallback, useRef, useState } from "react"

export type ChatDrawerMode = "context" | "workspace"

export type ChatDrawerDescriptor = {
  eyebrow: string
  title: string
  subtitle?: string
}

export type ChatDrawerSession = ChatDrawerDescriptor & {
  id: number
  mode: ChatDrawerMode
}

export function useChatDrawerRuntime() {
  const [session, setSession] = useState<ChatDrawerSession | null>(null)
  const idRef = useRef(0)

  const open = useCallback((
    mode: ChatDrawerMode,
    descriptor: ChatDrawerDescriptor,
  ) => {
    idRef.current += 1
    setSession({
      id: idRef.current,
      mode,
      ...descriptor,
    })
  }, [])

  const openContext = useCallback(
    (descriptor: ChatDrawerDescriptor) => open("context", descriptor),
    [open],
  )

  const openWorkspace = useCallback(
    (descriptor: ChatDrawerDescriptor) => open("workspace", descriptor),
    [open],
  )

  const close = useCallback(() => {
    setSession(null)
  }, [])

  return {
    session,
    openContext,
    openWorkspace,
    close,
  }
}
