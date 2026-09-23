import { useMemo, useState } from "react"

import { CHAT_MESSAGE_SENT_EVENT } from "./chatRoomContracts"
import type { UiChatEvent } from "./chatEventModel"
import {
  resolveAiGmRollRequest,
  resumeAiGmAfterRoll,
} from "./aiGmRollRequest"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function signed(value: number) {
  return value >= 0 ? "+" + value : String(value)
}

function rollTypeLabel(type: string) {
  if (type === "skill") return "Проверка навыка"
  if (type === "ability") return "Проверка характеристики"
  if (type === "save") return "Спасбросок"
  if (type === "attack") return "Атака"
  return "Проверка"
}

export default function ChatRollRequestCard({
  event,
  viewerUserId,
  campaignId,
}: {
  event: UiChatEvent
  viewerUserId: string
  campaignId: string
}) {
  const payload = useMemo(() => record(event.game?.payload), [event.game?.payload])
  const requestId = stringValue(payload.requestId)
  const targetUserId = stringValue(payload.targetUserId)
  const status = stringValue(payload.status) || "pending"
  const rollType = stringValue(payload.rollType)
  const label = stringValue(payload.label) || "Проверка"
  const reason = stringValue(payload.reason)
  const modifier = numberValue(payload.modifier) ?? 0
  const dc = numberValue(payload.dc)
  const resultTotal = numberValue(payload.resultTotal)
  const isTarget = Boolean(targetUserId && targetUserId === viewerUserId)
  const [busy, setBusy] = useState(false)
  const [localResolved, setLocalResolved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolved = status === "resolved" || localResolved

  const resume = async () => {
    if (!requestId || busy) return
    setBusy(true)
    setError(null)
    try {
      await resumeAiGmAfterRoll({ campaignId, requestId })
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "Продолжение ведущего не запустилось.",
      )
    } finally {
      setBusy(false)
    }
  }

  const roll = async () => {
    if (!requestId || busy) return
    setBusy(true)
    setError(null)
    try {
      const resolution = await resolveAiGmRollRequest(requestId)
      setLocalResolved(true)
      window.dispatchEvent(
        new CustomEvent(CHAT_MESSAGE_SENT_EVENT, {
          detail: {
            roomId: event.roomId,
            messageId: resolution.result_message_id,
          },
        }),
      )
      await resumeAiGmAfterRoll({ campaignId, requestId })
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "Бросок не выполнен.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className="u1-roll-request"
      data-roll-request-status={resolved ? "resolved" : "pending"}
      data-roll-request-target={isTarget || undefined}
    >
      <header className="u1-roll-request__head">
        <span>{rollTypeLabel(rollType)}</span>
        <strong>{label}</strong>
      </header>

      {reason ? <p>{reason}</p> : null}

      <div className="u1-roll-request__meta">
        <span>Модификатор <b>{signed(modifier)}</b></span>
        {dc !== null ? <span>СЛ <b>{dc}</b></span> : <span>СЛ скрыта</span>}
        {resolved && resultTotal !== null ? (
          <span>Итог <b>{resultTotal}</b></span>
        ) : null}
      </div>

      {isTarget && !resolved ? (
        <button type="button" disabled={busy} onClick={() => void roll()}>
          {busy ? "Бросаю…" : "Бросить d20"}
        </button>
      ) : null}

      {isTarget && resolved && error ? (
        <button type="button" disabled={busy} onClick={() => void resume()}>
          {busy ? "Продолжаю…" : "Продолжить ведущего"}
        </button>
      ) : null}

      {!isTarget && !resolved ? (
        <small>Ожидание броска игрока</small>
      ) : null}

      {resolved && !error ? <small>Бросок выполнен</small> : null}
      {error ? <em role="status">{error}</em> : null}
    </article>
  )
}
