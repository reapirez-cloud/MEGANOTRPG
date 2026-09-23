import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

type JsonRecord = Record<string, unknown>

export type Stage2GameChatContext = {
  room: JsonRecord
  sourceCharacter: JsonRecord
  sourceLocation: JsonRecord | null
  currentGameTime: {
    campaignDay: number | null
    dayPeriod: string | null
  }
  sourceAudience: {
    scope: "scene" | "direct_pc"
    recipientCharacterIds: string[]
  }
  players: JsonRecord[]
  presentCharacters: JsonRecord[]
  sheets: JsonRecord[]
  resourceStates: JsonRecord[]
  inventoryChargeItems: JsonRecord[]
  npcProfiles: JsonRecord[]
  npcRuntime: JsonRecord[]
  relationships: JsonRecord[]
  assets: JsonRecord[]
  factionMemberships: JsonRecord[]
  factionReputations: JsonRecord[]
  activeQuestContext: JsonRecord
  memory: {
    facts: JsonRecord[]
    summaries: JsonRecord[]
  }
  recentMessages: JsonRecord[]
  mentionedPlayerCharacters: Array<{ id: string; name: string }>
}

const CHAT_CONTEXT_LIMIT = 50
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

function lower(value: unknown) {
  return typeof value === "string"
    ? value.toLocaleLowerCase("ru-RU")
    : ""
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function gameTimeFromEvent(event: JsonRecord | undefined) {
  const payload = record(event?.payload)
  return {
    campaignDay: nullableNumber(payload.campaign_day),
    dayPeriod: nullableString(payload.day_period),
    sourceLocationId:
      nullableString(event?.location_id) ||
      nullableString(payload.location_snapshot),
  }
}

function withGameAge(
  item: JsonRecord,
  event: JsonRecord | undefined,
  currentDay: number | null,
) {
  const time = gameTimeFromEvent(event)
  return {
    ...item,
    campaign_day: time.campaignDay,
    day_period: time.dayPeriod,
    game_age_days:
      currentDay !== null && time.campaignDay !== null
        ? Math.max(0, currentDay - time.campaignDay)
        : null,
    source_location_id: time.sourceLocationId,
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
      .in("quest_id", activeQuestIds),
    admin
      .from("quest_stages")
      .select("id,quest_id,stage_key,position,status,player_title,completion_text,completed_at")
      .in("quest_id", activeQuestIds)
      .in("status", ["active", "completed"])
      .order("position", { ascending: true }),
    admin
      .from("quest_targets")
      .select("id,quest_id,stage_id,target_key,target_kind,placeholder_label,internal_note,binding_state,location_id,npc_character_id,item_definition_id")
      .in("quest_id", activeQuestIds),
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
        .in("stage_id", activeStageIds),
      admin
        .from("quest_condition_groups")
        .select("id,stage_id,group_key,mode,position")
        .in("stage_id", activeStageIds)
        .order("position", { ascending: true }),
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
    historyResult,
    charactersResult,
    worldStatesResult,
    roomMembersResult,
    memoryFactsResult,
    memorySummariesResult,
  ] = await Promise.all([
    admin
      .from("chat_rooms")
      .select("id,title,category,room_type,open_to_campaign,campaign_can_write,location_id,campaign_day,day_period,scene_state,room_state")
      .eq("id", roomId)
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    admin
      .from("chat_messages")
      .select("id,author_name,body,user_id,character_id,event_kind,event_payload,attachment_kind,turn_command_id,turn_component,turn_order,audience_scope,recipient_character_ids,created_at")
      .eq("room_id", roomId)
      .lte("id", sourceMessageId)
      .order("id", { ascending: false })
      .limit(CHAT_CONTEXT_LIMIT),
    admin
      .from("characters")
      .select("id,assigned_user_id,name,character_class,level,character_type,life_state,publication_state,bio")
      .eq("campaign_id", campaignId)
      .eq("publication_state", "campaign"),
    admin
      .from("character_world_state")
      .select("character_id,location_id,campaign_day,day_period,updated_at")
      .eq("campaign_id", campaignId),
    admin
      .from("chat_room_members")
      .select("user_id,can_read,can_write")
      .eq("room_id", roomId),
    admin
      .from("campaign_memory_facts")
      .select("id,fact_key,subject_type,subject_id,predicate,statement,structured_value,status,confidence,source_event_ids,visibility,room_id,visible_character_ids,provenance,updated_at")
      .eq("campaign_id", campaignId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(80),
    admin
      .from("campaign_memory_summaries")
      .select("id,title,summary,key_event_ids,visibility,room_id,visible_character_ids,period_start,period_end,status,updated_at")
      .eq("campaign_id", campaignId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(24),
  ])

  const firstError =
    roomResult.error ||
    historyResult.error ||
    charactersResult.error ||
    worldStatesResult.error ||
    roomMembersResult.error ||
    memoryFactsResult.error ||
    memorySummariesResult.error

  if (firstError) throw new Error(firstError.message)

  const room = record(roomResult.data)
  if (!room.id) throw new Error("ai_gm_stage2_room_not_found")

  const characters = rows(charactersResult.data)
  const sourceCharacter =
    characters.find((item) => item.id === sourceCharacterId) || null
  if (!sourceCharacter) throw new Error("ai_gm_stage2_source_character_not_found")

  const worldStates = rows(worldStatesResult.data)
  const worldByCharacter = new Map(
    worldStates.map((item) => [String(item.character_id), item]),
  )
  const sourceWorld = worldByCharacter.get(sourceCharacterId) || {}
  const sourceLocationId =
    nullableString(sourceWorld.location_id) || nullableString(room.location_id)
  const currentDay =
    nullableNumber(sourceWorld.campaign_day) ?? nullableNumber(room.campaign_day)
  const currentPeriod =
    nullableString(sourceWorld.day_period) || nullableString(room.day_period)

  const locationIds = unique(
    worldStates.map((item) => nullableString(item.location_id))
      .concat(sourceLocationId ? [sourceLocationId] : []),
  )
  const locationsResult = locationIds.length
    ? await admin
        .from("locations")
        .select("id,name,summary,parent_location_id,visibility_mode,lifecycle_state")
        .eq("campaign_id", campaignId)
        .in("id", locationIds)
    : { data: [], error: null }

  if (locationsResult.error) throw new Error(locationsResult.error.message)

  const locations = rows(locationsResult.data)
  const locationById = new Map(
    locations.map((location) => [String(location.id), location]),
  )
  const sourceLocation = sourceLocationId
    ? locationById.get(sourceLocationId) || null
    : null

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

  const presentCharacters = characters
    .filter((character) => {
      if (character.life_state !== "alive") return false
      if (String(character.id) === sourceCharacterId) return true
      if (!sourceLocationId) return false
      return nullableString(
        worldByCharacter.get(String(character.id))?.location_id,
      ) === sourceLocationId
    })
    .map((character) => {
      const world = worldByCharacter.get(String(character.id)) || {}
      return {
        id: character.id,
        name: character.name,
        character_type: character.character_type,
        character_class: character.character_class,
        level: character.level,
        bio: character.bio,
        location_id: nullableString(world.location_id),
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

  const [
    sheetsResult,
    resourceStatesResult,
    inventoryChargesResult,
    npcProfilesResult,
    npcRuntimeResult,
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
          .select("id,character_id,name,usage_mode,charges_current,charges_max,item_state,updated_at")
          .in("character_id", relevantCharacterIds)
          .eq("usage_mode", "charges")
          .limit(120)
      : Promise.resolve({ data: [], error: null }),
    presentNpcIds.length
      ? admin
          .from("npc_profiles")
          .select("character_id,role,species,creature_type,size,challenge_rating,occupation,faction,appearance,demeanor,motivation,public_notes,gm_notes,tags,inventory_text,inventory_data")
          .eq("campaign_id", campaignId)
          .in("character_id", presentNpcIds)
      : Promise.resolve({ data: [], error: null }),
    presentNpcIds.length
      ? admin.rpc("read_ai_gm_npc_runtime_v1", {
          p_campaign_id: campaignId,
          p_npc_ids: presentNpcIds,
        })
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("character_relationships")
      .select("id,subject_character_id,target_character_id,relationship_kind,public_label,attitude_score,player_note,gm_note,state,updated_at")
      .eq("campaign_id", campaignId)
      .eq("state", "active")
      .order("updated_at", { ascending: false })
      .limit(120),
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
    npcProfilesResult.error ||
    npcRuntimeResult.error ||
    relationshipsResult.error ||
    assetsResult.error ||
    factionMembershipResult.error ||
    factionReputationResult.error

  if (contextError) throw new Error(contextError.message)

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
      ),
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

  const history = rows(historyResult.data).reverse()
  const historyMessageIds = history.map((item) => String(item.id))
  const chatEventsResult = historyMessageIds.length
    ? await admin
        .from("campaign_events")
        .select("id,source_id,payload,occurred_at")
        .eq("campaign_id", campaignId)
        .eq("source_kind", "chat_message")
        .in("source_id", historyMessageIds)
    : { data: [], error: null }

  if (chatEventsResult.error) throw new Error(chatEventsResult.error.message)

  const chatEventByMessage = new Map(
    rows(chatEventsResult.data).map((item) => [String(item.source_id), item]),
  )

  const sourceMessage =
    history.find((message) => Number(message.id) === sourceMessageId) || {}
  const sourceAudienceScope =
    nullableString(sourceMessage.audience_scope) === "direct_pc"
      ? "direct_pc"
      : "scene"
  const sourceAudience = {
    scope: sourceAudienceScope as "scene" | "direct_pc",
    recipientCharacterIds: strings(sourceMessage.recipient_character_ids),
  }

  const recentMessages = history
    .filter((message) => {
      if (Number(message.id) === sourceMessageId) return true
      const event = chatEventByMessage.get(String(message.id))
      if (!event) return false

      const eventLocationId = nullableString(event.location_id)
      if (sourceLocationId && eventLocationId !== sourceLocationId) return false
      if (!sourceLocationId && eventLocationId) return false

      if (nullableString(event.visibility) === "characters") {
        const visibleCharacterIds = strings(event.visible_character_ids)
        return visibleCharacterIds.includes(sourceCharacterId)
      }

      return true
    })
    .map((message) => {
      const event = chatEventByMessage.get(String(message.id))
      return withGameAge({
        id: message.id,
        author_name: message.author_name,
        character_id: message.character_id,
        body: message.body,
        event_kind: message.event_kind,
        event_payload: message.event_payload,
        attachment_kind: message.attachment_kind,
        turn_command_id: message.turn_command_id,
        turn_component: message.turn_component,
        turn_order: message.turn_order,
        audience_scope: message.audience_scope,
        recipient_character_ids: message.recipient_character_ids,
        created_at: message.created_at,
      }, event, currentDay)
    })

  const rawFacts = rows(memoryFactsResult.data)
    .filter((item) => memoryVisible(item, roomId))
    .filter((item) => memoryRelevant(item, roomId, relevantIdSet))
    .slice(0, MAX_MEMORY_FACTS)
  const rawSummaries = rows(memorySummariesResult.data)
    .filter((item) => memoryVisible(item, roomId))
    .filter((item) => item.room_id === roomId || !item.room_id)
    .slice(0, MAX_MEMORY_SUMMARIES)

  const memoryEventIds = unique(
    rawFacts.flatMap((item) => strings(item.source_event_ids))
      .concat(rawSummaries.flatMap((item) => strings(item.key_event_ids))),
  )
  let memoryEventById = new Map<string, JsonRecord>()

  if (memoryEventIds.length) {
    const memoryEventsResult = await admin
      .from("campaign_events")
      .select("id,location_id,visibility,visible_character_ids,payload,occurred_at")
      .eq("campaign_id", campaignId)
      .in("id", memoryEventIds)

    if (memoryEventsResult.error) throw new Error(memoryEventsResult.error.message)
    memoryEventById = new Map(
      rows(memoryEventsResult.data).map((item) => [String(item.id), item]),
    )
  }

  function newestSourceEvent(ids: string[]) {
    const candidates = ids
      .map((id) => memoryEventById.get(id))
      .filter((item): item is JsonRecord => Boolean(item))
      .sort((a, b) =>
        String(b.occurred_at || "").localeCompare(String(a.occurred_at || ""))
      )
    return candidates[0]
  }

  function belongsToSourceScene(item: JsonRecord) {
    const sourceMemoryLocation = nullableString(item.source_location_id)
    if (sourceMemoryLocation) {
      return sourceMemoryLocation === sourceLocationId
    }

    // Old room-local memories without a location snapshot are ambiguous in a
    // split-party room. Fail closed instead of leaking another scene.
    if (item.room_id === roomId && sourceLocationId) return false

    // Campaign/global facts without a physical location remain valid.
    return true
  }

  const memoryFacts = rawFacts
    .map((item) =>
      withGameAge(
        item,
        newestSourceEvent(strings(item.source_event_ids)),
        currentDay,
      )
    )
    .filter(belongsToSourceScene)
  const memorySummaries = rawSummaries
    .map((item) =>
      withGameAge(
        item,
        newestSourceEvent(strings(item.key_event_ids)),
        currentDay,
      )
    )
    .filter(belongsToSourceScene)

  const originalMessage =
    nullableString(jobInput.original_message)?.toLocaleLowerCase("ru-RU") || ""
  const mentionedPlayerCharacters = playerCharacters
    .filter((player) => player.id !== sourceCharacterId)
    .filter((player) => {
      const name = lower(player.name)
      return Boolean(name) && originalMessage.includes(name)
    })
    .map((player) => ({ id: String(player.id), name: String(player.name) }))

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
    currentGameTime: {
      campaignDay: currentDay,
      dayPeriod: currentPeriod,
    },
    sourceAudience,
    players: playerCharacters,
    presentCharacters,
    sheets: rows(sheetsResult.data),
    resourceStates: rows(resourceStatesResult.data),
    inventoryChargeItems: rows(inventoryChargesResult.data),
    npcProfiles: rows(npcProfilesResult.data),
    npcRuntime: rows(npcRuntimeResult.data),
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
    recentMessages,
    mentionedPlayerCharacters,
  }
}

export function stage2ContextForPrompt(context: Stage2GameChatContext) {
  return JSON.stringify({
    contract: {
      recent_message_limit: CHAT_CONTEXT_LIMIT,
      player_locations_are_independent: true,
      do_not_merge_split_party_scenes: true,
      pc_autonomy: "never speak, decide or act for a player character",
      physical_scene_history_only: true,
      direct_pc_audience_is_server_authoritative: true,
      direct_pc_never_authorizes_ai_to_speak_for_recipient: true,
    },
    current_game_time: context.currentGameTime,
    source_audience: context.sourceAudience,
    room: context.room,
    source_character: context.sourceCharacter,
    source_location: context.sourceLocation,
    players: context.players,
    characters_physically_present_with_source: context.presentCharacters,
    canonical_sheets_for_present_characters: context.sheets,
    canonical_resource_states_for_present_characters: context.resourceStates,
    charged_inventory_items_for_present_characters: context.inventoryChargeItems,
    present_npc_profiles: context.npcProfiles,
    canonical_npc_runtime: context.npcRuntime,
    relationships: context.relationships,
    property_and_assets: context.assets,
    faction_memberships: context.factionMemberships,
    faction_reputations: context.factionReputations,
    active_quest_context: context.activeQuestContext,
    relevant_long_term_memory: context.memory,
    recent_chat_messages_all_authors: context.recentMessages,
    explicit_player_name_mentions: context.mentionedPlayerCharacters,
  })
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
      event_kind: message.event_kind,
      event_payload: message.event_payload,
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
    },
    current_game_time: context.currentGameTime,
    room: {
      id: context.room.id,
      title: context.room.title,
      location_id: context.room.location_id,
    },
    source_location: context.sourceLocation,
    npc: {
      id: npc.id,
      name: npc.name,
      character_class: npc.character_class,
      level: npc.level,
      profile: safeProfile,
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
