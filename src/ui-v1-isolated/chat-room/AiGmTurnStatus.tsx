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
  pending_roll_request_id?: string | null
  auto_roll_available?: boolean
  error_code?: string | null
  error_message?: string | null
  updated_at?: string | null
}

function publishStatus(roomId: string, status: AiGmStatus | null) {
  const phase = status?.phase || "idle"
  const terminal =
    phase === "failed" ||
    phase === "post_turn_failed" ||
    phase === "cancelled" ||
    phase === "idle"

  const detail: AiGmTurnStatusDetail = {
    roomId,
    active: status?.active === true && !terminal,
    phase,
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

async function wakeGameTurn(status: AiGmStatus) {
  if (
    !status.wake_required ||
    status.commit_id ||
    !status.job_id ||
    !status.campaign_id
  ) {
    return
  }

  await supabase.functions.invoke("voss-agent", {
    body: {
      campaignId: status.campaign_id,
      action: "game_chat_turn_resume",
      jobId: status.job_id,
    },
  })
}

export default function AiGmTurnStatus({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState<AiGmStatus | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [controlBusy, setControlBusy] = useState<"" | "cancel" | "inspect" | "edit">("")
  const [controlError, setControlError] = useState("")
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState("")
  const wakeAttemptRef = useRef<string>("")
  const autoRollAttemptRef = useRef<string>("")

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

    const pendingRollId =
      value?.phase === "waiting_for_roll" &&
      value.auto_roll_available === true &&
      typeof value.pending_roll_request_id === "string"
        ? value.pending_roll_request_id
        : ""

    if (pendingRollId && autoRollAttemptRef.current !== pendingRollId) {
      autoRollAttemptRef.current = pendingRollId
      void supabase
        .rpc("resolve_player_roll_request_v1", {
          p_request_id: pendingRollId,
        })
        .then(({ error: rollError }) => {
          if (rollError) return
          window.dispatchEvent(
            new CustomEvent(CHAT_MESSAGE_SENT_EVENT, {
              detail: { roomId },
            }),
          )
          void refresh()
        })
    }

    const wakeKey =
      value?.wake_required && value.commit_id
        ? "commit:" + value.commit_id + ":" + (value.updated_at || "")
        : value?.wake_required && value.job_id
          ? "job:" + value.job_id + ":" + (value.updated_at || "")
          : ""

    if (wakeKey && wakeAttemptRef.current !== wakeKey) {
      wakeAttemptRef.current = wakeKey
      if (value?.commit_id) void wakePostTurnCommit(value as AiGmStatus)
      else void wakeGameTurn(value as AiGmStatus)
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

  const invokeTurnControl = useCallback(async (
    mode: "inspect" | "cancel" | "edit_resend",
    editedBody?: string,
  ) => {
    if (!status?.job_id || !status.campaign_id) {
      throw new Error("Активный ход ИИ-ГМ не найден.")
    }

    const result = await supabase.functions.invoke("voss-agent", {
      body: {
        campaignId: status.campaign_id,
        action: "game_chat_turn_control",
        jobId: status.job_id,
        controlMode: mode,
        editedBody: mode === "edit_resend" ? editedBody : undefined,
      },
    })

    const data =
      result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? result.data as Record<string, unknown>
        : {}
    const errorMessage =
      typeof data.error === "string"
        ? data.error
        : result.error?.message || ""

    if (result.error || data.accepted === false || errorMessage) {
      throw new Error(errorMessage || "Не удалось изменить активный ход.")
    }

    return data
  }, [status])

  const cancelActiveTurn = useCallback(async () => {
    if (controlBusy || !status?.job_id) return
    setControlBusy("cancel")
    setControlError("")
    try {
      await invokeTurnControl("cancel")
      setEditing(false)
      setEditText("")
      wakeAttemptRef.current = ""
      window.dispatchEvent(
        new CustomEvent(CHAT_MESSAGE_SENT_EVENT, {
          detail: { roomId },
        }),
      )
      await refresh()
    } catch (error) {
      setControlError(
        error instanceof Error ? error.message : "Ход не удалось остановить.",
      )
    } finally {
      setControlBusy("")
    }
  }, [controlBusy, invokeTurnControl, refresh, roomId, status?.job_id])

  const openEdit = useCallback(async () => {
    if (controlBusy || !status?.job_id) return
    setControlBusy("inspect")
    setControlError("")
    try {
      const data = await invokeTurnControl("inspect")
      if (data.can_edit !== true) {
        throw new Error(
          typeof data.blocked_reason === "string" && data.blocked_reason
            ? data.blocked_reason
            : "Этот ход уже нельзя редактировать до ответа.",
        )
      }
      setEditText(typeof data.source_body === "string" ? data.source_body : "")
      setEditing(true)
    } catch (error) {
      setControlError(
        error instanceof Error ? error.message : "Сообщение не открылось.",
      )
    } finally {
      setControlBusy("")
    }
  }, [controlBusy, invokeTurnControl, status?.job_id])

  const saveEdit = useCallback(async () => {
    const body = editText.trim()
    if (!body || controlBusy) return
    setControlBusy("edit")
    setControlError("")
    try {
      await invokeTurnControl("edit_resend", body)
      setEditing(false)
      setEditText("")
      wakeAttemptRef.current = ""
      window.dispatchEvent(
        new CustomEvent(CHAT_MESSAGE_SENT_EVENT, {
          detail: { roomId },
        }),
      )
      await refresh()
    } catch (error) {
      setControlError(
        error instanceof Error ? error.message : "Сообщение не переотправлено.",
      )
    } finally {
      setControlBusy("")
    }
  }, [controlBusy, editText, invokeTurnControl, refresh, roomId])

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
  const preAnswerControlsVisible = Boolean(
    status.active === true &&
    status.job_id &&
    status.campaign_id &&
    (status.job_status === "queued" || status.job_status === "running") &&
    status.phase !== "waiting_for_roll",
  )
  const interruptible = Boolean(
    preAnswerControlsVisible &&
    status.phase !== "applying",
  )
  const atomicMutationInFlight =
    preAnswerControlsVisible && status.phase === "applying"

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

      {preAnswerControlsVisible ? (
        <div className="u1-ai-gm-status__actions">
          <button
            type="button"
            data-tone="danger"
            disabled={Boolean(controlBusy) || !interruptible}
            title={atomicMutationInFlight ? "Завершается короткая серверная операция" : undefined}
            onClick={() => void cancelActiveTurn()}
          >
            {controlBusy === "cancel" ? "Стоп…" : "Остановить шуршание"}
          </button>
          <button
            type="button"
            disabled={Boolean(controlBusy) || !interruptible}
            title={atomicMutationInFlight ? "Редактирование откроется сразу после серверной операции" : undefined}
            onClick={() => void openEdit()}
          >
            {controlBusy === "inspect" ? "Открываю…" : "Редактировать"}
          </button>
        </div>
      ) : null}

      {atomicMutationInFlight ? (
        <small className="u1-ai-gm-status__hint">
          Сервер применяет короткое действие. Стоп и редактирование включатся сразу после него.
        </small>
      ) : null}

      {controlError ? (
        <small className="u1-ai-gm-status__error">{controlError}</small>
      ) : null}

      {editing && preAnswerControlsVisible ? (
        <div className="u1-ai-gm-status__editor">
          <textarea
            value={editText}
            maxLength={4000}
            autoFocus
            disabled={Boolean(controlBusy) || !interruptible}
            onChange={(event) => setEditText(event.target.value)}
          />
          <div>
            <button
              type="button"
              disabled={Boolean(controlBusy)}
              onClick={() => {
                setEditing(false)
                setControlError("")
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={Boolean(controlBusy) || !interruptible || !editText.trim()}
              onClick={() => void saveEdit()}
            >
              {controlBusy === "edit" ? "Переотправляю…" : "Сохранить и отправить"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
