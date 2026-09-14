import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

type JsonRecord = Record<string, unknown>

type DevToolContext = {
  admin: SupabaseClient
  campaignId: string
  userId: string
  threadId: string
  isSystemAdmin: boolean
  devSessionId: string | null
}

const TOOL_NAMES = new Set([
  "read_repo_file",
  "list_repo_tree",
  "search_repo_code",
  "propose_dev_patch",
  "read_dev_run",
  "list_recent_dev_runs",
])

const REPO = Deno.env.get("GITHUB_DEV_REPO") || "reapirez-cloud/MEGANOTRPG"
const BASE_BRANCH = "dev"
const GITHUB_API = "https://api.github.com"

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".css", ".scss",
  ".sql", ".yml", ".yaml", ".html", ".toml", ".mjs", ".cjs",
])

const WRITE_DENY = [
  /^\.env(?:\.|$)/i,
  /^\.git(?:\/|$)/i,
  /^\.github\/workflows(?:\/|$)/i,
  /^node_modules(?:\/|$)/i,
  /^dist(?:\/|$)/i,
  /^coverage(?:\/|$)/i,
  /(^|\/)secrets?(?:\/|\.|$)/i,
  /(^|\/).*\.pem$/i,
  /(^|\/).*\.key$/i,
]

export const VOSS_DEVELOPER_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_repo_file",
      description:
        "Developer Mode only. Read one UTF-8 repository file from the fixed dev branch. Use this before changing a file. No main-branch access is exposed through this tool.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          start_line: { type: "integer", minimum: 1, maximum: 100000 },
          end_line: { type: "integer", minimum: 1, maximum: 100000 },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_repo_tree",
      description:
        "Developer Mode only. List paths from the fixed dev branch. Use a prefix to discover files before reading them.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          prefix: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_repo_code",
      description:
        "Developer Mode only. Search repository source text, then verify returned paths against the dev branch. Use for locating symbols before proposing a patch.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_dev_patch",
      description:
        "Developer Mode only. Save a bounded repository change proposal against the current dev SHA. This DOES NOT create a branch, commit, PR, merge or deployment. A human system admin must click the separate Developer Mode approval control before any repository mutation occurs.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          request: { type: "string" },
          summary: { type: "string" },
          changes: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                operation: { type: "string", enum: ["upsert", "delete"] },
                path: { type: "string" },
                content: { type: "string" },
                reason: { type: "string" },
              },
              required: ["operation", "path", "reason"],
            },
          },
        },
        required: ["title", "request", "summary", "changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_dev_run",
      description:
        "Developer Mode only. Read one developer run owned by the current system admin. This is status/read-only.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          run_id: { type: "string" },
        },
        required: ["run_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_dev_runs",
      description:
        "Developer Mode only. List recent developer runs owned by the current system admin.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
      },
    },
  },
]

export function isVossDeveloperTool(name: string) {
  return TOOL_NAMES.has(name)
}

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function integer(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback
}

function uuid(value: unknown) {
  const result = text(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(result)
    ? result
    : ""
}

function normalizePath(value: unknown) {
  const raw = text(value, 500).replace(/\\/g, "/").replace(/^\/+/, "")
  if (
    !raw ||
    raw.includes("\0") ||
    raw.split("/").some((part) => !part || part === "." || part === "..")
  ) return ""
  return raw
}

function writablePath(path: string) {
  return Boolean(path) && !WRITE_DENY.some((pattern) => pattern.test(path))
}

function textFile(path: string) {
  const lower = path.toLowerCase()
  const dot = lower.lastIndexOf(".")
  if (dot < 0) return false
  return TEXT_EXTENSIONS.has(lower.slice(dot))
}

function githubToken() {
  return Deno.env.get("GITHUB_DEV_TOKEN") || Deno.env.get("GITHUB_TOKEN") || ""
}

function githubHeaders(write = false) {
  const token = githubToken()
  if (write && !token) {
    throw new Error("developer_repo_not_configured")
  }
  return {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "MEGANOT-Voss-Developer-Mode",
    ...(token ? { "Authorization": "Bearer " + token } : {}),
  }
}

async function githubJson(path: string) {
  const response = await fetch(GITHUB_API + "/repos/" + REPO + path, {
    headers: githubHeaders(false),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800)
    if (response.status === 404) throw new Error("repo_resource_not_found")
    throw new Error("github_read_failed:" + response.status + ":" + detail)
  }
  return await response.json()
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\n/g, ""))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function readPath(path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  const payload = await githubJson(
    "/contents/" + encoded + "?ref=" + encodeURIComponent(BASE_BRANCH),
  )
  if (!payload || Array.isArray(payload) || payload.type !== "file") {
    throw new Error("repo_file_required")
  }
  if (Number(payload.size || 0) > 160000) {
    throw new Error("repo_file_too_large")
  }
  if (payload.encoding !== "base64" || typeof payload.content !== "string") {
    throw new Error("repo_file_not_utf8")
  }
  return {
    path,
    sha: String(payload.sha || ""),
    size: Number(payload.size || 0),
    content: decodeBase64(payload.content),
  }
}

async function repoHead() {
  const payload = await githubJson(
    "/git/ref/heads/" + encodeURIComponent(BASE_BRANCH),
  )
  const sha = String(payload?.object?.sha || "")
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("developer_base_sha_missing")
  return sha
}

function compactDiff(path: string, before: string, after: string) {
  if (before === after) return "### " + path + "\n(no content change)\n"

  const oldLines = before.split("\n")
  const newLines = after.split("\n")
  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) prefix += 1

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) suffix += 1

  const oldChanged = oldLines.slice(prefix, oldLines.length - suffix)
  const newChanged = newLines.slice(prefix, newLines.length - suffix)
  const output = [
    "### " + path,
    "@@ around line " + (prefix + 1) + " @@",
    ...oldChanged.slice(0, 60).map((line) => "- " + line),
    ...newChanged.slice(0, 60).map((line) => "+ " + line),
  ]
  if (oldChanged.length > 60 || newChanged.length > 60) {
    output.push("... diff preview truncated ...")
  }
  return output.join("\n") + "\n"
}

async function ensureDevAccess(ctx: DevToolContext) {
  if (!ctx.isSystemAdmin) throw new Error("system_admin_required")
  if (!ctx.devSessionId) throw new Error("developer_session_required")

  const { data, error } = await ctx.admin
    .from("ai_dev_sessions")
    .select("id,user_id,campaign_id,status,expires_at,base_branch")
    .eq("id", ctx.devSessionId)
    .maybeSingle()

  if (
    error ||
    !data ||
    data.user_id !== ctx.userId ||
    data.campaign_id !== ctx.campaignId ||
    data.status !== "active" ||
    data.base_branch !== BASE_BRANCH ||
    new Date(data.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("developer_session_not_active")
  }
}

async function readRepoFile(ctx: DevToolContext, args: JsonRecord) {
  await ensureDevAccess(ctx)
  const path = normalizePath(args.path)
  if (!path) return { error: "repo_path_invalid" }

  const file = await readPath(path)
  const lines = file.content.split("\n")
  const start = integer(args.start_line, 1, Math.max(1, lines.length), 1)
  const end = integer(
    args.end_line,
    start,
    Math.max(start, lines.length),
    Math.min(lines.length, start + 399),
  )
  return {
    repository: REPO,
    branch: BASE_BRANCH,
    path,
    sha: file.sha,
    total_lines: lines.length,
    start_line: start,
    end_line: end,
    content: lines.slice(start - 1, end).join("\n"),
    truncated: end < lines.length,
  }
}

async function listRepoTree(ctx: DevToolContext, args: JsonRecord) {
  await ensureDevAccess(ctx)
  const prefixRaw = text(args.prefix, 500).replace(/\\/g, "/").replace(/^\/+/, "")
  if (prefixRaw.includes("..")) return { error: "repo_prefix_invalid" }
  const prefix = prefixRaw ? prefixRaw.replace(/\/+$/, "") + "/" : ""
  const limit = integer(args.limit, 1, 200, 120)

  const payload = await githubJson(
    "/git/trees/" + encodeURIComponent(BASE_BRANCH) + "?recursive=1",
  )
  const rows = Array.isArray(payload?.tree) ? payload.tree : []
  const paths = rows
    .filter((row: any) =>
      row?.type === "blob" &&
      typeof row?.path === "string" &&
      row.path.startsWith(prefix)
    )
    .slice(0, limit)
    .map((row: any) => ({
      path: String(row.path),
      size: Number(row.size || 0),
      sha: String(row.sha || ""),
    }))

  return {
    repository: REPO,
    branch: BASE_BRANCH,
    prefix: prefixRaw,
    paths,
    truncated: rows.filter((row: any) =>
      row?.type === "blob" &&
      typeof row?.path === "string" &&
      row.path.startsWith(prefix)
    ).length > paths.length,
  }
}

async function searchRepoCode(ctx: DevToolContext, args: JsonRecord) {
  await ensureDevAccess(ctx)
  const query = text(args.query, 240)
  if (!query) return { error: "repo_search_query_required" }
  const limit = integer(args.limit, 1, 20, 10)

  const response = await fetch(
    GITHUB_API + "/search/code?q=" +
      encodeURIComponent(query + " repo:" + REPO),
    { headers: githubHeaders(false) },
  )

  if (!response.ok) {
    return {
      error: "github_code_search_failed",
      status: response.status,
      instruction:
        "Use list_repo_tree and read_repo_file against dev instead of guessing.",
    }
  }

  const payload = await response.json()
  const items = Array.isArray(payload?.items) ? payload.items.slice(0, limit) : []
  const results: Array<Record<string, unknown>> = []

  for (const item of items) {
    const path = normalizePath(item?.path)
    if (!path) continue
    try {
      const file = await readPath(path)
      const lower = file.content.toLocaleLowerCase("en-US")
      const needle = query.toLocaleLowerCase("en-US")
      const index = lower.indexOf(needle)
      results.push({
        path,
        dev_sha: file.sha,
        verified_on_dev: index >= 0,
        excerpt:
          index >= 0
            ? file.content.slice(Math.max(0, index - 500), index + needle.length + 900)
            : "",
      })
    } catch {
      results.push({
        path,
        verified_on_dev: false,
        excerpt: "",
      })
    }
  }

  return {
    repository: REPO,
    branch: BASE_BRANCH,
    warning:
      "GitHub code search discovers candidates from the indexed default branch; every result above was re-read from dev before being marked verified.",
    results,
  }
}

async function proposeDevPatch(ctx: DevToolContext, args: JsonRecord) {
  await ensureDevAccess(ctx)

  const title = text(args.title, 240)
  const request = text(args.request, 12000)
  const summary = text(args.summary, 6000)
  const rawChanges = Array.isArray(args.changes) ? args.changes.slice(0, 12) : []

  if (!title || !request || !summary || !rawChanges.length) {
    return { error: "developer_patch_fields_required" }
  }

  let totalContent = 0
  const changes: Array<Record<string, unknown>> = []
  const diffParts: string[] = []

  for (let index = 0; index < rawChanges.length; index += 1) {
    const row =
      rawChanges[index] && typeof rawChanges[index] === "object"
        ? rawChanges[index] as JsonRecord
        : {}
    const operation = text(row.operation, 20)
    const path = normalizePath(row.path)
    const reason = text(row.reason, 1200)

    if (!["upsert", "delete"].includes(operation) || !path || !reason) {
      return { error: "developer_change_invalid", index }
    }
    if (!writablePath(path)) {
      return { error: "developer_path_protected", path }
    }
    if (!textFile(path) && operation === "upsert") {
      return { error: "developer_binary_write_forbidden", path }
    }

    let before = ""
    let beforeSha: string | null = null
    try {
      const existing = await readPath(path)
      before = existing.content
      beforeSha = existing.sha
    } catch (error) {
      if (operation === "delete") {
        return { error: "developer_delete_target_missing", path }
      }
      if (
        !(error instanceof Error) ||
        error.message !== "repo_resource_not_found"
      ) throw error
    }

    if (operation === "delete") {
      changes.push({
        operation,
        path,
        reason,
        before_sha: beforeSha,
      })
      diffParts.push(compactDiff(path, before, ""))
      continue
    }

    const content = typeof row.content === "string" ? row.content : ""
    if (!content) return { error: "developer_upsert_content_required", path }
    if (content.length > 100000) {
      return { error: "developer_file_too_large", path }
    }
    totalContent += content.length
    if (totalContent > 260000) {
      return { error: "developer_patch_too_large" }
    }

    changes.push({
      operation,
      path,
      reason,
      before_sha: beforeSha,
      content,
    })
    diffParts.push(compactDiff(path, before, content))
  }

  const baseSha = await repoHead()
  const diffPreview = diffParts.join("\n").slice(0, 175000)

  const { data: job, error: jobError } = await ctx.admin
    .from("agent_jobs")
    .insert({
      campaign_id: ctx.campaignId,
      thread_id: ctx.threadId,
      requested_by: ctx.userId,
      agent_key: "voss",
      job_type: "dev_patch",
      status: "waiting_for_user",
      input: {
        title,
        request,
        base_branch: BASE_BRANCH,
        base_sha: baseSha,
        changed_paths: changes.map((change) => change.path),
      },
      result: {
        canonical_repository_changed: false,
        approval_required: true,
      },
      requested_outputs: 1,
      completed_outputs: 1,
    })
    .select("id")
    .single()

  if (jobError || !job?.id) {
    return { error: jobError?.message || "developer_job_create_failed" }
  }

  const { data: run, error: runError } = await ctx.admin
    .from("ai_dev_runs")
    .insert({
      session_id: ctx.devSessionId,
      campaign_id: ctx.campaignId,
      created_by: ctx.userId,
      agent_job_id: job.id,
      title,
      request_text: request,
      summary,
      base_branch: BASE_BRANCH,
      base_sha: baseSha,
      state: "proposed",
      proposed_changes: changes,
      diff_preview: diffPreview,
      ci_state: "unknown",
      preview_state: "none",
    })
    .select("id,title,summary,base_branch,base_sha,state,proposed_changes,diff_preview,created_at")
    .single()

  if (runError || !run) {
    await ctx.admin.from("agent_jobs").update({
      status: "failed",
      error_code: "developer_run_create_failed",
      error_message: runError?.message || "Could not save developer run.",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id)
    return { error: runError?.message || "developer_run_create_failed" }
  }

  return {
    run,
    repository: REPO,
    canonical_repository_changed: false,
    approval_required: true,
    approval_surface: "Developer Mode UI",
    next_step:
      "Review the diff. A system-admin click must create the preview branch and PR. The model cannot perform that approval.",
  }
}

async function readDevRun(ctx: DevToolContext, args: JsonRecord) {
  await ensureDevAccess(ctx)
  const runId = uuid(args.run_id)
  if (!runId) return { error: "developer_run_id_required" }

  const { data, error } = await ctx.admin
    .from("ai_dev_runs")
    .select("*")
    .eq("id", runId)
    .eq("created_by", ctx.userId)
    .eq("session_id", ctx.devSessionId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { run: data }
}

async function listDevRuns(ctx: DevToolContext, args: JsonRecord) {
  await ensureDevAccess(ctx)
  const limit = integer(args.limit, 1, 10, 5)

  const { data, error } = await ctx.admin
    .from("ai_dev_runs")
    .select("id,title,summary,base_sha,branch_name,state,pr_number,pr_url,head_sha,ci_state,ci_url,preview_state,preview_url,checks,error_code,error_message,created_at,updated_at,branch_applied_at,merged_at")
    .eq("created_by", ctx.userId)
    .eq("session_id", ctx.devSessionId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }
  return { runs: data || [] }
}

export async function executeVossDeveloperTool(
  ctx: DevToolContext,
  name: string,
  args: JsonRecord,
) {
  try {
    if (name === "read_repo_file") return await readRepoFile(ctx, args)
    if (name === "list_repo_tree") return await listRepoTree(ctx, args)
    if (name === "search_repo_code") return await searchRepoCode(ctx, args)
    if (name === "propose_dev_patch") return await proposeDevPatch(ctx, args)
    if (name === "read_dev_run") return await readDevRun(ctx, args)
    if (name === "list_recent_dev_runs") return await listDevRuns(ctx, args)
    return { error: "unknown_developer_tool" }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      canonical_repository_changed: false,
    }
  }
}
