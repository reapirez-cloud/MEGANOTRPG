import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { useCharacters } from "../context/CharacterContext"
import { supabase } from "../lib/supabase"
import type { ChatRoom } from "../types/chat"

type Result = { ok: boolean; error?: string; id?: string }

function formatTime(value?: string | null) {
  if (!value) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
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

    const hydrated = ((data || []) as Array<{
      id: string
      slug: string
      title: string
      category: string
      room_position: number
      preview: string
      last_message_at: string | null
      last_message_id: number | null
      unread_count: number
    }>).map((room) => ({
      id: room.id,
      slug: room.slug,
      title: room.title,
      category: room.category === "flood" ? "flood" : "game",
      position: room.room_position,
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
        {
          event: "*",
          schema: "public",
          table: "chat_rooms",
          filter: `campaign_id=eq.${campaignId}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
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

  const createGameRoom = useCallback(
    async (title: string): Promise<Result> => {
      const cleaned = title.trim()
      if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }
      if (!cleaned) return { ok: false, error: "Укажи название игрового чата." }

      const nextPosition =
        Math.max(0, ...rooms.filter((room) => room.category === "game").map((room) => room.position)) + 10
      const random =
        globalThis.crypto?.randomUUID?.().slice(0, 8) ||
        Math.random().toString(36).slice(2, 10)

      const { data, error: insertError } = await supabase
        .from("chat_rooms")
        .insert({
          campaign_id: campaignId,
          slug: `game-${Date.now()}-${random}`,
          title: cleaned,
          category: "game",
          position: nextPosition,
        })
        .select("id")
        .single()

      if (insertError || !data) {
        return { ok: false, error: insertError?.message || "Не удалось создать игровой чат." }
      }

      await loadRooms(true)
      return { ok: true, id: data.id }
    },
    [campaignId, loadRooms, rooms],
  )

  const renameRoom = useCallback(
    async (roomId: string, title: string): Promise<Result> => {
      const cleaned = title.trim()
      if (!cleaned) return { ok: false, error: "Название не может быть пустым." }
      const { error: updateError } = await supabase
        .from("chat_rooms")
        .update({ title: cleaned })
        .eq("id", roomId)
      if (updateError) return { ok: false, error: updateError.message }
      await loadRooms(true)
      return { ok: true }
    },
    [loadRooms],
  )

  const deleteRoom = useCallback(
    async (roomId: string): Promise<Result> => {
      const room = rooms.find((candidate) => candidate.id === roomId)
      if (!room) return { ok: false, error: "Чат не найден." }
      if (room.category === "flood") return { ok: false, error: "Основной флуд удалить нельзя." }
      const { error: deleteError } = await supabase.from("chat_rooms").delete().eq("id", roomId)
      if (deleteError) return { ok: false, error: deleteError.message }
      setRooms((current) => current.filter((candidate) => candidate.id !== roomId))
      return { ok: true }
    },
    [rooms],
  )

  return {
    rooms,
    campaignId,
    campaignTitle,
    loading,
    error,
    reload: () => loadRooms(false),
    createGameRoom,
    renameRoom,
    deleteRoom,
  }
}
