import { useCallback, useEffect, useState } from "react"

import { resolveCampaignMediaUrl } from "../../lib/campaignMedia"
import { supabase } from "../../lib/supabase"
import type {
  ChatRoomDayPeriod,
  ChatRoomShellModel,
} from "./chatRoomContracts"

type MembershipRow = {
  campaign_id: string
  active_character_id: string | null
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

async function resolveMembership(userId: string): Promise<MembershipRow | null> {
  const rememberedCampaignId =
    window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
    window.localStorage.getItem("meganotrpg:campaign-id") ||
    ""

  if (rememberedCampaignId) {
    const remembered = await supabase
      .from("campaign_members")
      .select("campaign_id, active_character_id")
      .eq("campaign_id", rememberedCampaignId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!remembered.error && remembered.data) {
      return remembered.data as MembershipRow
    }
  }

  const first = await supabase
    .from("campaign_members")
    .select("campaign_id, active_character_id, created_at")
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

export function useChatRoomShell(roomId: string) {
  const [model, setModel] = useState<ChatRoomShellModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const auth = await supabase.auth.getUser()
    if (auth.error || !auth.data.user) {
      setModel(null)
      setError(auth.error?.message || "Сессия не найдена")
      setLoading(false)
      return
    }

    const membership = await resolveMembership(auth.data.user.id)
    if (!membership) {
      setModel(null)
      setError("Кампания не найдена")
      setLoading(false)
      return
    }

    const roomsResult = await supabase.rpc("get_campaign_chat_rooms", {
      p_campaign_id: membership.campaign_id,
    })

    if (roomsResult.error) {
      setModel(null)
      setError(roomsResult.error.message)
      setLoading(false)
      return
    }

    const room = ((roomsResult.data || []) as RoomRow[]).find(
      (candidate) => candidate.id === roomId,
    )

    if (!room) {
      setModel(null)
      setError("Комната недоступна")
      setLoading(false)
      return
    }

    const characterId = room.character_id || membership.active_character_id
    let character: CharacterRow | null = null
    let sheet: SheetRow | null = null
    let world: WorldStateRow | null = null

    if (characterId) {
      const [characterResult, sheetResult, worldResult] = await Promise.all([
        supabase
          .from("characters")
          .select("id, name, character_class, level, avatar_url")
          .eq("campaign_id", membership.campaign_id)
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
          .eq("campaign_id", membership.campaign_id)
          .eq("character_id", characterId)
          .maybeSingle(),
      ])

      character = (characterResult.data as CharacterRow | null) || null
      sheet = (sheetResult.data as SheetRow | null) || null
      world = (worldResult.data as WorldStateRow | null) || null
    }

    const locationId =
      world?.location_id ||
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

    const avatarUrl = character?.avatar_url
      ? (await resolveCampaignMediaUrl(character.avatar_url)) || character.avatar_url
      : null

    setModel({
      roomId: room.id,
      roomTitle: room.title,
      roomType: normalizeRoomType(room.room_type),
      readOnly: Boolean(room.is_read_only),
      character: character
        ? {
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
        : null,
      context: {
        campaignDay:
          world?.campaign_day ??
          room.context_campaign_day ??
          room.campaign_day ??
          null,
        dayPeriod: normalizePeriod(
          world?.day_period ||
            room.context_day_period ||
            room.day_period,
        ),
        locationName,
      },
    })
    setLoading(false)
  }, [roomId])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      await load()
      if (cancelled) return
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [load])

  return {
    model,
    loading,
    error,
    reload: load,
  }
}
