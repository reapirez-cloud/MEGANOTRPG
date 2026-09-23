import { useCallback, useEffect, useState } from "react"

import { supabase } from "../../lib/supabase"
import { CHAT_MESSAGE_SENT_EVENT } from "./chatRoomContracts"

type AiGmStatus = {
  active?: boolean
  phase?: string
  label?: string
  job_id?: string
  job_status?: string
  error_code?: string | null
  error_message?: string | null
  updated_at?: string | null
}

export default function AiGmTurnStatus({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState<AiGmStatus | null>(null)

  const refresh = useCallback(async () => {
    const result = await supabase.rpc("get_ai_gm_room_status_v1", {
      p_room_id: roomId,
    })
    if (result.error) return
    const value =
      result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? result.data as AiGmStatus
        : null
    setStatus(value)
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
        {status.phase === "failed" && status.error_message ? (
          <small>{status.error_message}</small>
        ) : null}
      </span>
    </div>
  )
}
