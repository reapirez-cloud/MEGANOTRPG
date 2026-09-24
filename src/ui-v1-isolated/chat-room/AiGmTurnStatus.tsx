import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "../../lib/supabase"
import { CHAT_MESSAGE_SENT_EVENT } from "./chatRoomContracts"

type AiGmStatus = {
  active?: boolean
  phase?: string
  label?: string
  campaign_id?: string
  job_id?: string
  job_status?: string
  commit_id?: string
  commit_state?: string
  attempts?: number
  max_attempts?: number
  can_recover?: boolean
  wake_required?: boolean
  error_code?: string | null
  error_message?: string | null
  updated_at?: string | null
  lease_expires_at?: string | null
}

export default function AiGmTurnStatus({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState<AiGmStatus | null>(null)
  const [recovering, setRecovering] = useState(false)
  const wakeInFlightRef = useRef(false)

  const wakeCommit = useCallback(async (value: AiGmStatus) => {
    if (
      wakeInFlightRef.current ||
      !value.wake_required ||
      !value.commit_id ||
      !value.campaign_id
    ) {
      return
    }

    wakeInFlightRef.current = true
    try {
      await supabase.functions.invoke("voss-agent", {
        body: {
          campaignId: value.campaign_id,
          action: "game_chat_post_turn_resume",
          commitId: value.commit_id,
        },
      })
    } finally {
      wakeInFlightRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const result = await supabase.rpc("get_ai_gm_room_status_v2", {
      p_room_id: roomId,
    })
    if (result.error) return

    const value =
      result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? result.data as AiGmStatus
        : null
    setStatus(value)

    if (value) {
      void wakeCommit(value)
    }
  }, [roomId, wakeCommit])

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

  const recover = async () => {
    if (
      recovering ||
      !status?.can_recover ||
      !status.commit_id ||
      !status.campaign_id
    ) {
      return
    }

    setRecovering(true)
    try {
      const retry = await supabase.rpc("retry_ai_gm_post_turn_commit_v2", {
        p_commit_id: status.commit_id,
      })
      if (retry.error) throw retry.error

      await supabase.functions.invoke("voss-agent", {
        body: {
          campaignId: status.campaign_id,
          action: "game_chat_post_turn_resume",
          commitId: status.commit_id,
        },
      })
      await refresh()
    } finally {
      setRecovering(false)
    }
  }

  if (!status || status.phase === "idle") return null

  const failed = status.phase === "post_turn_failed"

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
        {failed && status.error_message ? (
          <small>{status.error_message}</small>
        ) : null}
      </span>
      {failed && status.can_recover ? (
        <button
          type="button"
          disabled={recovering}
          onClick={() => void recover()}
        >
          {recovering ? "Повтор…" : "Повторить синхронизацию"}
        </button>
      ) : null}
    </div>
  )
}
