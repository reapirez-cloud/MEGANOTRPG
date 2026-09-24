import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.3"

import { runPostTurnCommitV2 } from "../voss-agent/post-turn-commit.ts"

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

  let body: JsonRecord
  try {
    const parsed = await req.json()
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as JsonRecord
        : {}
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
    "verify_ai_gm_post_turn_dispatch_v2",
    { p_token: dispatchToken },
  )

  if (verification.error || verification.data !== true) {
    return reply({ error: "dispatch_denied" }, 403)
  }

  try {
    const result = await runPostTurnCommitV2(admin, campaignId, jobId)
    return reply({ ok: true, jobId, ...result })
  } catch (error) {
    return reply(
      {
        error: error instanceof Error ? error.message : String(error),
        code: "stage18_post_turn_worker_failed",
      },
      500,
    )
  }
})
