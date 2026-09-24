import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "../../lib/supabase"
import {
  AI_GM_TURN_STATUS_EVENT,
  CHAT_MESSAGE_SENT_EVENT,
  type AiGmTurnStatusDetail,
} from "./chatRoomContracts"

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
}

function publishStatus(roomId: string, status: AiGmStatus | null) {
  const detail: AiGmTurnStatusDetail = {
    roomId,
    active: status?.active === true,
    phase: status?.phase || "idle",
    label: status?.label || "ИИ-ГМ",
    commitId:
      typeof status?.commit_id === "string" && status.commit_id
        ? status.commit_id
        : null,
  }
  window.dispatchEvent(
    new CustomEvent<AiGmTurnStatusDetail>(AI_GM_TURN_STATUS_EVENT, {
      detail,
    }),
  )
}

async function wakePostTurnCommit(status: AiGmStatus) {
  if (
    !status.wake_required ||
    status.commit_state === "failed" ||
    !status.commit_id ||
    !status.campaign_id
  ) {
    return
  }

  await supabase.functions.invoke("voss-agent", {
    body: {
      campaignId: status.campaign_id,
      action: "game_chat_post_turn_resume",
      commitId: status.commit_id,
    },
  })
}

export default function AiGmTurnStatus({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState<AiGmStatus | null>(null)
  const [recovering, setRecovering] = useState(false)
  const wakeAttemptRef = useRef<string>("")

  const refresh = useCallback(async () => {
    const result = await supabase.rpc("get_ai_gm_room_status_v3", {
      p_room_id: roomId,
    })
    if (result.error) return

    const value =
      result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? result.data as AiGmStatus
        : null

    setStatus(value)
    publishStatus(roomId, value)

    const wakeKey =
      value?.wake_required && value.commit_id
        ? value.commit_id + ":" + (value.updated_at || "")
        : ""

    if (wakeKey && wakeAttemptRef.current !== wakeKey) {
      wakeAttemptRef.current = wakeKey
      void wakePostTurnCommit(value as AiGmStatus)
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
      publishStatus(roomId, null)
    }
  }, [refresh, roomId])

  const recover = useCallback(async () => {
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
      const retry = await supabase.rpc("retry_ai_gm_post_turn_commit_v3", {
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
      wakeAttemptRef.current = ""
      await refresh()
    } finally {
      setRecovering(false)
    }
  }, [recovering, refresh, status])

  if (!status || status.phase === "idle") return null

  const failed =
    status.phase === "failed" || status.phase === "post_turn_failed"

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
      {status.can_recover && status.commit_id ? (
        <button
          type="button"
          disabled={recovering}
          onClick={() => void recover()}
        >
          {recovering ? "Повтор…" : "Повторить"}
        </button>
      ) : null}
    </div>
  )
}
