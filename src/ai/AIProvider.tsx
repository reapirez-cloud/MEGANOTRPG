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

export type AIViewContext = {
  screen: string
  route?: string
  title?: string
  text?: string
  entity?: {
    type: string
    id: string
    label?: string
  } | null
  facts?: Record<string, unknown>
}

export type AIModel = {
  id: string
  model_key: string
  display_name: string
  is_base: boolean
  gm_selectable: boolean
  cost_tier: number
}

export type AIConversationMessage = {
  id: number
  role: "user" | "assistant"
  body: string
  created_at: string
  model_id: string | null
}

type AIContextValue = {
  campaignId: string
  userId: string
  canManage: boolean
  models: AIModel[]
  selectedModelId: string | null
  messages: AIConversationMessage[]
  loading: boolean
  sending: boolean
  error: string | null
  viewContext: AIViewContext | null
  route: string
  setViewContext: (context: AIViewContext | null) => void
  chooseModel: (modelId: string) => Promise<boolean>
  send: (message: string) => Promise<boolean>
  refreshConversation: () => Promise<void>
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

export function AIProvider({ children }: { children: ReactNode }) {
  const [campaignId, setCampaignId] = useState("")
  const [userId, setUserId] = useState("")
  const [canManage, setCanManage] = useState(false)
  const [models, setModels] = useState<AIModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AIConversationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewContext, setViewContext] = useState<AIViewContext | null>(null)
  const [route, setRoute] = useState(window.location.hash || "#/home")

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
        .select("id,model_key,display_name,is_base,gm_selectable,cost_tier")
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
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю Восса.")
        }
      }

      if (!cancelled) setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [loadConversationFor])

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
  }, [campaignId, loadConversationFor, route, sending, userId, viewContext])

  const value = useMemo<AIContextValue>(() => ({
    campaignId,
    userId,
    canManage,
    models,
    selectedModelId,
    messages,
    loading,
    sending,
    error,
    viewContext,
    route,
    setViewContext,
    chooseModel,
    send,
    refreshConversation,
  }), [
    campaignId,
    canManage,
    chooseModel,
    error,
    loading,
    messages,
    models,
    refreshConversation,
    route,
    selectedModelId,
    send,
    sending,
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
