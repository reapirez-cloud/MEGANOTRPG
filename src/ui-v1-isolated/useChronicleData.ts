import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { supabase } from "../lib/supabase"

const PAGE_STEP = 24

export type ChronicleKind =
  | "gm"
  | "diary"
  | "achievement"
  | "moment"
  | "world"
  | "system"
  | "future"

export type ChronicleEvent = {
  id: string
  sourceType: string
  sourceId: string | null
  kind: ChronicleKind
  title: string
  body: string
  mediaUrl: string | null
  publishedAt: string
  authorName: string | null
  characterName: string | null
}

type FeedRow = {
  id: string
  source_type: string
  source_id: string | null
  created_by: string | null
  character_id: string | null
  title: string
  body: string
  media_url: string | null
  published_at: string
}

type MemberRow = {
  user_id: string
  role: string
  is_owner: boolean
}

async function resolveCampaignId(userId: string) {
  let campaignId =
    window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
    window.localStorage.getItem("meganotrpg:campaign-id") ||
    ""

  if (campaignId) {
    const { data } = await supabase
      .from("campaign_members")
      .select("campaign_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!data) campaignId = ""
  }

  if (!campaignId) {
    const { data, error } = await supabase
      .from("campaign_members")
      .select("campaign_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)

    if (error) throw error
    campaignId = data?.[0]?.campaign_id || ""
  }

  if (campaignId) {
    window.localStorage.setItem("meganotrpg:v1:campaign-id", campaignId)
  }

  return campaignId
}

function classifyEvent(
  row: FeedRow,
  managers: Set<string>,
): ChronicleKind {
  if (row.source_type === "diary") return "diary"
  if (row.source_type === "achievement") return "achievement"
  if (row.source_type === "moment") return "moment"

  if (
    row.source_type === "world" ||
    row.source_type === "zone" ||
    row.source_type === "npc" ||
    row.source_type === "lore"
  ) {
    return "world"
  }

  if (
    row.source_type === "gm_note" ||
    row.source_type === "gm_post" ||
    row.source_type === "announcement"
  ) {
    return "gm"
  }

  if (
    row.source_type === "update" &&
    row.created_by &&
    managers.has(row.created_by)
  ) {
    return "gm"
  }

  if (row.source_type === "update" || row.source_type === "system") {
    return "system"
  }

  return "future"
}

export function useChronicleData() {
  const [campaignId, setCampaignId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("")
  const [events, setEvents] = useState<ChronicleEvent[]>([])
  const [visibleLimit, setVisibleLimit] = useState(PAGE_STEP)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const resolve = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return

      if (authError || !authData.user) {
        setError(authError?.message || "Сессия не найдена")
        setLoading(false)
        return
      }

      try {
        const nextCampaignId = await resolveCampaignId(authData.user.id)
        if (cancelled) return

        if (!nextCampaignId) {
          setError("Кампания не найдена")
          setLoading(false)
          return
        }

        setCampaignId(nextCampaignId)

        const { data: campaign } = await supabase
          .from("campaigns")
          .select("title")
          .eq("id", nextCampaignId)
          .maybeSingle()

        if (!cancelled && campaign?.title) {
          setCampaignTitle(campaign.title)
        }
      } catch (resolveError) {
        if (!cancelled) {
          setError(resolveError instanceof Error ? resolveError.message : "Не удалось открыть хронику")
          setLoading(false)
        }
      }
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [])

  const loadEvents = useCallback(async () => {
    if (!campaignId) return

    const isFirstLoad = events.length === 0
    if (isFirstLoad) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const { data, error: feedError } = await supabase
      .from("feed_items")
      .select(
        "id, source_type, source_id, created_by, character_id, title, body, media_url, published_at",
      )
      .eq("campaign_id", campaignId)
      .neq("source_type", "art")
      .order("published_at", { ascending: false })
      .limit(visibleLimit + 1)

    if (feedError) {
      setError(feedError.message)
      setLoading(false)
      setLoadingMore(false)
      return
    }

    const rows = (data || []) as FeedRow[]
    setHasMore(rows.length > visibleLimit)
    const visibleRows = rows.slice(0, visibleLimit)

    const characterIds = [
      ...new Set(
        visibleRows
          .map((row) => row.character_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ]
    const userIds = [
      ...new Set(
        visibleRows
          .map((row) => row.created_by)
          .filter((value): value is string => Boolean(value)),
      ),
    ]

    const [characterResult, profileResult, memberResult] = await Promise.all([
      characterIds.length
        ? supabase.from("characters").select("id, name").in("id", characterIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from("campaign_members")
            .select("user_id, role, is_owner")
            .eq("campaign_id", campaignId)
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const directoryError =
      characterResult.error || profileResult.error || memberResult.error
    if (directoryError) {
      setError(directoryError.message)
      setLoading(false)
      setLoadingMore(false)
      return
    }

    const characterMap = new Map(
      (characterResult.data || []).map((row: { id: string; name: string }) => [
        row.id,
        row.name,
      ]),
    )
    const profileMap = new Map(
      (profileResult.data || []).map(
        (row: { user_id: string; display_name: string }) => [
          row.user_id,
          row.display_name,
        ],
      ),
    )
    const managers = new Set(
      ((memberResult.data || []) as MemberRow[])
        .filter((row) => row.role === "gm" || row.is_owner)
        .map((row) => row.user_id),
    )

    const nextEvents = await Promise.all(
      visibleRows.map(async (row): Promise<ChronicleEvent> => {
        const mediaUrl = await resolveCampaignMediaUrl(row.media_url)
        const characterName = row.character_id
          ? characterMap.get(row.character_id) || null
          : null
        const profileName = row.created_by
          ? profileMap.get(row.created_by) || null
          : null

        return {
          id: row.id,
          sourceType: row.source_type,
          sourceId: row.source_id,
          kind: classifyEvent(row, managers),
          title: row.title || "",
          body: row.body || "",
          mediaUrl,
          publishedAt: row.published_at,
          authorName: profileName,
          characterName,
        }
      }),
    )

    setEvents(nextEvents)
    setLoading(false)
    setLoadingMore(false)
  }, [campaignId, events.length, visibleLimit])

  useEffect(() => {
    if (!campaignId) return
    void loadEvents()
  }, [campaignId, loadEvents])

  useEffect(() => {
    if (!campaignId) return

    let channel: RealtimeChannel | null = supabase
      .channel(`ui-v1-chronicle-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "feed_items",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          void loadEvents()
        },
      )
      .subscribe()

    return () => {
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, loadEvents])

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return
    setVisibleLimit((current) => current + PAGE_STEP)
  }, [hasMore, loadingMore])

  return useMemo(
    () => ({
      campaignTitle,
      events,
      loading,
      loadingMore,
      hasMore,
      error,
      refresh: loadEvents,
      loadMore,
    }),
    [
      campaignTitle,
      events,
      loading,
      loadingMore,
      hasMore,
      error,
      loadEvents,
      loadMore,
    ],
  )
}
