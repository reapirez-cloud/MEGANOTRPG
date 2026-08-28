import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { clearCharacterResourceState, registerCharacterResourceState } from "../lib/resourceRuntime.ts"
import { supabase } from "../lib/supabase.ts"
import type { CharacterResourceStateRow, ResourceSyncInput } from "../types/characterResources.ts"

export function useCharacterResourceStates(characterId: string | null) {
  const [rows, setRows] = useState<CharacterResourceStateRow[]>([])
  const [loading, setLoading] = useState(Boolean(characterId))
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)

  const load = useCallback(async () => {
    if (!characterId) { setRows([]); setLoading(false); setError(""); return }
    setLoading(true); setError("")
    const { data, error: queryError } = await supabase.from("character_resource_states").select("character_id,state_key,current,max_snapshot,label,recharge,updated_by,created_at,updated_at").eq("character_id", characterId).order("state_key")
    if (queryError) { setError(queryError.message); setLoading(false); return }
    setRows((data || []) as CharacterResourceStateRow[]); setLoading(false)
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    if (!characterId) return () => { cancelled = true }
    let channel: RealtimeChannel | null = supabase.channel(`character-resources-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_resource_states", filter: `character_id=eq.${characterId}` }, () => void load())
      .subscribe()
    return () => { cancelled = true; if (channel) { void supabase.removeChannel(channel); channel = null } clearCharacterResourceState(characterId) }
  }, [characterId, load])

  const state = useMemo(() => Object.fromEntries(rows.map((row) => [row.state_key, { current: row.current }])), [rows])
  useEffect(() => {
    if (!characterId) return
    registerCharacterResourceState(characterId, state)
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setRevision((value) => value + 1) })
    return () => { cancelled = true }
  }, [characterId, state])

  const sync = useCallback(async (resources: ResourceSyncInput[]) => {
    if (!characterId || !resources.length) return { ok: true as const }
    const { error: syncError } = await supabase.rpc("sync_character_resource_states", { p_character_id: characterId, p_resources: resources })
    if (syncError) return { ok: false as const, error: syncError.message }
    await load(); return { ok: true as const }
  }, [characterId, load])

  return { rows, state, loading, error, revision, reload: load, sync }
}
