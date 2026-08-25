import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../lib/supabase"
import type { FeedItem } from "../types/feed"

const PAGE_SIZE = 12
const feedFields = `
  id, campaign_id, source_type, source_id, created_by, character_id,
  title, body, media_url, published_at, updated_at,
  reactions:feed_reactions(id, feed_item_id, user_id, character_id, emoji, created_at),
  comments:feed_comments(id, feed_item_id, user_id, character_id, body, created_at, updated_at)
`

type Result = { ok: boolean; error?: string }

export function useFeed(campaignId: string) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    async (before?: string) => {
      let query = supabase
        .from("feed_items")
        .select(feedFields)
        .eq("campaign_id", campaignId)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1)

      if (before) query = query.lt("published_at", before)
      return query
    },
    [campaignId],
  )

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await fetchPage()
    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }
    const rows = (data || []) as FeedItem[]
    setHasMore(rows.length > PAGE_SIZE)
    setItems(rows.slice(0, PAGE_SIZE))
    setLoading(false)
  }, [campaignId, fetchPage])

  const loadMore = useCallback(async () => {
    const cursor = items[items.length - 1]?.published_at
    if (!cursor || loadingMore || !hasMore) return
    setLoadingMore(true)
    const { data, error: loadError } = await fetchPage(cursor)
    setLoadingMore(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    const rows = (data || []) as FeedItem[]
    setHasMore(rows.length > PAGE_SIZE)
    setItems((current) => [...current, ...rows.slice(0, PAGE_SIZE)])
  }, [fetchPage, hasMore, items, loadingMore])

  useEffect(() => {
    void load()
    if (!campaignId) return

    let timeout: number | null = null
    const refreshSoon = () => {
      if (timeout != null) window.clearTimeout(timeout)
      timeout = window.setTimeout(() => void load(), 180)
    }

    let channel: RealtimeChannel | null = supabase
      .channel(`campaign-feed-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_items", filter: `campaign_id=eq.${campaignId}` },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_reactions", filter: `campaign_id=eq.${campaignId}` },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_comments", filter: `campaign_id=eq.${campaignId}` },
        refreshSoon,
      )
      .subscribe()

    return () => {
      if (timeout != null) window.clearTimeout(timeout)
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, load])

  const createMoment = useCallback(
    async (body: string, mediaUrl: string | null): Promise<Result> => {
      const { error: createError } = await supabase.rpc("create_campaign_moment", {
        p_campaign_id: campaignId,
        p_body: body,
        p_media_url: mediaUrl,
      })
      if (createError) return { ok: false, error: createError.message }
      await load()
      return { ok: true }
    },
    [campaignId, load],
  )

  const toggleReaction = useCallback(
    async (feedItemId: string): Promise<Result> => {
      const { error: reactionError } = await supabase.rpc(
        "toggle_feed_reaction",
        { p_feed_item_id: feedItemId, p_emoji: "♥" },
      )
      if (reactionError) return { ok: false, error: reactionError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const addComment = useCallback(
    async (feedItemId: string, body: string): Promise<Result> => {
      const { error: commentError } = await supabase.rpc("add_feed_comment", {
        p_feed_item_id: feedItemId,
        p_body: body,
      })
      if (commentError) return { ok: false, error: commentError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteComment = useCallback(
    async (commentId: string): Promise<Result> => {
      const { error: deleteError } = await supabase.rpc("delete_feed_comment", {
        p_comment_id: commentId,
      })
      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteItem = useCallback(
    async (feedItemId: string): Promise<Result> => {
      const { error: deleteError } = await supabase.rpc("delete_feed_item", {
        p_feed_item_id: feedItemId,
      })
      if (deleteError) return { ok: false, error: deleteError.message }
      setItems((current) => current.filter((item) => item.id !== feedItemId))
      return { ok: true }
    },
    [],
  )

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh: load,
    loadMore,
    createMoment,
    toggleReaction,
    addComment,
    deleteComment,
    deleteItem,
  }
}
