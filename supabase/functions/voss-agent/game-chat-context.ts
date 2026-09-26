import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

import {
  applyLocationTemporalOverlay,
  effectiveNpcTemporalState,
  eventVisibleAtGameDay,
  gameTimeFromEvent,
  withGameAge,
} from "./temporal-overlay.ts"

type JsonRecord = Record<string, unknown>

export type Stage2GameChatContext = {
  room: JsonRecord
  sourceCharacter: JsonRecord
  sourceLocation: JsonRecord | null
  sourceLocationChildren: JsonRecord[]
  sourceLocationTransitions: JsonRecord[]
  currentGameTime: {
    campaignDay: number | null
    dayPeriod: string | null
    campaignMinute: number | null
  }
  sourceAudience: {
    scope: "scene" | "direct_pc"
    recipientCharacterIds: string[]
  }
  players: JsonRecord[]
  presentCharacters: JsonRecord[]
  sheets: JsonRecord[]
  resourceStates: JsonRecord[]
  inventoryItems: JsonRecord[]
  inventoryRoom: JsonRecord
  inventoryChargeItems: JsonRecord[]
  npcProfiles: JsonRecord[]
  npcIdentities: JsonRecord[]
  npcRuntime: JsonRecord[]
  gmBehaviorProfile: JsonRecord
  directorPreferences: JsonRecord
  contentProfile: JsonRecord
  sceneActors: JsonRecord[]
  relationships: JsonRecord[]
  assets: JsonRecord[]
  factionMemberships: JsonRecord[]
  factionReputations: JsonRecord[]
  activeQuestContext: JsonRecord
  memory: {
    facts: JsonRecord[]
    summaries: JsonRecord[]
  }
  retrieval: JsonRecord
  background: JsonRecord
  temporalSync: JsonRecord
  recentMessages: JsonRecord[]
  contextMetrics: {
    eligibleMessageCount: number
    projectedMessageCount: number
    recentMessageJsonBytes: number
  }
  sourceKnowledge: {
    knownLocations: JsonRecord[]
    knownNpcs: JsonRecord[]
    knownMemoryFacts: JsonRecord[]
  }
  mentionedPlayerCharacters: Array<{ id: string; name: string }>
}

const CHAT_CONTEXT_LIMIT = 50
const MAX_RECENT_MESSAGE_JSON_BYTES = 48_000
const MAX_PROMPT_CONTEXT_JSON_BYTES = 160_000
const MAX_MEMORY_FACTS = 24
const MAX_MEMORY_SUMMARIES = 8

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function nullableNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function optionalNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function lower(value: unknown) {
  return typeof value === "string"
    ? value.toLocaleLowerCase("ru-RU")
    : ""
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}


function boundedText(value: unknown, max = 1200) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max - 1).trimEnd() + "…"
}

function numberArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
        .slice(0, limit)
    : []
}

function compactMechanicalEvent(
  eventKind: string,
  payloadValue: unknown,
) {
  const payload = record(payloadValue)
  const effect = record(payload.effect)
  const label =
    boundedText(payload.label, 240) ||
    boundedText(payload.name, 240) ||
    boundedText(payload.title, 240)
  const detail =
    boundedText(payload.detail, 500) ||
    boundedText(payload.description, 500)
  const d20 =
    optionalNumber(payload.d20) ??
    optionalNumber(payload.d20Raw)
  const total =
    optionalNumber(payload.total) ??
    optionalNumber(effect.total)
  const modifier =
    optionalNumber(payload.modifier) ??
    optionalNumber(effect.modifier)
  const rolls = numberArray(effect.rolls)
  const diceCount = optionalNumber(effect.count)
  const diceSides = optionalNumber(effect.sides)
  const outcome =
    boundedText(payload.outcome_class, 80) ||
    boundedText(payload.outcomeClass, 80) ||
    boundedText(payload.outcome, 80) ||
    (
      typeof payload.success === "boolean"
        ? payload.success ? "success" : "failure"
        : null
    )
  const dcVisibility =
    boundedText(payload.dc_visibility, 32) ||
    boundedText(payload.dcVisibility, 32)
  const publicDc =
    dcVisibility === "public"
      ? optionalNumber(payload.dc) ??
        optionalNumber(payload.target_dc) ??
        optionalNumber(payload.targetDc)
      : null

  return {
    kind: eventKind,
    ...(label ? { label } : {}),
    ...(detail ? { detail } : {}),
    ...(d20 !== null ? { d20 } : {}),
    ...(modifier !== null ? { modifier } : {}),
    ...(total !== null ? { total } : {}),
    ...(rolls.length ? { rolls } : {}),
    ...(diceCount !== null ? { dice_count: diceCount } : {}),
    ...(diceSides !== null ? { dice_sides: diceSides } : {}),
    ...(outcome ? { outcome } : {}),
    ...(publicDc !== null ? { public_dc: publicDc } : {}),
  }
}

export function projectStage19ChatMessage(
  message: JsonRecord,
  currentDay: number | null,
): JsonRecord {
  const eventKind = nullableString(message.event_kind)
  const campaignDay = optionalNumber(message.campaign_day)
  const mechanic = eventKind
    ? compactMechanicalEvent(eventKind, message.event_payload)
    : null
  const body = boundedText(message.body, 4000)
  const payload = record(message.event_payload)
  const playerTurnPlan = record(payload.player_turn_plan)
  const projectedTurnPlan = nullableString(playerTurnPlan.draft_id)
    ? {
        draft_id: nullableString(playerTurnPlan.draft_id),
        turn_command_id: nullableString(playerTurnPlan.turn_command_id),
        execution_state: nullableString(playerTurnPlan.execution_state),
        execution_cursor: optionalNumber(playerTurnPlan.execution_cursor) || 0,
        entries: rows(playerTurnPlan.entries).slice(0, 64).map((entry) => ({
          command_id: nullableString(entry.command_id),
          kind: nullableString(entry.kind),
          label: boundedText(entry.label, 240),
          economy: nullableString(entry.economy),
          description: boundedText(entry.description, 1000),
          trigger_condition: boundedText(entry.trigger_condition, 600),
        })),
        executed_message_ids: Array.isArray(playerTurnPlan.executed_message_ids)
          ? playerTurnPlan.executed_message_ids.slice(0, 80)
          : [],
        executed_reaction_command_ids:
          strings(playerTurnPlan.executed_reaction_command_ids).slice(0, 8),
        interruption_reason: boundedText(
          playerTurnPlan.interruption_reason,
          600,
        ),
      }
    : null

  return {
    id: message.id,
    author_name: boundedText(message.author_name, 160) || "Персонаж",
    character_id: nullableString(message.character_id),
    ...(body ? { body } : {}),
    ...(mechanic ? { mechanic } : {}),
    ...(projectedTurnPlan ? { player_turn_plan: projectedTurnPlan } : {}),
    ...(message.attachment_kind === "image" ? { attachment: "image" } : {}),
    audience_scope:
      nullableString(message.audience_scope) === "direct_pc"
        ? "direct_pc"
        : "scene",
    recipient_character_ids: strings(message.recipient_character_ids).slice(0, 16),
    campaign_day: campaignDay,
    day_period: nullableString(message.day_period),
    game_age_days:
      currentDay !== null &&
      campaignDay !== null &&
      campaignDay <= currentDay
        ? currentDay - campaignDay
        : null,
    source_location_id: nullableString(message.source_location_id),
    created_at: nullableString(message.created_at),
  }
}

function projectStage19RecentMessages(
  messages: JsonRecord[],
  currentDay: number | null,
) {
  const projected = messages
    .map((message) => projectStage19ChatMessage(message, currentDay))
    .slice(-CHAT_CONTEXT_LIMIT)

  const selectedNewestFirst: JsonRecord[] = []
  let usedBytes = 2

  for (let index = projected.length - 1; index >= 0; index -= 1) {
    const message = projected[index]
    const messageBytes =
      new TextEncoder().encode(JSON.stringify(message)).length + 1

    if (
      selectedNewestFirst.length > 0 &&
      usedBytes + messageBytes > MAX_RECENT_MESSAGE_JSON_BYTES
    ) {
      break
    }

    selectedNewestFirst.push(message)
    usedBytes += messageBytes
  }

  return selectedNewestFirst.reverse()
}


function compactNpcIdentities(rowsValue: JsonRecord[]) {
  return rowsValue.map((item) => {
    const core = record(item.core)
    return {
      character_id: item.character_id,
      version: item.version,
      bootstrap_state: item.bootstrap_state,
      fingerprint_hash: item.fingerprint_hash,
      core: {
        traits: strings(core.traits).slice(0, 12),
        weighted_values: rows(core.weighted_values).slice(0, 12),
        red_lines: rows(core.red_lines).slice(0, 12),
        long_term_desires: strings(core.long_term_desires).slice(0, 12),
        fears: strings(core.fears).slice(0, 12),
        loyalties: strings(core.loyalties).slice(0, 12),
        authority_attitude: record(core.authority_attitude),
        risk_tolerance: core.risk_tolerance ?? null,
        violence_threshold: core.violence_threshold ?? null,
        pressure_behavior: strings(core.pressure_behavior).slice(0, 12),
        self_image: boundedText(core.self_image, 1200) || "",
        social_style: strings(core.social_style).slice(0, 12),
        decision_priorities: strings(core.decision_priorities).slice(0, 12),
      },
      last_major_event_id: item.last_major_event_id || null,
    }
  })
}

function compactNpcRuntime(rowsValue: JsonRecord[]) {
  return rowsValue.map((item) => ({
    character_id: item.character_id,
    status: item.status,
    bestiary_slug: item.bestiary_slug,
    resources: rows(item.resources).map((resource) => ({
      state_key: resource.state_key,
      current: resource.current,
      max: resource.max,
      label: resource.label,
      recharge: resource.recharge,
    })).slice(0, 24),
    actions: rows(item.actions).map((action) => {
      const runtime = record(action.runtime)
      const resource = record(action.resource)
      return {
        mechanic_key: action.stable_key,
        label: action.label,
        economy: action.economy,
        kind: runtime.kind,
        save_ability: runtime.saveAbility || null,
        resource_key: resource.key || null,
      }
    }).slice(0, 24),
    special_abilities: rows(item.special_abilities).map((ability) => ({
      label: ability.label || ability.name || null,
      kind: ability.kind || ability.type || null,
      description: boundedText(ability.description, 700),
    })).slice(0, 12),
  }))
}

function compactBackground(backgroundValue: JsonRecord) {
  const background = record(backgroundValue)
  const compactSnapshot = (value: unknown) => {
    const snapshot = record(value)
    const state = record(snapshot.state)
    const overlay = record(state.temporal_overlay)
    return snapshot.id
      ? {
          id: snapshot.id,
          through_game_day: snapshot.through_game_day,
          version: snapshot.version,
          summary: boundedText(snapshot.summary, 900),
          temporal_overlay: {
            location_id: overlay.location_id || null,
            life_state: overlay.life_state || null,
            lifecycle_state: overlay.lifecycle_state || null,
            status: overlay.status || null,
          },
        }
      : null
  }

  return {
    enabled: background.enabled === true,
    scene_day: background.scene_day ?? null,
    world_snapshot: compactSnapshot(background.world_snapshot),
    source_location_snapshot: compactSnapshot(background.source_location_snapshot),
    npc_snapshots: rows(background.npc_snapshots).map((row) => ({
      entity_id: row.entity_id,
      snapshot: compactSnapshot(row.snapshot),
    })).slice(0, 24),
    high_importance_events: rows(background.high_importance_events).map((event) => ({
      id: event.id,
      effective_game_day: event.effective_game_day,
      entity_scope: event.entity_scope,
      entity_id: event.entity_id,
      event_kind: event.event_kind,
      summary: boundedText(event.summary, 900),
      importance: event.importance,
    })).slice(0, 8),
  }
}

async function loadActiveQuestContext(
  admin: SupabaseClient,
  campaignId: string,
  characterId: string,
): Promise<JsonRecord> {
  const links = await admin
    .from("quest_characters")
    .select("quest_id,role")
    .eq("character_id", characterId)

  if (links.error) throw new Error(links.error.message)

  const questIds = unique(rows(links.data).map((row) => nullableString(row.quest_id)))
  if (!questIds.length) {
    return {
      character_id: characterId,
      campaign_id: campaignId,
      active_quests: [],
    }
  }

  const questsResult = await admin
    .from("quests")
    .select("id,quest_key,title,player_brief,status,sort_order,activated_at")
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .in("id", questIds)
    .order("sort_order", { ascending: true })
    .limit(12)

  if (questsResult.error) throw new Error(questsResult.error.message)

  const quests = rows(questsResult.data)
  const activeQuestIds = unique(quests.map((row) => nullableString(row.id)))
  if (!activeQuestIds.length) {
    return {
      character_id: characterId,
      campaign_id: campaignId,
      active_quests: [],
    }
  }

  const [secretResult, stageResult, targetResult] = await Promise.all([
    admin
      .from("quest_secrets")
      .select("quest_id,internal_summary,ai_directive")
      .in("quest_id", activeQuestIds)
      .limit(120),
    admin
      .from("quest_stages")
      .select("id,quest_id,stage_key,position,status,player_title,completion_text,completed_at")
      .in("quest_id", activeQuestIds)
      .in("status", ["active", "completed"])
      .order("position", { ascending: true })
      .limit(96),
    admin
      .from("quest_targets")
      .select("id,quest_id,stage_id,target_key,target_kind,placeholder_label,internal_note,binding_state,location_id,npc_character_id,item_definition_id")
      .in("quest_id", activeQuestIds)
      .limit(120),
  ])

  const firstError = secretResult.error || stageResult.error || targetResult.error
  if (firstError) throw new Error(firstError.message)

  const stages = rows(stageResult.data)
  const activeStages = stages.filter((stage) => stage.status === "active")
  const activeStageIds = unique(activeStages.map((stage) => nullableString(stage.id)))

  let stageSecrets: JsonRecord[] = []
  let groups: JsonRecord[] = []
  let conditions: JsonRecord[] = []
  let states: JsonRecord[] = []

  if (activeStageIds.length) {
    const [stageSecretsResult, groupsResult] = await Promise.all([
      admin
        .from("quest_stage_secrets")
        .select("stage_id,internal_title,objective,gm_notes")
        .in("stage_id", activeStageIds)
        .limit(96),
      admin
        .from("quest_condition_groups")
        .select("id,stage_id,group_key,mode,position")
        .in("stage_id", activeStageIds)
        .order("position", { ascending: true })
        .limit(96),
    ])

    if (stageSecretsResult.error) throw new Error(stageSecretsResult.error.message)
    if (groupsResult.error) throw new Error(groupsResult.error.message)

    stageSecrets = rows(stageSecretsResult.data)
    groups = rows(groupsResult.data)
    const groupIds = unique(groups.map((group) => nullableString(group.id)))

    if (groupIds.length) {
      const conditionsResult = await admin
        .from("quest_conditions")
        .select("id,group_id,condition_key,condition_type,target_id,required_quantity,negated,params,position")
        .in("group_id", groupIds)
        .order("position", { ascending: true })
        .limit(160)

      if (conditionsResult.error) throw new Error(conditionsResult.error.message)
      conditions = rows(conditionsResult.data)
      const conditionIds = unique(
        conditions.map((condition) => nullableString(condition.id)),
      )

      if (conditionIds.length) {
        const statesResult = await admin
          .from("quest_condition_states")
          .select("condition_id,satisfied,resolution_source,evidence,last_evaluated_at")
          .in("condition_id", conditionIds)
          .limit(160)

        if (statesResult.error) throw new Error(statesResult.error.message)
        states = rows(statesResult.data)
      }
    }
  }

  const secretsByQuest = new Map(
    rows(secretResult.data).map((item) => [String(item.quest_id), item]),
  )
  const stageSecretsByStage = new Map(
    stageSecrets.map((item) => [String(item.stage_id), item]),
  )
  const statesByCondition = new Map(
    states.map((item) => [String(item.condition_id), item]),
  )

  const targets = rows(targetResult.data)

  return {
    character_id: characterId,
    campaign_id: campaignId,
    active_quests: quests.map((quest) => {
      const questId = String(quest.id)
      const questSecret = secretsByQuest.get(questId) || {}
      const questStages = activeStages
        .filter((stage) => String(stage.quest_id) === questId)
        .map((stage) => {
          const stageId = String(stage.id)
          const secret = stageSecretsByStage.get(stageId) || {}
          const stageGroups = groups
            .filter((group) => String(group.stage_id) === stageId)
            .map((group) => {
              const groupId = String(group.id)
              return {
                id: group.id,
                key: group.group_key,
                mode: group.mode,
                conditions: conditions
                  .filter((condition) => String(condition.group_id) === groupId)
                  .map((condition) => ({
                    ...condition,
                    state: statesByCondition.get(String(condition.id)) || {
                      satisfied: false,
                      resolution_source: "pending",
                    },
                  })),
              }
            })

          return {
            ...stage,
            internal_title: secret.internal_title || "",
            objective: secret.objective || "",
            gm_notes: secret.gm_notes || "",
            targets: targets.filter((target) =>
              String(target.quest_id) === questId &&
              (!target.stage_id || String(target.stage_id) === stageId)
            ),
            condition_groups: stageGroups,
          }
        })

      const recentCompleted = stages
        .filter(
          (stage) =>
            String(stage.quest_id) === questId &&
            stage.status === "completed",
        )
        .sort((a, b) => Number(b.position || 0) - Number(a.position || 0))
        .slice(0, 8)

      return {
        ...quest,
        internal_summary: questSecret.internal_summary || "",
        ai_directive: questSecret.ai_directive || "",
        active_stages: questStages,
        recent_completed_stages: recentCompleted,
      }
    }),
  }
}

function memoryVisible(item: JsonRecord, roomId: string) {
  const visibility = nullableString(item.visibility) || "campaign"
  if (visibility === "room") return item.room_id === roomId
  if (visibility === "campaign" || visibility === "gm") return true

  // Player/user-scoped memories are intentionally not promoted into the
  // campaign-level GM context. This preserves the existing "Только я"
  // privacy boundary instead of letting a service-role read erase it.
  return false
}

function memoryRelevant(
  item: JsonRecord,
  roomId: string,
  relevantIds: Set<string>,
) {
  if (item.room_id === roomId) return true
  const subjectId = nullableString(item.subject_id)
  if (subjectId && relevantIds.has(subjectId)) return true
  if (!subjectId && !item.room_id) return true
  const visibleCharacters = strings(item.visible_character_ids)
  return visibleCharacters.some((id) => relevantIds.has(id))
}

export async function buildGameChatContextV2({
  admin,
  campaignId,
  jobInput,
}: {
  admin: SupabaseClient
  campaignId: string
  jobInput: JsonRecord
}): Promise<Stage2GameChatContext> {
  const roomId = nullableString(jobInput.room_id)
  const sourceCharacterId = nullableString(jobInput.source_character_id)
  const sourceMessageId =
    nullableNumber(jobInput.resume_chat_message_id) ??
    nullableNumber(jobInput.source_chat_message_id)

  if (!roomId || !sourceCharacterId || sourceMessageId === null) {
    throw new Error("ai_gm_stage2_context_input_invalid")
  }

  const [
    roomResult,
    charactersResult,
    worldStatesResult,
    roomMembersResult,
    locationDiscoveriesResult,
    npcDiscoveriesResult,
  ] = await Promise.all([
    admin
      .from("chat_rooms")
      .select("id,title,category,room_type,open_to_campaign,campaign_can_write,location_id,campaign_day,day_period,campaign_minute,scene_state,room_state")
      .eq("id", roomId)
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    admin
      .from("characters")
      .select("id,assigned_user_id,name,character_class,level,character_type,life_state,publication_state,bio")
      .eq("campaign_id", campaignId)
      .eq("publication_state", "campaign"),
    admin
      .from("character_world_state")
      .select("character_id,location_id,campaign_day,day_period,campaign_minute,updated_at")
      .eq("campaign_id", campaignId),
    admin
      .from("chat_room_members")
      .select("user_id,can_read,can_write")
      .eq("room_id", roomId),
    admin
      .from("character_location_discoveries")
      .select("location_id,discovered_at,source")
      .eq("character_id", sourceCharacterId),
    admin
      .from("character_npc_discoveries")
      .select("npc_character_id,discovered_at,source,source_message_id,last_interaction_at")
      .eq("character_id", sourceCharacterId),
  ])

  const firstError =
    roomResult.error ||
    charactersResult.error ||
    worldStatesResult.error ||
    roomMembersResult.error ||
    locationDiscoveriesResult.error ||
    npcDiscoveriesResult.error

  if (firstError) throw new Error(firstError.message)

  const room = record(roomResult.data)
  if (!room.id) throw new Error("ai_gm_stage2_room_not_found")

  const characters = rows(charactersResult.data)
  const sourceCharacter =
    characters.find((item) => item.id === sourceCharacterId) || null
  if (!sourceCharacter) throw new Error("ai_gm_stage2_source_character_not_found")

  let worldStates = rows(worldStatesResult.data)
  let worldByCharacter = new Map(
    worldStates.map((item) => [String(item.character_id), item]),
  )
  let sourceWorld = worldByCharacter.get(sourceCharacterId) || {}
  let sourceLocationId =
    nullableString(jobInput.source_location_id_snapshot) ||
    nullableString(sourceWorld.location_id) ||
    nullableString(room.location_id)
  let currentDay =
    nullableNumber(sourceWorld.campaign_day) ?? nullableNumber(room.campaign_day)
  let currentPeriod =
    nullableString(sourceWorld.day_period) || nullableString(room.day_period)
  let currentMinute =
    nullableNumber(sourceWorld.campaign_minute) ?? nullableNumber(room.campaign_minute)

  const syncResult = await admin.rpc("sync_colocated_player_time_v1", {
    p_campaign_id: campaignId,
    p_source_character_id: sourceCharacterId,
  })
  if (syncResult.error) throw new Error(syncResult.error.message)

  const temporalSync = record(syncResult.data)
  if (Number(temporalSync.synced_count || 0) > 0) {
    const refreshedWorldStates = await admin
      .from("character_world_state")
      .select("character_id,location_id,campaign_day,day_period,campaign_minute,updated_at")
      .eq("campaign_id", campaignId)

    if (refreshedWorldStates.error) {
      throw new Error(refreshedWorldStates.error.message)
    }

    worldStates = rows(refreshedWorldStates.data)
    worldByCharacter = new Map(
      worldStates.map((item) => [String(item.character_id), item]),
    )
    sourceWorld = worldByCharacter.get(sourceCharacterId) || {}
    sourceLocationId =
      nullableString(sourceWorld.location_id) ||
      nullableString(jobInput.source_location_id_snapshot) ||
      nullableString(room.location_id)
    currentDay =
      nullableNumber(sourceWorld.campaign_day) ?? nullableNumber(room.campaign_day)
    currentPeriod =
      nullableString(sourceWorld.day_period) || nullableString(room.day_period)
    currentMinute =
      nullableNumber(sourceWorld.campaign_minute) ?? nullableNumber(room.campaign_minute)
  }

  let recentCatchups: JsonRecord[] = []
  if (sourceLocationId && currentDay !== null) {
    const catchupsResult = await admin
      .from("ai_player_time_catchup_receipts")
      .select("id,location_id,character_id,source_character_id,from_day,from_period,to_day,to_period,from_minute,to_minute,catchup_kind,meaningful_actions,narrative_semantics,created_at")
      .eq("campaign_id", campaignId)
      .eq("location_id", sourceLocationId)
      .gte("to_day", Math.max(1, currentDay - 1))
      .order("created_at", { ascending: false })
      .limit(8)

    if (catchupsResult.error) throw new Error(catchupsResult.error.message)
    recentCatchups = rows(catchupsResult.data)
  }

  temporalSync.recent_catchups = recentCatchups

  const historyResult = await admin.rpc("read_ai_gm_recent_chat_context_v1", {
    p_campaign_id: campaignId,
    p_room_id: roomId,
    p_source_character_id: sourceCharacterId,
    p_source_message_id: sourceMessageId,
    p_source_location_id: sourceLocationId,
    p_current_day: currentDay,
    p_limit: CHAT_CONTEXT_LIMIT,
  })
  if (historyResult.error) throw new Error(historyResult.error.message)

  const historyEnvelope = record(historyResult.data)
  const sourceMessage = record(historyEnvelope.source_message)
  const sourceAudienceScope =
    nullableString(sourceMessage.audience_scope) === "direct_pc"
      ? "direct_pc"
      : "scene"
  const sourceAudience = {
    scope: sourceAudienceScope as "scene" | "direct_pc",
    recipientCharacterIds: strings(sourceMessage.recipient_character_ids),
  }
  const recentMessages = projectStage19RecentMessages(
    rows(historyEnvelope.messages),
    currentDay,
  )
  const contextMetrics = {
    eligibleMessageCount:
      Math.min(
        CHAT_CONTEXT_LIMIT,
        Math.max(0, Number(historyEnvelope.eligible_message_count || recentMessages.length)),
      ),
    projectedMessageCount: recentMessages.length,
    recentMessageJsonBytes:
      new TextEncoder().encode(JSON.stringify(recentMessages)).length,
  }

  const resolverQuery =
    nullableString(jobInput.original_message) ||
    boundedText(recentMessages[recentMessages.length - 1]?.body, 4000)

  const retrievalResult = await admin.rpc("resolve_ai_gm_context_v2", {
    p_campaign_id: campaignId,
    p_source_character_id: sourceCharacterId,
    p_room_id: roomId,
    p_query: resolverQuery || "",
    p_current_location_id: sourceLocationId,
    p_current_day: currentDay,
    p_fact_limit: MAX_MEMORY_FACTS,
    p_summary_limit: MAX_MEMORY_SUMMARIES,
    p_event_limit: 8,
    p_lore_limit: 8,
  })
  if (retrievalResult.error) throw new Error(retrievalResult.error.message)
  const retrieval = record(retrievalResult.data)

  const retrievalEntityRefs = [
    ...rows(retrieval.memory_facts).flatMap((item) => rows(item.entity_refs)),
    ...rows(retrieval.lore_entries).flatMap((item) => rows(item.entity_refs)),
  ]
  const retrievalCharacterIds = unique(
    retrievalEntityRefs
      .filter((ref) => ["character","pc","npc"].includes(String(ref.kind || "")))
      .map((ref) => nullableString(ref.id)),
  ).slice(0, 12)
  const retrievalLocationIds = unique(
    retrievalEntityRefs
      .filter((ref) => String(ref.kind || "") === "location")
      .map((ref) => nullableString(ref.id)),
  ).slice(0, 12)
  const retrievalFactionIds = unique(
    retrievalEntityRefs
      .filter((ref) => String(ref.kind || "") === "faction")
      .map((ref) => nullableString(ref.id)),
  ).slice(0, 12)
  const retrievalQuestIds = unique(
    retrievalEntityRefs
      .filter((ref) => String(ref.kind || "") === "quest")
      .map((ref) => nullableString(ref.id)),
  ).slice(0, 12)
  const retrievalQuestTargetIds = unique(
    retrievalEntityRefs
      .filter((ref) => String(ref.kind || "") === "quest_target")
      .map((ref) => nullableString(ref.id)),
  ).slice(0, 12)

  const discoveredLocationRows = rows(locationDiscoveriesResult.data)
  const discoveredNpcRows = rows(npcDiscoveriesResult.data)
  const discoveredLocationIds = unique(
    discoveredLocationRows.map((item) => nullableString(item.location_id)),
  )
  const discoveredNpcIds = unique(
    discoveredNpcRows.map((item) => nullableString(item.npc_character_id)),
  )

  const locationIds = unique(
    worldStates.map((item) => nullableString(item.location_id))
      .concat(sourceLocationId ? [sourceLocationId] : [])
      .concat(discoveredLocationIds)
      .concat(retrievalLocationIds),
  )
  const locationsResult = locationIds.length
    ? await admin
        .from("locations")
        .select("id,name,summary,parent_location_id,visibility_mode,background_simulation_scope,lifecycle_state,archetype,scale,structure_roles,structure_state,coverage_manifest,structured_at")
        .eq("campaign_id", campaignId)
        .in("id", locationIds)
    : { data: [], error: null }

  if (locationsResult.error) throw new Error(locationsResult.error.message)

  const locations = rows(locationsResult.data)
  const locationById = new Map(
    locations.map((location) => [String(location.id), location]),
  )
  const sourceLocationBase = sourceLocationId
    ? locationById.get(sourceLocationId) || null
    : null

  const canonicalPresentNpcIds = characters
    .filter((character) => {
      if (character.character_type !== "npc") return false
      if (!sourceLocationId) return false
      return nullableString(
        worldByCharacter.get(String(character.id))?.location_id,
      ) === sourceLocationId
    })
    .map((character) => String(character.id))

  const backgroundResult = currentDay !== null
    ? await admin.rpc("read_ai_background_temporal_context_v1", {
        p_campaign_id: campaignId,
        p_scene_day: currentDay,
        p_source_location_id: sourceLocationId,
        p_relevant_npc_ids: canonicalPresentNpcIds,
      })
    : { data: {
        enabled: false,
        scene_day: null,
        world_snapshot: null,
        source_location_snapshot: null,
        npc_snapshots: [],
        high_importance_events: [],
      }, error: null }

  if (backgroundResult.error) {
    throw new Error(backgroundResult.error.message)
  }

  const background = record(backgroundResult.data)
  const backgroundNpcRows = rows(background.npc_snapshots)
  const backgroundNpcSnapshotById = new Map(
    backgroundNpcRows.map((item) => [
      String(item.entity_id),
      record(item.snapshot),
    ]),
  )
  const sourceLocation = applyLocationTemporalOverlay(
    sourceLocationBase,
    background.source_location_snapshot,
  )

  const sourceLocationChildrenResult = sourceLocationId
    ? await admin
        .from("locations")
        .select("id,name,summary,parent_location_id,visibility_mode,background_simulation_scope,lifecycle_state,archetype,scale,structure_roles,structure_state,coverage_manifest,structured_at")
        .eq("campaign_id", campaignId)
        .eq("parent_location_id", sourceLocationId)
        .eq("lifecycle_state", "active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .limit(40)
    : { data: [], error: null }

  if (sourceLocationChildrenResult.error) {
    throw new Error(sourceLocationChildrenResult.error.message)
  }
  const sourceLocationChildren = rows(sourceLocationChildrenResult.data)

  const sourceSectionsResult = sourceLocationId
    ? await admin
        .from("location_sections")
        .select("id")
        .eq("location_id", sourceLocationId)
        .limit(80)
    : { data: [], error: null }

  if (sourceSectionsResult.error) {
    throw new Error(sourceSectionsResult.error.message)
  }
  const sourceSectionIds = rows(sourceSectionsResult.data)
    .map((item) => nullableString(item.id))
    .filter((id): id is string => Boolean(id))

  const sourceTransitionsResult = sourceSectionIds.length
    ? await admin
        .from("location_links")
        .select("id,section_id,target_location_id,label,visibility_mode,sort_order,travel_minutes")
        .in("section_id", sourceSectionIds)
        .order("sort_order", { ascending: true })
        .limit(80)
    : { data: [], error: null }

  if (sourceTransitionsResult.error) {
    throw new Error(sourceTransitionsResult.error.message)
  }

  const transitionRows = rows(sourceTransitionsResult.data)
  const transitionTargetIds = unique(
    transitionRows.map((item) => nullableString(item.target_location_id)),
  )
  const transitionTargetsResult = transitionTargetIds.length
    ? await admin
        .from("locations")
        .select("id,name,lifecycle_state")
        .eq("campaign_id", campaignId)
        .in("id", transitionTargetIds)
    : { data: [], error: null }

  if (transitionTargetsResult.error) {
    throw new Error(transitionTargetsResult.error.message)
  }

  const transitionTargetById = new Map(
    rows(transitionTargetsResult.data).map((item) => [String(item.id), item]),
  )
  const sourceLocationTransitions = transitionRows.map((item) => ({
    ...item,
    target_location_name:
      transitionTargetById.get(String(item.target_location_id))?.name || null,
    target_lifecycle_state:
      transitionTargetById.get(String(item.target_location_id))?.lifecycle_state || null,
  }))

  const sceneActorsResult = sourceLocationId
    ? await admin
        .from("ai_scene_actors")
        .select("id,room_id,location_id,source_bestiary_slug,display_label,runtime_ordinal,current_hp,max_hp,life_state,conditions,effects,runtime_state,campaign_day,day_period,revision,mechanics_snapshot")
        .eq("campaign_id", campaignId)
        .eq("room_id", roomId)
        .eq("location_id", sourceLocationId)
        .eq("runtime_state", "active")
        .eq("life_state", "alive")
        .order("spawned_at", { ascending: true })
        .limit(40)
    : { data: [], error: null }

  if (sceneActorsResult.error) throw new Error(sceneActorsResult.error.message)

  const rawSceneActors = rows(sceneActorsResult.data)
    .filter((actor) =>
      currentDay === null ||
      nullableNumber(actor.campaign_day) === null ||
      Number(actor.campaign_day) <= currentDay
    )
  const sceneActorIds = rawSceneActors.map((actor) => String(actor.id))
  const sceneActorResourcesResult = sceneActorIds.length
    ? await admin
        .from("ai_scene_actor_resources")
        .select("actor_id,state_key,current,max_snapshot,label,recharge")
        .in("actor_id", sceneActorIds)
    : { data: [], error: null }

  if (sceneActorResourcesResult.error) {
    throw new Error(sceneActorResourcesResult.error.message)
  }

  const sceneActorResources = rows(sceneActorResourcesResult.data)
  const sceneActors = rawSceneActors.map((actor) => {
    const mechanics = Array.isArray(actor.mechanics_snapshot)
      ? actor.mechanics_snapshot as JsonRecord[]
      : []
    return {
      id: actor.id,
      display_label: actor.display_label,
      runtime_ordinal: actor.runtime_ordinal,
      source_bestiary_slug: actor.source_bestiary_slug,
      current_hp: actor.current_hp,
      max_hp: actor.max_hp,
      life_state: actor.life_state,
      conditions: actor.conditions,
      effects: actor.effects,
      campaign_day: actor.campaign_day,
      day_period: actor.day_period,
      revision: actor.revision,
      resources: sceneActorResources
        .filter((resource) => String(resource.actor_id) === String(actor.id))
        .map((resource) => ({
          state_key: resource.state_key,
          current: resource.current,
          max: resource.max_snapshot,
          label: resource.label,
          recharge: resource.recharge,
        })),
      actions: mechanics.map((mechanic) => {
        const runtime = record(mechanic.runtime)
        const resource = record(mechanic.resource)
        return {
          mechanic_key: mechanic.stable_key,
          label: mechanic.label,
          economy: mechanic.economy,
          kind: runtime.kind,
          save_ability: runtime.saveAbility || null,
          resource_key: resource.key || null,
        }
      }),
    }
  })

  const roomMembers = rows(roomMembersResult.data)
  const roomMemberByUser = new Map(
    roomMembers.map((member) => [String(member.user_id), member]),
  )

  const playerCharacters = characters
    .filter(
      (character) =>
        character.character_type === "pc" &&
        character.life_state === "alive",
    )
    .map((character) => {
      const world = worldByCharacter.get(String(character.id)) || {}
      const locationId = nullableString(world.location_id)
      const assignedUserId = nullableString(character.assigned_user_id)
      const member = assignedUserId
        ? roomMemberByUser.get(assignedUserId) || {}
        : {}

      return {
        id: character.id,
        name: character.name,
        character_class: character.character_class,
        level: character.level,
        location_id: locationId,
        location_name: locationId
          ? locationById.get(locationId)?.name || null
          : null,
        campaign_day: nullableNumber(world.campaign_day),
        day_period: nullableString(world.day_period),
        same_location_as_source:
          Boolean(sourceLocationId) && locationId === sourceLocationId,
        can_read_room:
          room.open_to_campaign === true || member.can_read === true,
        can_write_room:
          (
            room.open_to_campaign === true &&
            room.campaign_can_write === true
          ) || member.can_write === true,
      }
    })
    .filter((player) => player.can_read_room === true)
    .slice(0, 16)

  const presentCharacters = characters
    .filter((character) => {
      const canonicalWorld = worldByCharacter.get(String(character.id)) || {}
      const canonicalLocationId = nullableString(canonicalWorld.location_id)

      if (String(character.id) === sourceCharacterId) {
        return character.life_state === "alive"
      }

      if (character.character_type !== "npc") {
        if (character.life_state !== "alive") return false
        if (!sourceLocationId) return false
        return canonicalLocationId === sourceLocationId
      }

      const effective = effectiveNpcTemporalState(
        character,
        canonicalLocationId,
        backgroundNpcSnapshotById.get(String(character.id)),
      )
      if (effective.lifeState !== "alive") return false
      if (!sourceLocationId) return false
      return effective.locationId === sourceLocationId
    })
    .map((character) => {
      const world = worldByCharacter.get(String(character.id)) || {}
      const canonicalLocationId = nullableString(world.location_id)
      const effective = character.character_type === "npc"
        ? effectiveNpcTemporalState(
            character,
            canonicalLocationId,
            backgroundNpcSnapshotById.get(String(character.id)),
          )
        : {
            lifeState: nullableString(character.life_state) || "alive",
            locationId: canonicalLocationId,
            status: null,
            snapshot: null,
            overlay: {},
          }

      return {
        id: character.id,
        name: character.name,
        character_type: character.character_type,
        character_class: character.character_class,
        level: character.level,
        bio: character.bio,
        life_state: effective.lifeState,
        base_life_state: character.life_state,
        location_id: effective.locationId,
        base_location_id: canonicalLocationId,
        temporal_status: effective.status,
        temporal_overlay: effective.overlay,
        background_snapshot: effective.snapshot,
        campaign_day: nullableNumber(world.campaign_day),
        day_period: nullableString(world.day_period),
        world_state_updated_at: nullableString(world.updated_at),
      }
    })

  const relevantCharacterIds = unique(
    presentCharacters.map((item) => nullableString(item.id))
      .concat([sourceCharacterId]),
  )
  const relevantIdSet = new Set(
    relevantCharacterIds.concat(sourceLocationId ? [sourceLocationId] : []),
  )

  const presentNpcIds = presentCharacters
    .filter((item) => item.character_type === "npc")
    .map((item) => String(item.id))

  const presentPcCharacterIds = new Set(
    presentCharacters
      .filter((item) => item.character_type === "pc")
      .map((item) => String(item.id)),
  )
  const participantCharacterByUser = new Map<
    string,
    { id: string; name: string }
  >()
  for (const character of characters) {
    const userId = nullableString(character.assigned_user_id)
    if (
      character.character_type !== "pc" ||
      !userId ||
      !presentPcCharacterIds.has(String(character.id))
    ) continue

    if (!participantCharacterByUser.has(userId)) {
      participantCharacterByUser.set(userId, {
        id: String(character.id),
        name: String(character.name || ""),
      })
    }
  }
  const participantUserIds = [...participantCharacterByUser.keys()].slice(0, 16)

  const [
    sheetsResult,
    resourceStatesResult,
    inventoryItemsResult,
    inventoryChargesResult,
    inventoryRoomResult,
    npcProfilesResult,
    npcIdentitiesResult,
    npcRuntimeResult,
    gmBehaviorProfileResult,
    directorPreferencesResult,
    contentSettingsResult,
    relationshipsResult,
    assetsResult,
    factionMembershipResult,
    factionReputationResult,
    activeQuestContext,
  ] = await Promise.all([
    relevantCharacterIds.length
      ? admin
          .from("character_sheets")
          .select("character_id,race,background,alignment,strength,dexterity,constitution,intelligence,wisdom,charisma,armor_class,initiative_bonus,speed,proficiency_bonus,max_hp,current_hp,temp_hp,passive_perception,spellcasting_enabled,spellcasting_ability,spell_save_dc,spell_attack_bonus,runtime_facts")
          .in("character_id", relevantCharacterIds)
      : Promise.resolve({ data: [], error: null }),
    relevantCharacterIds.length
      ? admin
          .from("character_resource_states")
          .select("character_id,state_key,current,max_snapshot,label,recharge,temporary_max_bonus,updated_at")
          .in("character_id", relevantCharacterIds)
      : Promise.resolve({ data: [], error: null }),
    relevantCharacterIds.length
      ? admin
          .from("character_inventory_items")
          .select("id,character_id,name,quantity,category,stack_mode,usage_mode,charges_current,charges_max,definition_id,holder_item_id,placement_kind,item_state,version,description,updated_at")
          .in("character_id", relevantCharacterIds)
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    relevantCharacterIds.length
      ? admin
          .from("character_inventory_items")
          .select("id,character_id,name,usage_mode,charges_current,charges_max,item_state,updated_at")
          .in("character_id", relevantCharacterIds)
          .eq("usage_mode", "charges")
          .limit(120)
      : Promise.resolve({ data: [], error: null }),
    admin.rpc("ai_gm_inventory_room_v1", {
      p_campaign_id: campaignId,
      p_character_id: sourceCharacterId,
    }),
    presentNpcIds.length
      ? admin
          .from("npc_profiles")
          .select("character_id,role,species,creature_type,size,challenge_rating,occupation,faction,appearance,demeanor,motivation,public_notes,gm_notes,tags,inventory_text,inventory_data,background_simulation_scope")
          .eq("campaign_id", campaignId)
          .in("character_id", presentNpcIds)
      : Promise.resolve({ data: [], error: null }),
    presentNpcIds.length
      ? admin.rpc("read_ai_npc_identity_fingerprints_v1", {
          p_campaign_id: campaignId,
          p_npc_ids: presentNpcIds,
        })
      : Promise.resolve({ data: [], error: null }),
    presentNpcIds.length
      ? admin.rpc("read_ai_gm_npc_runtime_v1", {
          p_campaign_id: campaignId,
          p_npc_ids: presentNpcIds,
        })
      : Promise.resolve({ data: [], error: null }),
    admin.rpc("read_ai_gm_behavior_profile_v1", {
      p_campaign_id: campaignId,
    }),
    participantUserIds.length
      ? admin.rpc("read_ai_gm_director_preferences_v1", {
          p_campaign_id: campaignId,
          p_participant_user_ids: participantUserIds,
        })
      : Promise.resolve({
          data: {
            enabled: true,
            scope: "physically_present_player_users",
            participant_count: 0,
            configured_count: 0,
            aggregation_rule: "equal_weight_mean_of_configured_participants",
            conflict_rule: "preserve_range_and_alternate_plausible_future_opportunities",
            dimensions: {},
            participants: [],
            version_vector: [],
            contract: {
              future_opportunities_only: true,
              existing_canon_immutable: true,
              resolved_rolls_immutable: true,
              npc_identity_and_consent_immutable: true,
              already_triggered_encounters_immutable: true,
            },
          },
          error: null,
        }),
    admin
      .from("ai_gm_content_settings")
      .select("mode,updated_at")
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    relevantCharacterIds.length
      ? admin
          .from("character_relationships")
          .select("id,subject_character_id,target_character_id,relationship_kind,public_label,attitude_score,player_note,gm_note,state,updated_at")
          .eq("campaign_id", campaignId)
          .eq("state", "active")
          .or(
            `subject_character_id.in.(${relevantCharacterIds.join(",")}),target_character_id.in.(${relevantCharacterIds.join(",")})`,
          )
          .order("updated_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("character_assets")
      .select("id,owner_character_id,asset_kind,ownership_kind,display_name,description,location_id,npc_character_id,inventory_item_id,world_storage_id,custom_data,state")
      .eq("campaign_id", campaignId)
      .eq("state", "active")
      .in("owner_character_id", relevantCharacterIds)
      .limit(80),
    admin
      .from("faction_memberships")
      .select("id,faction_id,character_id,membership_role,rank_label,is_primary,state")
      .eq("campaign_id", campaignId)
      .eq("state", "active")
      .in("character_id", relevantCharacterIds)
      .limit(80),
    admin
      .from("character_faction_reputations")
      .select("id,faction_id,character_id,standing_kind,public_label,reputation_score,player_note,gm_note,state")
      .eq("campaign_id", campaignId)
      .eq("state", "active")
      .in("character_id", relevantCharacterIds)
      .limit(80),
    loadActiveQuestContext(admin, campaignId, sourceCharacterId),
  ])

  const contextError =
    sheetsResult.error ||
    resourceStatesResult.error ||
    inventoryChargesResult.error ||
    inventoryItemsResult.error ||
    inventoryRoomResult.error ||
    npcProfilesResult.error ||
    npcIdentitiesResult.error ||
    npcRuntimeResult.error ||
    gmBehaviorProfileResult.error ||
    directorPreferencesResult.error ||
    contentSettingsResult.error ||
    relationshipsResult.error ||
    assetsResult.error ||
    factionMembershipResult.error ||
    factionReputationResult.error

  if (contextError) throw new Error(contextError.message)

  const contentSetting = record(contentSettingsResult.data)
  const contentMode = nullableString(contentSetting.mode)
  const contentProfile: JsonRecord = {
    mode:
      contentMode === "allowed" || contentMode === "adult_focused"
        ? contentMode
        : "off",
    enabled: contentMode === "allowed" || contentMode === "adult_focused",
    updated_at: contentSetting.updated_at || null,
    permissions: {
      mature_themes_allowed:
        contentMode === "allowed" || contentMode === "adult_focused",
      adult_focus: contentMode === "adult_focused",
    },
    invariants: {
      npc_agency_unchanged: true,
      canon_unchanged: true,
      dice_unchanged: true,
      prices_and_social_consequences_unchanged: true,
    },
  }

  const rawDirectorPreferences = record(directorPreferencesResult.data)
  const directorParticipants = rows(rawDirectorPreferences.participants)
    .map((item) => {
      const userId = nullableString(item.user_id)
      const character = userId
        ? participantCharacterByUser.get(userId) || null
        : null
      if (!character) return null

      return {
        character_id: character.id,
        character_name: character.name,
        version: nullableNumber(item.version) || 0,
        interests: record(item.interests),
        free_text: boundedText(item.free_text, 600),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const directorPreferences: JsonRecord = {
    enabled: rawDirectorPreferences.enabled === true,
    scope: "physical_scene_participants_only",
    participant_count: participantUserIds.length,
    configured_count: directorParticipants.length,
    aggregation_rule:
      nullableString(rawDirectorPreferences.aggregation_rule) ||
      "equal_weight_mean_of_configured_participants",
    conflict_rule:
      nullableString(rawDirectorPreferences.conflict_rule) ||
      "preserve_range_and_alternate_plausible_future_opportunities",
    dimensions: record(rawDirectorPreferences.dimensions),
    participants: directorParticipants,
    version_vector: directorParticipants.map((item) => ({
      character_id: item.character_id,
      version: item.version,
    })),
    contract: record(rawDirectorPreferences.contract),
  }

  const relationships = rows(relationshipsResult.data).filter(
    (item) =>
      relevantIdSet.has(String(item.subject_character_id)) ||
      relevantIdSet.has(String(item.target_character_id)),
  )

  const factionMemberships = rows(factionMembershipResult.data)
  const factionReputations = rows(factionReputationResult.data)
  const factionIds = unique(
    factionMemberships.map((item) => nullableString(item.faction_id))
      .concat(
        factionReputations.map((item) => nullableString(item.faction_id)),
      )
      .concat(retrievalFactionIds),
  )

  let factionById = new Map<string, JsonRecord>()
  if (factionIds.length) {
    const factionsResult = await admin
      .from("factions")
      .select("id,name,summary,state,tags")
      .eq("campaign_id", campaignId)
      .in("id", factionIds)

    if (factionsResult.error) throw new Error(factionsResult.error.message)
    factionById = new Map(
      rows(factionsResult.data).map((item) => [String(item.id), item]),
    )
  }

  const linkedRelationshipIds = unique(
    [sourceCharacterId].concat(retrievalCharacterIds),
  )
  const questTargetFilter = [
    retrievalQuestIds.length
      ? "quest_id.in.(" + retrievalQuestIds.join(",") + ")"
      : "",
    retrievalQuestTargetIds.length
      ? "id.in.(" + retrievalQuestTargetIds.join(",") + ")"
      : "",
  ].filter(Boolean).join(",")

  const [
    retrievedNpcProfilesResult,
    retrievedQuestsResult,
    retrievedQuestTargetsResult,
    retrievedRelationshipsResult,
  ] = await Promise.all([
    retrievalCharacterIds.length
      ? admin
          .from("npc_profiles")
          .select("character_id,role,species,occupation,faction,demeanor,motivation,public_notes,gm_notes,tags")
          .eq("campaign_id", campaignId)
          .in("character_id", retrievalCharacterIds)
          .limit(12)
      : Promise.resolve({ data: [], error: null }),
    retrievalQuestIds.length
      ? admin
          .from("quests")
          .select("id,quest_key,title,status,player_brief,updated_at")
          .eq("campaign_id", campaignId)
          .in("id", retrievalQuestIds)
          .limit(12)
      : Promise.resolve({ data: [], error: null }),
    questTargetFilter
      ? admin
          .from("quest_targets")
          .select("id,quest_id,stage_id,target_key,target_kind,placeholder_label,binding_state,location_id,npc_character_id,item_definition_id")
          .or(questTargetFilter)
          .limit(24)
      : Promise.resolve({ data: [], error: null }),
    retrievalCharacterIds.length
      ? admin
          .from("character_relationships")
          .select("id,subject_character_id,target_character_id,relationship_kind,public_label,attitude_score,player_note,gm_note,state,updated_at")
          .eq("campaign_id", campaignId)
          .eq("state", "active")
          .or(
            "subject_character_id.in.(" +
              linkedRelationshipIds.join(",") +
              "),target_character_id.in.(" +
              linkedRelationshipIds.join(",") +
              ")",
          )
          .order("updated_at", { ascending: false })
          .limit(24)
      : Promise.resolve({ data: [], error: null }),
  ])

  const retrievalLinkError =
    retrievedNpcProfilesResult.error ||
    retrievedQuestsResult.error ||
    retrievedQuestTargetsResult.error ||
    retrievedRelationshipsResult.error
  if (retrievalLinkError) throw new Error(retrievalLinkError.message)

  retrieval.linked_entities = {
    characters: characters
      .filter((item) => retrievalCharacterIds.includes(String(item.id)))
      .map((item) => {
        const world = worldByCharacter.get(String(item.id)) || {}
        return {
          id: item.id,
          name: item.name,
          character_type: item.character_type,
          life_state: item.life_state,
          location_id: world.location_id || null,
          campaign_day: world.campaign_day ?? null,
        }
      })
      .slice(0, 12),
    npc_profiles: rows(retrievedNpcProfilesResult.data).slice(0, 12),
    locations: retrievalLocationIds
      .map((id) => locationById.get(id))
      .filter((item): item is JsonRecord => Boolean(item))
      .map((item) => ({
        id: item.id,
        name: item.name,
        summary: boundedText(item.summary, 700),
        parent_location_id: item.parent_location_id,
        lifecycle_state: item.lifecycle_state,
      }))
      .slice(0, 12),
    factions: retrievalFactionIds
      .map((id) => factionById.get(id))
      .filter((item): item is JsonRecord => Boolean(item))
      .map((item) => ({
        id: item.id,
        name: item.name,
        summary: boundedText(item.summary, 700),
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 16) : [],
      }))
      .slice(0, 12),
    quests: rows(retrievedQuestsResult.data).slice(0, 12),
    quest_targets: rows(retrievedQuestTargetsResult.data).slice(0, 24),
    relationships: rows(retrievedRelationshipsResult.data)
      .filter((item) =>
        retrievalCharacterIds.includes(String(item.subject_character_id)) ||
        retrievalCharacterIds.includes(String(item.target_character_id))
      )
      .slice(0, 24),
  }

  const rawFacts = rows(retrieval.memory_facts).slice(0, MAX_MEMORY_FACTS)
  const rawSummaries = rows(retrieval.memory_summaries).slice(0, MAX_MEMORY_SUMMARIES)

  const memoryEventIds = unique(
    rawFacts.flatMap((item) => strings(item.source_event_ids))
      .concat(rawSummaries.flatMap((item) => strings(item.key_event_ids))),
  )
  let memoryEventById = new Map<string, JsonRecord>()

  if (memoryEventIds.length) {
    const memoryEventsResult = await admin
      .from("campaign_events")
      .select("id,event_type,source_kind,source_id,room_id,location_id,actor_character_id,participant_character_ids,summary,importance,confidence,visibility,visible_character_ids,payload,occurred_at")
      .eq("campaign_id", campaignId)
      .in("id", memoryEventIds)

    if (memoryEventsResult.error) throw new Error(memoryEventsResult.error.message)
    memoryEventById = new Map(
      rows(memoryEventsResult.data).map((item) => [String(item.id), item]),
    )
  }

  retrieval.evidence_events = [...memoryEventById.values()]
    .map((event) => ({
      id: event.id,
      event_type: event.event_type,
      source_kind: event.source_kind,
      source_id: event.source_id,
      room_id: event.room_id,
      location_id: event.location_id,
      actor_character_id: event.actor_character_id,
      participant_character_ids: event.participant_character_ids,
      summary: boundedText(event.summary, 1200),
      importance: event.importance,
      confidence: event.confidence,
      occurred_at: event.occurred_at,
    }))
    .slice(0, 16)

  function sourceEvents(ids: string[]) {
    return ids
      .map((id) => memoryEventById.get(id))
      .filter((item): item is JsonRecord => Boolean(item))
  }

  function newestSourceEvent(ids: string[]) {
    return sourceEvents(ids)
      .filter((event) => eventVisibleAtGameDay(event, currentDay))
      .sort((a, b) =>
        String(b.occurred_at || "").localeCompare(String(a.occurred_at || ""))
      )[0]
  }

  function memorySourceSetVisibleAtGameDay(ids: string[]) {
    if (currentDay === null || ids.length === 0) return true
    return !sourceEvents(ids).some(
      (event) => !eventVisibleAtGameDay(event, currentDay),
    )
  }

  // An active memory row can already contain a statement updated by a future
  // source event. If any known source event is ahead of this scene, exclude the
  // whole row instead of disguising future state as game_age_days = 0.
  const memoryFacts = rawFacts
    .filter((item) =>
      memorySourceSetVisibleAtGameDay(strings(item.source_event_ids))
    )
    .map((item) =>
      withGameAge(
        item,
        newestSourceEvent(strings(item.source_event_ids)),
        currentDay,
      )
    )
  const memorySummaries = rawSummaries
    .filter((item) =>
      memorySourceSetVisibleAtGameDay(strings(item.key_event_ids))
    )
    .map((item) =>
      withGameAge(
        item,
        newestSourceEvent(strings(item.key_event_ids)),
        currentDay,
      )
    )

  const originalMessage =
    nullableString(jobInput.original_message)?.toLocaleLowerCase("ru-RU") || ""
  const mentionedPlayerCharacters = playerCharacters
    .filter((player) => player.id !== sourceCharacterId)
    .filter((player) => {
      const name = lower(player.name)
      return Boolean(name) && originalMessage.includes(name)
    })
    .map((player) => ({ id: String(player.id), name: String(player.name) }))

  const knownLocationIds = new Set(
    unique(discoveredLocationIds.concat(sourceLocationId ? [sourceLocationId] : [])),
  )
  const knownNpcIds = new Set(
    unique(
      discoveredNpcIds.concat(
        presentCharacters
          .filter((item) => item.character_type === "npc")
          .map((item) => nullableString(item.id)),
      ),
    ),
  )
  const knownLocations = [...knownLocationIds]
    .map((id) => locationById.get(id))
    .filter((item): item is JsonRecord => Boolean(item))
    .map((item) => ({
      id: item.id,
      name: item.name,
      summary: boundedText(item.summary, 500),
      parent_location_id: item.parent_location_id,
      discovery: discoveredLocationRows.find(
        (row) => String(row.location_id) === String(item.id),
      ) || null,
    }))
    .slice(0, 80)
  const knownNpcs = characters
    .filter((item) => knownNpcIds.has(String(item.id)))
    .map((item) => ({
      id: item.id,
      name: item.name,
      character_type: item.character_type,
      life_state: item.life_state,
      discovery: discoveredNpcRows.find(
        (row) => String(row.npc_character_id) === String(item.id),
      ) || null,
    }))
    .slice(0, 80)
  const knownMemoryFacts = memoryFacts
    .filter((item) => {
      const visibility = nullableString(item.visibility) || "campaign"
      if (visibility === "gm") return false
      if (visibility === "campaign") return true
      if (visibility === "room") return item.room_id === roomId
      return strings(item.visible_character_ids).includes(sourceCharacterId)
    })
    .map((item) => ({
      id: item.id,
      fact_key: item.fact_key,
      subject_type: item.subject_type,
      subject_id: item.subject_id,
      predicate: item.predicate,
      statement: boundedText(item.statement, 700),
      room_id: item.room_id,
      search_tags: strings(item.search_tags).slice(0, 24),
      entity_refs: Array.isArray(item.entity_refs) ? item.entity_refs.slice(0, 24) : [],
    }))
    .slice(0, 32)

  return {
    room,
    sourceCharacter: {
      id: sourceCharacter.id,
      name: sourceCharacter.name,
      character_class: sourceCharacter.character_class,
      level: sourceCharacter.level,
      bio: sourceCharacter.bio,
    },
    sourceLocation,
    sourceLocationChildren,
    sourceLocationTransitions,
    currentGameTime: {
      campaignDay: currentDay,
      dayPeriod: currentPeriod,
      campaignMinute: currentMinute,
    },
    sourceAudience,
    players: playerCharacters,
    presentCharacters,
    sheets: rows(sheetsResult.data),
    resourceStates: rows(resourceStatesResult.data),
    inventoryItems: rows(inventoryItemsResult.data),
    inventoryRoom: record(inventoryRoomResult.data),
    inventoryChargeItems: rows(inventoryChargesResult.data),
    npcProfiles: rows(npcProfilesResult.data),
    npcIdentities: rows(npcIdentitiesResult.data),
    npcRuntime: rows(npcRuntimeResult.data),
    gmBehaviorProfile: record(gmBehaviorProfileResult.data),
    directorPreferences,
    contentProfile,
    sceneActors,
    relationships,
    assets: rows(assetsResult.data),
    factionMemberships: factionMemberships.map((item) => ({
      ...item,
      faction: factionById.get(String(item.faction_id)) || null,
    })),
    factionReputations: factionReputations.map((item) => ({
      ...item,
      faction: factionById.get(String(item.faction_id)) || null,
    })),
    activeQuestContext,
    memory: {
      facts: memoryFacts,
      summaries: memorySummaries,
    },
    retrieval,
    background,
    temporalSync,
    recentMessages,
    contextMetrics,
    sourceKnowledge: {
      knownLocations,
      knownNpcs,
      knownMemoryFacts,
    },
    mentionedPlayerCharacters,
  }
}

function compactQuestContext(value: JsonRecord) {
  return {
    character_id: value.character_id,
    active_quests: rows(value.active_quests).map((quest) => ({
      id: quest.id,
      quest_key: quest.quest_key,
      title: boundedText(quest.title, 300),
      player_brief: boundedText(quest.player_brief, 1200),
      internal_summary: boundedText(quest.internal_summary, 1200),
      ai_directive: boundedText(quest.ai_directive, 1200),
      active_stages: rows(quest.active_stages).map((stage) => ({
        id: stage.id,
        stage_key: stage.stage_key,
        position: stage.position,
        status: stage.status,
        player_title: boundedText(stage.player_title, 500),
        internal_title: boundedText(stage.internal_title, 500),
        objective: boundedText(stage.objective, 1200),
        gm_notes: boundedText(stage.gm_notes, 1200),
        targets: rows(stage.targets).map((target) => ({
          id: target.id,
          target_key: target.target_key,
          target_kind: target.target_kind,
          placeholder_label: boundedText(target.placeholder_label, 400),
          internal_note: boundedText(target.internal_note, 700),
          binding_state: target.binding_state,
          location_id: target.location_id,
          npc_character_id: target.npc_character_id,
          item_definition_id: target.item_definition_id,
        })).slice(0, 24),
        condition_groups: rows(stage.condition_groups).map((group) => ({
          id: group.id,
          key: group.key,
          mode: group.mode,
          conditions: rows(group.conditions).map((condition) => ({
            id: condition.id,
            condition_key: condition.condition_key,
            condition_type: condition.condition_type,
            target_id: condition.target_id,
            required_quantity: condition.required_quantity,
            negated: condition.negated,
            params_json: boundedText(
              JSON.stringify(record(condition.params)),
              900,
            ),
            state: {
              satisfied: record(condition.state).satisfied === true,
              resolution_source: record(condition.state).resolution_source,
              evidence: boundedText(record(condition.state).evidence, 700),
            },
          })).slice(0, 24),
        })).slice(0, 12),
      })).slice(0, 12),
      recent_completed_stages: rows(quest.recent_completed_stages).map((stage) => ({
        id: stage.id,
        stage_key: stage.stage_key,
        position: stage.position,
        player_title: boundedText(stage.player_title, 500),
        completion_text: boundedText(stage.completion_text, 900),
        completed_at: stage.completed_at,
      })).slice(0, 8),
    })).slice(0, 12),
  }
}

function compactMemory(memory: Stage2GameChatContext["memory"]) {
  return {
    facts: memory.facts.map((fact) => ({
      id: fact.id,
      fact_key: fact.fact_key,
      subject_type: fact.subject_type,
      subject_id: fact.subject_id,
      predicate: fact.predicate,
      statement: boundedText(fact.statement, 1200),
      confidence: fact.confidence,
      room_id: fact.room_id,
      campaign_day: fact.campaign_day,
      day_period: fact.day_period,
      game_age_days: fact.game_age_days,
      source_location_id: fact.source_location_id,
      visibility: fact.visibility,
      source_event_ids: strings(fact.source_event_ids).slice(0, 12),
      search_tags: strings(fact.search_tags).slice(0, 12),
      search_aliases: strings(fact.search_aliases).slice(0, 12),
      relation_keys: strings(fact.relation_keys).slice(0, 12),
      entity_refs: rows(fact.entity_refs).slice(0, 16),
      resolver_score: fact.resolver_score,
    })).slice(0, Math.min(MAX_MEMORY_FACTS, 20)),
    summaries: memory.summaries.map((summary) => ({
      id: summary.id,
      title: boundedText(summary.title, 300),
      summary: boundedText(summary.summary, 1800),
      room_id: summary.room_id,
      period_start: summary.period_start,
      period_end: summary.period_end,
      campaign_day: summary.campaign_day,
      day_period: summary.day_period,
      game_age_days: summary.game_age_days,
      source_location_id: summary.source_location_id,
    })).slice(0, Math.min(MAX_MEMORY_SUMMARIES, 6)),
  }
}

export function stage2ContextForPrompt(context: Stage2GameChatContext) {
  const compactCharacters = context.presentCharacters.map((item) => ({
    id: item.id,
    name: item.name,
    character_type: item.character_type,
    character_class: item.character_class,
    level: item.level,
    bio: boundedText(item.bio, 1000),
    life_state: item.life_state,
    location_id: item.location_id,
    temporal_status: item.temporal_status,
    campaign_day: item.campaign_day,
    day_period: item.day_period,
  }))

  const compactSheets = context.sheets.map((sheet) => ({
    character_id: sheet.character_id,
    race: sheet.race,
    background: sheet.background,
    alignment: sheet.alignment,
    strength: sheet.strength,
    dexterity: sheet.dexterity,
    constitution: sheet.constitution,
    intelligence: sheet.intelligence,
    wisdom: sheet.wisdom,
    charisma: sheet.charisma,
    armor_class: sheet.armor_class,
    initiative_bonus: sheet.initiative_bonus,
    speed: sheet.speed,
    proficiency_bonus: sheet.proficiency_bonus,
    max_hp: sheet.max_hp,
    current_hp: sheet.current_hp,
    temp_hp: sheet.temp_hp,
    passive_perception: sheet.passive_perception,
    spellcasting_enabled: sheet.spellcasting_enabled,
    spellcasting_ability: sheet.spellcasting_ability,
    spell_save_dc: sheet.spell_save_dc,
    spell_attack_bonus: sheet.spell_attack_bonus,
  }))

  const compactNpcProfiles = context.npcProfiles.map((profile) => ({
    character_id: profile.character_id,
    role: profile.role,
    species: profile.species,
    creature_type: profile.creature_type,
    size: profile.size,
    challenge_rating: profile.challenge_rating,
    occupation: profile.occupation,
    faction: profile.faction,
    appearance: boundedText(profile.appearance, 900),
    demeanor: boundedText(profile.demeanor, 900),
    motivation: boundedText(profile.motivation, 900),
    public_notes: boundedText(profile.public_notes, 900),
    gm_notes: boundedText(profile.gm_notes, 900),
    tags: Array.isArray(profile.tags) ? profile.tags.slice(0, 24) : [],
    inventory_text: boundedText(profile.inventory_text, 900),
    background_simulation_scope: profile.background_simulation_scope,
  }))

  const payload: JsonRecord = {
    contract: {
      recent_message_limit: CHAT_CONTEXT_LIMIT,
      history_projection: "stage19_bounded_clean_v1",
      player_locations_are_independent: true,
      do_not_merge_split_party_scenes: true,
      pc_autonomy: "never speak, decide or act for a player character",
      physical_scene_history_only: true,
      direct_pc_audience_is_server_authoritative: true,
      direct_pc_never_authorizes_ai_to_speak_for_recipient: true,
      unnamed_mechanical_extras_use_scene_actors_not_characters: true,
      scene_actor_runtime_ordinal_is_not_a_personal_name: true,
      worker_commands_are_not_narrative_memory: true,
      player_claims_do_not_expand_character_knowledge: true,
      unknown_specific_player_targets_cannot_seed_world_discovery: true,
    },
    current_game_time: context.currentGameTime,
    source_audience: context.sourceAudience,
    room: {
      id: context.room.id,
      title: context.room.title,
      room_type: context.room.room_type,
      location_id: context.room.location_id,
      campaign_day: context.room.campaign_day,
      day_period: context.room.day_period,
      campaign_minute: context.room.campaign_minute,
      scene_state: context.room.scene_state,
    },
    source_character: {
      id: context.sourceCharacter.id,
      name: context.sourceCharacter.name,
      character_class: context.sourceCharacter.character_class,
      level: context.sourceCharacter.level,
      bio: boundedText(context.sourceCharacter.bio, 1200),
    },
    source_location: context.sourceLocation
      ? {
          id: context.sourceLocation.id,
          name: context.sourceLocation.name,
          summary: boundedText(context.sourceLocation.summary, 1000),
          parent_location_id: context.sourceLocation.parent_location_id,
          lifecycle_state: context.sourceLocation.lifecycle_state,
          temporal_status: context.sourceLocation.temporal_status,
          archetype: context.sourceLocation.archetype,
          scale: context.sourceLocation.scale,
          structure_roles: context.sourceLocation.structure_roles,
          structure_state: context.sourceLocation.structure_state,
          coverage_manifest: context.sourceLocation.coverage_manifest,
          structured_at: context.sourceLocation.structured_at,
        }
      : null,
    source_location_structure: {
      needs_cascade:
        Boolean(context.sourceLocation) &&
        !["materialized", "detailed"].includes(
          String(context.sourceLocation?.structure_state || "stub"),
        ),
      transitions: context.sourceLocationTransitions.map((item) => ({
        id: item.id,
        target_location_id: item.target_location_id,
        target_location_name: item.target_location_name,
        label: item.label,
        visibility_mode: item.visibility_mode,
        travel_minutes: item.travel_minutes,
      })),
      direct_children: context.sourceLocationChildren.map((item) => ({
        id: item.id,
        name: item.name,
        summary: boundedText(item.summary, 500),
        archetype: item.archetype,
        scale: item.scale,
        structure_roles: item.structure_roles,
        structure_state: item.structure_state,
        visibility_mode: item.visibility_mode,
        background_simulation_scope: item.background_simulation_scope,
      })),
      rule:
        "When an entered location is incomplete, materialize exactly one immediate structural layer. Do not recursively expand grandchildren unless a child is itself physically entered in the same canonical turn.",
    },
    source_character_knowledge: {
      known_locations: context.sourceKnowledge.knownLocations,
      known_npcs: context.sourceKnowledge.knownNpcs,
      known_memory_facts: context.sourceKnowledge.knownMemoryFacts,
      rule:
        "Only these discoveries/facts plus directly observable current-scene evidence may justify a PC intentionally targeting a specific location/NPC/fact. Player wording alone is not knowledge.",
    },
    participating_players: context.players.slice(0, 16),
    characters_physically_present_with_source: compactCharacters,
    canonical_sheets_for_present_characters: compactSheets,
    canonical_resource_states_for_present_characters:
      context.resourceStates.map((resource) => ({
        character_id: resource.character_id,
        state_key: resource.state_key,
        current: resource.current,
        max: resource.max_snapshot,
        label: resource.label,
        recharge: resource.recharge,
        temporary_max_bonus: resource.temporary_max_bonus,
      })).slice(0, 96),
    canonical_inventory_for_present_characters:
      context.inventoryItems.map((item) => ({
        id: item.id,
        character_id: item.character_id,
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        stack_mode: item.stack_mode,
        usage_mode: item.usage_mode,
        charges_current: item.charges_current,
        charges_max: item.charges_max,
        definition_id: item.definition_id,
        holder_item_id: item.holder_item_id,
        placement_kind: item.placement_kind,
        version: item.version,
        item_state: item.item_state,
      })).slice(0, 160),
    source_inventory_room: context.inventoryRoom,
    charged_inventory_items_for_present_characters:
      context.inventoryChargeItems.map((item) => ({
        id: item.id,
        character_id: item.character_id,
        name: item.name,
        charges_current: item.charges_current,
        charges_max: item.charges_max,
        item_state: item.item_state,
      })).slice(0, 80),
    present_npc_profiles: compactNpcProfiles,
    present_npc_identity_fingerprints: compactNpcIdentities(context.npcIdentities),
    canonical_npc_runtime: compactNpcRuntime(context.npcRuntime),
    active_scene_actors: context.sceneActors.slice(0, 40),
    relationships: context.relationships.map((item) => ({
      id: item.id,
      subject_character_id: item.subject_character_id,
      target_character_id: item.target_character_id,
      relationship_kind: item.relationship_kind,
      public_label: item.public_label,
      attitude_score: item.attitude_score,
      player_note: boundedText(item.player_note, 700),
      gm_note: boundedText(item.gm_note, 700),
    })).slice(0, 80),
    property_and_assets: context.assets.map((item) => ({
      id: item.id,
      owner_character_id: item.owner_character_id,
      asset_kind: item.asset_kind,
      ownership_kind: item.ownership_kind,
      display_name: item.display_name,
      description: boundedText(item.description, 900),
      location_id: item.location_id,
      npc_character_id: item.npc_character_id,
      inventory_item_id: item.inventory_item_id,
    })).slice(0, 60),
    faction_memberships: context.factionMemberships.map((item) => {
      const faction = record(item.faction)
      return {
        faction_id: item.faction_id,
        character_id: item.character_id,
        membership_role: item.membership_role,
        rank_label: item.rank_label,
        is_primary: item.is_primary,
        faction: faction.id
          ? {
              id: faction.id,
              name: faction.name,
              summary: boundedText(faction.summary, 700),
              tags: Array.isArray(faction.tags) ? faction.tags.slice(0, 20) : [],
            }
          : null,
      }
    }).slice(0, 40),
    faction_reputations: context.factionReputations.map((item) => {
      const faction = record(item.faction)
      return {
        faction_id: item.faction_id,
        character_id: item.character_id,
        standing_kind: item.standing_kind,
        public_label: item.public_label,
        reputation_score: item.reputation_score,
        player_note: boundedText(item.player_note, 600),
        gm_note: boundedText(item.gm_note, 600),
        faction: faction.id
          ? {
              id: faction.id,
              name: faction.name,
              summary: boundedText(faction.summary, 700),
            }
          : null,
      }
    }).slice(0, 40),
    active_quest_context: compactQuestContext(context.activeQuestContext),
    relevant_long_term_memory: compactMemory(context.memory),
    retrieved_campaign_context: {
      query: context.retrieval.query || "",
      search_query: context.retrieval.search_query || "",
      resolver_version: context.retrieval.resolver_version || 2,
      anchors: record(context.retrieval.anchors),
      campaign_events: rows(context.retrieval.campaign_events).slice(0, 8),
      evidence_events: rows(context.retrieval.evidence_events).slice(0, 16),
      lore_entries: rows(context.retrieval.lore_entries).slice(0, 8),
      linked_entities: record(context.retrieval.linked_entities),
      contract: record(context.retrieval.contract),
      rule:
        "This is query-specific read-only evidence selected across the entire campaign before output limiting. Treat canonical IDs/provenance as stronger than lexical tags. Lore can be an in-world report or rumor and is not automatically objective truth.",
    },
    background_temporal_context: compactBackground(context.background),
    cooperative_time_sync: {
      synced_count: context.temporalSync.synced_count || 0,
      recent_catchups: rows(context.temporalSync.recent_catchups)
        .map((item) => ({
          id: item.id,
          location_id: item.location_id,
          character_id: item.character_id,
          source_character_id: item.source_character_id,
          from_day: item.from_day,
          from_period: item.from_period,
          from_minute: item.from_minute,
          to_day: item.to_day,
          to_period: item.to_period,
          to_minute: item.to_minute,
          catchup_kind: item.catchup_kind,
          meaningful_actions_json: boundedText(
            JSON.stringify(item.meaningful_actions ?? []),
            1000,
          ),
          narrative_semantics: boundedText(item.narrative_semantics, 1000),
        }))
        .slice(0, 8),
    },
    recent_chat_messages_all_authors: context.recentMessages,
    context_metrics: context.contextMetrics,
    explicit_player_name_mentions: context.mentionedPlayerCharacters,
  }

  let json = JSON.stringify(payload)
  if (
    new TextEncoder().encode(json).length <= MAX_PROMPT_CONTEXT_JSON_BYTES
  ) {
    return json
  }

  const trimArray = (key: string, limit: number) => {
    const value = payload[key]
    if (Array.isArray(value)) payload[key] = value.slice(0, limit)
  }

  trimArray("relationships", 32)
  trimArray("property_and_assets", 24)
  trimArray("faction_memberships", 24)
  trimArray("faction_reputations", 24)
  trimArray("canonical_resource_states_for_present_characters", 64)
  trimArray("canonical_inventory_for_present_characters", 96)
  trimArray("charged_inventory_items_for_present_characters", 48)

  const memory = record(payload.relevant_long_term_memory)
  memory.facts = rows(memory.facts).slice(0, 12)
  memory.summaries = rows(memory.summaries).slice(0, 4)
  payload.relevant_long_term_memory = memory

  const quests = record(payload.active_quest_context)
  quests.active_quests = rows(quests.active_quests)
    .slice(0, 6)
    .map((quest) => ({
      ...quest,
      active_stages: rows(quest.active_stages).slice(0, 3),
      recent_completed_stages:
        rows(quest.recent_completed_stages).slice(0, 4),
    }))
  payload.active_quest_context = quests

  json = JSON.stringify(payload)
  if (
    new TextEncoder().encode(json).length <= MAX_PROMPT_CONTEXT_JSON_BYTES
  ) {
    return json
  }

  return JSON.stringify({
    contract: payload.contract,
    current_game_time: payload.current_game_time,
    source_audience: payload.source_audience,
    room: payload.room,
    source_character: payload.source_character,
    source_location: payload.source_location,
    source_location_structure: payload.source_location_structure,
    source_character_knowledge: payload.source_character_knowledge,
    retrieved_campaign_context: payload.retrieved_campaign_context,
    participating_players: payload.participating_players,
    characters_physically_present_with_source:
      payload.characters_physically_present_with_source,
    canonical_sheets_for_present_characters:
      payload.canonical_sheets_for_present_characters,
    canonical_resource_states_for_present_characters:
      Array.isArray(payload.canonical_resource_states_for_present_characters)
        ? payload.canonical_resource_states_for_present_characters.slice(0, 40)
        : [],
    canonical_inventory_for_present_characters:
      Array.isArray(payload.canonical_inventory_for_present_characters)
        ? payload.canonical_inventory_for_present_characters.slice(0, 64)
        : [],
    source_inventory_room: payload.source_inventory_room,
    present_npc_profiles: payload.present_npc_profiles,
    present_npc_identity_fingerprints: payload.present_npc_identity_fingerprints,
    canonical_npc_runtime: payload.canonical_npc_runtime,
    active_scene_actors: payload.active_scene_actors,
    active_quest_context: {
      ...record(payload.active_quest_context),
      active_quests: rows(record(payload.active_quest_context).active_quests)
        .slice(0, 4),
    },
    relevant_long_term_memory: {
      facts: rows(record(payload.relevant_long_term_memory).facts).slice(0, 8),
      summaries:
        rows(record(payload.relevant_long_term_memory).summaries).slice(0, 2),
    },
    background_temporal_context: payload.background_temporal_context,
    cooperative_time_sync: payload.cooperative_time_sync,
    recent_chat_messages_all_authors: payload.recent_chat_messages_all_authors,
    context_metrics: payload.context_metrics,
    explicit_player_name_mentions: payload.explicit_player_name_mentions,
  })
}

export function stage19ContextTelemetry(context: Stage2GameChatContext) {
  const bytes =
    new TextEncoder().encode(stage2ContextForPrompt(context)).length
  return {
    context_message_count: context.recentMessages.length,
    stage19_eligible_message_count: context.contextMetrics.eligibleMessageCount,
    stage19_projected_message_count: context.contextMetrics.projectedMessageCount,
    stage19_recent_message_json_bytes:
      context.contextMetrics.recentMessageJsonBytes,
    stage19_context_json_bytes: bytes,
    stage19_estimated_context_tokens: Math.ceil(bytes / 4),
  }
}

export function stage21BehaviorProfileTelemetry(
  context: Stage2GameChatContext,
) {
  const profile = record(context.gmBehaviorProfile)
  return {
    stage21_gm_behavior_profile_key:
      nullableString(profile.profile_key) || "adventure",
    stage21_gm_behavior_dimensions:
      record(profile.dimensions),
  }
}


export function stage22DirectorPreferenceTelemetry(
  context: Stage2GameChatContext,
) {
  const preferences = record(context.directorPreferences)
  return {
    stage22_director_participant_count:
      nullableNumber(preferences.participant_count) || 0,
    stage22_director_configured_count:
      nullableNumber(preferences.configured_count) || 0,
    stage22_director_dimensions:
      record(preferences.dimensions),
    stage22_director_version_vector:
      Array.isArray(preferences.version_vector)
        ? preferences.version_vector
        : [],
  }
}


export function stage23ContentProfileTelemetry(
  context: Stage2GameChatContext,
) {
  const profile = record(context.contentProfile)
  return {
    stage23_content_mode: nullableString(profile.mode) || "off",
    stage23_content_enabled: profile.enabled === true,
    stage23_content_permissions: record(profile.permissions),
  }
}


export function npcDialogueContextForPrompt(
  context: Stage2GameChatContext,
  npcCharacterId: string,
  priorOutputs: JsonRecord[] = [],
) {
  const npc = context.presentCharacters.find(
    (item) =>
      String(item.id) === npcCharacterId &&
      item.character_type === "npc",
  )
  if (!npc) throw new Error("ai_gm_npc_dialogue_context_absent")

  const profile = context.npcProfiles.find(
    (item) => String(item.character_id) === npcCharacterId,
  ) || {}
  const identity = context.npcIdentities.find(
    (item) => String(item.character_id) === npcCharacterId,
  ) || null
  const sheet = context.sheets.find(
    (item) => String(item.character_id) === npcCharacterId,
  ) || null

  const safeProfile = {
    character_id: profile.character_id || npcCharacterId,
    role: profile.role || null,
    species: profile.species || null,
    creature_type: profile.creature_type || null,
    size: profile.size || null,
    challenge_rating: profile.challenge_rating ?? null,
    occupation: profile.occupation || null,
    faction: profile.faction || null,
    appearance: profile.appearance || null,
    demeanor: profile.demeanor || null,
    motivation: profile.motivation || null,
    public_notes: profile.public_notes || null,
    tags: profile.tags || [],
    inventory_text: profile.inventory_text || "",
    inventory_data: Array.isArray(profile.inventory_data)
      ? profile.inventory_data
      : [],
  }

  const nameById = new Map(
    context.presentCharacters.map((item) => [
      String(item.id),
      String(item.name || ""),
    ]),
  )
  const relationships = context.relationships
    .filter(
      (item) =>
        String(item.subject_character_id) === npcCharacterId ||
        String(item.target_character_id) === npcCharacterId,
    )
    .map((item) => ({
      subject_character_id: item.subject_character_id,
      subject_name: nameById.get(String(item.subject_character_id)) || null,
      target_character_id: item.target_character_id,
      target_name: nameById.get(String(item.target_character_id)) || null,
      relationship_kind: item.relationship_kind,
      public_label: item.public_label,
      attitude_score: item.attitude_score,
      state: item.state,
    }))

  const visibleCharacterIds = new Set(
    context.presentCharacters.map((item) => String(item.id)),
  )
  const presenceSinceRaw =
    typeof npc.world_state_updated_at === "string"
      ? npc.world_state_updated_at
      : ""
  const presenceSince = Date.parse(presenceSinceRaw)
  const visibleRecentMessages = context.recentMessages
    .filter((message) => {
      const characterId =
        typeof message.character_id === "string"
          ? message.character_id
          : null
      if (characterId && !visibleCharacterIds.has(characterId)) return false
      if (!Number.isFinite(presenceSince)) return false
      const createdAt = Date.parse(String(message.created_at || ""))
      return Number.isFinite(createdAt) && createdAt >= presenceSince
    })
    .slice(-16)
    .map((message) => ({
      id: message.id,
      author_name: message.author_name,
      character_id: message.character_id,
      body: message.body,
      mechanic: message.mechanic || null,
      campaign_day: message.campaign_day,
      day_period: message.day_period,
    }))

  const visibleFacts = context.memory.facts
    .filter((item) => item.visibility !== "gm")
    .filter(
      (item) =>
        String(item.subject_id || "") === npcCharacterId ||
        strings(item.visible_character_ids).includes(npcCharacterId),
    )
    .map((item) => ({
      fact_key: item.fact_key,
      subject_type: item.subject_type,
      subject_id: item.subject_id,
      predicate: item.predicate,
      statement: item.statement,
      structured_value: item.structured_value,
      confidence: item.confidence,
      campaign_day: item.campaign_day,
      day_period: item.day_period,
      game_age_days: item.game_age_days,
    }))

  const visibleSummaries = context.memory.summaries
    .filter((item) => item.visibility !== "gm")
    .filter((item) =>
      strings(item.visible_character_ids).includes(npcCharacterId)
    )
    .map((item) => ({
      title: item.title,
      summary: item.summary,
      campaign_day: item.campaign_day,
      day_period: item.day_period,
      game_age_days: item.game_age_days,
    }))

  return JSON.stringify({
    contract: {
      identity: "You are this NPC only, never the GM or a player character.",
      knowledge_boundary:
        "Use only this object. If a fact is absent, the NPC does not know it.",
      no_omniscient_quest_context: true,
      no_hidden_gm_notes: true,
      identity_fingerprint_is_stable_personality_canon: true,
      hard_red_lines_are_non_negotiable: true,
      mutable_relationship_or_mood_must_not_rewrite_identity: true,
    },
    content_profile: context.contentProfile,
    current_game_time: context.currentGameTime,
    room: {
      id: context.room.id,
      title: context.room.title,
      location_id: context.room.location_id,
    },
    source_location: context.sourceLocation,
    cooperative_time_sync: context.temporalSync,
    background_temporal_context: {
      scene_day: context.background.scene_day ?? null,
      world_snapshot: context.background.world_snapshot ?? null,
      source_location_snapshot: context.background.source_location_snapshot ?? null,
      npc_snapshot:
        rows(context.background.npc_snapshots)
          .find((item) => String(item.entity_id) === npcCharacterId)
          ?.snapshot || null,
    },
    npc: {
      id: npc.id,
      name: npc.name,
      character_class: npc.character_class,
      level: npc.level,
      profile: safeProfile,
      identity_fingerprint: identity
        ? {
            version: identity.version,
            bootstrap_state: identity.bootstrap_state,
            fingerprint_hash: identity.fingerprint_hash,
            core: record(identity.core),
            last_major_event_id: identity.last_major_event_id || null,
          }
        : null,
      sheet,
      resource_states: context.resourceStates.filter(
        (item) => String(item.character_id) === npcCharacterId,
      ),
      charged_inventory_items: context.inventoryChargeItems.filter(
        (item) => String(item.character_id) === npcCharacterId,
      ),
    },
    source_character: {
      id: context.sourceCharacter.id,
      name: context.sourceCharacter.name,
      character_class: context.sourceCharacter.character_class,
      level: context.sourceCharacter.level,
    },
    physically_present_characters: context.presentCharacters.map((item) => ({
      id: item.id,
      name: item.name,
      character_type: item.character_type,
    })),
    relationships,
    owned_assets: context.assets.filter(
      (item) => String(item.owner_character_id) === npcCharacterId,
    ),
    faction_memberships: context.factionMemberships.filter(
      (item) => String(item.character_id) === npcCharacterId,
    ),
    faction_reputations: context.factionReputations.filter(
      (item) => String(item.character_id) === npcCharacterId,
    ),
    explicitly_visible_memory: {
      facts: visibleFacts,
      summaries: visibleSummaries,
    },
    recent_messages_observed_since_current_presence: visibleRecentMessages,
    prior_messages_in_this_ai_turn: priorOutputs.slice(-12),
  })
}
