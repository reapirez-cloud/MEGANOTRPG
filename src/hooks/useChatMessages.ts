import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import type { ChatMessage } from "../types/chat"

type RealtimeState = "connecting" | "live" | "offline"

export function useChatMessages(roomId: string) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtime, setRealtime] = useState<RealtimeState>("connecting")

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: loadError } = await supabase
      .from("chat_messages")
      .select("id, room_id, user_id, client_id, author_name, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(200)

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    setMessages((data || []) as ChatMessage[])
    setLoading(false)
  }, [roomId])

  useEffect(() => {
    void loadMessages()

    let channel: RealtimeChannel | null = supabase
      .channel(`chat-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage

          setMessages((current) => {
            if (current.some((message) => message.id === incoming.id)) {
              return current
            }

            return [...current, incoming]
          })
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime("live")
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtime("offline")
        } else {
          setRealtime("connecting")
        }
      })

    return () => {
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [loadMessages, roomId])

  const sendMessage = useCallback(
    async (text: string) => {
      const body = text.trim()
      if (!body || sending) return false

      setSending(true)
      setError(null)

      const { data, error: sendError } = await supabase
        .from("chat_messages")
        .insert({
          room_id: roomId,
          body,
        })
        .select("id, room_id, user_id, client_id, author_name, body, created_at")
        .single()

      setSending(false)

      if (sendError) {
        setError(sendError.message)
        return false
      }

      const inserted = data as ChatMessage

      setMessages((current) => {
        if (current.some((message) => message.id === inserted.id)) {
          return current
        }

        return [...current, inserted]
      })

      return true
    },
    [roomId, sending],
  )

  return {
    messages,
    loading,
    sending,
    error,
    realtime,
    userId: user.id,
    sendMessage,
  }
}
