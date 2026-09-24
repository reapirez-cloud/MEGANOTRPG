import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

import {
  buildGameChatContextV2,
  type Stage2GameChatContext,
} from "./game-chat-context.ts"
import {
  requestChatCompletion,
} from "./provider-gateway.ts"
import {
  type RouterModel,
} from "./model-router.ts"
import {
  executeVossManagerTool,
  VOSS_MANAGER_TOOLS,
} from "./manager-tools.ts"
import {
  executeVossQuestTool,
  VOSS_QUEST_TOOLS,
} from "./quest-tools.ts"
import {
  executeVossMemoryTool,
  VOSS_MEMORY_WRITE_TOOLS,
} from "./memory-tools.ts"

type JsonRecord = Record<string, unknown>

type ProviderToolCall = {
  id?: string
  function?: {
    name?: string
    arguments?: string | JsonRecord
  }
}

const POST_TURN_MODEL_KEY = "deepseek-v4.1-flash"

const MANAGER_TOOL_NAMES = new Set([
  "create_location",
  "update_location",
  "create_world_npc",
  "update_world_npc",
  "upsert_location_transition",
  "upsert_faction",
  "set_faction_membership",
  "set_character_faction_reputation",
  "set_npc_habitat",
  "move_character_world",
  "set_world_discovery",
  "upsert_location_secret",
  "set_location_secret_state",
])

const QUEST_TOOL_NAMES = new Set([
  "create_quest_plan",
  "activate_quest",
  "update_quest_brief",
  "bind_quest_target",
  "materialize_quest_target",
  "resolve_quest_condition",
  "run_quest_resolver",
])

const MEMORY_TOOL_NAMES = new Set([
  "remember_campaign_fact",
])

const AMBIGUOUS_ON_ERROR_TOOL_NAMES = new Set([
  "create_location",
  "create_world_npc",
  "remember_campaign_fact",
])

const NOOP_TOOL = {
  type: "function",
  function: {
    name: "stage18_noop",
    description:
      "Complete this post-turn intent without a database mutation because the published fact is already canonical or no allowed mutation can be made without inventing information.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
} as const

const POST_TURN_TOOLS = [
  ...VOSS_MANAGER_TOOLS.filter((tool) =>
    MANAGER_TOOL_NAMES.has(tool.function.name)
  ),
  ...VOSS_QUEST_TOOLS.filter((tool) =>
    QUEST_TOOL_NAMES.has(tool.function.name)
  ),
  ...VOSS_MEMORY_WRITE_TOOLS.filter((tool) =>
    MEMORY_TOOL_NAMES.has(tool.function.name)
  ),
  NOOP_TOOL,
]

const POST_TURN_SYSTEM = [
  "Ты младший post-turn commit worker MEGANOT. Ты НЕ GM, НЕ рассказчик и НЕ продолжаешь сцену.",
  "Ответ основного GM уже опубликован. Он неизменяем. Твоя задача: выполнить РОВНО ОДИН переданный intent и не создавать новых сюжетных фактов.",
  "Используй только один доступный tool call. Не вызывай несколько tools за один intent.",
  "Не придумывай новый NPC, локацию, награду, секрет, конфликт, отношение, квестовый поворот или последствие, которых нет в опубликованном ответе/intent/canonical context.",
  "Допускаются только технические поля, необходимые для сохранения уже установленного факта. Они не должны менять смысл сцены.",
  "UUID используй только из canonical context или из самого intent. Не выдумывай UUID.",
  "Если нужное состояние уже существует, используй stage18_noop.",
  "Если intent нельзя выполнить одним разрешённым изменением без выдумывания фактов, используй stage18_noop и объясни причину.",
  "batch_location_changes запрещён. Удаление сущностей запрещено. Свободное world-building запрещено.",
  "Не пиши текст игроку. Выбери ровно один tool.",
].join("\n")

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function parseToolArguments(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord
  }
  if (typeof value !== "string" || value.length > 100000) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : {}
  } catch {
    return {}
  }
}

function providerToolCalls(payload: unknown): ProviderToolCall[] {
  const response = record(payload)
  const choices = Array.isArray(response.choices) ? response.choices : []
  const first = record(choices[0])
  const message = record(first.message)
  return Array.isArray(message.tool_calls)
    ? message.tool_calls.slice(0, 2) as ProviderToolCall[]
    : []
}

async function resolvePostTurnModel(
  admin: SupabaseClient,
): Promise<RouterModel> {
  const { data, error } = await admin
    .from("ai_models")
    .select(
      "id,provider_key,model_key,display_name,enabled,is_base,gm_selectable,user_selectable,supports_tools,supports_json,supports_streaming,supports_vision,model_kind,access_scope,context_window,cost_tier,reasoning_tier,latency_tier",
    )
    .eq("model_key", POST_TURN_MODEL_KEY)
    .eq("enabled", true)
    .eq("model_kind", "agent")
    .eq("access_scope", "campaign")
    .eq("supports_tools", true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("stage18_post_turn_model_unavailable")
  return data as RouterModel
}

function compactPostTurnContext(context: Stage2GameChatContext) {
  return {
    game_time: context.currentGameTime,
    source_character: context.sourceCharacter,
    source_location: context.sourceLocation,
    present_characters: context.presentCharacters,
    npc_profiles: context.npcProfiles,
    scene_actors: context.sceneActors,
    relationships: context.relationships,
    assets: context.assets,
    faction_memberships: context.factionMemberships,
    faction_reputations: context.factionReputations,
    active_quest_context: context.activeQuestContext,
    memory: {
      facts: context.memory.facts,
      summaries: context.memory.summaries,
    },
    background: context.background,
  }
}

async function publishedAnswerEventId(
  admin: SupabaseClient,
  campaignId: string,
  replyMessageId: number,
) {
  const { data, error } = await admin
    .from("campaign_events")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("source_kind", "chat_message")
    .eq("source_id", String(replyMessageId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return typeof data?.id === "string" ? data.id : null
}

async function executePostTurnTool({
  admin,
  campaignId,
  requestedBy,
  model,
  replyMessageId,
  name,
  args,
}: {
  admin: SupabaseClient
  campaignId: string
  requestedBy: string
  model: RouterModel
  replyMessageId: number
  name: string
  args: JsonRecord
}) {
  if (MANAGER_TOOL_NAMES.has(name)) {
    return await executeVossManagerTool(
      {
        client: admin,
        admin,
        campaignId,
        userId: requestedBy,
        authority: "admin",
      },
      name,
      args,
    )
  }

  if (QUEST_TOOL_NAMES.has(name)) {
    return await executeVossQuestTool(
      {
        client: admin,
        campaignId,
        userId: requestedBy,
        authority: "admin",
      },
      name,
      args,
    )
  }

  if (MEMORY_TOOL_NAMES.has(name)) {
    const eventId = await publishedAnswerEventId(
      admin,
      campaignId,
      replyMessageId,
    )
    if (!eventId) {
      return { error: "stage18_published_answer_event_missing" }
    }

    return await executeVossMemoryTool(
      {
        client: admin,
        admin,
        campaignId,
        userId: requestedBy,
        modelId: model.id,
        canManage: true,
      },
      name,
      {
        ...args,
        source_event_ids: [eventId],
      },
    )
  }

  return { error: "stage18_post_turn_tool_not_allowed" }
}

async function planOneIntent({
  model,
  publishedAnswer,
  intent,
  context,
}: {
  model: RouterModel
  publishedAnswer: string
  intent: JsonRecord
  context: Stage2GameChatContext
}) {
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: POST_TURN_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        published_answer: publishedAnswer,
        post_turn_intent: {
          intent_key: intent.intent_key,
          kind: intent.kind,
          instruction: intent.instruction,
          evidence: intent.evidence,
        },
        canonical_context: compactPostTurnContext(context),
      }),
    },
  ]

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = await requestChatCompletion({
      model,
      messages,
      tools: POST_TURN_TOOLS as unknown as Array<Record<string, unknown>>,
      toolChoice: "required",
      temperature: 0.05,
      timeoutMs: 70_000,
      retryCount: 1,
    })

    const calls = providerToolCalls(payload)
    if (calls.length === 1) {
      const call = calls[0]
      const name =
        typeof call.function?.name === "string"
          ? call.function.name.trim()
          : ""
      const args = parseToolArguments(call.function?.arguments)

      if (
        name === "stage18_noop" ||
        MANAGER_TOOL_NAMES.has(name) ||
        QUEST_TOOL_NAMES.has(name) ||
        MEMORY_TOOL_NAMES.has(name)
      ) {
        return { name, args }
      }
    }

    messages.push({
      role: "user",
      content:
        "Нарушен Stage 18 contract. Верни ровно один разрешённый tool call для этого же intent, без текста и без дополнительных действий.",
    })
  }

  throw new Error("stage18_post_turn_planner_invalid_output")
}

async function failPlanning(
  admin: SupabaseClient,
  jobId: string,
  intentId: string,
  leaseToken: string,
  error: unknown,
) {
  const message =
    error instanceof Error ? error.message : String(error || "planning_failed")
  await admin.rpc("fail_ai_gm_post_turn_planning_v2", {
    p_job_id: jobId,
    p_intent_id: intentId,
    p_lease_token: leaseToken,
    p_error: message,
  })
}

async function failExecution({
  admin,
  jobId,
  intentId,
  leaseToken,
  error,
  ambiguous,
}: {
  admin: SupabaseClient
  jobId: string
  intentId: string
  leaseToken: string
  error: unknown
  ambiguous: boolean
}) {
  const message =
    error instanceof Error ? error.message : String(error || "execution_failed")
  await admin.rpc("fail_ai_gm_post_turn_intent_v2", {
    p_job_id: jobId,
    p_intent_id: intentId,
    p_lease_token: leaseToken,
    p_error: message,
    p_ambiguous: ambiguous,
  })
}

export async function runPostTurnCommitV2(
  admin: SupabaseClient,
  campaignId: string,
  jobId: string,
) {
  const claim = await admin.rpc("claim_ai_gm_post_turn_job_v2", {
    p_job_id: jobId,
  })
  if (claim.error) throw new Error(claim.error.message)

  const claimed = record(claim.data)
  if (claimed.claimed !== true) {
    return {
      claimed: false,
      state: typeof claimed.state === "string" ? claimed.state : "unknown",
    }
  }

  if (String(claimed.campaign_id || "") !== campaignId) {
    throw new Error("stage18_post_turn_campaign_mismatch")
  }

  const intent = record(claimed.intent)
  const intentId = String(intent.id || "")
  const leaseToken = String(claimed.lease_token || "")
  const requestedBy = String(claimed.requested_by || "")
  const roomId = String(claimed.room_id || "")
  const sourceCharacterId = String(claimed.source_character_id || "")
  const sourceMessageId = Number(claimed.source_message_id || 0)
  const replyMessageId = Number(claimed.reply_message_id || 0)
  const publishedAnswer =
    typeof claimed.published_answer === "string"
      ? claimed.published_answer
      : ""

  if (
    !intentId ||
    !leaseToken ||
    !requestedBy ||
    !roomId ||
    !Number.isInteger(sourceMessageId) ||
    sourceMessageId <= 0 ||
    !Number.isInteger(replyMessageId) ||
    replyMessageId <= 0 ||
    !publishedAnswer
  ) {
    await failPlanning(
      admin,
      jobId,
      intentId,
      leaseToken,
      "stage18_claim_payload_invalid",
    )
    return { claimed: true, state: "recovery_required" }
  }

  let model: RouterModel
  let context: Stage2GameChatContext
  let plan: { name: string; args: JsonRecord }

  try {
    model = await resolvePostTurnModel(admin)
    context = await buildGameChatContextV2({
      admin,
      campaignId,
      jobInput: {
        room_id: roomId,
        source_character_id: sourceCharacterId,
        source_chat_message_id: String(sourceMessageId),
        resume_chat_message_id: String(replyMessageId),
        original_message: publishedAnswer,
      },
    })
    plan = await planOneIntent({
      model,
      publishedAnswer,
      intent,
      context,
    })
  } catch (error) {
    await failPlanning(admin, jobId, intentId, leaseToken, error)
    return { claimed: true, state: "recovery_required" }
  }

  const begin = await admin.rpc("begin_ai_gm_post_turn_intent_v2", {
    p_job_id: jobId,
    p_intent_id: intentId,
    p_lease_token: leaseToken,
    p_tool_name: plan.name,
    p_tool_args: plan.args,
    p_worker_model_key: model.model_key,
  })

  if (begin.error) {
    await failPlanning(admin, jobId, intentId, leaseToken, begin.error.message)
    return { claimed: true, state: "recovery_required" }
  }

  if (plan.name === "stage18_noop") {
    const complete = await admin.rpc("complete_ai_gm_post_turn_intent_v2", {
      p_job_id: jobId,
      p_intent_id: intentId,
      p_lease_token: leaseToken,
      p_result: {
        noop: true,
        reason:
          typeof plan.args.reason === "string"
            ? plan.args.reason.slice(0, 1000)
            : "already_canonical_or_not_safely_actionable",
        model_key: model.model_key,
      },
    })
    if (complete.error) throw new Error(complete.error.message)
    return { claimed: true, state: "completed", noop: true }
  }

  let toolResult: unknown
  try {
    toolResult = await executePostTurnTool({
      admin,
      campaignId,
      requestedBy,
      model,
      replyMessageId,
      name: plan.name,
      args: plan.args,
    })
  } catch (error) {
    await failExecution({
      admin,
      jobId,
      intentId,
      leaseToken,
      error,
      ambiguous: true,
    })
    return { claimed: true, state: "recovery_required" }
  }

  const result = record(toolResult)
  if (typeof result.error === "string" || result.not_found === true) {
    const ambiguous = AMBIGUOUS_ON_ERROR_TOOL_NAMES.has(plan.name)
    await failExecution({
      admin,
      jobId,
      intentId,
      leaseToken,
      error:
        typeof result.error === "string"
          ? result.error
          : "stage18_post_turn_target_not_found",
      ambiguous,
    })
    return {
      claimed: true,
      state: ambiguous ? "recovery_required" : "retry_wait",
      error: result.error || "not_found",
    }
  }

  const complete = await admin.rpc("complete_ai_gm_post_turn_intent_v2", {
    p_job_id: jobId,
    p_intent_id: intentId,
    p_lease_token: leaseToken,
    p_result: {
      tool_name: plan.name,
      arguments: plan.args,
      result,
      model_key: model.model_key,
    },
  })
  if (complete.error) {
    // The mutation may already be committed. Never replay it automatically.
    await failExecution({
      admin,
      jobId,
      intentId,
      leaseToken,
      error: complete.error.message,
      ambiguous: true,
    })
    return { claimed: true, state: "recovery_required" }
  }

  return {
    claimed: true,
    state: "completed",
    toolName: plan.name,
  }
}

export const STAGE18_POST_TURN_MODEL_KEY = POST_TURN_MODEL_KEY
export const STAGE18_POST_TURN_ALLOWED_TOOL_NAMES = new Set([
  ...MANAGER_TOOL_NAMES,
  ...QUEST_TOOL_NAMES,
  ...MEMORY_TOOL_NAMES,
  "stage18_noop",
])
