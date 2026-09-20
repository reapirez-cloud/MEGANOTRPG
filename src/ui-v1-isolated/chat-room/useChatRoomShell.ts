import { useCallback, useEffect, useState } from "react"

import { resolveCampaignMediaUrl } from "../../lib/campaignMedia"
import { supabase } from "../../lib/supabase"
import {
  CHAT_SPEAKER_CHANGED_EVENT,
  chatSpeakerStorageKey,
  type ChatRoomDayPeriod,
  type ChatRoomHeaderCharacter,
  type ChatRoomShellModel,
} from "./chatRoomContracts"

type MembershipRow = {
  campaign_id: string
  active_character_id: string | null
  role: string
  is_owner: boolean
}

type RoomRow = {
  id: string
  title: string
  room_type: string
  character_id: string | null
  is_read_only: boolean
  location_id: string | null
  campaign_day: number | null
  day_period: string | null
  context_location_id: string | null
  context_campaign_day: number | null
  context_day_period: string | null
}

type CharacterRow = {
  id: string
  assigned_user_id: string | null
  name: string
  character_class: string | null
  level: number | null
  avatar_url: string | null
}

type SheetRow = {
  current_hp: number | null
  max_hp: number | null
  temp_hp: number | null
}

type WorldStateRow = {
  location_id: string | null
  campaign_day: number | null
  day_period: string | null
}

type ActorBindingRow = {
  character_id: string
}

type InventoryItemRow = {
  definition_id: string | null
  definition_revision: number | null
  mechanics: unknown
}

type DefinitionRevisionRow = {
  definition_id: string
  revision: number
  data: unknown
}

function normalizePeriod(value: string | null | undefined): ChatRoomDayPeriod | null {
  if (
    value === "dawn" ||
    value === "morning" ||
    value === "day" ||
    value === "late_day" ||
    value === "evening" ||
    value === "night" ||
    value === "deep_night"
  ) {
    return value
  }
  return null
}

function normalizeRoomType(value: string): ChatRoomShellModel["roomType"] {
  if (value === "character" || value === "flood") return value
  return "scene"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function itemMechanicsContainWeaponAction(mechanics: unknown) {
  if (!Array.isArray(mechanics)) return false

  return mechanics.some((entry) => {
    if (!isRecord(entry) || entry.type !== "action") return false

    const tags = Array.isArray(entry.tags)
      ? entry.tags.filter((tag): tag is string => typeof tag === "string")
      : []
    const label = typeof entry.label === "string" ? entry.label.toLocaleLowerCase("ru-RU") : ""

    return (
      tags.some((tag) => tag.toLocaleLowerCase("en-US") === "weapon") ||
      label.includes("атак") ||
      typeof entry.attackAbility === "string" ||
      Array.isArray(entry.damage)
    )
  })
}

function definitionHasWeaponRole(data: unknown) {
  if (!isRecord(data)) return false
  const profile = data.inventory_profile
  if (!isRecord(profile)) return false

  const semanticRole =
    typeof profile.semantic_role === "string"
      ? profile.semantic_role.toLocaleLowerCase("en-US")
      : ""

  return semanticRole.startsWith("weapon.")
}

async function resolveMembership(userId: string): Promise<MembershipRow | null> {
  const rememberedCampaignId =
    window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
    window.localStorage.getItem("meganotrpg:campaign-id") ||
    ""

  if (rememberedCampaignId) {
    const remembered = await supabase
      .from("campaign_members")
      .select("campaign_id, active_character_id, role, is_owner")
      .eq("campaign_id", rememberedCampaignId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!remembered.error && remembered.data) {
      return remembered.data as MembershipRow
    }
  }

  const first = await supabase
    .from("campaign_members")
    .select("campaign_id, active_character_id, role, is_owner, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)

  const membership = first.data?.[0] as MembershipRow | undefined
  if (!membership) return null

  window.localStorage.setItem(
    "meganotrpg:v1:campaign-id",
    membership.campaign_id,
  )
  return membership
}

async function loadCharacter(
  campaignId: string,
  characterId: string,
): Promise<CharacterRow | null> {
  const result = await supabase
    .from("characters")
    .select("id, assigned_user_id, name, character_class, level, avatar_url")
    .eq("campaign_id", campaignId)
    .eq("id", characterId)
    .maybeSingle()

  return (result.data as CharacterRow | null) || null
}

async function resolvePlayerCharacterId({
  campaignId,
  room,
  userId,
  activeCharacterId,
}: {
  campaignId: string
  room: RoomRow
  userId: string
  activeCharacterId: string | null
}) {
  if (room.room_type === "character" && room.character_id) {
    const roomCharacter = await loadCharacter(campaignId, room.character_id)
    return roomCharacter?.assigned_user_id === userId ? roomCharacter.id : null
  }

  if (room.room_type !== "scene" || !activeCharacterId) return null

  const participant = await supabase
    .from("scene_participants")
    .select("character_id")
    .eq("room_id", room.id)
    .eq("character_id", activeCharacterId)
    .maybeSingle()

  return participant.data?.character_id || null
}

async function resolveGmCharacterId({
  campaignId,
  roomId,
  userId,
}: {
  campaignId: string
  roomId: string
  userId: string
}) {
  const stored = window.localStorage.getItem(
    chatSpeakerStorageKey(campaignId, roomId, userId),
  )

  if (!stored || stored === "narrator") return null

  const binding = await supabase
    .from("chat_actor_bindings")
    .select("character_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .eq("character_id", stored)
    .maybeSingle()

  return (binding.data as ActorBindingRow | null)?.character_id || null
}

async function loadCharacterPresentation(
  campaignId: string,
  characterId: string,
) {
  const [characterResult, sheetResult, worldResult, inventoryResult] =
    await Promise.all([
      supabase
        .from("characters")
        .select("id, assigned_user_id, name, character_class, level, avatar_url")
        .eq("campaign_id", campaignId)
        .eq("id", characterId)
        .maybeSingle(),
      supabase
        .from("character_sheets")
        .select("current_hp, max_hp, temp_hp")
        .eq("character_id", characterId)
        .maybeSingle(),
      supabase
        .from("character_world_state")
        .select("location_id, campaign_day, day_period")
        .eq("campaign_id", campaignId)
        .eq("character_id", characterId)
        .maybeSingle(),
      supabase
        .from("character_inventory_items")
        .select("definition_id, definition_revision, mechanics")
        .eq("character_id", characterId)
        .eq("equipped", true)
        .in("equipment_slot", ["main_hand", "off_hand"]),
    ])

  const character = (characterResult.data as CharacterRow | null) || null
  const sheet = (sheetResult.data as SheetRow | null) || null
  const world = (worldResult.data as WorldStateRow | null) || null
  const inventory = (inventoryResult.data || []) as InventoryItemRow[]

  const definitionPairs = inventory
    .filter(
      (item) =>
        item.definition_id &&
        typeof item.definition_revision === "number",
    )
    .map((item) => ({
      definitionId: item.definition_id!,
      revision: item.definition_revision!,
    }))

  let definitionRevisions: DefinitionRevisionRow[] = []
  if (definitionPairs.length) {
    const ids = [...new Set(definitionPairs.map((pair) => pair.definitionId))]
    const result = await supabase
      .from("reference_definition_revisions")
      .select("definition_id, revision, data")
      .in("definition_id", ids)

    definitionRevisions = (result.data || []) as DefinitionRevisionRow[]
  }

  const revisionMap = new Map(
    definitionRevisions.map((revision) => [
      revision.definition_id + ":" + revision.revision,
      revision,
    ]),
  )

  const hasEquippedWeapon = inventory.some((item) => {
    if (itemMechanicsContainWeaponAction(item.mechanics)) return true
    if (!item.definition_id || typeof item.definition_revision !== "number") {
      return false
    }

    return definitionHasWeaponRole(
      revisionMap.get(
        item.definition_id + ":" + item.definition_revision,
      )?.data,
    )
  })

  if (!character) {
    return {
      character: null,
      world,
      hasEquippedWeapon: false,
    }
  }

  const avatarUrl = character.avatar_url
    ? (await resolveCampaignMediaUrl(character.avatar_url)) || character.avatar_url
    : null

  const presentation: ChatRoomHeaderCharacter = {
    id: character.id,
    name: character.name,
    className: character.character_class || "Без класса",
    level: Math.max(1, Number(character.level || 1)),
    avatarUrl,
    currentHp:
      typeof sheet?.current_hp === "number" ? sheet.current_hp : null,
    maxHp: typeof sheet?.max_hp === "number" ? sheet.max_hp : null,
    tempHp: Math.max(0, Number(sheet?.temp_hp || 0)),
  }

  return {
    character: presentation,
    world,
    hasEquippedWeapon,
  }
}

export function useChatRoomShell(roomId: string) {
  const [model, setModel] = useState<ChatRoomShellModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)

    const auth = await supabase.auth.getUser()
    if (auth.error || !auth.data.user) {
      setModel(null)
      setError(auth.error?.message || "Сессия не найдена")
      if (!silent) setLoading(false)
      return
    }

    const userId = auth.data.user.id
    const membership = await resolveMembership(userId)
    if (!membership) {
      setModel(null)
      setError("Кампания не найдена")
      if (!silent) setLoading(false)
      return
    }

    const roomsResult = await supabase.rpc("get_campaign_chat_rooms", {
      p_campaign_id: membership.campaign_id,
    })

    if (roomsResult.error) {
      setModel(null)
      setError(roomsResult.error.message)
      if (!silent) setLoading(false)
      return
    }

    const room = ((roomsResult.data || []) as RoomRow[]).find(
      (candidate) => candidate.id === roomId,
    )

    if (!room) {
      setModel(null)
      setError("Комната недоступна")
      if (!silent) setLoading(false)
      return
    }

    const canManage = membership.role === "gm" || membership.is_owner === true
    const characterId = canManage
      ? await resolveGmCharacterId({
          campaignId: membership.campaign_id,
          roomId: room.id,
          userId,
        })
      : await resolvePlayerCharacterId({
          campaignId: membership.campaign_id,
          room,
          userId,
          activeCharacterId: membership.active_character_id,
        })

    const presentation = characterId
      ? await loadCharacterPresentation(membership.campaign_id, characterId)
      : {
          character: null,
          world: null,
          hasEquippedWeapon: false,
        }

    const locationId =
      presentation.world?.location_id ||
      room.context_location_id ||
      room.location_id ||
      null

    let locationName: string | null = null
    if (locationId) {
      const locationResult = await supabase
        .from("locations")
        .select("name")
        .eq("campaign_id", membership.campaign_id)
        .eq("id", locationId)
        .maybeSingle()

      locationName = locationResult.data?.name || null
    }

    setModel({
      roomId: room.id,
      roomTitle: room.title,
      roomType: normalizeRoomType(room.room_type),
      readOnly: Boolean(room.is_read_only),
      canManage,
      viewer: {
        campaignId: membership.campaign_id,
        userId,
      },
      identity: canManage
        ? presentation.character
          ? { kind: "character", character: presentation.character }
          : { kind: "narrator", name: "Рассказчик" }
        : presentation.character
          ? { kind: "character", character: presentation.character }
          : null,
      context: {
        campaignDay:
          presentation.world?.campaign_day ??
          room.context_campaign_day ??
          room.campaign_day ??
          null,
        dayPeriod: normalizePeriod(
          presentation.world?.day_period ||
            room.context_day_period ||
            room.day_period,
        ),
        locationName,
      },
      quickActions: {
        hasCharacter: Boolean(presentation.character),
        hasEquippedWeapon: presentation.hasEquippedWeapon,
      },
    })
    if (!silent) setLoading(false)
  }, [roomId])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      await load()
      if (cancelled) return
    }

    const handleSpeakerChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string }>).detail
      if (detail?.roomId && detail.roomId !== roomId) return
      void load(true)
    }

    window.addEventListener(CHAT_SPEAKER_CHANGED_EVENT, handleSpeakerChanged)
    void run()

    return () => {
      cancelled = true
      window.removeEventListener(CHAT_SPEAKER_CHANGED_EVENT, handleSpeakerChanged)
    }
  }, [load, roomId])

  return {
    model,
    loading,
    error,
    reload: () => load(false),
  }
}
