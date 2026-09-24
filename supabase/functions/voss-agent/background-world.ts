import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

import type { RouterModel } from "./model-router.ts"
import {
  ProviderGatewayError,
  requestChatCompletion,
} from "./provider-gateway.ts"
import {
  executeRandomDecision,
  RESOLVE_RANDOM_DECISION_TOOL,
} from "./random-decision.ts"

type JsonRecord = Record<string, unknown>

type ProviderToolCall = {
  id?: string
  function?: {
    name?: string
    arguments?: string | JsonRecord
  }
}

type ExpectedResult = {
  entityScope: "world" | "npc" | "location"
  entityId: string
  rollResult: number
  severityKey: string
  direction: "negative" | "neutral" | "positive"
  magnitude: "critical" | "severe" | "notable" | "minor" | "neutral"
}

const WORKER_MODEL_KEY = "deepseek-v4.1-flash"
const EVENT_KIND_RE = /^[a-z][a-z0-9._:-]{0,119}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const WORKER_SYSTEM = [
  "Ты служебный daily background worker MEGANOT. Ты не ведущий текущей сцены и не отвечаешь игрокам.",
  "Все случайные решения уже сделаны серверным World Resolver. Ты НЕ выбираешь кандидатов, НЕ перебрасываешь d100 и НЕ меняешь supplied roll.",
  "Во входе есть только выбранные Stage 9 сущности. Нельзя просить, подменять или придумывать другую NPC/location как объект фонового хода.",
  "Для world и КАЖДОЙ selected entity верни ровно один result с теми же entity_scope, entity_id, roll_result, severity_key, direction и magnitude.",
  "Направление и масштаб обязательны: negative остаётся негативным, positive позитивным, neutral нейтральным; critical/severe/notable/minor нельзя ослаблять или усиливать.",
  "Для любого non-neutral результата lasting_change обязан быть true. Для neutral допустим lasting_change=false, и это нормальный результат без устойчивого события.",
  "Предпочитай продолжить current_snapshot/recent_events, если это логически связано с сущностью. Не притягивай старую линию насильно.",
  "quest_constraints являются жёстким каноническим контекстом. Не ломай их ради драматизма.",
  "Не создавай новые постоянные NPC, локации, квесты, предметы или фракции. Не мутируй канонические строки напрямую.",
  "effect_payload описывает структурированное последствие события.",
  "snapshot_summary — это ПОЛНЫЙ краткий актуальный итог состояния world/NPC/location ПОСЛЕ этого результата, а не описание только нового события. Он должен заменить предыдущий active summary и сохранять только всё ещё актуальные последствия/незакрытые линии.",
  "proposed_state — ПОЛНЫЙ компактный replacement current-state ПОСЛЕ события. Это НЕ patch и НЕ дневник. Перенеси из current_snapshot.state только всё ещё актуальные поля, обнови изменившиеся, удали устаревшие. Не создавай history/events/timeline массивы.",
  "Если событие меняет временно эффективное физическое состояние, используй proposed_state.temporal_overlay. Для NPC разрешены только life_state='alive'|'dead', location_id=существующий UUID или null, status=короткий machine key. Для location разрешены lifecycle_state='active'|'archived' и status. Для world разрешён только status.",
  "temporal_overlay обязан описывать состояние, эффективное на campaign_day этого события, и переноситься в следующий replacement snapshot пока эффект остаётся актуальным. Не мутируй canonical rows напрямую: основной GM увидит overlay только в сценах с scene_day >= through_game_day.",
  "event_kind должен быть коротким machine key вида economy.shift, npc.recovery, location.damage. Для lasting_change=false используй event_kind=none.",
  "summary — 1–2 коротких предложения без художественной сцены.",
  "Если после учёта supplied roll и канона остаются 2+ реально равноправных НЕРАЗРЕШЁННЫХ сюжетных исхода, можешь вызвать resolve_random_decision. Сначала полностью задай вопрос и все d100 bands. Сервер зафиксирует их до броска.",
  "Никогда не используй resolve_random_decision для supplied daily roll, атаки, save/check, deterministic rule, уже существующего факта или чтобы переиграть неудобный исход.",
  "После resolve_random_decision обязан следовать matched_outcome; повтор того же decision_key не даёт новый бросок.",
  "Верни только JSON без markdown: {world:Result,entities:Result[]}.",
  "Result={entity_scope:'world'|'npc'|'location',entity_id:string,roll_result:number,severity_key:string,direction:'negative'|'neutral'|'positive',magnitude:'critical'|'severe'|'notable'|'minor'|'neutral',lasting_change:boolean,event_kind:string,summary:string,snapshot_summary:string,importance:0|1|2|3|4|5,effect_payload:object,proposed_state:object}",
].join("\n")

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function text(value: unknown, max = 1800) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function providerMessage(payload: any): {
  content?: string | null
  tool_calls?: ProviderToolCall[]
} {
  const message = payload?.choices?.[0]?.message
  return message && typeof message === "object" ? message : {}
}

function parseProviderToolArguments(raw: unknown): JsonRecord {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as JsonRecord
  }
  if (typeof raw !== "string" || raw.length > 50000) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : {}
  } catch {
    return {}
  }
}

function providerText(payload: any) {
  const direct = providerMessage(payload).content
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  return ""
}

function parseJsonObject(value: string): JsonRecord {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("background_worker_empty_answer")

  const candidates = [
    trimmed,
    trimmed.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, ""),
  ]
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("background_worker_invalid_json")
}

function exactInt(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("background_worker_integer_required")
  }
  if (value < min || value > max) {
    throw new Error("background_worker_integer_out_of_bounds")
  }
  return value
}

function boundedObject(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + "_must_be_object")
  }
  const serialized = JSON.stringify(value)
  if (serialized.length > 24_000) {
    throw new Error(label + "_too_large")
  }
  return value as JsonRecord
}

function expectedFromContext(
  entityScope: ExpectedResult["entityScope"],
  entityId: string,
  rollValue: unknown,
): ExpectedResult {
  const roll = record(rollValue)
  const rollResult = exactInt(roll.result, 1, 100)
  const severityKey = text(roll.severity_key, 80)
  const direction = text(roll.direction, 16)
  const magnitude = text(roll.magnitude, 16)

  if (!severityKey) throw new Error("background_worker_missing_severity")
  if (!["negative", "neutral", "positive"].includes(direction)) {
    throw new Error("background_worker_direction_invalid")
  }
  if (!["critical", "severe", "notable", "minor", "neutral"].includes(magnitude)) {
    throw new Error("background_worker_magnitude_invalid")
  }

  return {
    entityScope,
    entityId,
    rollResult,
    severityKey,
    direction: direction as ExpectedResult["direction"],
    magnitude: magnitude as ExpectedResult["magnitude"],
  }
}

function normalizeResult(
  value: unknown,
  expected: ExpectedResult,
): JsonRecord {
  const row = record(value)

  if (
    text(row.entity_scope, 20) !== expected.entityScope ||
    text(row.entity_id, 100) !== expected.entityId ||
    exactInt(row.roll_result, 1, 100) !== expected.rollResult ||
    text(row.severity_key, 80) !== expected.severityKey ||
    text(row.direction, 16) !== expected.direction ||
    text(row.magnitude, 16) !== expected.magnitude
  ) {
    throw new Error("background_worker_supplied_roll_violation")
  }

  if (typeof row.lasting_change !== "boolean") {
    throw new Error("background_worker_lasting_change_invalid")
  }
  if (expected.severityKey !== "neutral" && row.lasting_change !== true) {
    throw new Error("background_worker_non_neutral_must_be_lasting")
  }

  const summary = text(row.summary, 1800)
  if (!summary) throw new Error("background_worker_summary_required")

  let eventKind = text(row.event_kind, 120).toLowerCase()
  if (row.lasting_change) {
    if (!EVENT_KIND_RE.test(eventKind)) {
      throw new Error("background_worker_event_kind_invalid")
    }
  } else {
    eventKind = "none"
  }

  const snapshotSummary = text(row.snapshot_summary, 1800)
  if (!snapshotSummary) {
    throw new Error("background_worker_snapshot_summary_required")
  }

  const importance = exactInt(row.importance, 0, 5)
  const effectPayload = boundedObject(row.effect_payload, "effect_payload")
  const proposedState = boundedObject(row.proposed_state, "proposed_state")
  for (const forbidden of [
    "history",
    "event_history",
    "daily_history",
    "timeline",
    "events",
    "event_log",
  ]) {
    if (Object.prototype.hasOwnProperty.call(proposedState, forbidden)) {
      throw new Error("background_worker_snapshot_history_key_forbidden")
    }
  }

  return {
    entity_scope: expected.entityScope,
    entity_id: expected.entityId,
    roll_result: expected.rollResult,
    severity_key: expected.severityKey,
    direction: expected.direction,
    magnitude: expected.magnitude,
    lasting_change: row.lasting_change,
    event_kind: eventKind,
    summary,
    snapshot_summary: snapshotSummary,
    importance,
    effect_payload: {
      ...effectPayload,
      snapshot_mode: "replace",
      snapshot_summary: snapshotSummary,
    },
    proposed_state: proposedState,
  }
}

function expectedResults(workerInput: JsonRecord) {
  const world = record(workerInput.world)
  const campaign = record(world.campaign)
  const campaignId = text(campaign.id, 100)
  if (!campaignId) throw new Error("background_worker_campaign_context_missing")

  const expectedWorld = expectedFromContext(
    "world",
    campaignId,
    world.roll,
  )

  const expectedEntities: ExpectedResult[] = []

  for (const npc of records(workerInput.selected_npcs)) {
    const id = text(npc.entity_id, 100)
    if (!UUID_RE.test(id)) throw new Error("background_worker_npc_context_invalid")
    expectedEntities.push(expectedFromContext("npc", id, npc.roll))
  }

  for (const location of records(workerInput.selected_locations)) {
    const id = text(location.entity_id, 100)
    if (!UUID_RE.test(id)) {
      throw new Error("background_worker_location_context_invalid")
    }
    expectedEntities.push(expectedFromContext("location", id, location.roll))
  }

  return { expectedWorld, expectedEntities }
}

export function validateBackgroundWorkerOutput(
  raw: unknown,
  workerInput: JsonRecord,
) {
  const output = record(raw)
  const { expectedWorld, expectedEntities } = expectedResults(workerInput)

  const normalizedWorld = normalizeResult(output.world, expectedWorld)
  const rawEntities = Array.isArray(output.entities) ? output.entities : null
  if (!rawEntities || rawEntities.length !== expectedEntities.length) {
    throw new Error("background_worker_entity_result_count_mismatch")
  }

  const expectedByKey = new Map(
    expectedEntities.map((item) => [
      item.entityScope + ":" + item.entityId.toLowerCase(),
      item,
    ]),
  )
  const seen = new Set<string>()
  const normalizedEntities: JsonRecord[] = []

  for (const rawEntity of rawEntities) {
    const row = record(rawEntity)
    const scope = text(row.entity_scope, 20)
    const id = text(row.entity_id, 100)
    const key = scope + ":" + id.toLowerCase()
    const expected = expectedByKey.get(key)
    if (!expected) {
      throw new Error("background_worker_rejected_or_unknown_entity")
    }
    if (seen.has(key)) throw new Error("background_worker_duplicate_entity_result")
    seen.add(key)
    normalizedEntities.push(normalizeResult(row, expected))
  }

  if (seen.size !== expectedEntities.length) {
    throw new Error("background_worker_selected_entity_missing")
  }

  const normalized = {
    world: normalizedWorld,
    entities: normalizedEntities,
  }
  if (JSON.stringify(normalized).length > 160_000) {
    throw new Error("background_worker_output_budget_exceeded")
  }
  return normalized
}

async function fixedWorkerModel(
  admin: SupabaseClient,
): Promise<RouterModel> {
  const { data, error } = await admin
    .from("ai_models")
    .select(
      "id,provider_key,model_key,display_name,enabled,is_base,gm_selectable,user_selectable,supports_tools,supports_json,supports_streaming,supports_vision,model_kind,access_scope,context_window,cost_tier,reasoning_tier,latency_tier",
    )
    .eq("model_key", WORKER_MODEL_KEY)
    .eq("enabled", true)
    .eq("model_kind", "agent")
    .eq("access_scope", "campaign")
    .eq("supports_json", true)
    .eq("supports_tools", true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("background_worker_model_missing")
  return data as RouterModel
}

function failureCode(error: unknown) {
  if (error instanceof ProviderGatewayError) return error.code
  const raw = error instanceof Error ? error.message : String(error)
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").slice(0, 120)
  return cleaned || "ai_background_worker_failed"
}

export async function runAiWorldBackground(
  admin: SupabaseClient,
  runId: string,
) {
  let claimed = false

  try {
    const prepare = await admin.rpc("prepare_ai_background_daily_worker_v1", {
      p_run_id: runId,
    })
    if (prepare.error) throw new Error(prepare.error.message)

    const prepared = record(prepare.data)
    if (prepared.completed === true) {
      return {
        processed: false,
        completed: true,
        replayed: true,
        runId,
      }
    }
    if (prepared.busy === true) {
      return {
        processed: false,
        busy: true,
        runId,
      }
    }

    claimed = true
    if (text(prepared.worker_model, 120) !== WORKER_MODEL_KEY) {
      throw new Error("background_worker_model_mismatch")
    }

    const workerInput = boundedObject(
      prepared.worker_input,
      "background_worker_input",
    )
    if (text(workerInput.surface, 80) !== "ai_background_daily_v1") {
      throw new Error("background_worker_input_surface_invalid")
    }

    const model = await fixedWorkerModel(admin)

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: WORKER_SYSTEM },
      {
        role: "user",
        content:
          "Обработай этот один игровой день. Используй только supplied entities/rolls и верни только JSON.\n" +
          JSON.stringify(workerInput),
      },
    ]

    let normalized: ReturnType<typeof validateBackgroundWorkerOutput> | null = null

    for (let round = 0; round < 4; round += 1) {
      const payload = await requestChatCompletion({
        model,
        messages,
        tools: [
          RESOLVE_RANDOM_DECISION_TOOL,
        ] as unknown as Array<Record<string, unknown>>,
        toolChoice: "auto",
        temperature: 0.1,
        disableReasoningEffort: false,
        timeoutMs: 85_000,
        retryCount: 0,
        responseFormat: { type: "json_object" },
      })

      const assistant = providerMessage(payload)
      const calls = Array.isArray(assistant.tool_calls)
        ? assistant.tool_calls.slice(0, 4)
        : []

      if (!calls.length) {
        const raw = providerText(payload)
        const parsed = parseJsonObject(raw)
        normalized = validateBackgroundWorkerOutput(parsed, workerInput)
        break
      }

      messages.push({
        role: "assistant",
        content:
          typeof assistant.content === "string" ? assistant.content : null,
        tool_calls: calls,
      })

      for (let index = 0; index < calls.length; index += 1) {
        const call = calls[index]
        const callId = call.id || `background-random-${round}-${index}`
        const name =
          typeof call.function?.name === "string" ? call.function.name : ""
        const args = parseProviderToolArguments(call.function?.arguments)

        let result: unknown
        if (name !== "resolve_random_decision") {
          result = { error: "background_worker_tool_not_allowed" }
        } else {
          result = await executeRandomDecision(
            {
              admin,
              campaignId: text(prepared.campaign_id, 100),
              campaignDay: Number(prepared.campaign_day || 0),
              runKey: runId,
              surface: "background_flash",
            },
            args,
          )
        }

        const rawResult = JSON.stringify(result)
        messages.push({
          role: "tool",
          tool_call_id: callId,
          name,
          content:
            rawResult.length <= 16000
              ? rawResult
              : JSON.stringify({
                  truncated: true,
                  preview: rawResult.slice(0, 16000),
                }),
        })
      }
    }

    if (!normalized) {
      throw new Error("background_worker_random_decision_round_limit")
    }

    const complete = await admin.rpc(
      "complete_ai_background_daily_worker_v1",
      {
        p_run_id: runId,
        p_output: normalized,
      },
    )
    if (complete.error) throw new Error(complete.error.message)

    return {
      processed: true,
      completed: true,
      runId,
      completion: complete.data,
    }
  } catch (error) {
    if (claimed) {
      await admin.rpc("fail_ai_background_daily_worker_v1", {
        p_run_id: runId,
        p_failure_code: failureCode(error),
        p_failure_detail: error instanceof Error ? error.message : String(error),
      })
    }
    throw error
  }
}
