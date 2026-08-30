import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { Character } from "../context/CharacterContext.tsx"
import {
  buildCharacterPreparationModel,
  type CharacterPreparationRecord,
  type CharacterPreparationSession,
} from "../lib/characterPreparation.ts"
import { supabase } from "../lib/supabase.ts"
import {
  registeredCharacterTemplateBundles,
  subscribeCharacterTemplateBundles,
} from "../rule-templates/registry.ts"

export function useChatPreparation(character: Character | null) {
  const characterId = character?.id || null
  const [bundleRevision, setBundleRevision] = useState(0)
  const [session, setSession] = useState<CharacterPreparationSession | null>(null)
  const [records, setRecords] = useState<CharacterPreparationRecord[]>([])
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!characterId) return
    return subscribeCharacterTemplateBundles(characterId, () => setBundleRevision((value) => value + 1))
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    let channel: RealtimeChannel | null = supabase.channel(`chat-preparation-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_sessions", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_records", filter: `character_id=eq.${characterId}` }, refresh)
      .subscribe()
    return () => { if (channel) { void supabase.removeChannel(channel); channel = null } }
  }, [characterId, refresh])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!characterId) { setSession(null); setRecords([]); setError(""); setLoading(false); return }
      setLoading(true); setError("")
      void Promise.all([
        supabase.from("character_preparation_sessions").select("*").eq("character_id", characterId).maybeSingle(),
        supabase.from("character_preparation_records").select("*").eq("character_id", characterId).order("generation", { ascending: false }).limit(100),
      ]).then(([sessionResult, recordsResult]) => {
        if (cancelled) return
        const firstError = sessionResult.error || recordsResult.error
        if (firstError) setError(firstError.message)
        else {
          setSession(sessionResult.data as CharacterPreparationSession | null)
          setRecords((recordsResult.data || []) as CharacterPreparationRecord[])
        }
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [characterId, revision])

  const model = useMemo(() => buildCharacterPreparationModel(
    characterId ? registeredCharacterTemplateBundles(characterId) : [],
    Math.max(1, character?.level || 1),
    session,
    records,
  ), [bundleRevision, character?.level, characterId, records, session])

  return { model, loading, error, refresh }
}
