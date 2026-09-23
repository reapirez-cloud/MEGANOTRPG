import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.3"

import { runAiWorldBackground } from "../voss-agent/background-world.ts"

type JsonRecord = Record<string, unknown>

function reply(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405)
  }

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

  const runId = typeof body.runId === "string" ? body.runId.trim() : ""
  const dispatchToken =
    typeof body.dispatchToken === "string" ? body.dispatchToken.trim() : ""

  if (!runId || !dispatchToken) {
    return reply({ error: "dispatch_payload_invalid" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const verification = await admin.rpc(
    "verify_ai_background_dispatch_v1",
    { p_token: dispatchToken },
  )
  if (verification.error || verification.data !== true) {
    return reply({ error: "dispatch_denied" }, 403)
  }

  try {
    const result = await runAiWorldBackground(admin, runId)
    return reply({
      ok: true,
      processed: result.processed === true,
      completed: result.completed === true,
      busy: result.busy === true,
      replayed: result.replayed === true,
      runId,
    })
  } catch (error) {
    return reply({
      error: error instanceof Error ? error.message : String(error),
      code: "ai_world_background_runner_failed",
      runId,
    }, 500)
  }
})
