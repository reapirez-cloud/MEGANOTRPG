import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

export type VossTaskKey =
  | "general"
  | "reference_read"
  | "memory_read"
  | "memory_write"
  | "workshop"
  | "draft_edit"

type RouteMode = "auto" | "primary" | "base" | "fixed"

export type RouterModel = {
  id: string
  provider_key: string
  model_key: string
  display_name: string
  enabled: boolean
  is_base: boolean
  gm_selectable: boolean
  supports_tools: boolean
  supports_json: boolean
  supports_streaming: boolean
  context_window: number | null
  cost_tier: number
  reasoning_tier: number
  latency_tier: number
}

export type VossRouteDecision = {
  taskKey: VossTaskKey
  model: RouterModel
  routeMode:
    | "base_lock"
    | "auto"
    | "primary"
    | "base"
    | "fixed"
    | "fallback"
  reason: string
  degraded: boolean
}

type JsonRecord = Record<string, unknown>

type RouteRow = {
  task_key: VossTaskKey
  mode: RouteMode
  selected_model_id: string | null
}

const TASKS_REQUIRING_TOOLS = new Set<VossTaskKey>([
  "reference_read",
  "memory_read",
  "memory_write",
  "workshop",
  "draft_edit",
])

const TASKS_PREFERRING_JSON = new Set<VossTaskKey>([
  "workshop",
  "draft_edit",
])

function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim()
    : ""
}

function contextText(viewContext: JsonRecord) {
  try {
    return JSON.stringify(viewContext).toLocaleLowerCase("ru-RU")
  } catch {
    return ""
  }
}

export function classifyVossTask(
  message: string,
  viewContext: JsonRecord,
): VossTaskKey {
  const text = normalizedText(message)
  const context = contextText(viewContext)

  if (
    /(запомни|запомнить|зафиксируй|зафиксировать|добавь\s+в\s+память)/u.test(text) ||
    /сохрани(?:ть)?.{0,40}(сводк|итог|резюме|факт|памят)/u.test(text)
  ) {
    return "memory_write"
  }

  const draftContext =
    /ai[-_ ]?draft|черновик|gm-workshop-ai-drafts/u.test(context)

  if (
    draftContext &&
    /(исправ|измени|изменить|передел|убери|удали|замени|добавь|дополни|сократи|переимен)/u.test(text)
  ) {
    return "draft_edit"
  }

  const creationVerb =
    /(создай|создать|сделай|сделать|добавь|добавить|придумай|спроектируй|собери|сгенерируй|подготовь)/u.test(text)
  const contentNoun =
    /(зон|локац|нпс|npc|персонаж|предмет|оруж|брон|заклин|эффект|состояни|болезн|монстр|противник|механик|награ|достижен|трактир|подземел|квест)/u.test(text)

  if (creationVerb && contentNoun) {
    return "workshop"
  }

  if (
    /(напомни|вспомни|вспомин|истори[яю]|хронолог)/u.test(text) ||
    /что\s+(?:было|произошло|случилось)/u.test(text) ||
    /когда\s+(?:мы|они|он|она|группа)/u.test(text) ||
    /прошл(?:ой|ую|ая|ые|ых)?\s+(?:сесси|сцен)/u.test(text) ||
    /кто\s+обещал/u.test(text) ||
    /почему\s+(?:мы|группа)/u.test(text) ||
    /до\s+этого/u.test(text)
  ) {
    return "memory_read"
  }

  const hasEntity =
    /"entity"\s*:\s*\{/u.test(context) &&
    !/"entity"\s*:\s*null/u.test(context)

  if (
    hasEntity ||
    /(класс|подкласс|способност|умени|механик|заклин|предмет|инвентар|персонаж|локац|зон|эффект|состояни|правил)/u.test(text)
  ) {
    return "reference_read"
  }

  return "general"
}

function defaultMode(taskKey: VossTaskKey): RouteMode {
  if (taskKey === "reference_read" || taskKey === "memory_read") {
    return "auto"
  }
  return "primary"
}

function isEligible(
  model: RouterModel,
  taskKey: VossTaskKey,
  gmOnly = true,
) {
  if (!model.enabled) return false
  if (gmOnly && !model.gm_selectable && !model.is_base) return false
  if (TASKS_REQUIRING_TOOLS.has(taskKey) && !model.supports_tools) return false
  return true
}

function economicalSort(
  left: RouterModel,
  right: RouterModel,
) {
  return (
    left.cost_tier - right.cost_tier ||
    left.latency_tier - right.latency_tier ||
    right.reasoning_tier - left.reasoning_tier ||
    left.display_name.localeCompare(right.display_name)
  )
}

function strongSort(
  left: RouterModel,
  right: RouterModel,
  preferJson: boolean,
) {
  if (preferJson && left.supports_json !== right.supports_json) {
    return left.supports_json ? -1 : 1
  }
  return (
    right.reasoning_tier - left.reasoning_tier ||
    left.cost_tier - right.cost_tier ||
    left.latency_tier - right.latency_tier ||
    left.display_name.localeCompare(right.display_name)
  )
}

function autoCandidate(
  models: RouterModel[],
  taskKey: VossTaskKey,
) {
  const eligible = models.filter((model) => isEligible(model, taskKey))
  if (!eligible.length) return null

  if (taskKey === "reference_read" || taskKey === "memory_read") {
    return [...eligible].sort(economicalSort)[0] || null
  }

  return [...eligible]
    .sort((left, right) =>
      strongSort(left, right, TASKS_PREFERRING_JSON.has(taskKey))
    )[0] || null
}

function fallbackCandidate(
  models: RouterModel[],
  taskKey: VossTaskKey,
  primary: RouterModel | null,
  base: RouterModel,
) {
  const auto = autoCandidate(models, taskKey)
  if (auto) return auto
  if (primary) return primary
  return base
}

export async function resolveVossModel(
  admin: SupabaseClient,
  input: {
    campaignId: string
    canManage: boolean
    selectedModelId: string | null
    message: string
    viewContext: JsonRecord
  },
): Promise<VossRouteDecision> {
  const taskKey = classifyVossTask(input.message, input.viewContext)

  const { data: rows, error } = await admin
    .from("ai_models")
    .select(
      "id,provider_key,model_key,display_name,enabled,is_base,gm_selectable,supports_tools,supports_json,supports_streaming,context_window,cost_tier,reasoning_tier,latency_tier",
    )
    .eq("enabled", true)

  if (error) throw new Error(error.message)

  const models = (rows || []) as RouterModel[]
  const base = models.find((model) => model.is_base)
  if (!base) throw new Error("No active base AI model configured")

  if (!input.canManage) {
    return {
      taskKey,
      model: base,
      routeMode: "base_lock",
      reason: "Player requests are permanently locked to the base model.",
      degraded:
        TASKS_REQUIRING_TOOLS.has(taskKey) && !base.supports_tools,
    }
  }

  const primary =
    models.find(
      (model) =>
        model.id === input.selectedModelId &&
        (model.gm_selectable || model.is_base),
    ) || base

  const { data: routeData, error: routeError } = await admin
    .from("ai_agent_model_routes")
    .select("task_key,mode,selected_model_id")
    .eq("campaign_id", input.campaignId)
    .eq("agent_key", "voss")
    .eq("task_key", taskKey)
    .maybeSingle()

  if (routeError) throw new Error(routeError.message)

  const route = routeData as RouteRow | null
  const mode = route?.mode || defaultMode(taskKey)

  if (mode === "base") {
    return {
      taskKey,
      model: base,
      routeMode: "base",
      reason: "GM route explicitly pins this task to the base model.",
      degraded:
        TASKS_REQUIRING_TOOLS.has(taskKey) && !base.supports_tools,
    }
  }

  if (mode === "fixed") {
    const fixed = models.find(
      (model) =>
        model.id === route?.selected_model_id &&
        (model.gm_selectable || model.is_base),
    ) || null

    if (fixed && isEligible(fixed, taskKey, false)) {
      return {
        taskKey,
        model: fixed,
        routeMode: "fixed",
        reason: "GM route explicitly pins this task to a fixed model.",
        degraded: false,
      }
    }

    const fallback = fallbackCandidate(models, taskKey, primary, base)
    return {
      taskKey,
      model: fallback,
      routeMode: "fallback",
      reason:
        "Configured fixed model is unavailable or lacks required capabilities; safe fallback selected.",
      degraded: !isEligible(fallback, taskKey, false),
    }
  }

  if (mode === "primary") {
    if (isEligible(primary, taskKey, false)) {
      return {
        taskKey,
        model: primary,
        routeMode: "primary",
        reason: "Task uses the GM-selected primary model.",
        degraded: false,
      }
    }

    const fallback = fallbackCandidate(models, taskKey, primary, base)
    return {
      taskKey,
      model: fallback,
      routeMode: "fallback",
      reason:
        "Primary model lacks required task capabilities; compatible fallback selected.",
      degraded: !isEligible(fallback, taskKey, false),
    }
  }

  const automatic = autoCandidate(models, taskKey)
  if (automatic) {
    return {
      taskKey,
      model: automatic,
      routeMode: "auto",
      reason:
        taskKey === "reference_read" || taskKey === "memory_read"
          ? "Auto route selected the cheapest/fastest compatible read model."
          : "Auto route selected the strongest compatible model for this task.",
      degraded: false,
    }
  }

  const fallback = fallbackCandidate(models, taskKey, primary, base)
  return {
    taskKey,
    model: fallback,
    routeMode: "fallback",
    reason:
      "No fully compatible model is registered; request continues in degraded mode.",
    degraded: !isEligible(fallback, taskKey, false),
  }
}

export async function recordVossRouteRun(
  admin: SupabaseClient,
  input: {
    campaignId: string
    userId: string
    threadId: string
    decision: VossRouteDecision
  },
) {
  await admin
    .from("ai_model_route_runs")
    .insert({
      campaign_id: input.campaignId,
      user_id: input.userId,
      thread_id: input.threadId,
      agent_key: "voss",
      task_key: input.decision.taskKey,
      model_id: input.decision.model.id,
      route_mode: input.decision.routeMode,
      reason: input.decision.reason,
      degraded: input.decision.degraded,
    })
    .then(() => undefined)
    .catch(() => undefined)
}
