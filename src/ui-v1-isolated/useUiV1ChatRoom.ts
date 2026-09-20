import { useCallback, useEffect, useState } from "react"

import { supabase } from "../lib/supabase"
import type { ChatMessage, RoomState, RoomType, SceneState } from "../types/chat"

export type UiV1ChatRoomSummary = {
  id: string
  title: string
  room_type: RoomType
  room_state: RoomState
  scene_state: SceneState
  is_read_only: boolean
  character_id: string | null
  location_id: string | null
  campaign_day: number
  day_period: string
}

type ChatRoomState = {
  room: UiV1ChatRoomSummary | null
  messages: ChatMessage[]
  viewerUserId: string | null
  loading: boolean
  error: string | null
}

const initialState: ChatRoomState = {
  room: null,
  messages: [],
  viewerUserId: null,
  loading: true,
  error: null,
}

function messageFromRow(row: Record<string, unknown>): ChatMessage {
  return row as unknown as ChatMessage
}

export function useUiV1ChatRoom(roomId: string) {
  const [state, setState] = useState<ChatRoomState>(initialState)

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))

    const [roomResult, messageResult, userResult] = await Promise.all([
      supabase
        .from("chat_rooms")
        .select(
          "id,title,room_type,room_state,scene_state,is_read_only,character_id,location_id,campaign_day,day_period",
        )
        .eq("id", roomId)
        .maybeSingle(),
      supabase
        .from("chat_messages")
        .select(
          "id,room_id,user_id,client_id,character_id,author_name,author_avatar_url,body,created_at,edited_at,attachment_url,attachment_kind,event_kind,event_payload",
        )
        .eq("room_id", roomId)
        .order("id", { ascending: false })
        .limit(120),
      supabase.auth.getUser(),
    ])

    if (roomResult.error || !roomResult.data) {
      setState({
        room: null,
        messages: [],
        viewerUserId: userResult.data.user?.id || null,
        loading: false,
        error: roomResult.error?.message || "Чат недоступен.",
      })
      return
    }

    if (messageResult.error) {
      setState({
        room: roomResult.data as UiV1ChatRoomSummary,
        messages: [],
        viewerUserId: userResult.data.user?.id || null,
        loading: false,
        error: messageResult.error.message,
      })
      return
    }

    const rows = (messageResult.data || []).map((row) =>
      messageFromRow(row as Record<string, unknown>),
    )

    setState({
      room: roomResult.data as UiV1ChatRoomSummary,
      messages: rows.reverse(),
      viewerUserId: userResult.data.user?.id || null,
      loading: false,
      error: null,
    })
  }, [roomId])

  useEffect(() => {
    let disposed = false

    queueMicrotask(() => {
      if (!disposed) void load()
    })

    const channel = supabase
      .channel("ui-v1-chat-room:" + roomId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: "room_id=eq." + roomId,
        },
        () => {
          if (!disposed) void load()
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_rooms",
          filter: "id=eq." + roomId,
        },
        () => {
          if (!disposed) void load()
        },
      )
      .subscribe()

    return () => {
      disposed = true
      void supabase.removeChannel(channel)
    }
  }, [load, roomId])

  return {
    ...state,
    reload: load,
  }
}
