import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { resolveCampaignMediaUrl } from "../../lib/campaignMedia"
import { supabase } from "../../lib/supabase"
import type { ChatMessage } from "../../types/chat"
import { normalizeChatEvent, type UiChatEvent } from "./chatEventModel"

type MembershipRow = {
  campaign_id: string
}

type CampaignMemberRoleRow = {
  user_id: string
  role: string
  is_owner: boolean
}

const MESSAGE_LIMIT = 150

async function resolveCampaignId(userId: string) {
  const rememberedCampaignId =
    window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
    window.localStorage.getItem("meganotrpg:campaign-id") ||
    ""

  if (rememberedCampaignId) {
    const remembered = await supabase
      .from("campaign_members")
      .select("campaign_id")
      .eq("campaign_id", rememberedCampaignId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!remembered.error && remembered.data) {
      return (remembered.data as MembershipRow).campaign_id
    }
  }

  const first = await supabase
    .from("campaign_members")
    .select("campaign_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)

  const membership = first.data?.[0] as MembershipRow | undefined
  if (!membership) return null

  window.localStorage.setItem(
    "meganotrpg:v1:campaign-id",
    membership.campaign_id,
  )
  return membership.campaign_id
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

export function useChatRoomEvents(roomId: string) {
  const [events, setEvents] = useState<UiChatEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)

    const auth = await supabase.auth.getUser()
    if (auth.error || !auth.data.user) {
      setEvents([])
      setError(auth.error?.message || "Сессия не найдена")
      if (!silent) setLoading(false)
      return
    }

    const campaignId = await resolveCampaignId(auth.data.user.id)
    if (!campaignId) {
      setEvents([])
      setError("Кампания не найдена")
      if (!silent) setLoading(false)
      return
    }

    const [messagesResult, rolesResult] = await Promise.all([
      supabase
        .from("chat_messages")
        .select(
          "id, room_id, user_id, client_id, character_id, author_name, author_avatar_url, body, created_at, edited_at, attachment_url, attachment_kind, event_kind, event_payload",
        )
        .eq("room_id", roomId)
        .order("id", { ascending: false })
        .limit(MESSAGE_LIMIT),
      supabase
        .from("campaign_members")
        .select("user_id, role, is_owner")
        .eq("campaign_id", campaignId),
    ])

    if (messagesResult.error) {
      setEvents([])
      setError(messagesResult.error.message)
      if (!silent) setLoading(false)
      return
    }

    const gmUsers = new Set(
      ((rolesResult.data || []) as CampaignMemberRoleRow[])
        .filter((member) => member.role === "gm" || member.is_owner === true)
        .map((member) => member.user_id),
    )

    const rawMessages = ((messagesResult.data || []) as ChatMessage[]).reverse()
    const hydrated = await Promise.all(rawMessages.map(hydrateMessageMedia))

    setEvents(
      hydrated.map((message) =>
        normalizeChatEvent(
          message,
          Boolean(message.user_id && gmUsers.has(message.user_id)),
        ),
      ),
    )
    if (!silent) setLoading(false)
  }, [roomId])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let refreshTimer: number | null = null

    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void load(true)
      }, 100)
    }

    void load()

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
  }, [load, roomId])

  return {
    events,
    loading,
    error,
    reload: () => load(false),
  }
}
