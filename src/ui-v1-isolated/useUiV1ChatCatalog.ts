import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { buildChatCatalogModel } from "../chat/catalogModel"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { deleteCampaignMediaObjects, uploadCampaignImage } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import { parseMediaPresentation } from "../media/presentation"
import { oracle } from "../oracle-engine/runtime.ts"
import type { SnakeActionInput } from "../snake-engine"
import type { ChatRoom, RoomState, RoomType } from "../types/chat"
import type { DayPeriod } from "../world-state/types"

type RoomPreviewMediaRow = {
  room_id: string
  asset_id: string
  storage_path: string
  presentation: unknown
}

type MutationResult = { ok: boolean; error?: string }

type RoomRpcRow = {
  id: string
  slug: string
  title: string
  category: string
  room_type: string
  room_position: number
  avatar_url: string | null
  character_id: string | null
  character_life_state: string | null
  open_to_campaign: boolean
  is_read_only: boolean
  room_state: string
  campaign_can_write: boolean
  location_id: string | null
  campaign_day: number
  day_period: string
  scene_state: string
  is_own_character_room: boolean
  context_location_id: string | null
  context_location_name: string | null
  context_campaign_day: number | null
  context_day_period: string | null
  preview: string
  created_at: string
  updated_at: string
  closed_at: string | null
  character_died_at: string | null
  last_message_at: string | null
  last_message_id: number | null
  unread_count: number
}

export type UiV1ChatCharacter = {
  id: string
  name: string
  character_class: string
  level: number
}

function formatTime(value?: string | null) {
  if (!value) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function normalizeRoomType(value: string, category: string): RoomType {
  if (value === "character" || value === "scene" || value === "flood") return value
  return category === "flood" ? "flood" : "scene"
}

function normalizeRoomState(value: string): RoomState {
  return value === "gm_only" || value === "closed" ? value : "open"
}

function normalizePeriod(value: string): DayPeriod {
  if (["dawn", "morning", "day", "late_day", "evening", "night", "deep_night"].includes(value)) {
    return value as DayPeriod
  }
  return "day"
}

export function useUiV1ChatCatalog() {
  const [campaignId, setCampaignId] = useState("")
  const [userId, setUserId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("")
  const [canManage, setCanManage] = useState(false)
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [characters, setCharacters] = useState<UiV1ChatCharacter[]>([])
  const [identityLoading, setIdentityLoading] = useState(true)
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadIdentity = async () => {
      setIdentityLoading(true)
      setError(null)

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return

      if (authError || !authData.user) {
        setError(authError?.message || "Сессия не найдена")
        setIdentityLoading(false)
        setRoomsLoading(false)
        return
      }

      const userId = authData.user.id
      setUserId(userId)
      let nextCampaignId =
        window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
        window.localStorage.getItem("meganotrpg:campaign-id") ||
        ""

      let membership:
        | { campaign_id: string; role: string; is_owner: boolean }
        | null = null

      if (nextCampaignId) {
        const result = await supabase
          .from("campaign_members")
          .select("campaign_id, role, is_owner")
          .eq("campaign_id", nextCampaignId)
          .eq("user_id", userId)
          .maybeSingle()

        if (result.error) {
          setError(result.error.message)
          setIdentityLoading(false)
          setRoomsLoading(false)
          return
        }

        membership = result.data
        if (!membership) nextCampaignId = ""
      }

      if (!nextCampaignId) {
        const result = await supabase
          .from("campaign_members")
          .select("campaign_id, role, is_owner, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)

        if (cancelled) return
        if (result.error) {
          setError(result.error.message)
          setIdentityLoading(false)
          setRoomsLoading(false)
          return
        }

        const first = result.data?.[0]
        if (first) {
          nextCampaignId = first.campaign_id
          membership = {
            campaign_id: first.campaign_id,
            role: first.role,
            is_owner: first.is_owner,
          }
        }
      }

      if (!nextCampaignId || !membership) {
        setError("Кампания не найдена")
        setIdentityLoading(false)
        setRoomsLoading(false)
        return
      }

      window.localStorage.setItem("meganotrpg:v1:campaign-id", nextCampaignId)
      setCampaignId(nextCampaignId)
      setCanManage(membership.role === "gm" || membership.is_owner === true)

      const campaignResult = await supabase
        .from("campaigns")
        .select("title")
        .eq("id", nextCampaignId)
        .maybeSingle()

      if (!cancelled) {
        setCampaignTitle(campaignResult.data?.title || "")
        setIdentityLoading(false)
      }
    }

    void loadIdentity()
    return () => {
      cancelled = true
    }
  }, [])

  const loadRooms = useCallback(async (silent = false) => {
    if (!campaignId) return
    if (!silent) setRoomsLoading(true)
    setError(null)

    const [roomsResult, charactersResult, previewMediaResult] = await Promise.all([
      supabase.rpc("get_campaign_chat_rooms", { p_campaign_id: campaignId }),
      supabase
        .from("characters")
        .select("id, name, character_class, level")
        .eq("campaign_id", campaignId),
      supabase.rpc("list_chat_room_preview_media_v1", {
        p_campaign_id: campaignId,
      }),
    ])

    if (roomsResult.error || previewMediaResult.error) {
      setError(roomsResult.error?.message || previewMediaResult.error?.message || "Не удалось загрузить превью чатов.")
      if (!silent) setRoomsLoading(false)
      return
    }

    const previewMedia = new Map(
      ((previewMediaResult.data || []) as RoomPreviewMediaRow[])
        .map((item) => [item.room_id, item] as const),
    )

    const hydrated = await Promise.all(
      ((roomsResult.data || []) as RoomRpcRow[]).map(async (room) => ({
        id: room.id,
        slug: room.slug,
        title: room.title,
        category: room.category === "flood" ? "flood" : "game",
        room_type: normalizeRoomType(room.room_type, room.category),
        position: room.room_position,
        avatar_url:
          (await resolveCampaignMediaUrl(room.avatar_url)) ||
          room.avatar_url ||
          null,
        avatar_presentation: parseMediaPresentation(
          previewMedia.get(room.id)?.presentation,
        ),
        character_id: room.character_id || null,
        character_life_state:
          room.character_life_state === "dead"
            ? "dead"
            : room.character_life_state === "alive"
              ? "alive"
              : null,
        open_to_campaign: Boolean(room.open_to_campaign),
        is_read_only: Boolean(room.is_read_only),
        room_state: normalizeRoomState(room.room_state),
        campaign_can_write: Boolean(room.campaign_can_write),
        location_id: room.location_id || null,
        campaign_day: Number(room.campaign_day || 1),
        day_period: normalizePeriod(room.day_period),
        scene_state: room.scene_state === "closed" ? "closed" : "active",
        is_own_character_room: Boolean(room.is_own_character_room),
        context_location_id: room.context_location_id || null,
        context_location_name: room.context_location_name || null,
        context_campaign_day:
          room.context_campaign_day === null
            ? null
            : Number(room.context_campaign_day),
        context_day_period: room.context_day_period
          ? normalizePeriod(room.context_day_period)
          : null,
        preview: room.preview,
        time: formatTime(room.last_message_at),
        created_at: room.created_at,
        updated_at: room.updated_at,
        closed_at: room.closed_at || null,
        character_died_at: room.character_died_at || null,
        last_message_at: room.last_message_at || null,
        last_message_id: room.last_message_id,
        unread_count: Number(room.unread_count || 0),
      } satisfies ChatRoom)),
    )

    setRooms(hydrated)
    if (!charactersResult.error) {
      setCharacters((charactersResult.data || []) as UiV1ChatCharacter[])
    }
    setRoomsLoading(false)
  }, [campaignId])

  const setRoomPreview = useCallback(async (
    room: ChatRoom,
    input: SnakeActionInput,
  ): Promise<MutationResult> => {
    if (!canManage || !campaignId) {
      return { ok: false, error: "Недостаточно прав для изменения превью." }
    }
    if (room.room_type !== "character" && room.room_type !== "scene") {
      return { ok: false, error: "Для этой комнаты превью не настраивается." }
    }

    const file =
      typeof File !== "undefined" && input?.file instanceof File
        ? input.file
        : null
    if (!file) {
      return { ok: false, error: "Выбери изображение для превью." }
    }

    const presentation = parseMediaPresentation(input?.presentation)
    if (!presentation) {
      return { ok: false, error: "Кадр превью не определён." }
    }

    const upload = await uploadCampaignImage(file, "chat-previews", campaignId)
    if (!upload.ok) return { ok: false, error: upload.error }

    const { error: bindError } = await supabase.rpc(
      "bind_chat_room_preview_upload_v1",
      {
        p_room_id: room.id,
        p_storage_path: upload.url,
        p_mime_type: upload.mimeType,
        p_width: upload.width,
        p_height: upload.height,
        p_presentation: presentation,
      },
    )

    if (bindError) {
      await deleteCampaignMediaObjects([upload.url])
      return { ok: false, error: bindError.message }
    }

    await loadRooms(true)
    return { ok: true }
  }, [campaignId, canManage, loadRooms])

  const deleteScene = useCallback(async (
    room: ChatRoom,
  ): Promise<MutationResult> => {
    if (!canManage || !campaignId || !userId) {
      return { ok: false, error: "Недостаточно прав для удаления сцены." }
    }
    if (room.room_type !== "scene") {
      return { ok: false, error: "Удалять можно только сцены." }
    }

    try {
      await oracle.world.deleteScene(
        createEngineCommandContext({
          campaignId,
          requestedBy: userId,
          authority: "gm",
        }),
        room.id,
      )
      await loadRooms(true)
      return { ok: true }
    } catch (reason) {
      return {
        ok: false,
        error:
          reason instanceof Error
            ? reason.message
            : "Не удалось удалить сцену.",
      }
    }
  }, [campaignId, canManage, loadRooms, userId])

  useEffect(() => {
    if (!campaignId) return

    let refreshTimer: number | null = null
    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void loadRooms(true), 120)
    }

    void loadRooms()

    let channel: RealtimeChannel | null = supabase
      .channel("ui-v1-chat-catalog-" + campaignId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_rooms",
        filter: `campaign_id=eq.${campaignId}`,
      }, refreshSoon)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_messages",
      }, refreshSoon)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "characters",
        filter: `campaign_id=eq.${campaignId}`,
      }, refreshSoon)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "character_world_state",
        filter: `campaign_id=eq.${campaignId}`,
      }, refreshSoon)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "locations",
        filter: `campaign_id=eq.${campaignId}`,
      }, refreshSoon)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "scene_participants",
      }, refreshSoon)
      .subscribe()

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, loadRooms])

  const catalog = useMemo(() => buildChatCatalogModel(rooms), [rooms])

  return {
    campaignId,
    campaignTitle,
    canManage,
    rooms,
    characters,
    catalog,
    loading: identityLoading || roomsLoading,
    error,
    reload: () => loadRooms(false),
    setRoomPreview,
    deleteScene,
  }
}
