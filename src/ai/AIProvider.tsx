import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { supabase } from "../lib/supabase"

export type AIViewEntity = {
  type: string
  id: string
  label?: string
}

export type AIViewDraft = {
  dirty: boolean
  editorTitle?: string
  values: Record<string, unknown>
  initialValues?: Record<string, unknown>
}

export type AIViewContext = {
  screen: string
  route?: string
  title?: string
  text?: string
  entity?: AIViewEntity | null
  facts?: Record<string, unknown>
  draft?: AIViewDraft
}

export type AIViewContextLayer = Omit<AIViewContext, "screen"> & {
  screen?: string
}

type StoredViewLayer = {
  priority: number
  context: AIViewContextLayer
}

export type AIModel = {
  id: string
  model_key: string
  display_name: string
  is_base: boolean
  gm_selectable: boolean
  supports_tools: boolean
  supports_json: boolean
  cost_tier: number
  reasoning_tier: number
  latency_tier: number
  supports_vision: boolean
  model_kind: "agent" | "image" | "owner_override"
  access_scope: "campaign" | "system_admin"
}

export type AIRouteInfo = {
  task:
    | "general"
    | "reference_read"
    | "memory_read"
    | "memory_write"
    | "workshop"
    | "draft_edit"
    | "mechanics_compile"
    | "developer"
  mode: "base_lock" | "auto" | "primary" | "base" | "fixed" | "fallback" | "owner_override"
  reason: string
  degraded: boolean
  modelId: string
  modelName: string
}

export type AIConversationMessage = {
  id: number
  role: "user" | "assistant"
  body: string
  created_at: string
  model_id: string | null
}

export type AIDraftNode = {
  key: string
  entity_type: "location" | "character" | "definition"
  entity_subtype?: string
  name: string
  summary: string
  payload: Record<string, unknown>
}

export type AIDraftRelation = {
  kind: string
  from_key: string
  to_key?: string
  to_existing?: {
    entity_type: "location" | "character" | "definition"
    id: string
    label?: string
  }
  label?: string
  data?: Record<string, unknown>
}

export type AIDraftRevision = {
  draft_id: string
  revision: number
  change_summary: string
  operations: Array<Record<string, unknown>>
  validation_warnings: string[]
  created_at: string
}

export type AIDraft = {
  id: string
  draft_type: "bundle" | "location" | "character" | "definition"
  title: string
  summary: string
  status: "review" | "archived" | "applied"
  schema_version: number
  current_revision: number
  content: {
    schemaVersion?: number
    nodes?: AIDraftNode[]
    relations?: AIDraftRelation[]
  }
  validation_warnings: string[]
  recent_revisions?: AIDraftRevision[]
  created_at: string
  updated_at: string
}

export type AIMediaAsset = {
  id: string
  source_job_id: string | null
  variant_index: number
  status: "generated" | "reviewed" | "attached" | "rejected" | "garbage"
  purpose: string
  profile: string
  storage_path: string
  review: Record<string, unknown>
  created_at: string
  url: string | null
}

export type AIAgentJob = {
  id: string
  status: "queued" | "running" | "waiting_for_user" | "completed" | "failed" | "cancelled"
  input: Record<string, unknown>
  result: Record<string, unknown>
  requested_outputs: number
  completed_outputs: number
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  outputs: AIMediaAsset[]
}

export type AIMechanicsDiagnostic = {
  severity: "error" | "warning" | "info"
  code: string
  path: string
  message: string
}

export type AIMechanicsCoverage = {
  rule: string
  owner: "ce" | "gm" | "hybrid"
  mechanic_ids: string[]
  note?: string
}

export type AIMechanicsCompilation = {
  id: string
  title: string
  intent_text: string
  target_kind: "preview" | "reference_definition" | "rule_template" | "rule_template_level"
  target_id: string | null
  target_level: number | null
  status: "validated" | "unsupported" | "applied" | "rejected"
  mechanics: Array<Record<string, unknown>>
  coverage: AIMechanicsCoverage[]
  diagnostics: AIMechanicsDiagnostic[]
  unsupported_reasons: string[]
  compiler_version: number
  applied_at: string | null
  applied_result: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type AIDevSession = {
  id: string
  campaign_id: string
  status: "active" | "revoked" | "expired"
  base_branch: "dev"
  owner_override_model_id: string | null
  created_at?: string
  expires_at: string
  last_used_at?: string
  closed_at?: string | null
}

export type AIDevRun = {
  id: string
  session_id: string
  campaign_id: string
  created_by: string
  agent_job_id: string | null
  title: string
  request_text: string
  summary: string
  base_branch: "dev"
  base_sha: string
  branch_name: string | null
  state:
    | "proposed"
    | "branch_applied"
    | "checks_pending"
    | "preview_ready"
    | "merge_ready"
    | "merged_dev"
    | "failed"
    | "cancelled"
    | "stale"
  proposed_changes: Array<Record<string, unknown>>
  diff_preview: string
  pr_number: number | null
  pr_url: string | null
  head_sha: string | null
  ci_state: "unknown" | "pending" | "success" | "failure"
  ci_url: string | null
  preview_state: "none" | "unknown" | "pending" | "success" | "failure"
  preview_url: string | null
  checks: Array<Record<string, unknown>>
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  branch_applied_at: string | null
  merged_at: string | null
}

export type AIDeveloperCapabilities = {
  systemAdmin: boolean
  sessionId: string
  repository: string
  baseBranch: "dev"
  repositoryConfigured: boolean
  mutationTargets: string[]
  forbiddenTargets: string[]
}

type AIContextValue = {
  campaignId: string
  userId: string
  canManage: boolean
  isSystemAdmin: boolean
  models: AIModel[]
  ownerOverrideModels: AIModel[]
  selectedModelId: string | null
  lastRoute: AIRouteInfo | null
  messages: AIConversationMessage[]
  drafts: AIDraft[]
  jobs: AIAgentJob[]
  mechanicsCompilations: AIMechanicsCompilation[]
  devSession: AIDevSession | null
  devRuns: AIDevRun[]
  developerCapabilities: AIDeveloperCapabilities | null
  loading: boolean
  sending: boolean
  error: string | null
  viewContext: AIViewContext | null
  route: string
  setViewContextLayer: (
    source: string,
    context: AIViewContextLayer,
    priority?: number,
  ) => void
  clearViewContextLayer: (source: string) => void
  chooseModel: (modelId: string) => Promise<boolean>
  openDeveloperMode: (ownerOverrideModelId?: string | null) => Promise<boolean>
  closeDeveloperMode: () => Promise<void>
  setDeveloperOverride: (ownerOverrideModelId: string | null) => Promise<boolean>
  applyDevRun: (runId: string) => Promise<boolean>
  refreshDevRun: (runId: string) => Promise<boolean>
  mergeDevRun: (runId: string) => Promise<boolean>
  cancelDevRun: (runId: string) => Promise<boolean>
  send: (message: string) => Promise<boolean>
  refreshConversation: () => Promise<void>
  refreshDrafts: () => Promise<void>
  refreshJobs: () => Promise<void>
  refreshMechanicsCompilations: () => Promise<void>
  refreshDevRuns: () => Promise<void>
}

const AIContext = createContext<AIContextValue | null>(null)

function rememberedCampaignId() {
  return (
    window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
    window.localStorage.getItem("meganotrpg:campaign-id") ||
    ""
  )
}

function normalizeFunctionError(message: string) {
  if (/non-2xx|edge function/i.test(message)) {
    return "Восс пока не получил доступ к модели. Проверь серверные настройки AI-провайдера."
  }
  return message || "Восс не смог ответить."
}

function composeViewContext(
  layers: Record<string, StoredViewLayer>,
  fallbackRoute: string,
): AIViewContext | null {
  const ordered = Object.entries(layers)
    .sort(([leftSource, left], [rightSource, right]) =>
      left.priority - right.priority ||
      leftSource.localeCompare(rightSource),
    )

  if (!ordered.length) return null

  const descending = [...ordered].reverse()
  const firstValue = <K extends keyof AIViewContextLayer>(key: K) => {
    for (const [, layer] of descending) {
      const value = layer.context[key]
      if (value !== undefined && value !== null && value !== "") return value
    }
    return undefined
  }

  const primaryFacts = firstValue("facts") as Record<string, unknown> | undefined
  const textParts = ordered
    .map(([, layer]) => layer.context.text?.trim())
    .filter((value): value is string => Boolean(value))

  const contextLayers = ordered.map(([source, layer]) => ({
    source,
    priority: layer.priority,
    screen: layer.context.screen,
    title: layer.context.title,
    entity: layer.context.entity || undefined,
    facts: layer.context.facts,
  }))

  return {
    screen: String(firstValue("screen") || "meganot"),
    route: String(firstValue("route") || fallbackRoute),
    title: firstValue("title") as string | undefined,
    text: [...new Set(textParts)].join("\n\n") || undefined,
    entity: (firstValue("entity") as AIViewEntity | null | undefined) || null,
    draft: firstValue("draft") as AIViewDraft | undefined,
    facts: {
      ...(primaryFacts || {}),
      contextLayers,
    },
  }
}

export function AIProvider({ children }: { children: ReactNode }) {
  const [campaignId, setCampaignId] = useState("")
  const [userId, setUserId] = useState("")
  const [canManage, setCanManage] = useState(false)
  const [isSystemAdmin, setIsSystemAdmin] = useState(false)
  const [models, setModels] = useState<AIModel[]>([])
  const [ownerOverrideModels, setOwnerOverrideModels] = useState<AIModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [lastRoute, setLastRoute] = useState<AIRouteInfo | null>(null)
  const [messages, setMessages] = useState<AIConversationMessage[]>([])
  const [drafts, setDrafts] = useState<AIDraft[]>([])
  const [jobs, setJobs] = useState<AIAgentJob[]>([])
  const [mechanicsCompilations, setMechanicsCompilations] = useState<AIMechanicsCompilation[]>([])
  const [devSession, setDevSession] = useState<AIDevSession | null>(null)
  const [devSessionToken, setDevSessionToken] = useState("")
  const [devRuns, setDevRuns] = useState<AIDevRun[]>([])
  const [developerCapabilities, setDeveloperCapabilities] = useState<AIDeveloperCapabilities | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewLayers, setViewLayers] = useState<Record<string, StoredViewLayer>>({})
  const [route, setRoute] = useState(window.location.hash || "#/home")

  const viewContext = useMemo(
    () => composeViewContext(viewLayers, route),
    [route, viewLayers],
  )

  const setViewContextLayer = useCallback((
    source: string,
    context: AIViewContextLayer,
    priority = 0,
  ) => {
    const cleanSource = source.trim()
    if (!cleanSource) return

    setViewLayers((current) => ({
      ...current,
      [cleanSource]: { priority, context },
    }))
  }, [])

  const clearViewContextLayer = useCallback((source: string) => {
    setViewLayers((current) => {
      if (!(source in current)) return current
      const next = { ...current }
      delete next[source]
      return next
    })
  }, [])

  const loadConversationFor = useCallback(async (nextCampaignId: string, nextUserId: string) => {
    const { data: thread, error: threadError } = await supabase
      .from("ai_threads")
      .select("id")
      .eq("campaign_id", nextCampaignId)
      .eq("user_id", nextUserId)
      .eq("agent_key", "voss")
      .maybeSingle()

    if (threadError) throw threadError
    if (!thread?.id) {
      setMessages([])
      return
    }

    const { data: rows, error: messageError } = await supabase
      .from("ai_messages")
      .select("id,role,body,created_at,model_id")
      .eq("thread_id", thread.id)
      .order("id", { ascending: true })
      .limit(120)

    if (messageError) throw messageError
    setMessages((rows || []) as AIConversationMessage[])
  }, [])

  const refreshConversation = useCallback(async () => {
    if (!campaignId || !userId) return
    try {
      await loadConversationFor(campaignId, userId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю Восса.")
    }
  }, [campaignId, loadConversationFor, userId])

  const loadDraftsFor = useCallback(async (nextCampaignId: string) => {
    const { data, error: draftError } = await supabase
      .from("ai_drafts")
      .select("id,draft_type,title,summary,status,schema_version,current_revision,content,validation_warnings,created_at,updated_at")
      .eq("campaign_id", nextCampaignId)
      .eq("status", "review")
      .order("updated_at", { ascending: false })
      .limit(50)

    if (draftError) throw draftError

    const draftRows = (data || []) as AIDraft[]
    const ids = draftRows.map((draft) => draft.id)

    let revisionRows: AIDraftRevision[] = []
    if (ids.length) {
      const { data: revisions, error: revisionError } = await supabase
        .from("ai_draft_revisions")
        .select("draft_id,revision,change_summary,operations,validation_warnings,created_at")
        .in("draft_id", ids)
        .order("revision", { ascending: false })
        .limit(300)

      if (revisionError) throw revisionError
      revisionRows = (revisions || []) as AIDraftRevision[]
    }

    const byDraft = new Map<string, AIDraftRevision[]>()
    for (const revision of revisionRows) {
      const current = byDraft.get(revision.draft_id) || []
      if (current.length < 12) current.push(revision)
      byDraft.set(revision.draft_id, current)
    }

    setDrafts(draftRows.map((draft) => ({
      ...draft,
      recent_revisions: byDraft.get(draft.id) || [],
    })))
  }, [])

  const refreshDrafts = useCallback(async () => {
    if (!campaignId || !canManage) {
      setDrafts([])
      return
    }
    try {
      await loadDraftsFor(campaignId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить AI-черновики.")
    }
  }, [campaignId, canManage, loadDraftsFor])

  const loadJobsFor = useCallback(async (
    nextCampaignId: string,
    nextUserId: string,
  ) => {
    const { data: jobRows, error: jobError } = await supabase
      .from("agent_jobs")
      .select("id,status,input,result,requested_outputs,completed_outputs,error_code,error_message,created_at,updated_at")
      .eq("campaign_id", nextCampaignId)
      .eq("requested_by", nextUserId)
      .eq("job_type", "image_generate")
      .order("created_at", { ascending: false })
      .limit(12)

    if (jobError) throw jobError

    const ids = (jobRows || []).map((job) => job.id)
    let assetRows: Array<{
      id: string
      source_job_id: string | null
      variant_index: number
      status: AIMediaAsset["status"]
      purpose: string
      profile: string
      storage_path: string
      review: Record<string, unknown>
      created_at: string
    }> = []

    if (ids.length) {
      const { data: assets, error: assetError } = await supabase
        .from("media_assets")
        .select("id,source_job_id,variant_index,status,purpose,profile,storage_path,review,created_at")
        .in("source_job_id", ids)
        .order("variant_index", { ascending: true })

      if (assetError) throw assetError
      assetRows = (assets || []) as typeof assetRows
    }

    const resolvedAssets = await Promise.all(
      assetRows.map(async (asset): Promise<AIMediaAsset> => ({
        ...asset,
        url:
          (await resolveCampaignMediaUrl(asset.storage_path)) ||
          null,
      })),
    )

    const assetsByJob = new Map<string, AIMediaAsset[]>()
    for (const asset of resolvedAssets) {
      if (!asset.source_job_id) continue
      const current = assetsByJob.get(asset.source_job_id) || []
      current.push(asset)
      assetsByJob.set(asset.source_job_id, current)
    }

    setJobs(
      (jobRows || []).map((job) => ({
        ...(job as Omit<AIAgentJob, "outputs">),
        outputs: (assetsByJob.get(job.id) || [])
          .sort((left, right) => left.variant_index - right.variant_index),
      })),
    )
  }, [])

  const refreshJobs = useCallback(async () => {
    if (!campaignId || !userId) {
      setJobs([])
      return
    }

    try {
      await loadJobsFor(campaignId, userId)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось загрузить задачи Восса.",
      )
    }
  }, [campaignId, loadJobsFor, userId])

  const hasActiveJobs = useMemo(
    () => jobs.some((job) =>
      job.status === "queued" ||
      job.status === "running" ||
      job.status === "waiting_for_user"
    ),
    [jobs],
  )

  useEffect(() => {
    if (!campaignId || !userId || !hasActiveJobs) return

    const timer = window.setInterval(() => {
      void loadJobsFor(campaignId, userId)
    }, 2200)

    return () => window.clearInterval(timer)
  }, [campaignId, hasActiveJobs, loadJobsFor, userId])

  const loadMechanicsCompilationsFor = useCallback(async (
    nextCampaignId: string,
    nextUserId: string,
  ) => {
    const { data, error: compilationError } = await supabase
      .from("ai_mechanics_compilations")
      .select("id,title,intent_text,target_kind,target_id,target_level,status,mechanics,coverage,diagnostics,unsupported_reasons,compiler_version,applied_at,applied_result,created_at,updated_at")
      .eq("campaign_id", nextCampaignId)
      .eq("created_by", nextUserId)
      .order("created_at", { ascending: false })
      .limit(12)

    if (compilationError) throw compilationError
    setMechanicsCompilations((data || []) as AIMechanicsCompilation[])
  }, [])

  const refreshMechanicsCompilations = useCallback(async () => {
    if (!campaignId || !userId || !canManage) {
      setMechanicsCompilations([])
      return
    }

    try {
      await loadMechanicsCompilationsFor(campaignId, userId)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось загрузить компиляции механик.",
      )
    }
  }, [campaignId, canManage, loadMechanicsCompilationsFor, userId])

  const loadDevRunsFor = useCallback(async (
    nextCampaignId: string,
    nextUserId: string,
  ) => {
    const { data, error: devRunError } = await supabase
      .from("ai_dev_runs")
      .select("id,session_id,campaign_id,created_by,agent_job_id,title,request_text,summary,base_branch,base_sha,branch_name,state,proposed_changes,diff_preview,pr_number,pr_url,head_sha,ci_state,ci_url,preview_state,preview_url,checks,error_code,error_message,created_at,updated_at,branch_applied_at,merged_at")
      .eq("campaign_id", nextCampaignId)
      .eq("created_by", nextUserId)
      .order("created_at", { ascending: false })
      .limit(12)

    if (devRunError) throw devRunError
    setDevRuns((data || []) as AIDevRun[])
  }, [])

  const refreshDevRuns = useCallback(async () => {
    if (!campaignId || !userId || !isSystemAdmin) {
      setDevRuns([])
      return
    }
    try {
      await loadDevRunsFor(campaignId, userId)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось загрузить Developer Mode runs.",
      )
    }
  }, [campaignId, isSystemAdmin, loadDevRunsFor, userId])

  const callDeveloperMode = useCallback(async (
    action: "capabilities" | "apply" | "status" | "merge" | "cancel",
    runId?: string,
  ) => {
    if (!devSession || !devSessionToken) {
      return { ok: false as const, data: null, error: "Developer Mode session is not active." }
    }

    const { data, error: invokeError } = await supabase.functions.invoke(
      "developer-mode",
      {
        body: {
          action,
          sessionId: devSession.id,
          sessionToken: devSessionToken,
          ...(runId ? { runId } : {}),
        },
      },
    )

    if (invokeError || data?.error) {
      const message =
        data?.detail ||
        data?.error ||
        invokeError?.message ||
        "Developer Mode action failed."
      setError(String(message))
      return { ok: false as const, data, error: String(message) }
    }

    return { ok: true as const, data, error: null }
  }, [devSession, devSessionToken])

  const openDeveloperMode = useCallback(async (
    ownerOverrideModelId: string | null = null,
  ) => {
    if (!campaignId || !isSystemAdmin) return false
    setError(null)

    const { data, error: sessionError } = await supabase.rpc(
      "open_ai_dev_session_v1",
      {
        p_campaign_id: campaignId,
        p_owner_override_model_id: ownerOverrideModelId,
      },
    )

    if (sessionError || !data?.id || !data?.token) {
      setError(sessionError?.message || "Не удалось открыть Developer Mode.")
      return false
    }

    const token = String(data.token)
    const session: AIDevSession = {
      id: String(data.id),
      campaign_id: String(data.campaign_id),
      status: "active",
      base_branch: "dev",
      owner_override_model_id:
        data.owner_override_model_id ? String(data.owner_override_model_id) : null,
      expires_at: String(data.expires_at),
    }

    setDevSession(session)
    setDevSessionToken(token)

    const { data: capabilities, error: capabilityError } =
      await supabase.functions.invoke("developer-mode", {
        body: {
          action: "capabilities",
          sessionId: session.id,
          sessionToken: token,
        },
      })

    if (!capabilityError && capabilities && !capabilities.error) {
      setDeveloperCapabilities(capabilities as AIDeveloperCapabilities)
    } else {
      setDeveloperCapabilities(null)
    }

    await loadDevRunsFor(campaignId, userId)
    return true
  }, [campaignId, isSystemAdmin, loadDevRunsFor, userId])

  const closeDeveloperMode = useCallback(async () => {
    const current = devSession
    setDevSession(null)
    setDevSessionToken("")
    setDeveloperCapabilities(null)
    if (!current?.id) return

    const { error: closeError } = await supabase.rpc(
      "close_ai_dev_session_v1",
      { p_session_id: current.id },
    )
    if (closeError) setError(closeError.message)
  }, [devSession])

  const setDeveloperOverride = useCallback(async (
    ownerOverrideModelId: string | null,
  ) => {
    if (!devSession || !isSystemAdmin) return false
    const { data, error: overrideError } = await supabase.rpc(
      "set_ai_dev_session_override_v1",
      {
        p_session_id: devSession.id,
        p_owner_override_model_id: ownerOverrideModelId,
      },
    )
    if (overrideError || !data?.id) {
      setError(overrideError?.message || "Не удалось изменить Developer Mode model override.")
      return false
    }
    setDevSession((current) => current
      ? {
          ...current,
          owner_override_model_id:
            data.owner_override_model_id ? String(data.owner_override_model_id) : null,
          expires_at: String(data.expires_at || current.expires_at),
        }
      : current
    )
    return true
  }, [devSession, isSystemAdmin])

  const applyDevRun = useCallback(async (runId: string) => {
    const result = await callDeveloperMode("apply", runId)
    if (result.ok && campaignId && userId) {
      await loadDevRunsFor(campaignId, userId)
    }
    return result.ok
  }, [callDeveloperMode, campaignId, loadDevRunsFor, userId])

  const refreshDevRun = useCallback(async (runId: string) => {
    const result = await callDeveloperMode("status", runId)
    if (campaignId && userId) await loadDevRunsFor(campaignId, userId)
    return result.ok
  }, [callDeveloperMode, campaignId, loadDevRunsFor, userId])

  const mergeDevRun = useCallback(async (runId: string) => {
    const result = await callDeveloperMode("merge", runId)
    if (campaignId && userId) await loadDevRunsFor(campaignId, userId)
    return result.ok
  }, [callDeveloperMode, campaignId, loadDevRunsFor, userId])

  const cancelDevRun = useCallback(async (runId: string) => {
    const result = await callDeveloperMode("cancel", runId)
    if (campaignId && userId) await loadDevRunsFor(campaignId, userId)
    return result.ok
  }, [callDeveloperMode, campaignId, loadDevRunsFor, userId])

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/home")
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return

      if (authError || !authData.user) {
        setLoading(false)
        return
      }

      const nextUserId = authData.user.id
      const { data: memberships, error: membershipError } = await supabase
        .from("campaign_members")
        .select("campaign_id,role,is_owner,created_at")
        .eq("user_id", nextUserId)
        .order("created_at", { ascending: true })

      if (cancelled) return
      if (membershipError) {
        setError(membershipError.message)
        setLoading(false)
        return
      }

      const remembered = rememberedCampaignId()
      const membership =
        (memberships || []).find((row) => row.campaign_id === remembered) ||
        memberships?.[0] ||
        null

      if (!membership) {
        setLoading(false)
        return
      }

      const nextCampaignId = membership.campaign_id
      const manager = membership.role === "gm" || membership.is_owner === true

      setCampaignId(nextCampaignId)
      setUserId(nextUserId)
      setCanManage(manager)

      const { data: systemAdminStatus, error: systemAdminError } =
        await supabase.rpc("my_system_admin_status_v1")
      const systemAdmin = !systemAdminError && systemAdminStatus === true
      setIsSystemAdmin(systemAdmin)
      if (!systemAdmin) {
        setDevSession(null)
        setDevSessionToken("")
        setDeveloperCapabilities(null)
        setDevRuns([])
      }

      const { data: modelRows, error: modelError } = await supabase
        .from("ai_models")
        .select("id,model_key,display_name,is_base,gm_selectable,supports_tools,supports_json,supports_vision,cost_tier,reasoning_tier,latency_tier,model_kind,access_scope")
        .order("is_base", { ascending: false })
        .order("cost_tier", { ascending: true })
        .order("display_name", { ascending: true })

      if (cancelled) return
      if (modelError) {
        setError(modelError.message)
        setLoading(false)
        return
      }

      const allModels = (modelRows || []) as AIModel[]
      const nextModels = allModels.filter((model) =>
        model.model_kind === "agent" && model.access_scope === "campaign"
      )
      const nextOwnerOverrides = allModels.filter((model) =>
        model.model_kind === "owner_override" &&
        model.access_scope === "system_admin"
      )
      setModels(nextModels)
      setOwnerOverrideModels(systemAdmin ? nextOwnerOverrides : [])

      const baseModel = nextModels.find((model) => model.is_base) || null
      let nextSelectedModelId = baseModel?.id || null

      if (manager) {
        const { data: settings, error: settingsError } = await supabase
          .from("ai_agent_settings")
          .select("selected_model_id")
          .eq("campaign_id", nextCampaignId)
          .eq("agent_key", "voss")
          .maybeSingle()

        if (!settingsError && settings?.selected_model_id) {
          const selected = nextModels.find((model) =>
            model.id === settings.selected_model_id && model.gm_selectable)
          if (selected) nextSelectedModelId = selected.id
        }
      }

      setSelectedModelId(nextSelectedModelId)

      try {
        await loadConversationFor(nextCampaignId, nextUserId)
        await loadJobsFor(nextCampaignId, nextUserId)
        if (manager) {
          await loadDraftsFor(nextCampaignId)
          await loadMechanicsCompilationsFor(nextCampaignId, nextUserId)
        } else {
          setDrafts([])
          setMechanicsCompilations([])
        }
        if (systemAdmin) {
          await loadDevRunsFor(nextCampaignId, nextUserId)
        } else {
          setDevRuns([])
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить AI-данные Восса.")
        }
      }

      if (!cancelled) setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [loadConversationFor, loadDevRunsFor, loadDraftsFor, loadJobsFor, loadMechanicsCompilationsFor])

  const chooseModel = useCallback(async (modelId: string) => {
    if (!canManage || !campaignId || !userId) return false
    const model = models.find((item) => item.id === modelId && item.gm_selectable)
    if (!model) return false

    setError(null)
    const { error: settingsError } = await supabase
      .from("ai_agent_settings")
      .upsert({
        campaign_id: campaignId,
        agent_key: "voss",
        selected_model_id: modelId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "campaign_id,agent_key",
      })

    if (settingsError) {
      setError(settingsError.message)
      return false
    }

    setSelectedModelId(modelId)
    return true
  }, [campaignId, canManage, models, userId])

  const send = useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim()
    if (!campaignId || !userId || !message || sending) return false

    setSending(true)
    setError(null)

    const context: AIViewContext = viewContext || {
      screen: "unknown",
      route,
      title: "MEGANOT RPG",
      text: "Специальный контекст текущего экрана пока не зарегистрирован.",
    }

    const { data, error: invokeError } = await supabase.functions.invoke("voss-agent", {
      body: {
        campaignId,
        agentKey: "voss",
        message,
        viewContext: context,
        ...(devSession && devSessionToken
          ? {
              devSessionId: devSession.id,
              devSessionToken,
            }
          : {}),
      },
    })

    if (invokeError) {
      setError(normalizeFunctionError(invokeError.message))
      setSending(false)
      return false
    }

    if (!data?.answer) {
      setError(data?.error || "Восс вернул пустой ответ.")
      setSending(false)
      return false
    }

    if (data?.routing && data?.model?.id && data?.model?.name) {
      setLastRoute({
        task: data.routing.task,
        mode: data.routing.mode,
        reason: data.routing.reason || "",
        degraded: data.routing.degraded === true,
        modelId: data.model.id,
        modelName: data.model.name,
      })
    }

    try {
      await loadConversationFor(campaignId, userId)
      await loadJobsFor(campaignId, userId)
      if (canManage) {
        await loadDraftsFor(campaignId)
        await loadMechanicsCompilationsFor(campaignId, userId)
      }
      if (isSystemAdmin) {
        await loadDevRunsFor(campaignId, userId)
      }
    } catch {
      const now = new Date().toISOString()
      setMessages((current) => [
        ...current,
        { id: -Date.now(), role: "user", body: message, created_at: now, model_id: null },
        { id: -(Date.now() + 1), role: "assistant", body: data.answer, created_at: now, model_id: data.model?.id || null },
      ])
    }

    setSending(false)
    return true
  }, [campaignId, canManage, devSession, devSessionToken, isSystemAdmin, loadConversationFor, loadDevRunsFor, loadDraftsFor, loadJobsFor, loadMechanicsCompilationsFor, route, sending, userId, viewContext])

  const value = useMemo<AIContextValue>(() => ({
    campaignId,
    userId,
    canManage,
    isSystemAdmin,
    models,
    ownerOverrideModels,
    selectedModelId,
    lastRoute,
    messages,
    drafts,
    jobs,
    mechanicsCompilations,
    devSession,
    devRuns,
    developerCapabilities,
    loading,
    sending,
    error,
    viewContext,
    route,
    setViewContextLayer,
    clearViewContextLayer,
    chooseModel,
    openDeveloperMode,
    closeDeveloperMode,
    setDeveloperOverride,
    applyDevRun,
    refreshDevRun,
    mergeDevRun,
    cancelDevRun,
    send,
    refreshConversation,
    refreshDrafts,
    refreshJobs,
    refreshMechanicsCompilations,
    refreshDevRuns,
  }), [
    applyDevRun,
    campaignId,
    canManage,
    cancelDevRun,
    chooseModel,
    closeDeveloperMode,
    clearViewContextLayer,
    developerCapabilities,
    devRuns,
    devSession,
    drafts,
    error,
    isSystemAdmin,
    jobs,
    loading,
    mechanicsCompilations,
    lastRoute,
    messages,
    mergeDevRun,
    models,
    openDeveloperMode,
    ownerOverrideModels,
    refreshConversation,
    refreshDrafts,
    refreshJobs,
    refreshMechanicsCompilations,
    refreshDevRun,
    refreshDevRuns,
    route,
    selectedModelId,
    send,
    sending,
    setDeveloperOverride,
    setViewContextLayer,
    userId,
    viewContext,
  ])

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAI() {
  const value = useContext(AIContext)
  if (!value) throw new Error("useAI must be used inside AIProvider")
  return value
}

// oxlint-disable-next-line react/only-export-components
export function useAIViewContextLayer(
  source: string,
  context: AIViewContextLayer | null,
  priority = 0,
) {
  const { setViewContextLayer, clearViewContextLayer } = useAI()
  const contextJson = JSON.stringify(context)

  useEffect(() => {
    if (contextJson === "null") {
      clearViewContextLayer(source)
      return
    }

    setViewContextLayer(
      source,
      JSON.parse(contextJson) as AIViewContextLayer,
      priority,
    )
  }, [
    clearViewContextLayer,
    contextJson,
    priority,
    setViewContextLayer,
    source,
  ])

  useEffect(() => {
    return () => clearViewContextLayer(source)
  }, [clearViewContextLayer, source])
}
