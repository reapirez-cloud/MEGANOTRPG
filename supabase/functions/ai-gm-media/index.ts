import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.3"

import { processAgentImageJob } from "../voss-agent/image-tools.ts"

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function stringValue(value: unknown, maxLength = 200) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : ""
}

function reply(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
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
    body = record(await req.json())
  } catch {
    return reply({ error: "invalid_json" }, 400)
  }

  const jobId = stringValue(body.jobId, 100)
  const campaignId = stringValue(body.campaignId, 100)
  const dispatchToken = stringValue(body.dispatchToken, 200)
  if (!jobId || !campaignId || !dispatchToken) {
    return reply({ error: "dispatch_payload_invalid" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const verification = await admin.rpc("verify_ai_gm_media_dispatch_v1", {
    p_token: dispatchToken,
  })
  if (verification.error || verification.data !== true) {
    return reply({ error: "dispatch_denied" }, 403)
  }

  const { data: job, error: jobError } = await admin
    .from("agent_jobs")
    .select("id,campaign_id,agent_key,job_type,status,input,result,error_code,error_message")
    .eq("id", jobId)
    .eq("campaign_id", campaignId)
    .eq("agent_key", "ai-gm-media-worker")
    .eq("job_type", "image_generate")
    .contains("input", { surface: "ai_gm_media_stage9_v1" })
    .maybeSingle()

  if (jobError) return reply({ error: jobError.message }, 500)
  if (!job?.id) return reply({ error: "ai_gm_media_job_not_found" }, 404)

  try {
    if (job.status === "queued") {
      await processAgentImageJob({ admin, jobId })
    }

    const finalized = await admin.rpc("finalize_ai_gm_media_lifecycle_v1", {
      p_job_id: jobId,
    })
    if (finalized.error) {
      return reply({
        error: "ai_gm_media_finalize_failed",
        detail: finalized.error.message,
      }, 500)
    }

    const { data: fresh } = await admin
      .from("agent_jobs")
      .select("status,result,error_code,error_message")
      .eq("id", jobId)
      .maybeSingle()

    const status = String(fresh?.status || "unknown")
    return reply({
      ok: status === "completed",
      status,
      result: record(fresh?.result),
      lifecycle: record(finalized.data),
      error_code: fresh?.error_code || null,
      error_message: fresh?.error_message || null,
    }, status === "failed" ? 500 : 200)
  } catch (error) {
    const finalized = await admin.rpc("finalize_ai_gm_media_lifecycle_v1", {
      p_job_id: jobId,
    })

    return reply({
      error: error instanceof Error ? error.message : String(error),
      code: "ai_gm_media_worker_failed",
      lifecycle:
        finalized.error
          ? { error: finalized.error.message }
          : record(finalized.data),
    }, 500)
  }
})
