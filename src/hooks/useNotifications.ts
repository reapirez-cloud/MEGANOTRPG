import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../lib/supabase"
import type { AppNotification } from "../types/feed"

const fields =
  "id, campaign_id, recipient_user_id, actor_user_id, actor_character_id, feed_item_id, kind, body, created_at, read_at"

export function useNotifications(campaignId: string) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) {
      setItems([])
      setUnreadCount(0)
      return
    }

    setLoading(true)
    const [itemsResult, countResult] = await Promise.all([
      supabase
        .from("notifications")
        .select(fields)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .is("read_at", null),
    ])
    setLoading(false)

    const loadError = itemsResult.error || countResult.error
    if (loadError) {
      setError(loadError.message)
      return
    }

    setError(null)
    setItems((itemsResult.data || []) as AppNotification[])
    setUnreadCount(countResult.count || 0)
  }, [campaignId])

  useEffect(() => {
    void load()
    if (!campaignId) return

    let channel: RealtimeChannel | null = supabase
      .channel(`campaign-notifications-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as AppNotification
            setItems((current) =>
              [incoming, ...current.filter((item) => item.id !== incoming.id)]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 40),
            )
            if (!incoming.read_at) setUnreadCount((current) => current + 1)
            return
          }

          if (payload.eventType === "UPDATE") {
            const incoming = payload.new as AppNotification
            setItems((current) => {
              const previous = current.find((item) => item.id === incoming.id)
              if (previous && !previous.read_at && incoming.read_at) {
                setUnreadCount((count) => Math.max(0, count - 1))
              } else if (previous?.read_at && !incoming.read_at) {
                setUnreadCount((count) => count + 1)
              }
              return current.map((item) =>
                item.id === incoming.id ? incoming : item,
              )
            })
            return
          }

          const removed = payload.old as Partial<AppNotification>
          if (!removed.id) return
          setItems((current) => {
            const previous = current.find((item) => item.id === removed.id)
            if (previous && !previous.read_at) {
              setUnreadCount((count) => Math.max(0, count - 1))
            }
            return current.filter((item) => item.id !== removed.id)
          })
        },
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

    const now = new Date().toISOString()
    setUnreadCount(0)
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at || now })),
    )
  }, [campaignId])

  return { items, unreadCount, loading, error, refresh: load, markAllRead }
}
