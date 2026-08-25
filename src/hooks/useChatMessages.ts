import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import type { ChatMessage } from "../types/chat"

type RealtimeState = "connecting" | "live" | "offline"
type Result = { ok: boolean; error?: string }

const fields =
  "id, room_id, user_id, client_id, character_id, author_name, author_avatar_url, body, created_at, edited_at"

export function useChatMessages(roomId: string) {
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
      .select(fields)
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
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          )
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage
          setMessages((current) =>
            current.map((message) =>
              message.id === incoming.id ? incoming : message,
            ),
          )
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const removed = payload.old as Partial<ChatMessage>
          if (removed.id == null) return
          setMessages((current) =>
            current.filter((message) => message.id !== removed.id),
          )
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
        .insert({ room_id: roomId, body })
        .select(fields)
        .single()

      setSending(false)

      if (sendError) {
        setError(sendError.message)
        return false
      }

      const inserted = data as ChatMessage
      setMessages((current) =>
        current.some((message) => message.id === inserted.id)
          ? current
          : [...current, inserted],
      )
      return true
    },
    [roomId, sending],
  )

  const editMessage = useCallback(
    async (messageId: number, text: string): Promise<Result> => {
      const body = text.trim()
      if (!body) return { ok: false, error: "Сообщение не может быть пустым." }

      const { error: editError } = await supabase.rpc("edit_chat_message", {
        p_message_id: messageId,
        p_body: body,
      })

      if (editError) return { ok: false, error: editError.message }

      await loadMessages()
      return { ok: true }
    },
    [loadMessages],
  )

  const deleteMessage = useCallback(
    async (messageId: number): Promise<Result> => {
      const { error: deleteError } = await supabase.rpc(
        "delete_chat_message",
        { p_message_id: messageId },
      )

      if (deleteError) return { ok: false, error: deleteError.message }

      setMessages((current) =>
        current.filter((message) => message.id !== messageId),
      )
      return { ok: true }
    },
    [],
  )

  return {
    messages,
    loading,
    sending,
    error,
    realtime,
    sendMessage,
    editMessage,
    deleteMessage,
  }
}
