import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../lib/supabase"
import type { AppNotification } from "../types/feed"

export function useNotifications(campaignId: string) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from("notifications")
      .select("id, campaign_id, recipient_user_id, actor_user_id, actor_character_id, feed_item_id, kind, body, created_at, read_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(40)
    setLoading(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    setError(null)
    setItems((data || []) as AppNotification[])
  }, [campaignId])

  useEffect(() => {
    void load()
    if (!campaignId) return
    let channel: RealtimeChannel | null = supabase
      .channel(`campaign-notifications-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `campaign_id=eq.${campaignId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, load])

  const markAllRead = useCallback(async () => {
    if (!campaignId) return
    const { error: markError } = await supabase.rpc("mark_notifications_read", {
      p_campaign_id: campaignId,
    })
    if (markError) {
      setError(markError.message)
      return
    }
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })),
    )
  }, [campaignId])

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items],
  )

  return { items, unreadCount, loading, error, refresh: load, markAllRead }
}
