import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { ResolvedCharacterContract } from "../character-engine/index.ts"
import type { Character } from "../context/CharacterContext.tsx"
import { resolveLegacyCharacterEngineView } from "../lib/legacyCharacterEngineAdapter.ts"
import { resourceSyncInputs } from "../lib/resourceRuntime.ts"
import { supabase } from "../lib/supabase.ts"
import type { CharacterFeature, CharacterSheet, CharacterSpell, InventoryItem } from "../types/characterSheet.ts"
import { useCharacterResourceStates } from "./useCharacterResourceStates.ts"
import { useCharacterTemplateRegistry } from "./useCharacterTemplateRegistry.ts"

export function useResolvedChatActor(character: Character | null) {
  const characterId = character?.id || null
  const {
    bundles: templateBundles,
    error: templateError,
    loading: templateLoading,
    suppressions,
  } = useCharacterTemplateRegistry(characterId)
  const suppressedSourceIds = suppressions.sourceIds
  const {
    error: resourceError,
    loading: resourceLoading,
    rows: resourceRows,
    state: resourceState,
    sync: syncResources,
  } = useCharacterResourceStates(characterId)
  const [contract, setContract] = useState<ResolvedCharacterContract | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const rowByKey = useMemo(() => new Map(resourceRows.map((row) => [row.state_key, row])), [resourceRows])

  useEffect(() => {
    if (!characterId) return
    let channel: RealtimeChannel | null = supabase.channel(`character-sheet-runtime-${characterId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "character_sheets", filter: `character_id=eq.${characterId}` }, refresh)
      .subscribe()
    return () => { if (channel) { void supabase.removeChannel(channel); channel = null } }
  }, [characterId, refresh])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!character) { setContract(null); setError(""); setLoading(false); return }
      if (templateLoading || resourceLoading) { setLoading(true); return }
      setLoading(true); setError(templateError || resourceError || "")
      void Promise.all([
        supabase.from("character_sheets").select("*").eq("character_id", character.id).maybeSingle(),
        supabase.from("character_inventory_items").select("*").eq("character_id", character.id).order("sort_order", { ascending: true }),
        supabase.from("character_spells").select("*").eq("character_id", character.id).order("spell_level", { ascending: true }),
        supabase.from("character_features").select("*").eq("character_id", character.id).order("sort_order", { ascending: true }),
      ]).then(async ([sheetResult, inventoryResult, spellsResult, featuresResult]) => {
        if (cancelled) return
        const firstError = sheetResult.error || inventoryResult.error || spellsResult.error || featuresResult.error
        if (firstError) { setError(firstError.message); setLoading(false); return }
        const sheet = sheetResult.data as CharacterSheet | null
        if (!sheet) { setContract(null); setLoading(false); return }
        try {
          const view = resolveLegacyCharacterEngineView({
            character,
            sheet,
            inventory: (inventoryResult.data || []) as InventoryItem[],
            spells: (spellsResult.data || []) as CharacterSpell[],
            features: (featuresResult.data || []) as CharacterFeature[],
            resourceStates: resourceState,
            templateBundles,
            suppressedSourceIds,
          })
          if (cancelled) return
          setContract(view.contract)
          const desired = resourceSyncInputs(view.contract)
          const needsSync = desired.some((item) => { const row = rowByKey.get(item.stateKey); return !row || row.max_snapshot !== item.max || row.label !== item.label || JSON.stringify(row.recharge) !== JSON.stringify(item.recharge) })
          if (needsSync) { const result = await syncResources(desired); if (!result.ok && !cancelled) setError(result.error || "Не удалось синхронизировать ресурсы персонажа.") }
        } catch (reason) {
          if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось рассчитать действия персонажа.")
        }
        if (!cancelled) setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [character, resourceError, resourceLoading, resourceState, revision, rowByKey, suppressedSourceIds, syncResources, templateBundles, templateError, templateLoading])

  return { contract, loading, error, refresh }
}
