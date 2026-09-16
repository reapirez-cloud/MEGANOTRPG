import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { TradeInvalidation } from "./types.ts"

/**
 * Cross-client refresh transport for Trade.
 *
 * Realtime never accepts an offer and never decides settlement. It only tells a
 * future UI/controller to refetch the canonical GENA/Cheburashka state.
 */
export function subscribeTradeSessionInvalidation(
  client: SupabaseClient,
  sessionId: string,
  onInvalidate: (change: TradeInvalidation) => void,
): () => void {
  let channel: RealtimeChannel = client.channel(`gena-trade:${sessionId}`)

  const tables: Array<{
    table: string
    kind: TradeInvalidation["kind"]
    filter: string
  }> = [
    { table: "trade_sessions", kind: "session", filter: `id=eq.${sessionId}` },
    { table: "trade_offer_lines", kind: "offer", filter: `session_id=eq.${sessionId}` },
    { table: "trade_visible_items", kind: "visibility", filter: `session_id=eq.${sessionId}` },
    { table: "trade_interest_marks", kind: "interest", filter: `session_id=eq.${sessionId}` },
    { table: "trade_messages", kind: "thread", filter: `session_id=eq.${sessionId}` },
  ]

  for (const entry of tables) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: entry.table,
        filter: entry.filter,
      },
      () => onInvalidate({ kind: entry.kind, sessionId }),
    )
  }

  channel = channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
