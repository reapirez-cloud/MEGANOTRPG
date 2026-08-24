import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { ChatRoom } from "../types/chat"

function formatTime(value?: string) {
  if (!value) return ""

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function useRooms() {
  const [rooms, setRooms] = useState<ChatRoom[]>([])
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

    setCampaignTitle(campaign.title)

    const { data: roomRows, error: roomsError } = await supabase
      .from("chat_rooms")
      .select("id, slug, title, category, position")
      .eq("campaign_id", campaign.id)
      .order("category", { ascending: false })
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
            : "Пока без сообщений",
          time: formatTime(lastMessage?.created_at),
        } satisfies ChatRoom
      }),
    )

    setRooms(hydrated)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  return {
    rooms,
    campaignTitle,
    loading,
    error,
    reload: loadRooms,
  }
}
