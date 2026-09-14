import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

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

export type AIDraft = {
  id: string
  draft_type: "bundle" | "location" | "character" | "definition"
  title: string
  summary: string
  status: "review" | "archived"
  schema_version: number
  current_revision: number
  content: {
    schemaVersion?: number
    nodes?: AIDraftNode[]
    relations?: AIDraftRelation[]
  }
  validation_warnings: string[]
  created_at: string
  updated_at: string
}

type AIContextValue = {
  campaignId: string
  userId: string
  canManage: boolean
  models: AIModel[]
  selectedModelId: string | null
  messages: AIConversationMessage[]
  drafts: AIDraft[]
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
  send: (message: string) => Promise<boolean>
  refreshConversation: () => Promise<void>
  refreshDrafts: () => Promise<void>
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
  const [models, setModels] = useState<AIModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AIConversationMessage[]>([])
  const [drafts, setDrafts] = useState<AIDraft[]>([])
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
    setDrafts((data || []) as AIDraft[])
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

      const { data: modelRows, error: modelError } = await supabase
        .from("ai_models")
        .select("id,model_key,display_name,is_base,gm_selectable,supports_tools,supports_json,cost_tier")
        .order("is_base", { ascending: false })
        .order("cost_tier", { ascending: true })
        .order("display_name", { ascending: true })

      if (cancelled) return
      if (modelError) {
        setError(modelError.message)
        setLoading(false)
        return
      }

      const nextModels = (modelRows || []) as AIModel[]
      setModels(nextModels)

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
        if (manager) {
          await loadDraftsFor(nextCampaignId)
        } else {
          setDrafts([])
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
  }, [loadConversationFor, loadDraftsFor])

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

    try {
      await loadConversationFor(campaignId, userId)
      if (canManage) await loadDraftsFor(campaignId)
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
  }, [campaignId, canManage, loadConversationFor, loadDraftsFor, route, sending, userId, viewContext])

  const value = useMemo<AIContextValue>(() => ({
    campaignId,
    userId,
    canManage,
    models,
    selectedModelId,
    messages,
    drafts,
    loading,
    sending,
    error,
    viewContext,
    route,
    setViewContextLayer,
    clearViewContextLayer,
    chooseModel,
    send,
    refreshConversation,
    refreshDrafts,
  }), [
    campaignId,
    canManage,
    chooseModel,
    clearViewContextLayer,
    drafts,
    error,
    loading,
    messages,
    models,
    refreshConversation,
    refreshDrafts,
    route,
    selectedModelId,
    send,
    sending,
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
