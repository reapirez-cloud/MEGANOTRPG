import { useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../lib/supabase"

export type HomeEvent = {
  id: string
  source_type: "achievement" | "diary" | "moment" | "update"
  title: string
  body: string
  published_at: string
}

type HomeData = {
  campaignTitle: string
  events: HomeEvent[]
  loading: boolean
  error: string | null
}

const FALLBACK_CAMPAIGN_TITLE = "Мунтар"
const EVENT_LIMIT = 3

export function useHomeData(): HomeData {
  const [campaignTitle, setCampaignTitle] = useState(FALLBACK_CAMPAIGN_TITLE)
  const [events, setEvents] = useState<HomeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let channel: RealtimeChannel | null = null

    const load = async () => {
      setLoading(true)
      setError(null)

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return

      if (authError || !authData.user) {
        setError(authError?.message || "Сессия не найдена")
        setLoading(false)
        return
      }

      const userId = authData.user.id
      let campaignId =
        window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
        window.localStorage.getItem("meganotrpg:campaign-id") ||
        ""

      if (campaignId) {
        const { data: membership } = await supabase
          .from("campaign_members")
          .select("campaign_id")
          .eq("campaign_id", campaignId)
          .eq("user_id", userId)
          .maybeSingle()

        if (!membership) campaignId = ""
      }

      if (!campaignId) {
        const { data: memberships, error: membershipError } = await supabase
          .from("campaign_members")
          .select("campaign_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)

        if (cancelled) return
        if (membershipError) {
          setError(membershipError.message)
          setLoading(false)
          return
        }

        campaignId = memberships?.[0]?.campaign_id || ""
      }

      if (!campaignId) {
        setError("Кампания не найдена")
        setLoading(false)
        return
      }

      window.localStorage.setItem("meganotrpg:v1:campaign-id", campaignId)

      const refreshEvents = async () => {
        const { data, error: feedError } = await supabase
          .from("feed_items")
          .select("id, source_type, title, body, published_at")
          .eq("campaign_id", campaignId)
          .neq("source_type", "art")
          .order("published_at", { ascending: false })
          .limit(EVENT_LIMIT)

        if (cancelled) return

        if (feedError) {
          setError(feedError.message)
          setEvents([])
          return
        }

        setEvents((data || []) as HomeEvent[])
      }

      const [campaignResult] = await Promise.all([
        supabase
          .from("campaigns")
          .select("title")
          .eq("id", campaignId)
          .maybeSingle(),
        refreshEvents(),
      ])

      if (cancelled) return

      if (campaignResult.data?.title) {
        setCampaignTitle(campaignResult.data.title)
      }

      channel = supabase
        .channel(`ui-v1-home-feed-${campaignId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "feed_items",
            filter: `campaign_id=eq.${campaignId}`,
          },
          () => {
            void refreshEvents()
          },
        )
        .subscribe()

      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [])

  return { campaignTitle, events, loading, error }
}
