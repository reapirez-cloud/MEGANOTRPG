import { supabase } from "../../lib/supabase"

export type AiGmRoomStatus = {
  active?: boolean
  phase?: string
  label?: string
  send_locked?: boolean
  job_id?: string
  job_status?: string
  post_turn_job_id?: string
  post_turn_state?: string
  completed_intents?: number
  total_intents?: number
  error_code?: string | null
  error_message?: string | null
  updated_at?: string | null
  runtime_stage?: number
}

export async function loadAiGmRoomStatus(roomId: string) {
  // Best-effort watchdog. The DB gate is authoritative; this call only wakes a
  // queued/stale post-turn worker if a prior HTTP dispatch was lost.
  await supabase
    .rpc("ensure_ai_gm_post_turn_dispatch_v2", { p_room_id: roomId })
    .then(() => undefined)
    .catch(() => undefined)

  const result = await supabase.rpc("get_ai_gm_room_status_v1", {
    p_room_id: roomId,
  })
  if (result.error) throw result.error

  return result.data &&
      typeof result.data === "object" &&
      !Array.isArray(result.data)
    ? result.data as AiGmRoomStatus
    : null
}
