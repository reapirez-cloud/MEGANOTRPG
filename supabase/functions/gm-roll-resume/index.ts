import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.3"

import { runGameChatTurn } from "../voss-agent/game-chat-runtime.ts"

type JsonRecord = Record<string, unknown>

function reply(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceRoleKey) {
    return reply({ error: "service_role_not_configured" }, 503)
  }

  let body: JsonRecord = {}
  try {
    const parsed = await req.json()
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as JsonRecord
    }
  } catch {
    return reply({ error: "invalid_json" }, 400)
  }

  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : ""
  const campaignId =
    typeof body.campaignId === "string" ? body.campaignId.trim() : ""
  const dispatchToken =
    typeof body.dispatchToken === "string" ? body.dispatchToken.trim() : ""

  if (!jobId || !campaignId || !dispatchToken) {
    return reply({ error: "dispatch_payload_invalid" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const verification = await admin.rpc(
    "verify_ai_gm_roll_resume_dispatch_v1",
    { p_token: dispatchToken },
  )

  if (verification.error || verification.data !== true) {
    return reply({ error: "dispatch_denied" }, 403)
  }

  const job = await admin
    .from("agent_jobs")
    .select("id,campaign_id,status,job_type,input")
    .eq("id", jobId)
    .eq("campaign_id", campaignId)
    .eq("job_type", "conversation_turn")
    .maybeSingle()

  if (job.error) return reply({ error: job.error.message }, 500)
  if (!job.data?.id) return reply({ error: "gm_job_not_found" }, 404)

  if (job.data.status !== "queued") {
    return reply({ ok: true, skipped: true, status: job.data.status })
  }

  const surface =
    job.data.input &&
    typeof job.data.input === "object" &&
    !Array.isArray(job.data.input)
      ? (job.data.input as JsonRecord).surface
      : null

  if (surface !== "game_chat_v1") {
    return reply({ error: "gm_job_surface_invalid" }, 409)
  }

  await runGameChatTurn(admin, campaignId, jobId)
  return reply({ ok: true, resumed: true, jobId })
})
