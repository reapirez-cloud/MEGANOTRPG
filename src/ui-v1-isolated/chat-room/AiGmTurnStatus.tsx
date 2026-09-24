import { useCallback, useEffect, useState } from "react"

import { CHAT_MESSAGE_SENT_EVENT } from "./chatRoomContracts"
import { loadAiGmRoomStatus, type AiGmRoomStatus } from "./aiGmRoomStatus"

export default function AiGmTurnStatus({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState<AiGmRoomStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await loadAiGmRoomStatus(roomId))
    } catch {
      // The database gate remains authoritative if status polling fails.
    }
  }, [roomId])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1600)

    const onMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string }>).detail
      if (detail?.roomId === roomId) void refresh()
    }
    window.addEventListener(CHAT_MESSAGE_SENT_EVENT, onMessage)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener(CHAT_MESSAGE_SENT_EVENT, onMessage)
    }
  }, [refresh, roomId])

  if (!status || status.phase === "idle") return null

  return (
    <div
      className="u1-ai-gm-status"
      data-phase={status.phase || "unknown"}
      data-active={status.active || undefined}
      role="status"
      aria-live="polite"
    >
      <i aria-hidden="true" />
      <span>
        <strong>{status.label || "ИИ-ГМ"}</strong>
        {(status.phase === "failed" || status.phase === "post_turn_recovery") &&
        status.error_message ? (
          <small>{status.error_message}</small>
        ) : null}
      </span>
    </div>
  )
}
