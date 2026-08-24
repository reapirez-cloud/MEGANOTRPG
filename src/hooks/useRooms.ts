import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { ChatRoom } from "../types/chat"

type Result = { ok: boolean; error?: string; id?: string }

function formatTime(value?: string) {
  if (!value) return ""

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function useRooms() {
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [campaignId, setCampaignId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRooms = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, title")
      .eq("slug", "demo")
      .single()

    if (campaignError || !campaign) {
      setLoading(false)
      setError(campaignError?.message || "Кампания не найдена")
      return
    }

    setCampaignId(campaign.id)
    setCampaignTitle(campaign.title)

    const { data: roomRows, error: roomsError } = await supabase
      .from("chat_rooms")
      .select("id, slug, title, category, position")
      .eq("campaign_id", campaign.id)
      .order("position", { ascending: true })

    if (roomsError || !roomRows) {
      setLoading(false)
      setError(roomsError?.message || "Не удалось загрузить комнаты")
      return
    }

    const hydrated = await Promise.all(
      roomRows.map(async (room) => {
        const { data: lastMessage } = await supabase
          .from("chat_messages")
          .select("author_name, body, created_at")
          .eq("room_id", room.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        return {
          ...room,
          category: room.category as "game" | "flood",
          preview: lastMessage
            ? `${lastMessage.author_name}: ${lastMessage.body}`
            : room.category === "flood"
              ? "Общий разговор кампании"
              : "Пока без сообщений",
          time: formatTime(lastMessage?.created_at),
        } satisfies ChatRoom
      }),
    )

    hydrated.sort((a, b) => {
      if (a.category !== b.category) return a.category === "flood" ? -1 : 1
      return a.position - b.position
    })

    setRooms(hydrated)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  const createGameRoom = useCallback(
    async (title: string): Promise<Result> => {
      const cleaned = title.trim()
      if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }
      if (!cleaned) return { ok: false, error: "Укажи название игрового чата." }

      const nextPosition =
        Math.max(
          0,
          ...rooms
            .filter((room) => room.category === "game")
            .map((room) => room.position),
        ) + 10

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
        return {
          ok: false,
          error: insertError?.message || "Не удалось создать игровой чат.",
        }
      }

      await loadRooms()
      return { ok: true, id: data.id }
    },
    [campaignId, loadRooms, rooms],
  )

  return {
    rooms,
    campaignId,
    campaignTitle,
    loading,
    error,
    reload: loadRooms,
    createGameRoom,
  }
}
