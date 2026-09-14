import type { RouterModel } from "./model-router.ts"

type JsonRecord = Record<string, unknown>

type ChatRequest = {
  model: RouterModel
  messages: Array<Record<string, unknown>>
  tools?: Array<Record<string, unknown>>
  temperature?: number
  allowOwnerOverride?: boolean
}

export class ProviderGatewayError extends Error {
  code: string
  status: number
  providerStatus: number | null
  detail: string

  constructor(
    message: string,
    options: {
      code: string
      status: number
      providerStatus?: number | null
      detail?: string
    },
  ) {
    super(message)
    this.name = "ProviderGatewayError"
    this.code = options.code
    this.status = options.status
    this.providerStatus = options.providerStatus ?? null
    this.detail = options.detail || ""
  }
}

function getEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)
    if (value) return value
  }
  return ""
}

function normalizedBaseUrl(value: string, fallback = "") {
  return (value || fallback).replace(/\/+$/, "")
}

function ensureGatewayModel(
  model: RouterModel,
  allowOwnerOverride = false,
) {
  const campaignAgent =
    model.enabled &&
    model.model_kind === "agent" &&
    model.access_scope === "campaign"

  const ownerOverride =
    allowOwnerOverride &&
    model.enabled &&
    model.model_kind === "owner_override" &&
    model.access_scope === "system_admin"

  if (!campaignAgent && !ownerOverride) {
    throw new ProviderGatewayError(
      "Model is not available to this AI gateway scope",
      {
        code: "ai_model_scope_denied",
        status: 403,
      },
    )
  }
}

function deepSeekConfig(model: RouterModel) {
  const apiKey = getEnv(
    "DEEPSEEK_API_KEY",
    // Temporary compatibility with the Stage 1 secret name.
    // This is still the same DeepSeek provider, never a provider fallback.
    "AI_API_KEY",
  )
  const apiBase = normalizedBaseUrl(
    getEnv("DEEPSEEK_API_BASE_URL"),
    "https://api.deepseek.com",
  )

  if (!apiKey) {
    throw new ProviderGatewayError("DeepSeek provider is not configured", {
      code: "ai_provider_not_configured",
      status: 503,
      detail: "DEEPSEEK_API_KEY is missing",
    })
  }

  return {
    apiBase,
    apiKey,
    providerModel: model.model_key,
  }
}

function astraConfig(model: RouterModel) {
  const apiKey = getEnv("ASTRA_API_KEY")
  const apiBase = normalizedBaseUrl(getEnv("ASTRA_API_BASE_URL"))
  const providerModel = getEnv("ASTRA_MODEL") || model.model_key

  if (!apiBase || !apiKey || !providerModel) {
    throw new ProviderGatewayError(
      "Astra owner override is not configured",
      {
        code: "owner_override_not_configured",
        status: 503,
        detail: "ASTRA_API_KEY / ASTRA_API_BASE_URL are required before enabling the owner override registry row.",
      },
    )
  }

  return { apiBase, apiKey, providerModel }
}

function legacyOpenAICompatibleConfig(model: RouterModel) {
  const apiKey = getEnv("AI_API_KEY")
  const apiBase = normalizedBaseUrl(getEnv("AI_API_BASE_URL"))
  const defaultModel = getEnv("AI_DEFAULT_MODEL")
  const providerModel = model.model_key === "__default__"
    ? defaultModel
    : model.model_key

  if (!apiBase || !apiKey || !providerModel) {
    throw new ProviderGatewayError(
      "Legacy OpenAI-compatible provider is not configured",
      {
        code: "ai_provider_not_configured",
        status: 503,
      },
    )
  }

  return { apiBase, apiKey, providerModel }
}

function providerConfig(
  model: RouterModel,
  allowOwnerOverride = false,
) {
  ensureGatewayModel(model, allowOwnerOverride)

  switch (model.provider_key) {
    case "deepseek":
      return deepSeekConfig(model)
    case "openai-compatible":
      return legacyOpenAICompatibleConfig(model)
    case "astra-compatible":
      if (!allowOwnerOverride) {
        throw new ProviderGatewayError("Owner override requires an active Developer Mode session", {
          code: "owner_override_scope_denied",
          status: 403,
        })
      }
      return astraConfig(model)
    default:
      throw new ProviderGatewayError(
        "Unsupported AI provider: " + model.provider_key,
        {
          code: "ai_provider_unsupported",
          status: 503,
        },
      )
  }
}

export async function requestChatCompletion(input: ChatRequest) {
  const { apiBase, apiKey, providerModel } = providerConfig(
    input.model,
    input.allowOwnerOverride === true,
  )

  let response: Response
  try {
    response = await fetch(apiBase + "/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: providerModel,
        messages: input.messages,
        temperature: input.temperature ?? 0.55,
        ...(input.tools?.length
          ? {
              tools: input.tools,
              tool_choice: "auto",
            }
          : {}),
      }),
    })
  } catch (error) {
    throw new ProviderGatewayError("AI provider request failed", {
      code: "ai_provider_request_failed",
      status: 502,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200)
    throw new ProviderGatewayError("AI provider returned an error", {
      code: "ai_provider_error",
      status: 502,
      providerStatus: response.status,
      detail,
    })
  }

  try {
    return await response.json()
  } catch (error) {
    throw new ProviderGatewayError("AI provider returned invalid JSON", {
      code: "ai_provider_invalid_response",
      status: 502,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
