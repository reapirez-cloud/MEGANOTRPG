import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"

export type SceneSurfaceInvalidation =
  | { kind: "surface"; roomId: string; surfaceId: string }
  | { kind: "participants"; roomId: string }

/**
 * Larisa-owned refresh transport for scene mechanics.
 *
 * Canonical winner/permission decisions happen in server transactions. Realtime
 * only tells future consumers to refetch scene membership / Surface state.
 */
export function subscribeLarisaSceneSurfaceChanges(
  client: SupabaseClient,
  roomId: string,
  onInvalidate: (change: SceneSurfaceInvalidation) => void,
): () => void {
  let channel: RealtimeChannel = client.channel(`larisa-scene-surfaces:${roomId}`)

  channel = channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "scene_surfaces",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const current = payload.new as Record<string, unknown>
        const previous = payload.old as Record<string, unknown>
        onInvalidate({
          kind: "surface",
          roomId,
          surfaceId: String(current.id || previous.id || ""),
        })
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "scene_participants",
        filter: `room_id=eq.${roomId}`,
      },
      () => onInvalidate({ kind: "participants", roomId }),
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
