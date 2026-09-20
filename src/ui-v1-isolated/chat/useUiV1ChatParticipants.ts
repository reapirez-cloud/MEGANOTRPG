import { useCallback, useEffect, useState } from "react"

import { supabase } from "../../lib/supabase"
import type { UiV1ChatRoomSummary } from "../useUiV1ChatRoom"

export type UiV1ChatParticipant = {
  id: string
  name: string
  characterClass: string
  level: number
  avatarUrl: string | null
  lifeState: string
  assignedUserId: string | null
  characterType: string
}

type State = {
  participants: UiV1ChatParticipant[]
  loading: boolean
  error: string
}

const emptyState: State = {
  participants: [],
  loading: false,
  error: "",
}

export function useUiV1ChatParticipants(
  room: UiV1ChatRoomSummary | null,
  enabled: boolean,
) {
  const [state, setState] = useState<State>(emptyState)

  const load = useCallback(async () => {
    if (!enabled || !room || room.room_type === "flood") {
      setState(emptyState)
      return
    }

    setState((current) => ({ ...current, loading: true, error: "" }))

    let ids: string[] = []

    if (room.room_type === "character") {
      if (room.character_id) ids = [room.character_id]
    } else {
      const result = await supabase
        .from("scene_participants")
        .select("character_id")
        .eq("room_id", room.id)

      if (result.error) {
        setState({
          participants: [],
          loading: false,
          error: result.error.message,
        })
        return
      }

      ids = (result.data || [])
        .map((row) => String(row.character_id || ""))
        .filter(Boolean)
    }

    if (!ids.length) {
      setState({ participants: [], loading: false, error: "" })
      return
    }

    const result = await supabase
      .from("characters")
      .select("id,name,character_class,level,avatar_url,life_state,assigned_user_id,character_type")
      .in("id", ids)

    if (result.error) {
      setState({
        participants: [],
        loading: false,
        error: result.error.message,
      })
      return
    }

    const byId = new Map(
      (result.data || []).map((row) => [
        String(row.id),
        {
          id: String(row.id),
          name: String(row.name || "Персонаж"),
          characterClass: String(row.character_class || ""),
          level: Number(row.level || 1),
          avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
          lifeState: String(row.life_state || "alive"),
          assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
          characterType: String(row.character_type || "pc"),
        } satisfies UiV1ChatParticipant,
      ]),
    )

    setState({
      participants: ids
        .map((id) => byId.get(id) || null)
        .filter((item): item is UiV1ChatParticipant => item !== null),
      loading: false,
      error: "",
    })
  }, [enabled, room])

  useEffect(() => {
    let disposed = false

    queueMicrotask(() => {
      if (!disposed) void load()
    })

    if (!enabled || !room || room.room_type !== "scene") {
      return () => {
        disposed = true
      }
    }

    const channel = supabase
      .channel("ui-v1-chat-participants:" + room.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scene_participants",
          filter: "room_id=eq." + room.id,
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
  }, [enabled, load, room])

  return {
    ...state,
    reload: load,
  }
}
