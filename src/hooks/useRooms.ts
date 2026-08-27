import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useCharacters } from "../context/CharacterContext"
import { deleteCampaignMediaObjects } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import type { ChatRoom, RoomType } from "../types/chat"

type Result = { ok: boolean; error?: string; id?: string }

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
  preview: string
  last_message_at: string | null
  last_message_id: number | null
  unread_count: number
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

export function useRooms() {
  const { campaignId, campaignTitle } = useCharacters()
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRooms = useCallback(async (silent = false) => {
    if (!campaignId) {
      setRooms([])
      setLoading(false)
      return
    }

    if (!silent) setLoading(true)
    setError(null)

    const { data, error: roomsError } = await supabase.rpc(
      "get_campaign_chat_rooms",
      { p_campaign_id: campaignId },
    )

    if (roomsError) {
      if (!silent) setLoading(false)
      setError(roomsError.message)
      return
    }

    const hydrated = ((data || []) as RoomRpcRow[]).map((room) => ({
      id: room.id,
      slug: room.slug,
      title: room.title,
      category: room.category === "flood" ? "flood" : "game",
      room_type: normalizeRoomType(room.room_type, room.category),
      position: room.room_position,
      avatar_url: room.avatar_url || null,
      character_id: room.character_id || null,
      character_life_state: room.character_life_state === "dead" ? "dead" : room.character_life_state === "alive" ? "alive" : null,
      open_to_campaign: Boolean(room.open_to_campaign),
      is_read_only: Boolean(room.is_read_only),
      preview: room.preview,
      time: formatTime(room.last_message_at),
      last_message_id: room.last_message_id,
      unread_count: room.unread_count,
    })) satisfies ChatRoom[]

    setRooms(hydrated)
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    void loadRooms()
    if (!campaignId) return

    let refreshTimer: number | null = null
    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void loadRooms(true), 160)
    }

    let channel: RealtimeChannel | null = supabase
      .channel(`campaign-rooms-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_rooms", filter: `campaign_id=eq.${campaignId}` },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${campaignId}` },
        refreshSoon,
      )
      .subscribe()

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, loadRooms])

  const createSceneRoom = useCallback(async (title: string): Promise<Result> => {
    const cleaned = title.trim()
    if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }
    if (!cleaned) return { ok: false, error: "Укажи название сцены." }

    const { data, error: createError } = await supabase.rpc(
      "create_campaign_chat_room",
      { p_campaign_id: campaignId, p_title: cleaned },
    )

    if (createError || !data) {
      return { ok: false, error: createError?.message || "Не удалось создать сцену." }
    }

    await loadRooms(true)
    return { ok: true, id: String(data) }
  }, [campaignId, loadRooms])

  const renameRoom = useCallback(async (roomId: string, title: string): Promise<Result> => {
    const cleaned = title.trim()
    if (!cleaned) return { ok: false, error: "Название не может быть пустым." }
    const { error: updateError } = await supabase
      .from("chat_rooms")
      .update({ title: cleaned })
      .eq("id", roomId)
    if (updateError) return { ok: false, error: updateError.message }
    await loadRooms(true)
    return { ok: true }
  }, [loadRooms])

  const setRoomAvatar = useCallback(async (roomId: string, avatarUrl: string | null): Promise<Result> => {
    const { error: updateError } = await supabase
      .from("chat_rooms")
      .update({ avatar_url: avatarUrl })
      .eq("id", roomId)
    if (updateError) return { ok: false, error: updateError.message }
    await loadRooms(true)
    return { ok: true }
  }, [loadRooms])

  const deleteRoom = useCallback(async (roomId: string): Promise<Result> => {
    const room = rooms.find((item) => item.id === roomId)
    if (!room) return { ok: false, error: "Чат не найден." }
    if (room.room_type === "flood") return { ok: false, error: "Флуд удалить нельзя." }
    if (room.room_type === "character") {
      return { ok: false, error: "Персональный чат удаляется только вместе с персонажем." }
    }

    const { data: rows, error: attachmentsError } = await supabase
      .from("chat_messages")
      .select("attachment_url")
      .eq("room_id", roomId)
      .not("attachment_url", "is", null)

    if (attachmentsError) return { ok: false, error: attachmentsError.message }

    const { error: deleteError } = await supabase
      .from("chat_rooms")
      .delete()
      .eq("id", roomId)

    if (deleteError) return { ok: false, error: deleteError.message }

    setRooms((current) => current.filter((item) => item.id !== roomId))
    void deleteCampaignMediaObjects((rows || []).map((row) => row.attachment_url as string | null))
    return { ok: true }
  }, [rooms])

  return {
    rooms,
    campaignId,
    campaignTitle,
    loading,
    error,
    reload: () => loadRooms(false),
    createSceneRoom,
    createGameRoom: createSceneRoom,
    renameRoom,
    setRoomAvatar,
    deleteRoom,
  }
}
