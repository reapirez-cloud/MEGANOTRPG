import { supabase } from "../../lib/supabase"

export type AiGmRollResolution = {
  request_id: string
  status: "resolved"
  job_id: string
  result_message_id: number
  d20: number
  total: number
}

function asResolution(value: unknown): AiGmRollResolution {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Сервер не вернул результат броска.")
  }
  const row = value as Record<string, unknown>
  const resultMessageId = Number(row.result_message_id)
  const d20 = Number(row.d20)
  const total = Number(row.total)
  if (
    typeof row.request_id !== "string" ||
    typeof row.job_id !== "string" ||
    !Number.isInteger(resultMessageId) ||
    !Number.isInteger(d20) ||
    !Number.isInteger(total)
  ) {
    throw new Error("Результат броска повреждён.")
  }
  return {
    request_id: row.request_id,
    status: "resolved",
    job_id: row.job_id,
    result_message_id: resultMessageId,
    d20,
    total,
  }
}

export async function resolveAiGmRollRequest(requestId: string) {
  const result = await supabase.rpc("resolve_ai_gm_roll_request_v1", {
    p_request_id: requestId,
  })
  if (result.error) throw result.error
  return asResolution(result.data)
}

export async function resumeAiGmAfterRoll({
  campaignId,
  requestId,
}: {
  campaignId: string
  requestId: string
}) {
  const result = await supabase.functions.invoke("voss-agent", {
    body: {
      campaignId,
      action: "resume_game_chat_roll",
      requestId,
    },
  })
  if (result.error) throw result.error
  return result.data
}
