import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

import { executeVossManagerTool } from "./manager-tools.ts"
import type { RouterModel } from "./model-router.ts"
import { ProviderGatewayError, requestChatCompletion } from "./provider-gateway.ts"
import { executeVossQuestTool } from "./quest-tools.ts"

type JsonRecord = Record<string, unknown>

type MaintenanceJob = {
  id: string
  requested_by: string
  input: JsonRecord
}

type MaintenanceAnalysis = {
  summaryTitle: string
  summary: string
  facts: JsonRecord[]
  ownerActions: JsonRecord[]
}

const WORKER_MODEL_KEY = "deepseek-v4.1-flash"
const MAX_OWNER_ACTIONS = 12
const OWNER_TOOL_WHITELIST = new Set([
  "move_character_world",
  "set_world_discovery",
  "update_world_npc",
  "set_faction_membership",
  "set_character_faction_reputation",
  "set_character_life_state",
  "set_location_secret_state",
  "resolve_quest_condition",
  "run_quest_resolver",
])

const WORKER_SYSTEM = [
  "Ты служебный world-maintenance worker MEGANOT. Ты НЕ ведущий и не пишешь художественный ответ игрокам.",
  "Твоя задача: сверить ровно один 45-message диапазон игрового чата с текущим каноническим состоянием и вернуть только структурированный JSON.",
  "Player message сам по себе НЕ доказывает, что заявленное действие удалось или мир изменился.",
  "Подтверждённым evidence считается narration/GM message, NPC message или gameplay event card. Для owner_action обязательно укажи evidence_message_ids, среди которых есть хотя бы одно такое подтверждение.",
  "Не создавай новые NPC, локации, предметы, фракции или квесты из одного лишь упоминания. Не переписывай художественный текст в канон.",
  "owner_actions используй только для уже однозначно подтверждённых устойчивых изменений, которые ещё не отражены в current_state.",
  "Разрешённые owner tools: move_character_world, set_world_discovery, update_world_npc, set_faction_membership, set_character_faction_reputation, set_character_life_state, set_location_secret_state, resolve_quest_condition, run_quest_resolver.",
  "Для update_world_npc меняй только поля, прямо подтверждённые окном: location_id, relationship или profile. Не переписывай имя, bio, stats, avatar.",
  "Факты memory_facts тоже должны иметь evidence_message_ids и не должны превращать неподтверждённое заявление PC в факт.",
  "Summary может описывать попытки игроков, но чётко отличай намерение от подтверждённого результата.",
  "Верни только JSON без markdown: {summary_title:string, summary:string, memory_facts:[{fact_key,subject_type,subject_id,predicate,statement,confidence,evidence_message_ids:string[]}], owner_actions:[{tool,args,evidence_message_ids:string[],confidence:number,reason:string}]}",
].join("\n")

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function text(value: unknown, max = 6000) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function ids(value: unknown, max = 60) {
  if (!Array.isArray(value)) return [] as string[]
  return [...new Set(
    value
      .filter((item): item is string | number =>
        typeof item === "string" || typeof item === "number"
      )
      .map((item) => String(item).trim())
      .filter(Boolean),
  )].slice(0, max)
}

function confidence(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0
}

function providerText(payload: any) {
  const direct = payload?.choices?.[0]?.message?.content
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  return ""
}

function parseJsonObject(value: string): JsonRecord | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
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
  return null
}

async function fixedWorkerModel(admin: SupabaseClient): Promise<RouterModel> {
  const { data, error } = await admin
    .from("ai_models")
    .select("id,provider_key,model_key,display_name,enabled,is_base,gm_selectable,user_selectable,supports_tools,supports_json,supports_streaming,supports_vision,model_kind,access_scope,context_window,cost_tier,reasoning_tier,latency_tier")
    .eq("model_key", WORKER_MODEL_KEY)
    .eq("enabled", true)
    .eq("model_kind", "agent")
    .eq("access_scope", "campaign")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("world_worker_model_missing")
  return data as RouterModel
}

async function claimMaintenanceJob(
  admin: SupabaseClient,
  campaignId: string,
  roomId: string,
): Promise<MaintenanceJob | null> {
  const { data: queued, error: findError } = await admin
    .from("agent_jobs")
    .select("id,requested_by,input")
    .eq("campaign_id", campaignId)
    .eq("agent_key", "world-worker")
    .eq("job_type", "world_maintenance")
    .eq("status", "queued")
    .eq("input->>maintenance_room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (findError) throw new Error(findError.message)
  if (!queued?.id) return null

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("agent_jobs")
    .update({
      status: "running",
      started_at: now,
      updated_at: now,
    })
    .eq("id", queued.id)
    .eq("status", "queued")
    .select("id,requested_by,input")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.id) return null

  return {
    id: data.id,
    requested_by: data.requested_by,
    input: record(data.input),
  }
}

async function failMaintenanceJob(
  admin: SupabaseClient,
  jobId: string,
  error: unknown,
) {
  const gateway = error instanceof ProviderGatewayError ? error : null
  const message = error instanceof Error ? error.message : String(error)
  await admin
    .from("agent_jobs")
    .update({
      status: "failed",
      error_code: gateway?.code || "world_maintenance_failed",
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
}

async function loadMaintenanceSnapshot(
  admin: SupabaseClient,
  campaignId: string,
  job: MaintenanceJob,
) {
  const roomId = text(job.input.maintenance_room_id, 100)
  const rangeStart = Number(job.input.range_start_message_id || 0)
  const rangeEnd = Number(job.input.range_end_message_id || 0)

  if (
    !roomId ||
    !Number.isInteger(rangeStart) ||
    !Number.isInteger(rangeEnd) ||
    rangeStart <= 0 ||
    rangeEnd < rangeStart
  ) {
    throw new Error("world_maintenance_input_invalid")
  }

  const [roomResult, messagesResult, campaignCharactersResult] =
    await Promise.all([
      admin
        .from("chat_rooms")
        .select("id,title,location_id,campaign_day,day_period,scene_state,room_state")
        .eq("campaign_id", campaignId)
        .eq("id", roomId)
        .maybeSingle(),
      admin
        .from("chat_messages")
        .select("id,author_name,body,user_id,character_id,event_kind,event_payload,attachment_kind,created_at")
        .eq("room_id", roomId)
        .lte("id", rangeEnd)
        .order("id", { ascending: false })
        .limit(50),
      admin
        .from("characters")
        .select("id,name,character_type,life_state,character_class,level,publication_state")
        .eq("campaign_id", campaignId)
        .eq("publication_state", "campaign"),
    ])

  const initialError =
    roomResult.error || messagesResult.error || campaignCharactersResult.error
  if (initialError) throw new Error(initialError.message)
  if (!roomResult.data) throw new Error("world_maintenance_room_missing")

  const recentMessages = records(messagesResult.data).reverse()
  const targetMessages = recentMessages.filter((message) => {
    const id = Number(message.id || 0)
    return id >= rangeStart && id <= rangeEnd
  })

  if (targetMessages.length !== 45) {
    throw new Error(
      "world_maintenance_window_size_invalid:" + targetMessages.length,
    )
  }

  const messageIds = recentMessages.map((message) => String(message.id))
  const eventsResult = await admin
    .from("campaign_events")
    .select("id,event_type,source_kind,source_id,room_id,location_id,actor_character_id,participant_character_ids,summary,payload,importance,confidence,occurred_at")
    .eq("campaign_id", campaignId)
    .eq("source_kind", "chat_message")
    .in("source_id", messageIds)

  if (eventsResult.error) throw new Error(eventsResult.error.message)

  const characters = records(campaignCharactersResult.data)
  const characterById = new Map(
    characters.map((character) => [String(character.id), character]),
  )

  const relevantCharacterIds = [...new Set(
    recentMessages
      .map((message) => text(message.character_id, 100))
      .filter(Boolean),
  )]

  const [
    worldResult,
    relationshipsResult,
    factionMembershipsResult,
    factionReputationsResult,
    questLinksResult,
  ] = await Promise.all([
    admin
      .from("character_world_state")
      .select("character_id,location_id,campaign_day,day_period,updated_at")
      .eq("campaign_id", campaignId)
      .in("character_id", relevantCharacterIds.length ? relevantCharacterIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("character_relationships")
      .select("id,subject_character_id,target_character_id,relationship_kind,public_label,attitude_score,gm_note,state,updated_at")
      .eq("campaign_id", campaignId)
      .eq("state", "active")
      .or(
        relevantCharacterIds.length
          ? "subject_character_id.in.(" + relevantCharacterIds.join(",") + "),target_character_id.in.(" + relevantCharacterIds.join(",") + ")"
          : "id.is.null",
      )
      .limit(120),
    admin
      .from("faction_memberships")
      .select("id,faction_id,character_id,membership_role,rank_label,is_primary,state")
      .eq("campaign_id", campaignId)
      .eq("state", "active")
      .in("character_id", relevantCharacterIds.length ? relevantCharacterIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(80),
    admin
      .from("character_faction_reputations")
      .select("id,faction_id,character_id,standing_kind,public_label,reputation_score,gm_note,state")
      .eq("campaign_id", campaignId)
      .eq("state", "active")
      .in("character_id", relevantCharacterIds.length ? relevantCharacterIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(80),
    admin
      .from("quest_characters")
      .select("quest_id,character_id,role")
      .in("character_id", relevantCharacterIds.length ? relevantCharacterIds : ["00000000-0000-0000-0000-000000000000"]),
  ])

  const stateError =
    worldResult.error ||
    relationshipsResult.error ||
    factionMembershipsResult.error ||
    factionReputationsResult.error ||
    questLinksResult.error
  if (stateError) throw new Error(stateError.message)

  const questIds = [...new Set(
    records(questLinksResult.data)
      .map((row) => text(row.quest_id, 100))
      .filter(Boolean),
  )]

  let quests: JsonRecord[] = []
  let questStages: JsonRecord[] = []
  let questGroups: JsonRecord[] = []
  let questConditions: JsonRecord[] = []
  let questStates: JsonRecord[] = []

  if (questIds.length) {
    const [questsResult, stagesResult] = await Promise.all([
      admin
        .from("quests")
        .select("id,quest_key,title,status,player_brief,activated_at,updated_at")
        .eq("campaign_id", campaignId)
        .in("id", questIds),
      admin
        .from("quest_stages")
        .select("id,quest_id,stage_key,position,status,player_title,completed_at")
        .in("quest_id", questIds),
    ])
    if (questsResult.error || stagesResult.error) {
      throw new Error((questsResult.error || stagesResult.error)!.message)
    }
    quests = records(questsResult.data)
    questStages = records(stagesResult.data)

    const activeStageIds = questStages
      .filter((stage) => stage.status === "active")
      .map((stage) => text(stage.id, 100))
      .filter(Boolean)

    if (activeStageIds.length) {
      const groupsResult = await admin
        .from("quest_condition_groups")
        .select("id,stage_id,group_key,mode,position")
        .in("stage_id", activeStageIds)
      if (groupsResult.error) throw new Error(groupsResult.error.message)
      questGroups = records(groupsResult.data)

      const groupIds = questGroups
        .map((group) => text(group.id, 100))
        .filter(Boolean)
      if (groupIds.length) {
        const conditionsResult = await admin
          .from("quest_conditions")
          .select("id,group_id,condition_key,condition_type,target_id,required_quantity,negated,params,position")
          .in("group_id", groupIds)
        if (conditionsResult.error) throw new Error(conditionsResult.error.message)
        questConditions = records(conditionsResult.data)

        const conditionIds = questConditions
          .map((condition) => text(condition.id, 100))
          .filter(Boolean)
        if (conditionIds.length) {
          const statesResult = await admin
            .from("quest_condition_states")
            .select("condition_id,satisfied,resolution_source,evidence,last_evaluated_at")
            .in("condition_id", conditionIds)
          if (statesResult.error) throw new Error(statesResult.error.message)
          questStates = records(statesResult.data)
        }
      }
    }
  }

  const events = records(eventsResult.data)
  const eventByMessage = new Map(
    events.map((event) => [String(event.source_id), event]),
  )

  const enrichedMessages = recentMessages.map((message) => ({
    ...message,
    character: message.character_id
      ? characterById.get(String(message.character_id)) || null
      : null,
    campaign_event: eventByMessage.get(String(message.id)) || null,
    in_target_45:
      Number(message.id || 0) >= rangeStart &&
      Number(message.id || 0) <= rangeEnd,
  }))

  const canonicalEvidenceIds = new Set(
    targetMessages
      .filter((message) => {
        if (text(message.event_kind, 80)) return true
        if (!message.character_id) return true
        const character = characterById.get(String(message.character_id))
        return character?.character_type === "npc"
      })
      .map((message) => String(message.id)),
  )

  return {
    roomId,
    rangeStart,
    rangeEnd,
    room: roomResult.data,
    recentMessages: enrichedMessages,
    targetMessages,
    campaignEvents: events,
    canonicalEvidenceIds,
    currentState: {
      characters: relevantCharacterIds
        .map((id) => characterById.get(id))
        .filter(Boolean),
      world: records(worldResult.data),
      relationships: records(relationshipsResult.data),
      faction_memberships: records(factionMembershipsResult.data),
      faction_reputations: records(factionReputationsResult.data),
      quests,
      quest_stages: questStages,
      quest_condition_groups: questGroups,
      quest_conditions: questConditions,
      quest_condition_states: questStates,
    },
  }
}

function promptSnapshot(snapshot: Awaited<ReturnType<typeof loadMaintenanceSnapshot>>) {
  return JSON.stringify({
    maintenance_window: {
      room_id: snapshot.roomId,
      range_start_message_id: snapshot.rangeStart,
      range_end_message_id: snapshot.rangeEnd,
      exact_message_count: 45,
    },
    room: snapshot.room,
    last_50_chat_messages: snapshot.recentMessages,
    campaign_events_for_last_50_messages: snapshot.campaignEvents,
    current_state: snapshot.currentState,
  })
}

function parseAnalysis(raw: string): MaintenanceAnalysis {
  const parsed = parseJsonObject(raw)
  if (!parsed) throw new Error("world_worker_invalid_json")

  return {
    summaryTitle: text(parsed.summary_title, 240) || "Сверка игровой сцены",
    summary: text(parsed.summary, 16000),
    facts: records(parsed.memory_facts).slice(0, 24),
    ownerActions: records(parsed.owner_actions).slice(0, MAX_OWNER_ACTIONS),
  }
}

function evidenceIsCanonical(
  evidenceMessageIds: string[],
  snapshot: Awaited<ReturnType<typeof loadMaintenanceSnapshot>>,
) {
  if (!evidenceMessageIds.length) return false
  const allowedRange = new Set(
    snapshot.targetMessages.map((message) => String(message.id)),
  )
  if (evidenceMessageIds.some((id) => !allowedRange.has(id))) return false
  return evidenceMessageIds.some((id) =>
    snapshot.canonicalEvidenceIds.has(id)
  )
}

function sourceEventIds(
  evidenceMessageIds: string[],
  snapshot: Awaited<ReturnType<typeof loadMaintenanceSnapshot>>,
) {
  const byMessage = new Map(
    snapshot.campaignEvents.map((event) => [
      String(event.source_id),
      String(event.id),
    ]),
  )
  return evidenceMessageIds
    .map((id) => byMessage.get(id))
    .filter((id): id is string => Boolean(id))
}

function sanitizeOwnerArgs(tool: string, raw: JsonRecord): JsonRecord {
  if (tool !== "update_world_npc") return raw

  const output: JsonRecord = {}
  const characterId = text(raw.character_id, 100)
  if (characterId) output.character_id = characterId
  const locationId = text(raw.location_id, 100)
  if (locationId) output.location_id = locationId

  const relationship = record(raw.relationship)
  if (Object.keys(relationship).length) output.relationship = relationship
  const profile = record(raw.profile)
  if (Object.keys(profile).length) output.profile = profile

  return output
}

async function executeOwnerActions(
  admin: SupabaseClient,
  campaignId: string,
  managerUserId: string,
  actions: JsonRecord[],
  snapshot: Awaited<ReturnType<typeof loadMaintenanceSnapshot>>,
) {
  const results: JsonRecord[] = []

  for (const action of actions) {
    const tool = text(action.tool, 120)
    const actionConfidence = confidence(action.confidence)
    const evidenceMessageIds = ids(action.evidence_message_ids, 45)

    if (
      !OWNER_TOOL_WHITELIST.has(tool) ||
      actionConfidence < 0.9 ||
      !evidenceIsCanonical(evidenceMessageIds, snapshot)
    ) {
      results.push({
        tool,
        applied: false,
        reason: "worker_action_rejected_by_evidence_guard",
        evidence_message_ids: evidenceMessageIds,
      })
      continue
    }

    const args = sanitizeOwnerArgs(tool, record(action.args))
    let result: unknown

    if (tool === "resolve_quest_condition" || tool === "run_quest_resolver") {
      result = await executeVossQuestTool(
        {
          client: admin,
          campaignId,
          userId: managerUserId,
          authority: "admin",
        },
        tool,
        args,
      )
    } else {
      result = await executeVossManagerTool(
        {
          client: admin,
          admin,
          campaignId,
          userId: managerUserId,
          authority: "admin",
        },
        tool,
        args,
      )
    }

    const resultRecord = record(result)
    results.push({
      tool,
      applied:
        typeof resultRecord.error !== "string" &&
        resultRecord.not_found !== true,
      evidence_message_ids: evidenceMessageIds,
      confidence: actionConfidence,
      reason: text(action.reason, 600),
      result: resultRecord,
    })
  }

  return results
}

async function saveMaintenanceMemory(
  admin: SupabaseClient,
  campaignId: string,
  managerUserId: string,
  jobId: string,
  model: RouterModel,
  analysis: MaintenanceAnalysis,
  snapshot: Awaited<ReturnType<typeof loadMaintenanceSnapshot>>,
) {
  const allEventIds = snapshot.targetMessages
    .map((message) => String(message.id))
    .map((messageId) => {
      const event = snapshot.campaignEvents.find(
        (candidate) => String(candidate.source_id) === messageId,
      )
      return event ? String(event.id) : null
    })
    .filter((id): id is string => Boolean(id))

  const firstMessage = snapshot.targetMessages[0]
  const lastMessage = snapshot.targetMessages[snapshot.targetMessages.length - 1]

  const existingSummary = await admin
    .from("campaign_memory_summaries")
    .select("id")
    .eq("maintenance_job_id", jobId)
    .maybeSingle()

  if (existingSummary.error) throw new Error(existingSummary.error.message)

  const summaryInsert = existingSummary.data?.id
    ? { data: existingSummary.data, error: null }
    : await admin
      .from("campaign_memory_summaries")
      .insert({
      campaign_id: campaignId,
      title: analysis.summaryTitle,
      summary: analysis.summary || "Окно обработано без устойчивых изменений.",
      period_start: firstMessage?.created_at || null,
      period_end: lastMessage?.created_at || null,
      key_event_ids: allEventIds,
      visibility: "gm",
      room_id: snapshot.roomId,
      visible_user_ids: [],
      visible_character_ids: [],
      model_id: model.id,
      created_by: managerUserId,
      status: "active",
      maintenance_job_id: jobId,
    })
      .select("id")
      .single()

  if (summaryInsert.error) throw new Error(summaryInsert.error.message)

  const factRows = analysis.facts.flatMap((fact, factIndex) => {
    const evidenceMessageIds = ids(fact.evidence_message_ids, 45)
    if (
      confidence(fact.confidence) < 0.75 ||
      !evidenceIsCanonical(evidenceMessageIds, snapshot)
    ) {
      return []
    }

    const eventIds = sourceEventIds(evidenceMessageIds, snapshot)
    if (!eventIds.length) return []

    const statement = text(fact.statement, 6000)
    if (!statement) return []

    return [{
      campaign_id: campaignId,
      fact_key: text(fact.fact_key, 180) || null,
      subject_type: text(fact.subject_type, 80) || null,
      subject_id: text(fact.subject_id, 180) || null,
      predicate: text(fact.predicate, 120) || null,
      statement,
      structured_value: {
        maintenance_room_id: snapshot.roomId,
        range_start_message_id: snapshot.rangeStart,
        range_end_message_id: snapshot.rangeEnd,
        evidence_message_ids: evidenceMessageIds,
      },
      status: "active",
      confidence: confidence(fact.confidence),
      source_event_ids: eventIds,
      visibility: "gm",
      room_id: snapshot.roomId,
      visible_user_ids: [],
      visible_character_ids: [],
      provenance: {
        kind: "world_maintenance_v1",
        worker_model_key: model.model_key,
        range_start_message_id: snapshot.rangeStart,
        range_end_message_id: snapshot.rangeEnd,
        campaign_day: snapshot.room.campaign_day ?? null,
        day_period: snapshot.room.day_period ?? null,
      },
      created_by: managerUserId,
      maintenance_job_id: jobId,
      maintenance_fact_index: factIndex,
    }]
  })

  let factIds: string[] = []
  if (factRows.length) {
    const existingFacts = await admin
      .from("campaign_memory_facts")
      .select("id,maintenance_fact_index")
      .eq("maintenance_job_id", jobId)

    if (existingFacts.error) throw new Error(existingFacts.error.message)

    const existingRows = records(existingFacts.data)
    const existingIndexes = new Set(
      existingRows.map((row) => Number(row.maintenance_fact_index)),
    )
    const missingRows = factRows.filter(
      (row) => !existingIndexes.has(Number(row.maintenance_fact_index)),
    )

    factIds = existingRows.map((row) => String(row.id))

    if (missingRows.length) {
      const factsInsert = await admin
        .from("campaign_memory_facts")
        .insert(missingRows)
        .select("id")

      if (factsInsert.error) throw new Error(factsInsert.error.message)
      factIds.push(
        ...records(factsInsert.data).map((row) => String(row.id)),
      )
    }
  }

  return {
    summary_id: String(summaryInsert.data.id),
    fact_ids: factIds,
  }
}

async function processMaintenanceJob(
  admin: SupabaseClient,
  campaignId: string,
  job: MaintenanceJob,
) {
  const snapshot = await loadMaintenanceSnapshot(admin, campaignId, job)
  const model = await fixedWorkerModel(admin)

  const payload = await requestChatCompletion({
    model,
    messages: [
      { role: "system", content: WORKER_SYSTEM },
      {
        role: "user",
        content:
          "Сверь окно и верни только JSON по контракту.\n" +
          promptSnapshot(snapshot),
      },
    ],
    temperature: 0.15,
    disableReasoningEffort: false,
    timeoutMs: 85_000,
    retryCount: 1,
  })

  const raw = providerText(payload)
  if (!raw) throw new Error("world_worker_empty_answer")
  const analysis = parseAnalysis(raw)

  const ownerResults = await executeOwnerActions(
    admin,
    campaignId,
    job.requested_by,
    analysis.ownerActions,
    snapshot,
  )
  const memory = await saveMaintenanceMemory(
    admin,
    campaignId,
    job.requested_by,
    job.id,
    model,
    analysis,
    snapshot,
  )

  const completeResult = await admin.rpc(
    "complete_ai_gm_room_maintenance_v1",
    {
      p_job_id: job.id,
      p_result: {
        surface: "world_maintenance_v1",
        worker_model_id: model.id,
        worker_model_key: model.model_key,
        range_start_message_id: snapshot.rangeStart,
        range_end_message_id: snapshot.rangeEnd,
        context_message_count: snapshot.recentMessages.length,
        summary_id: memory.summary_id,
        fact_ids: memory.fact_ids,
        owner_actions: ownerResults,
      },
    },
  )

  if (completeResult.error) throw new Error(completeResult.error.message)
  return completeResult.data
}

export async function runPendingWorldMaintenanceForRoom(
  admin: SupabaseClient,
  campaignId: string,
  roomId: string,
) {
  const reserve = await admin.rpc("reserve_ai_gm_room_maintenance_v1", {
    p_room_id: roomId,
  })
  if (reserve.error) throw new Error(reserve.error.message)

  const job = await claimMaintenanceJob(admin, campaignId, roomId)
  if (!job) return { processed: false }

  try {
    const completion = await processMaintenanceJob(admin, campaignId, job)
    return {
      processed: true,
      jobId: job.id,
      completion,
    }
  } catch (error) {
    await failMaintenanceJob(admin, job.id, error)
    throw error
  }
}
