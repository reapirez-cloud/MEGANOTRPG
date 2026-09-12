import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../../lib/supabase"
import type { FeedSource } from "../../types/feed"

export type HomeRecentEvent = {
  id: string
  sourceType: Exclude<FeedSource, "art">
  title: string
  body: string
  publishedAt: string
}

const fields = "id, source_type, title, body, published_at"

export function useHomeRecentEvents(campaignId: string) {
  const [items, setItems] = useState<HomeRecentEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!campaignId) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)

    const { data } = await supabase
      .from("feed_items")
      .select(fields)
      .eq("campaign_id", campaignId)
      .neq("source_type", "art")
      .order("published_at", { ascending: false })
      .limit(4)

    setItems(
      ((data || []) as Array<{
        id: string
        source_type: Exclude<FeedSource, "art">
        title: string | null
        body: string | null
        published_at: string
      }>).map((item) => ({
        id: item.id,
        sourceType: item.source_type,
        title: item.title || "",
        body: item.body || "",
        publishedAt: item.published_at,
      })),
    )
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })

    if (!campaignId) return () => { cancelled = true }

    let channel: RealtimeChannel | null = supabase
      .channel(`ui-v1-home-events-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "feed_items",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, load])

  return { items, loading }
}
