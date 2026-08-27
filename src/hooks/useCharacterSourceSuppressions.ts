import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { clearCharacterSourceSuppressions, registerCharacterSourceSuppressions } from "../lib/suppressionRuntime.ts"
import { supabase } from "../lib/supabase.ts"
import type { CharacterSourceSuppressionRow } from "../types/characterSuppressions.ts"

export function useCharacterSourceSuppressions(characterId: string | null) {
  const [rows, setRows] = useState<CharacterSourceSuppressionRow[]>([])
  const [loading, setLoading] = useState(Boolean(characterId))
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)

  const load = useCallback(async () => {
    if (!characterId) { setRows([]); setLoading(false); setError(""); return }
    setLoading(true); setError("")
    const { data, error: queryError } = await supabase
      .from("character_source_suppressions")
      .select("character_id,source_id,disabled_by,created_at,updated_at")
      .eq("character_id", characterId)
      .order("source_id")
    if (queryError) { setError(queryError.message); setLoading(false); return }
    setRows((data || []) as CharacterSourceSuppressionRow[])
    setLoading(false)
  }, [characterId])

  useEffect(() => {
    void load()
    if (!characterId) return
    let channel: RealtimeChannel | null = supabase.channel(`character-suppressions-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_source_suppressions", filter: `character_id=eq.${characterId}` }, () => void load())
      .subscribe()
    return () => {
      if (channel) { void supabase.removeChannel(channel); channel = null }
      clearCharacterSourceSuppressions(characterId)
    }
  }, [characterId, load])

  const sourceIds = useMemo(() => new Set(rows.map((row) => row.source_id)), [rows])
  useEffect(() => {
    if (!characterId) return
    registerCharacterSourceSuppressions(characterId, sourceIds)
    setRevision((value) => value + 1)
  }, [characterId, sourceIds])

  const setSuppressed = useCallback(async (sourceId: string, suppressed: boolean) => {
    if (!characterId || !sourceId.trim()) return { ok: false as const, error: "Источник не указан." }
    const { error: rpcError } = await supabase.rpc("set_character_source_suppressed", {
      p_character_id: characterId,
      p_source_id: sourceId,
      p_suppressed: suppressed,
    })
    if (rpcError) return { ok: false as const, error: rpcError.message }
    await load()
    return { ok: true as const }
  }, [characterId, load])

  return { rows, sourceIds, loading, error, revision, reload: load, setSuppressed }
}
