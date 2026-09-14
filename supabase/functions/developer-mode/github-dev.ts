type JsonRecord = Record<string, unknown>

export type DevRunRow = {
  id: string
  title: string
  summary: string
  base_branch: string
  base_sha: string
  branch_name: string | null
  state: string
  proposed_changes: Array<Record<string, unknown>>
  pr_number: number | null
  pr_url: string | null
  head_sha: string | null
  ci_state: string
  preview_state: string
}

const API = "https://api.github.com"
export const DEV_REPO = Deno.env.get("GITHUB_DEV_REPO") || "reapirez-cloud/MEGANOTRPG"
export const DEV_BASE_BRANCH = "dev"

function token() {
  return Deno.env.get("GITHUB_DEV_TOKEN") || Deno.env.get("GITHUB_TOKEN") || ""
}

export function developerRepoConfigured() {
  return Boolean(token())
}

function headers() {
  const value = token()
  if (!value) throw new Error("developer_repo_not_configured")
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + value,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "MEGANOT-Developer-Mode",
  }
}

async function request(
  path: string,
  init: RequestInit = {},
  expected: number[] = [200],
) {
  const response = await fetch(API + "/repos/" + DEV_REPO + path, {
    ...init,
    headers: {
      ...headers(),
      ...(init.headers || {}),
    },
  })
  const raw = await response.text()
  let payload: any = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = raw
  }
  if (!expected.includes(response.status)) {
    const message =
      payload && typeof payload === "object"
        ? String(payload.message || JSON.stringify(payload)).slice(0, 1200)
        : String(payload || "").slice(0, 1200)
    throw new Error(
      "github_write_failed:" + response.status + ":" + message,
    )
  }
  return payload
}

export async function devHeadSha() {
  const ref = await request(
    "/git/ref/heads/" + encodeURIComponent(DEV_BASE_BRANCH),
  )
  const sha = String(ref?.object?.sha || "")
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("developer_base_sha_missing")
  return sha
}

function encodedBranch(branch: string) {
  return branch.split("/").map(encodeURIComponent).join("/")
}

export async function applyRunToPreviewBranch(run: DevRunRow) {
  if (run.base_branch !== DEV_BASE_BRANCH) throw new Error("developer_base_branch_forbidden")
  if (run.state !== "proposed") throw new Error("developer_run_not_proposed")
  if (!Array.isArray(run.proposed_changes) || !run.proposed_changes.length) {
    throw new Error("developer_run_has_no_changes")
  }

  const currentBase = await devHeadSha()
  if (currentBase !== run.base_sha) throw new Error("developer_run_stale")

  const branch = "ai/voss/" + run.id.slice(0, 8)

  const baseCommit = await request("/git/commits/" + run.base_sha)
  const baseTreeSha = String(baseCommit?.tree?.sha || "")
  if (!/^[0-9a-f]{40}$/.test(baseTreeSha)) {
    throw new Error("developer_base_tree_missing")
  }

  const treePayload = await request(
    "/git/trees/" + baseTreeSha + "?recursive=1",
  )
  const modes = new Map<string, string>()
  for (const entry of Array.isArray(treePayload?.tree) ? treePayload.tree : []) {
    if (
      entry?.type === "blob" &&
      typeof entry?.path === "string" &&
      typeof entry?.mode === "string"
    ) {
      modes.set(entry.path, entry.mode)
    }
  }

  const tree: Array<Record<string, unknown>> = []
  for (const change of run.proposed_changes) {
    const operation = String(change.operation || "")
    const path = String(change.path || "")
    if (!path || path.includes("..") || path.startsWith(".github/workflows/")) {
      throw new Error("developer_path_protected:" + path)
    }

    if (operation === "delete") {
      tree.push({
        path,
        mode: modes.get(path) || "100644",
        type: "blob",
        sha: null,
      })
      continue
    }

    if (operation !== "upsert" || typeof change.content !== "string") {
      throw new Error("developer_change_invalid:" + path)
    }

    const blob = await request(
      "/git/blobs",
      {
        method: "POST",
        body: JSON.stringify({
          content: change.content,
          encoding: "utf-8",
        }),
      },
      [201],
    )
    tree.push({
      path,
      mode: modes.get(path) || "100644",
      type: "blob",
      sha: String(blob.sha || ""),
    })
  }

  await request(
    "/git/refs",
    {
      method: "POST",
      body: JSON.stringify({
        ref: "refs/heads/" + branch,
        sha: run.base_sha,
      }),
    },
    [201],
  )

  let commitSha = ""
  try {
    const nextTree = await request(
      "/git/trees",
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree,
        }),
      },
      [201],
    )

    const commit = await request(
      "/git/commits",
      {
        method: "POST",
        body: JSON.stringify({
          message: "Voss Developer Mode: " + run.title,
          tree: String(nextTree.sha || ""),
          parents: [run.base_sha],
        }),
      },
      [201],
    )
    commitSha = String(commit.sha || "")
    if (!/^[0-9a-f]{40}$/.test(commitSha)) {
      throw new Error("developer_commit_sha_missing")
    }

    await request(
      "/git/refs/heads/" + encodedBranch(branch),
      {
        method: "PATCH",
        body: JSON.stringify({
          sha: commitSha,
          force: false,
        }),
      },
      [200],
    )

    const pull = await request(
      "/pulls",
      {
        method: "POST",
        body: JSON.stringify({
          title: "[Voss Dev] " + run.title,
          head: branch,
          base: DEV_BASE_BRANCH,
          body: [
            "Developer Mode preview run.",
            "",
            "Run: " + run.id,
            "Base SHA: " + run.base_sha,
            "",
            run.summary,
            "",
            "This PR was created only after an explicit system-admin UI approval.",
            "It targets dev only. Developer Mode has no main merge capability.",
          ].join("\n"),
          maintainer_can_modify: true,
        }),
      },
      [201],
    )

    return {
      branch,
      headSha: commitSha,
      prNumber: Number(pull.number),
      prUrl: String(pull.html_url || ""),
    }
  } catch (error) {
    try {
      await request(
        "/git/refs/heads/" + encodedBranch(branch),
        { method: "DELETE" },
        [204],
      )
    } catch {
      // Best-effort cleanup only. The original error remains authoritative.
    }
    throw error
  }
}

export type DevRemoteStatus = {
  ciState: "unknown" | "pending" | "success" | "failure"
  ciUrl: string | null
  previewState: "unknown" | "pending" | "success" | "failure"
  previewUrl: string | null
  checks: Array<Record<string, unknown>>
}

export async function readRemoteStatus(headSha: string): Promise<DevRemoteStatus> {
  if (!/^[0-9a-f]{40}$/.test(headSha)) throw new Error("developer_head_sha_invalid")

  const [runs, combined] = await Promise.all([
    request("/actions/runs?head_sha=" + encodeURIComponent(headSha) + "&per_page=20"),
    request("/commits/" + headSha + "/status"),
  ])

  const workflowRuns = Array.isArray(runs?.workflow_runs)
    ? runs.workflow_runs
    : []
  const ciRuns = workflowRuns
    .filter((run: any) => String(run?.name || "").toLowerCase() === "ci")
    .sort((a: any, b: any) =>
      new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    )

  let ciState: DevRemoteStatus["ciState"] = "unknown"
  let ciUrl: string | null = null
  const checks: Array<Record<string, unknown>> = []

  if (ciRuns.length) {
    const ci = ciRuns[0]
    ciUrl = String(ci.html_url || "") || null
    if (ci.status !== "completed") {
      ciState = "pending"
    } else {
      ciState = ci.conclusion === "success" ? "success" : "failure"
    }

    if (ci.id) {
      try {
        const jobs = await request("/actions/runs/" + ci.id + "/jobs?per_page=50")
        for (const job of Array.isArray(jobs?.jobs) ? jobs.jobs : []) {
          checks.push({
            source: "github-actions",
            name: String(job.name || "CI"),
            status: String(job.status || ""),
            conclusion: job.conclusion ? String(job.conclusion) : null,
            url: job.html_url ? String(job.html_url) : null,
            steps: Array.isArray(job.steps)
              ? job.steps.map((step: any) => ({
                  name: String(step.name || ""),
                  status: String(step.status || ""),
                  conclusion: step.conclusion ? String(step.conclusion) : null,
                }))
              : [],
          })
        }
      } catch {
        checks.push({
          source: "github-actions",
          name: "CI",
          status: String(ci.status || ""),
          conclusion: ci.conclusion ? String(ci.conclusion) : null,
          url: ciUrl,
        })
      }
    }
  }

  const statuses = Array.isArray(combined?.statuses) ? combined.statuses : []
  const vercel = statuses.filter((status: any) =>
    String(status?.context || "").toLowerCase().startsWith("vercel")
  )

  let previewState: DevRemoteStatus["previewState"] = "unknown"
  let previewUrl: string | null = null

  if (vercel.length) {
    const successful = vercel.find((status: any) => status.state === "success")
    const pending = vercel.find((status: any) => status.state === "pending")
    if (successful) {
      previewState = "success"
      previewUrl = successful.target_url ? String(successful.target_url) : null
    } else if (pending) {
      previewState = "pending"
      previewUrl = pending.target_url ? String(pending.target_url) : null
    } else {
      previewState = "failure"
      previewUrl = vercel[0]?.target_url ? String(vercel[0].target_url) : null
    }

    for (const status of vercel) {
      checks.push({
        source: "vercel",
        name: String(status.context || "Vercel"),
        status: String(status.state || ""),
        description: status.description ? String(status.description) : null,
        url: status.target_url ? String(status.target_url) : null,
      })
    }
  }

  return {
    ciState,
    ciUrl,
    previewState,
    previewUrl,
    checks,
  }
}

export async function mergeRunPr(run: DevRunRow) {
  if (
    run.base_branch !== DEV_BASE_BRANCH ||
    !run.pr_number ||
    !run.head_sha ||
    run.state !== "merge_ready"
  ) {
    throw new Error("developer_run_not_merge_ready")
  }

  const result = await request(
    "/pulls/" + run.pr_number + "/merge",
    {
      method: "PUT",
      body: JSON.stringify({
        commit_title: "Merge Voss Developer Mode run " + run.id.slice(0, 8) + " into dev",
        commit_message: run.summary,
        sha: run.head_sha,
        merge_method: "merge",
      }),
    },
    [200],
  )

  if (result?.merged !== true) {
    throw new Error("developer_pr_merge_rejected:" + String(result?.message || "unknown"))
  }

  return {
    merged: true,
    mergeSha: String(result.sha || ""),
  }
}

export async function cancelRunBranch(run: DevRunRow) {
  if (run.pr_number) {
    try {
      await request(
        "/pulls/" + run.pr_number,
        {
          method: "PATCH",
          body: JSON.stringify({ state: "closed" }),
        },
        [200],
      )
    } catch {
      // Closing the DB run must not be blocked by GitHub cleanup failure.
    }
  }

  if (run.branch_name) {
    try {
      await request(
        "/git/refs/heads/" + encodedBranch(run.branch_name),
        { method: "DELETE" },
        [204],
      )
    } catch {
      // Best-effort cleanup only.
    }
  }
}
