import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.3"

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

function cleanContext(input: unknown): JsonRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const raw = JSON.stringify(input)
  if (raw.length <= 12000) return input as JsonRecord
  return {
    truncated: true,
    text: raw.slice(0, 12000),
  }
}

function contentFromProvider(payload: any): string {
  const chat = payload?.choices?.[0]?.message?.content
  if (typeof chat === "string" && chat.trim()) return chat.trim()
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  return ""
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
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

  const token = authHeader.replace(/^Bearer\s+/i, "")
  const { data: authData, error: authError } = await userClient.auth.getUser(token)
  const user = authData.user
  if (authError || !user) return reply({ error: "Invalid session" }, 401)

  let body: JsonRecord
  try {
    body = await req.json()
  } catch {
    return reply({ error: "Invalid JSON body" }, 400)
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""
  const agentKey = body.agentKey === "voss" ? "voss" : "voss"
  const viewContext = cleanContext(body.viewContext)

  if (!campaignId) return reply({ error: "campaignId is required" }, 400)
  if (!message) return reply({ error: "message is required" }, 400)
  if (message.length > 8000) return reply({ error: "message is too long" }, 400)

  const { data: membership, error: membershipError } = await userClient
    .from("campaign_members")
    .select("role,is_owner")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (membershipError) return reply({ error: membershipError.message }, 500)
  if (!membership) return reply({ error: "Campaign access denied" }, 403)

  const canChooseModel = membership.role === "gm" || membership.is_owner === true

  let selectedModelId: string | null = null
  if (canChooseModel) {
    const { data: settings } = await userClient
      .from("ai_agent_settings")
      .select("selected_model_id")
      .eq("campaign_id", campaignId)
      .eq("agent_key", agentKey)
      .maybeSingle()
    selectedModelId = settings?.selected_model_id || null
  }

  let modelQuery = admin
    .from("ai_models")
    .select("id,model_key,display_name,provider_key,gm_selectable")
    .eq("enabled", true)

  if (selectedModelId && canChooseModel) {
    modelQuery = modelQuery.eq("id", selectedModelId).eq("gm_selectable", true)
  } else {
    modelQuery = modelQuery.eq("is_base", true)
  }

  const { data: model, error: modelError } = await modelQuery.maybeSingle()
  if (modelError) return reply({ error: modelError.message }, 500)

  let resolvedModel = model
  if (!resolvedModel && selectedModelId) {
    const { data: baseModel } = await admin
      .from("ai_models")
      .select("id,model_key,display_name,provider_key,gm_selectable")
      .eq("enabled", true)
      .eq("is_base", true)
      .maybeSingle()
    resolvedModel = baseModel
  }

  if (!resolvedModel) return reply({ error: "No active AI model configured" }, 503)

  const apiBase = getEnv("AI_API_BASE_URL").replace(/\/+$/, "")
  const apiKey = getEnv("AI_API_KEY")
  const defaultModel = getEnv("AI_DEFAULT_MODEL")
  const providerModel = resolvedModel.model_key === "__default__"
    ? defaultModel
    : resolvedModel.model_key

  if (!apiBase || !apiKey || !providerModel) {
    return reply({
      error: "AI provider is not configured yet",
      code: "ai_provider_not_configured",
      model: resolvedModel.display_name,
    }, 503)
  }

  let threadId = ""
  const { data: existingThread, error: threadLookupError } = await admin
    .from("ai_threads")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .eq("agent_key", agentKey)
    .maybeSingle()

  if (threadLookupError) return reply({ error: threadLookupError.message }, 500)

  if (existingThread?.id) {
    threadId = existingThread.id
  } else {
    const { data: createdThread, error: createThreadError } = await admin
      .from("ai_threads")
      .insert({
        campaign_id: campaignId,
        user_id: user.id,
        agent_key: agentKey,
        title: "Восс",
      })
      .select("id")
      .single()
    if (createThreadError) return reply({ error: createThreadError.message }, 500)
    threadId = createdThread.id
  }

  const { data: recentRows, error: historyError } = await admin
    .from("ai_messages")
    .select("role,body")
    .eq("thread_id", threadId)
    .order("id", { ascending: false })
    .limit(24)

  if (historyError) return reply({ error: historyError.message }, 500)
  const history = [...(recentRows || [])].reverse()

  const contextText = Object.keys(viewContext).length
    ? JSON.stringify(viewContext, null, 2)
    : "Контекст текущего экрана не передан."

  const systemPrompt = [
    "Ты Восс, встроенный помощник MEGANOT RPG.",
    "Твоя первая роль: помогать разбираться в классах, подклассах, игровых механиках и содержимом мастерской ГМ.",
    "Говори по-русски, уверенно и живо. Тон Восса сухой, практичный, иногда язвительный, но без клоунады.",
    "Не выдумывай факты, которых нет в переданном контексте. Если данных недостаточно, прямо скажи, чего не хватает.",
    "Всегда отличай точную механику от своей оценки или совета.",
    "На этапе 1 ты работаешь только на чтение: не заявляй, что создал, изменил, удалил или сохранил сущность.",
    "Если пользователь просит что-то создать, можешь предложить структуру будущего черновика, но ясно обозначь, что это предложение.",
    "Текущий интерфейс передаётся ниже как справочный контекст. Считай его подсказкой о том, что сейчас открыто у пользователя.",
    "",
    "ТЕКУЩИЙ КОНТЕКСТ ИНТЕРФЕЙСА:",
    contextText,
  ].join("\n")

  const providerMessages = [
    { role: "system", content: systemPrompt },
    ...history.map((row) => ({ role: row.role, content: row.body })),
    { role: "user", content: message },
  ]

  let providerResponse: Response
  try {
    providerResponse = await fetch(apiBase + "/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: providerModel,
        messages: providerMessages,
        temperature: 0.55,
      }),
    })
  } catch (error) {
    return reply({
      error: "AI provider request failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 502)
  }

  if (!providerResponse.ok) {
    const detail = (await providerResponse.text()).slice(0, 800)
    return reply({
      error: "AI provider returned an error",
      providerStatus: providerResponse.status,
      detail,
    }, 502)
  }

  const providerPayload = await providerResponse.json()
  const answer = contentFromProvider(providerPayload)
  if (!answer) {
    return reply({ error: "AI provider returned an empty answer" }, 502)
  }

  const { error: saveError } = await admin.from("ai_messages").insert([
    {
      thread_id: threadId,
      role: "user",
      body: message,
      view_context: viewContext,
    },
    {
      thread_id: threadId,
      role: "assistant",
      body: answer,
      model_id: resolvedModel.id,
      view_context: {},
    },
  ])
  if (saveError) return reply({ error: saveError.message }, 500)

  await admin
    .from("ai_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId)

  return reply({
    answer,
    threadId,
    model: {
      id: resolvedModel.id,
      name: resolvedModel.display_name,
    },
    canChooseModel,
  })
})
