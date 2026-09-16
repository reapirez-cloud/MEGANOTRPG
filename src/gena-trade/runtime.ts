import { supabase } from "../lib/supabase.ts"
import { subscribeTradeSessionInvalidation } from "./realtime.ts"
import { SupabaseTradeSessionClient } from "./supabase.ts"

export const tradeSession = new SupabaseTradeSessionClient(supabase)

export function watchTradeSession(
  sessionId: string,
  onInvalidate: Parameters<typeof subscribeTradeSessionInvalidation>[2],
): () => void {
  return subscribeTradeSessionInvalidation(supabase, sessionId, onInvalidate)
}
