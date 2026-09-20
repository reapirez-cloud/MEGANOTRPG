import { useCallback, useEffect, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { resolveCampaignMediaUrl } from "../../lib/campaignMedia"
import { supabase } from "../../lib/supabase"
import type { ChatMessage } from "../../types/chat"
import { normalizeChatEvent, type UiChatEvent } from "./chatEventModel"

type ViewerContextRow = {
  campaign_id: string
  can_read: boolean
}

type CampaignMemberRoleRow = {
  user_id: string
  role: string
  is_owner: boolean
}

const MESSAGE_LIMIT = 150

async function resolveRoomCampaignId(roomId: string) {
  const contextResult = await supabase.rpc("get_chat_room_viewer_context_v1", {
    p_room_id: roomId,
  })

  if (contextResult.error) throw contextResult.error

  const context =
    ((contextResult.data || []) as ViewerContextRow[])[0] || null

  if (!context?.can_read) return null
  return context.campaign_id
}

async function hydrateMessageMedia(message: ChatMessage): Promise<ChatMessage> {
  const [avatar, attachment] = await Promise.all([
    message.author_avatar_url
      ? resolveCampaignMediaUrl(message.author_avatar_url)
      : Promise.resolve(null),
    message.attachment_url
      ? resolveCampaignMediaUrl(message.attachment_url)
      : Promise.resolve(null),
  ])

  return {
    ...message,
    author_avatar_url: avatar || message.author_avatar_url,
    attachment_url: attachment || message.attachment_url,
  }
}

function mergeEvents(current: UiChatEvent[], incoming: UiChatEvent[]) {
  const byId = new Map<number, UiChatEvent>()

  for (const event of current) byId.set(event.id, event)
  for (const event of incoming) byId.set(event.id, event)

  return [...byId.values()].sort((a, b) => a.id - b.id)
}

export function useChatRoomEvents(roomId: string) {
  const [events, setEvents] = useState<UiChatEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gmUsersRef = useRef<Set<string>>(new Set())

  const resolveGmUsers = useCallback(async (campaignId: string) => {
    const rolesResult = await supabase
      .from("campaign_members")
      .select("user_id, role, is_owner")
      .eq("campaign_id", campaignId)

    const gmUsers = new Set(
      ((rolesResult.data || []) as CampaignMemberRoleRow[])
        .filter((member) => member.role === "gm" || member.is_owner === true)
        .map((member) => member.user_id),
    )
    gmUsersRef.current = gmUsers
    return gmUsers
  }, [])

  const normalizeRows = useCallback(
    async (rows: ChatMessage[], gmUsers = gmUsersRef.current) => {
      const hydrated = await Promise.all(rows.map(hydrateMessageMedia))
      return hydrated.map((message) =>
        normalizeChatEvent(
          message,
          Boolean(message.user_id && gmUsers.has(message.user_id)),
        ),
      )
    },
    [],
  )

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)

    const auth = await supabase.auth.getUser()
    if (auth.error || !auth.data.user) {
      setEvents([])
      setError(auth.error?.message || "Сессия не найдена")
      setLoading(false)
      return
    }

    let campaignId: string | null = null
    try {
      campaignId = await resolveRoomCampaignId(roomId)
    } catch (contextError) {
      setEvents([])
      setError(
        contextError instanceof Error
          ? contextError.message
          : "Не удалось проверить доступ к комнате",
      )
      setLoading(false)
      return
    }

    if (!campaignId) {
      setEvents([])
      setError("Кампания не найдена")
      setLoading(false)
      return
    }

    const [messagesResult, gmUsers] = await Promise.all([
      supabase
        .from("chat_messages")
        .select(
          "id, room_id, user_id, client_id, character_id, author_name, author_avatar_url, body, created_at, edited_at, attachment_url, attachment_kind, event_kind, event_payload",
        )
        .eq("room_id", roomId)
        .order("id", { ascending: false })
        .limit(MESSAGE_LIMIT),
      resolveGmUsers(campaignId),
    ])

    if (messagesResult.error) {
      setEvents([])
      setError(messagesResult.error.message)
      setLoading(false)
      return
    }

    const rawMessages = ((messagesResult.data || []) as ChatMessage[]).reverse()
    const normalized = await normalizeRows(rawMessages, gmUsers)

    setEvents(normalized)
    setHasMore(rawMessages.length === MESSAGE_LIMIT)
    setLoading(false)
  }, [normalizeRows, resolveGmUsers, roomId])

  const refreshLatest = useCallback(async () => {
    setRefreshing(true)
    setError(null)

    const messagesResult = await supabase
      .from("chat_messages")
      .select(
        "id, room_id, user_id, client_id, character_id, author_name, author_avatar_url, body, created_at, edited_at, attachment_url, attachment_kind, event_kind, event_payload",
      )
      .eq("room_id", roomId)
      .order("id", { ascending: false })
      .limit(MESSAGE_LIMIT)

    if (messagesResult.error) {
      setError(messagesResult.error.message)
      setRefreshing(false)
      return
    }

    const rawMessages = ((messagesResult.data || []) as ChatMessage[]).reverse()
    const normalized = await normalizeRows(rawMessages)

    setEvents((current) => mergeEvents(current, normalized))
    setRefreshing(false)
  }, [normalizeRows, roomId])

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return 0

    const oldestId = events[0]?.id
    if (!oldestId) return 0

    setLoadingOlder(true)
    setError(null)

    const messagesResult = await supabase
      .from("chat_messages")
      .select(
        "id, room_id, user_id, client_id, character_id, author_name, author_avatar_url, body, created_at, edited_at, attachment_url, attachment_kind, event_kind, event_payload",
      )
      .eq("room_id", roomId)
      .lt("id", oldestId)
      .order("id", { ascending: false })
      .limit(MESSAGE_LIMIT)

    if (messagesResult.error) {
      setError(messagesResult.error.message)
      setLoadingOlder(false)
      return 0
    }

    const rawMessages = ((messagesResult.data || []) as ChatMessage[]).reverse()
    const normalized = await normalizeRows(rawMessages)

    setEvents((current) => mergeEvents(current, normalized))
    setHasMore(rawMessages.length === MESSAGE_LIMIT)
    setLoadingOlder(false)
    return normalized.length
  }, [events, hasMore, loadingOlder, normalizeRows, roomId])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let refreshTimer: number | null = null

    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void refreshLatest()
      }, 90)
    }

    void loadInitial()

    channel = supabase
      .channel("ui-v1-chat-room-events-" + roomId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
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
  }, [loadInitial, refreshLatest, roomId])

  return {
    events,
    loading,
    refreshing,
    loadingOlder,
    hasMore,
    error,
    reload: loadInitial,
    loadOlder,
  }
}
