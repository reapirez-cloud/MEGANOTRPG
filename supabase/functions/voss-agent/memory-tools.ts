import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

type JsonObject = Record<string, unknown>

type MemoryVisibility = "campaign" | "gm" | "room" | "users" | "characters"

type MemorySourceRow = {
  id: string
  visibility: MemoryVisibility
  room_id: string | null
  visible_user_ids: string[]
  visible_character_ids: string[]
}

export type VossMemoryToolContext = {
  client: SupabaseClient
  admin: SupabaseClient
  campaignId: string
  userId: string
  modelId: string | null
  canManage: boolean
}

export const VOSS_MEMORY_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_campaign_memory",
      description:
        "Search durable campaign history, active remembered facts and saved recaps visible to the current user. Use this for questions about what happened before, who said/did something, prior decisions, promises, discoveries or unresolved history.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_campaign_timeline",
      description:
        "Read visible durable campaign events in chronological order with optional time, room, location, character and event-type filters. Use this to reconstruct or recap a session/scene.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          room_id: { type: "string" },
          location_id: { type: "string" },
          character_id: { type: "string" },
          event_types: {
            type: "array",
            maxItems: 12,
            items: { type: "string" },
          },
          min_importance: {
            type: "integer",
            minimum: 0,
            maximum: 5,
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
          },
          order: {
            type: "string",
            enum: ["asc", "desc"],
          },
        },
        required: [],
      },
    },
  },
] as const

export const VOSS_MEMORY_WRITE_TOOLS = [
  {
    type: "function",
    function: {
      name: "remember_campaign_fact",
      description:
        "Save one structured campaign-memory fact. GM-only. Use only when the GM explicitly asks to remember/fix a fact, or explicitly asks to preserve a conclusion derived from cited campaign events. This does not alter canonical game state.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          fact_key: { type: "string" },
          subject_type: { type: "string" },
          subject_id: { type: "string" },
          predicate: { type: "string" },
          statement: { type: "string" },
          structured_value: {
            type: "object",
            additionalProperties: true,
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          source_event_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          supersedes_fact_id: { type: "string" },
          visibility: {
            type: "string",
            enum: ["campaign", "gm", "room", "users", "characters"],
          },
          room_id: { type: "string" },
          visible_user_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          visible_character_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
        },
        required: ["statement", "source_event_ids", "visibility"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_campaign_summary",
      description:
        "Save a GM-approved campaign/session/scene recap as a memory cache with source event ids. GM-only. Use only when the GM explicitly asks to save/remember the recap. It is a lossy summary, never canonical state.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          period_start: { type: "string" },
          period_end: { type: "string" },
          key_event_ids: {
            type: "array",
            maxItems: 60,
            items: { type: "string" },
          },
          visibility: {
            type: "string",
            enum: ["campaign", "gm", "room", "users", "characters"],
          },
          room_id: { type: "string" },
          visible_user_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          visible_character_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
        },
        required: ["title", "summary", "key_event_ids", "visibility"],
      },
    },
  },
] as const

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function boundedConfidence(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(1, parsed))
}

function cleanSearch(value: unknown) {
  return text(value, 160)
    .replace(/[%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueStrings(value: unknown, max: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, max)
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 6) return null
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") return value.slice(0, 6000)
  if (Array.isArray(value)) {
    return value.slice(0, 64).map((item) => sanitizeJson(item, depth + 1))
  }
  if (value && typeof value === "object") {
    const output: JsonObject = {}
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, 64)) {
      const key = rawKey.slice(0, 96)
      if (key) output[key] = sanitizeJson(rawValue, depth + 1)
    }
    return output
  }
  return null
}

function object(value: unknown): JsonObject {
  const sanitized = sanitizeJson(value)
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as JsonObject
    : {}
}

function visibility(value: unknown): MemoryVisibility {
  const candidate = text(value, 24)
  return ["campaign", "gm", "room", "users", "characters"].includes(candidate)
    ? candidate as MemoryVisibility
    : "gm"
}

function validIso(value: unknown) {
  const raw = text(value, 64)
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function sourceScopeAllows(
  source: MemorySourceRow,
  targetVisibility: MemoryVisibility,
  roomId: string | null,
  userIds: string[],
  characterIds: string[],
) {
  if (targetVisibility === "gm") return true
  if (source.visibility === "campaign") return true

  if (targetVisibility === "campaign") return false

  if (targetVisibility === "room") {
    return source.visibility === "room" && source.room_id === roomId
  }

  if (targetVisibility === "users") {
    if (source.visibility !== "users") return false
    const allowed = new Set(source.visible_user_ids || [])
    return userIds.every((id) => allowed.has(id))
  }

  if (targetVisibility === "characters") {
    if (source.visibility !== "characters") return false
    const allowed = new Set(source.visible_character_ids || [])
    return characterIds.every((id) => allowed.has(id))
  }

  return false
}

async function visibleSourceEvents(
  context: VossMemoryToolContext,
  ids: string[],
) {
  if (!ids.length) return [] as MemorySourceRow[]

  const { data, error } = await context.client
    .from("campaign_events")
    .select("id,visibility,room_id,visible_user_ids,visible_character_ids")
    .eq("campaign_id", context.campaignId)
    .in("id", ids)

  if (error) throw new Error(error.message)

  const rows = (data || []) as MemorySourceRow[]
  const found = new Set(rows.map((row) => row.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length) {
    throw new Error(
      "Some source events are missing or not visible to the current GM.",
    )
  }
  return rows
}

function validateTargetScope(
  targetVisibility: MemoryVisibility,
  roomId: string | null,
  userIds: string[],
  characterIds: string[],
) {
  if (targetVisibility === "room" && !roomId) {
    throw new Error("room_id is required for room-scoped memory")
  }
  if (targetVisibility === "users" && !userIds.length) {
    throw new Error("visible_user_ids are required for user-scoped memory")
  }
  if (targetVisibility === "characters" && !characterIds.length) {
    throw new Error(
      "visible_character_ids are required for character-scoped memory",
    )
  }
}

async function assertRoomVisible(
  context: VossMemoryToolContext,
  roomId: string | null,
) {
  if (!roomId) return
  const { data, error } = await context.client
    .from("chat_rooms")
    .select("id")
    .eq("campaign_id", context.campaignId)
    .eq("id", roomId)
    .maybeSingle()

  if (error || !data) {
    throw new Error("Memory room is missing or not visible to this GM.")
  }
}

async function searchCampaignMemory(
  context: VossMemoryToolContext,
  args: JsonObject,
) {
  const query = cleanSearch(args.query)
  if (!query) return { error: "search query is empty" }

  const limit = boundedInt(args.limit, 12, 1, 20)
  const pattern = "%" + query + "%"

  const [eventsResult, factsResult, summariesResult] = await Promise.all([
    context.client
      .from("campaign_events")
      .select("id,event_type,source_kind,room_id,location_id,actor_character_id,participant_character_ids,summary,importance,confidence,occurred_at")
      .eq("campaign_id", context.campaignId)
      .ilike("summary", pattern)
      .order("occurred_at", { ascending: false })
      .limit(limit),
    context.client
      .from("campaign_memory_facts")
      .select("id,fact_key,subject_type,subject_id,predicate,statement,structured_value,confidence,source_event_ids,visibility,created_at,updated_at")
      .eq("campaign_id", context.campaignId)
      .eq("status", "active")
      .ilike("statement", pattern)
      .order("updated_at", { ascending: false })
      .limit(limit),
    context.client
      .from("campaign_memory_summaries")
      .select("id,title,summary,period_start,period_end,key_event_ids,visibility,room_id,status,created_at,updated_at")
      .eq("campaign_id", context.campaignId)
      .eq("status", "active")
      .ilike("summary", pattern)
      .order("period_end", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  ])

  const error =
    eventsResult.error ||
    factsResult.error ||
    summariesResult.error
  if (error) return { error: error.message }

  return {
    query,
    events: eventsResult.data || [],
    facts: factsResult.data || [],
    summaries: summariesResult.data || [],
  }
}

async function readCampaignTimeline(
  context: VossMemoryToolContext,
  args: JsonObject,
) {
  const order = args.order === "asc" ? "asc" : "desc"
  const limit = boundedInt(args.limit, 50, 1, 100)
  const from = validIso(args.from)
  const to = validIso(args.to)
  const roomId = text(args.room_id, 100)
  const locationId = text(args.location_id, 100)
  const characterId = text(args.character_id, 100)
  const eventTypes = uniqueStrings(args.event_types, 12)
    .map((item) => item.slice(0, 120))
  const minImportance = boundedInt(args.min_importance, 0, 0, 5)

  let query = context.client
    .from("campaign_events")
    .select("id,event_type,source_kind,source_id,room_id,location_id,actor_character_id,participant_character_ids,summary,payload,importance,confidence,provenance,occurred_at")
    .eq("campaign_id", context.campaignId)
    .gte("importance", minImportance)

  if (from) query = query.gte("occurred_at", from)
  if (to) query = query.lte("occurred_at", to)
  if (roomId) query = query.eq("room_id", roomId)
  if (locationId) query = query.eq("location_id", locationId)
  if (characterId) {
    query = query.contains("participant_character_ids", [characterId])
  }
  if (eventTypes.length) query = query.in("event_type", eventTypes)

  const { data, error } = await query
    .order("occurred_at", { ascending: order === "asc" })
    .limit(limit)

  if (error) return { error: error.message }

  return {
    from,
    to,
    order,
    events: data || [],
  }
}

async function rememberCampaignFact(
  context: VossMemoryToolContext,
  args: JsonObject,
) {
  if (!context.canManage) return { error: "GM authority required" }

  const statement = text(args.statement, 6000)
  if (!statement) return { error: "statement is required" }

  const sourceEventIds = uniqueStrings(args.source_event_ids, 24)
  const targetVisibility = visibility(args.visibility)
  const roomId = text(args.room_id, 100) || null
  const userIds = uniqueStrings(args.visible_user_ids, 24)
  const characterIds = uniqueStrings(args.visible_character_ids, 24)

  try {
    validateTargetScope(targetVisibility, roomId, userIds, characterIds)
    await assertRoomVisible(context, roomId)

    const sources = await visibleSourceEvents(context, sourceEventIds)
    if (
      sources.some((source) =>
        !sourceScopeAllows(
          source,
          targetVisibility,
          roomId,
          userIds,
          characterIds,
        )
      )
    ) {
      return {
        error:
          "Memory visibility would be broader than at least one source event.",
      }
    }

    const supersedesId = text(args.supersedes_fact_id, 100) || null
    if (supersedesId) {
      const { data: oldFact, error } = await context.client
        .from("campaign_memory_facts")
        .select("id,status")
        .eq("campaign_id", context.campaignId)
        .eq("id", supersedesId)
        .eq("status", "active")
        .maybeSingle()
      if (error || !oldFact) {
        return { error: "Fact to supersede is missing or not visible." }
      }
    }

    const factId = crypto.randomUUID()
    const fallbackConfidence = sourceEventIds.length ? 0.8 : 1
    const factKey = text(args.fact_key, 180) || null

    const { error: insertError } = await context.admin
      .from("campaign_memory_facts")
      .insert({
        id: factId,
        campaign_id: context.campaignId,
        fact_key: factKey,
        subject_type: text(args.subject_type, 80) || null,
        subject_id: text(args.subject_id, 180) || null,
        predicate: text(args.predicate, 120) || null,
        statement,
        structured_value: object(args.structured_value),
        status: "active",
        confidence: boundedConfidence(args.confidence, fallbackConfidence),
        source_event_ids: sourceEventIds,
        visibility: targetVisibility,
        room_id: roomId,
        visible_user_ids: userIds,
        visible_character_ids: characterIds,
        provenance: {
          kind: sourceEventIds.length ? "event_synthesis" : "gm_assertion",
          agent: "voss",
          model_id: context.modelId,
        },
        created_by: context.userId,
      })

    if (insertError) return { error: insertError.message }

    if (supersedesId) {
      const { error: updateError } = await context.admin
        .from("campaign_memory_facts")
        .update({
          status: "superseded",
          superseded_by: factId,
          updated_at: new Date().toISOString(),
        })
        .eq("campaign_id", context.campaignId)
        .eq("id", supersedesId)
        .eq("status", "active")

      if (updateError) {
        await context.admin
          .from("campaign_memory_facts")
          .delete()
          .eq("id", factId)
        return { error: updateError.message }
      }
    }

    return {
      fact_id: factId,
      stored: true,
      canonical_state_changed: false,
      source_kind: sourceEventIds.length ? "event_synthesis" : "gm_assertion",
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function saveCampaignSummary(
  context: VossMemoryToolContext,
  args: JsonObject,
) {
  if (!context.canManage) return { error: "GM authority required" }

  const title = text(args.title, 240)
  const summary = text(args.summary, 16000)
  if (!title || !summary) return { error: "title and summary are required" }

  const eventIds = uniqueStrings(args.key_event_ids, 60)
  const targetVisibility = visibility(args.visibility)
  const roomId = text(args.room_id, 100) || null
  const userIds = uniqueStrings(args.visible_user_ids, 24)
  const characterIds = uniqueStrings(args.visible_character_ids, 24)
  const periodStart = validIso(args.period_start)
  const periodEnd = validIso(args.period_end)

  if (
    periodStart &&
    periodEnd &&
    new Date(periodEnd).getTime() < new Date(periodStart).getTime()
  ) {
    return { error: "period_end cannot be earlier than period_start" }
  }

  try {
    validateTargetScope(targetVisibility, roomId, userIds, characterIds)
    await assertRoomVisible(context, roomId)

    const sources = await visibleSourceEvents(context, eventIds)
    if (
      sources.some((source) =>
        !sourceScopeAllows(
          source,
          targetVisibility,
          roomId,
          userIds,
          characterIds,
        )
      )
    ) {
      return {
        error:
          "Summary visibility would be broader than at least one source event.",
      }
    }

    const summaryId = crypto.randomUUID()
    const { error } = await context.admin
      .from("campaign_memory_summaries")
      .insert({
        id: summaryId,
        campaign_id: context.campaignId,
        title,
        summary,
        period_start: periodStart,
        period_end: periodEnd,
        key_event_ids: eventIds,
        visibility: targetVisibility,
        room_id: roomId,
        visible_user_ids: userIds,
        visible_character_ids: characterIds,
        model_id: context.modelId,
        created_by: context.userId,
      })

    if (error) return { error: error.message }

    return {
      summary_id: summaryId,
      stored: true,
      canonical_state_changed: false,
      key_events: eventIds.length,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function isVossMemoryTool(name: string) {
  return (
    name === "search_campaign_memory" ||
    name === "read_campaign_timeline" ||
    name === "remember_campaign_fact" ||
    name === "save_campaign_summary"
  )
}

export function isVossMemoryWriteTool(name: string) {
  return name === "remember_campaign_fact" || name === "save_campaign_summary"
}

export async function executeVossMemoryTool(
  context: VossMemoryToolContext,
  name: string,
  args: JsonObject,
) {
  if (name === "search_campaign_memory") {
    return searchCampaignMemory(context, args)
  }
  if (name === "read_campaign_timeline") {
    return readCampaignTimeline(context, args)
  }
  if (name === "remember_campaign_fact") {
    return rememberCampaignFact(context, args)
  }
  if (name === "save_campaign_summary") {
    return saveCampaignSummary(context, args)
  }
  return { error: "Unknown memory tool" }
}
