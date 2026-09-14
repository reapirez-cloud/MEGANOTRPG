import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.3"
import {
  applyRunToPreviewBranch,
  cancelRunBranch,
  developerRepoConfigured,
  DEV_BASE_BRANCH,
  DEV_REPO,
  mergeRunPr,
  readRemoteStatus,
  type DevRunRow,
} from "./github-dev.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type JsonRecord = Record<string, unknown>

function reply(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  })
}

function getEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)
    if (value) return value
  }
  return ""
}

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function uuid(value: unknown) {
  const result = text(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(result)
    ? result
    : ""
}

async function updateStageJobs(
  admin: ReturnType<typeof createClient>,
  runId: string,
  userId: string,
  details: {
    ciState?: string
    previewState?: string
    checks?: unknown
    error?: string | null
  } = {},
) {
  const { data: jobs } = await admin
    .from("agent_jobs")
    .select("id,job_type,input")
    .eq("requested_by", userId)
    .in("job_type", ["dev_test", "dev_build", "dev_preview"])

  for (const job of jobs || []) {
    const input =
      job.input && typeof job.input === "object" && !Array.isArray(job.input)
        ? job.input as JsonRecord
        : {}
    if (input.run_id !== runId) continue

    let nextStatus: "running" | "completed" | "failed" = "running"
    if (job.job_type === "dev_preview") {
      if (details.previewState === "success") nextStatus = "completed"
      else if (details.previewState === "failure") nextStatus = "failed"
    } else {
      if (details.ciState === "success") nextStatus = "completed"
      else if (details.ciState === "failure") nextStatus = "failed"
    }

    await admin.from("agent_jobs").update({
      status: nextStatus,
      result: {
        run_id: runId,
        ci_state: details.ciState || "unknown",
        preview_state: details.previewState || "unknown",
        checks: details.checks || [],
      },
      completed_outputs: nextStatus === "completed" ? 1 : 0,
      error_code: nextStatus === "failed" ? "developer_check_failed" : null,
      error_message:
        nextStatus === "failed"
          ? details.error || "Developer Mode check failed."
          : null,
      started_at: nextStatus === "running" ? new Date().toISOString() : undefined,
      completed_at:
        nextStatus === "completed" || nextStatus === "failed"
          ? new Date().toISOString()
          : undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id)
  }
}

async function refreshRunStatus(
  admin: ReturnType<typeof createClient>,
  run: DevRunRow & { created_by: string },
) {
  if (!run.head_sha) throw new Error("developer_run_has_no_head")

  const remote = await readRemoteStatus(run.head_sha)
  let state = "checks_pending"

  if (remote.ciState === "failure" || remote.previewState === "failure") {
    state = "failed"
  } else if (
    remote.ciState === "success" &&
    remote.previewState === "success"
  ) {
    state = "merge_ready"
  } else if (remote.previewState === "success") {
    state = "preview_ready"
  }

  const { data, error } = await admin
    .from("ai_dev_runs")
    .update({
      state,
      ci_state: remote.ciState,
      ci_url: remote.ciUrl,
      preview_state: remote.previewState,
      preview_url: remote.previewUrl,
      checks: remote.checks,
      error_code: state === "failed" ? "developer_checks_failed" : null,
      error_message:
        state === "failed"
          ? "CI or preview check failed. Inspect checks before proposing another run."
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .select("*")
    .single()

  if (error || !data) throw new Error(error?.message || "developer_run_update_failed")

  await updateStageJobs(
    admin,
    run.id,
    run.created_by,
    {
      ciState: remote.ciState,
      previewState: remote.previewState,
      checks: remote.checks,
      error: state === "failed" ? "CI or preview check failed." : null,
    },
  )

  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405)

  const authHeader = req.headers.get("Authorization") || ""
  if (!authHeader.startsWith("Bearer ")) {
    return reply({ error: "Authentication required" }, 401)
  }

  const supabaseUrl = getEnv("SUPABASE_URL")
  const publishableKey = getEnv("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY")
  const secretKey = getEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return reply({ error: "Supabase function environment is incomplete" }, 500)
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const rawToken = authHeader.replace(/^Bearer\s+/i, "")
  const { data: authData, error: authError } = await userClient.auth.getUser(rawToken)
  if (authError || !authData.user) return reply({ error: "Invalid session" }, 401)
  const userId = authData.user.id

  let body: JsonRecord
  try {
    body = await req.json()
  } catch {
    return reply({ error: "Invalid JSON body" }, 400)
  }

  const action = text(body.action, 40)
  const sessionId = uuid(body.sessionId)
  const sessionToken = text(body.sessionToken, 200)
  const runId = uuid(body.runId)

  if (!sessionId || !sessionToken) {
    return reply({ error: "Developer session is required" }, 403)
  }

  const { data: validSession, error: validateError } = await admin.rpc(
    "validate_ai_dev_session_v1",
    {
      p_session_id: sessionId,
      p_token: sessionToken,
      p_user_id: userId,
    },
  )

  if (validateError || validSession !== true) {
    return reply({ error: "Developer session is not active" }, 403)
  }

  const { data: session, error: sessionError } = await admin
    .from("ai_dev_sessions")
    .select("id,user_id,campaign_id,status,expires_at,base_branch")
    .eq("id", sessionId)
    .maybeSingle()

  if (
    sessionError ||
    !session ||
    session.user_id !== userId ||
    session.status !== "active" ||
    session.base_branch !== DEV_BASE_BRANCH
  ) {
    return reply({ error: "Developer session is invalid" }, 403)
  }

  if (action === "capabilities") {
    return reply({
      systemAdmin: true,
      sessionId,
      repository: DEV_REPO,
      baseBranch: DEV_BASE_BRANCH,
      repositoryConfigured: developerRepoConfigured(),
      mutationTargets: ["preview_branch", "pull_request", "dev"],
      forbiddenTargets: ["main"],
    })
  }

  if (!runId) return reply({ error: "runId is required" }, 400)

  const { data: runData, error: runError } = await admin
    .from("ai_dev_runs")
    .select("*")
    .eq("id", runId)
    .eq("session_id", sessionId)
    .eq("created_by", userId)
    .maybeSingle()

  if (runError) return reply({ error: runError.message }, 500)
  if (!runData) return reply({ error: "Developer run not found" }, 404)
  const run = runData as DevRunRow & {
    created_by: string
    campaign_id: string
    agent_job_id: string | null
  }

  try {
    if (action === "apply") {
      if (!developerRepoConfigured()) {
        return reply({
          error: "developer_repo_not_configured",
          detail:
            "GITHUB_DEV_TOKEN (or GITHUB_TOKEN) is not configured in the server environment.",
        }, 503)
      }

      const applied = await applyRunToPreviewBranch(run)

      const { data: updated, error: updateError } = await admin
        .from("ai_dev_runs")
        .update({
          branch_name: applied.branch,
          state: "checks_pending",
          pr_number: applied.prNumber,
          pr_url: applied.prUrl,
          head_sha: applied.headSha,
          ci_state: "pending",
          preview_state: "pending",
          branch_applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
        })
        .eq("id", run.id)
        .select("*")
        .single()

      if (updateError || !updated) {
        throw new Error(updateError?.message || "developer_run_update_failed")
      }

      if (run.agent_job_id) {
        await admin.from("agent_jobs").update({
          status: "completed",
          result: {
            run_id: run.id,
            branch: applied.branch,
            pr_number: applied.prNumber,
            pr_url: applied.prUrl,
            head_sha: applied.headSha,
            target: "dev",
          },
          completed_outputs: 1,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", run.agent_job_id)
      }

      const stageJobs = [
        ["dev_test", "Run repository tests"],
        ["dev_build", "Run application build"],
        ["dev_preview", "Create and verify preview deployment"],
      ]
      for (const [jobType, label] of stageJobs) {
        await admin.from("agent_jobs").insert({
          campaign_id: run.campaign_id,
          thread_id: null,
          requested_by: userId,
          agent_key: "voss",
          job_type: jobType,
          status: "queued",
          input: {
            run_id: run.id,
            head_sha: applied.headSha,
            branch: applied.branch,
            target: "dev",
            label,
          },
          result: {},
          requested_outputs: 1,
          completed_outputs: 0,
        })
      }

      return reply({
        applied: true,
        repositoryChanged: true,
        canonicalAppStateChanged: false,
        run: updated,
        next:
          "CI and preview checks must succeed. Merge remains a separate explicit system-admin action.",
      })
    }

    if (action === "status") {
      if (!developerRepoConfigured()) {
        return reply({ error: "developer_repo_not_configured" }, 503)
      }
      if (!run.head_sha) {
        return reply({ run, checksAvailable: false })
      }
      const updated = await refreshRunStatus(admin, run)
      return reply({
        run: updated,
        checksAvailable: true,
        mergeAllowed: updated.state === "merge_ready",
      })
    }

    if (action === "merge") {
      if (!developerRepoConfigured()) {
        return reply({ error: "developer_repo_not_configured" }, 503)
      }

      const refreshed = await refreshRunStatus(admin, run)
      if (
        refreshed.state !== "merge_ready" ||
        refreshed.ci_state !== "success" ||
        refreshed.preview_state !== "success"
      ) {
        return reply({
          error: "developer_run_not_merge_ready",
          run: refreshed,
          rule: "CI success + preview success are both mandatory.",
        }, 409)
      }

      const merged = await mergeRunPr(refreshed as DevRunRow)

      const { data: updated, error: mergeUpdateError } = await admin
        .from("ai_dev_runs")
        .update({
          state: "merged_dev",
          merged_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
        })
        .eq("id", run.id)
        .select("*")
        .single()

      if (mergeUpdateError || !updated) {
        throw new Error(mergeUpdateError?.message || "developer_merge_journal_failed")
      }

      await admin.from("agent_jobs").insert({
        campaign_id: run.campaign_id,
        thread_id: null,
        requested_by: userId,
        agent_key: "voss",
        job_type: "dev_deploy",
        status: "completed",
        input: {
          run_id: run.id,
          target: "dev",
          pr_number: run.pr_number,
        },
        result: {
          merged: true,
          merge_sha: merged.mergeSha,
          target: "dev",
          main_untouched: true,
        },
        requested_outputs: 1,
        completed_outputs: 1,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })

      return reply({
        merged: true,
        target: "dev",
        mainUntouched: true,
        mergeSha: merged.mergeSha,
        run: updated,
      })
    }

    if (action === "cancel") {
      if (developerRepoConfigured()) {
        await cancelRunBranch(run)
      }

      const { data: updated, error: cancelError } = await admin
        .from("ai_dev_runs")
        .update({
          state: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .select("*")
        .single()

      if (cancelError || !updated) {
        throw new Error(cancelError?.message || "developer_cancel_failed")
      }

      if (run.agent_job_id) {
        await admin.from("agent_jobs").update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        }).eq("id", run.agent_job_id)
      }

      return reply({
        cancelled: true,
        run: updated,
      })
    }

    return reply({ error: "Unsupported Developer Mode action" }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message === "developer_run_stale") {
      await admin.from("ai_dev_runs").update({
        state: "stale",
        error_code: "developer_run_stale",
        error_message:
          "dev changed after this proposal. Re-read the repository and create a fresh proposal.",
        updated_at: new Date().toISOString(),
      }).eq("id", run.id)
      return reply({ error: message }, 409)
    }

    await admin.from("ai_dev_runs").update({
      error_code: "developer_executor_error",
      error_message: message.slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq("id", run.id)

    return reply({
      error: "Developer Mode action failed",
      detail: message,
    }, 500)
  }
})
