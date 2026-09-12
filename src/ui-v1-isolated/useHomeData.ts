import { useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { supabase } from "../lib/supabase"

export type HomeEvent = {
  id: string
  source_type: string
  title: string
  body: string
  media_url: string | null
  published_at: string
}

export type HomeSocietyNews = {
  id: string
  title: string
  body: string
  published_at: string
}

export type HomeArtPreview = {
  id: string
  title: string
  imageUrl: string
}

type HomeData = {
  campaignTitle: string
  campaignCoverUrl: string | null
  events: HomeEvent[]
  artPreviews: HomeArtPreview[]
  achievementCount: number
  latestAchievementTitle: string | null
  societyNews: HomeSocietyNews | null
  loading: boolean
  error: string | null
}

const FALLBACK_CAMPAIGN_TITLE = "Мунтар"
const EVENT_LIMIT = 3

export function useHomeData(): HomeData {
  const [campaignTitle, setCampaignTitle] = useState(FALLBACK_CAMPAIGN_TITLE)
  const [campaignCoverUrl, setCampaignCoverUrl] = useState<string | null>(null)
  const [events, setEvents] = useState<HomeEvent[]>([])
  const [artPreviews, setArtPreviews] = useState<HomeArtPreview[]>([])
  const [achievementCount, setAchievementCount] = useState(0)
  const [latestAchievementTitle, setLatestAchievementTitle] = useState<string | null>(null)
  const [societyNews, setSocietyNews] = useState<HomeSocietyNews | null>(null)
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
          .select("id, source_type, title, body, media_url, published_at")
          .eq("campaign_id", campaignId)
          .neq("source_type", "art")
          .neq("source_type", "update")
          .order("published_at", { ascending: false })
          .limit(EVENT_LIMIT)

        if (cancelled) return

        if (feedError) {
          setError(feedError.message)
          setEvents([])
          return
        }

        const rows = (data || []) as HomeEvent[]
        const resolved = await Promise.all(
          rows.map(async (row) => ({
            ...row,
            media_url: await resolveCampaignMediaUrl(row.media_url),
          })),
        )

        if (!cancelled) setEvents(resolved)
      }

      const refreshArtPreviews = async () => {
        const { data, error: artError } = await supabase
          .from("campaign_art_items")
          .select("id, title, image_url")
          .eq("campaign_id", campaignId)
          .order("created_at", { ascending: false })
          .limit(3)

        if (cancelled || artError) return

        const resolved = await Promise.all(
          (data || []).map(async (row: { id: string; title: string | null; image_url: string }) => ({
            id: row.id,
            title: row.title || "Арт кампании",
            imageUrl: (await resolveCampaignMediaUrl(row.image_url)) || row.image_url,
          })),
        )

        if (!cancelled) setArtPreviews(resolved)
      }

      const refreshAchievements = async () => {
        const { data, count, error: achievementError } = await supabase
          .from("achievements")
          .select("title, awarded_at", { count: "exact" })
          .eq("campaign_id", campaignId)
          .order("awarded_at", { ascending: false })
          .limit(1)

        if (cancelled || achievementError) return

        setAchievementCount(count || 0)
        setLatestAchievementTitle(data?.[0]?.title || null)
      }

      const refreshSocietyNews = async () => {
        const { data, error: newsError } = await supabase
          .from("campaign_updates")
          .select("id, title, body, published_at")
          .eq("campaign_id", campaignId)
          .eq("kind", "announcement")
          .order("published_at", { ascending: false })
          .limit(1)

        if (cancelled || newsError) return
        setSocietyNews(((data || [])[0] as HomeSocietyNews | undefined) || null)
      }

      const campaignRequest = supabase
        .from("campaigns")
        .select("title, cover_url")
        .eq("id", campaignId)
        .maybeSingle()

      const [campaignResult] = await Promise.all([
        campaignRequest,
        refreshEvents(),
        refreshArtPreviews(),
        refreshAchievements(),
        refreshSocietyNews(),
      ])

      if (cancelled) return

      if (campaignResult.data?.title) {
        setCampaignTitle(campaignResult.data.title)
      }

      if (campaignResult.data?.cover_url) {
        setCampaignCoverUrl(
          (await resolveCampaignMediaUrl(campaignResult.data.cover_url)) ||
            campaignResult.data.cover_url,
        )
      }

      channel = supabase
        .channel("ui-v1-home-" + campaignId)
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
            void refreshSocietyNews()
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "campaign_art_items",
            filter: `campaign_id=eq.${campaignId}`,
          },
          () => {
            void refreshArtPreviews()
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "achievements",
            filter: `campaign_id=eq.${campaignId}`,
          },
          () => {
            void refreshAchievements()
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

  return {
    campaignTitle,
    campaignCoverUrl,
    events,
    artPreviews,
    achievementCount,
    latestAchievementTitle,
    societyNews,
    loading,
    error,
  }
}
