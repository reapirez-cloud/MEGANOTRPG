import { useEffect, useState } from "react"
import type { ResolvedCharacterContract } from "../character-engine/index.ts"
import type { Character } from "../context/CharacterContext"
import { resolveLegacyCharacterEngineView } from "../lib/legacyCharacterEngineAdapter"
import { supabase } from "../lib/supabase"
import type { CharacterFeature, CharacterSheet, CharacterSpell, InventoryItem } from "../types/characterSheet"

export function useResolvedChatActor(character: Character | null) {
  const [contract, setContract] = useState<ResolvedCharacterContract | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    if (!character) { setContract(null); setError(""); setLoading(false); return }
    setLoading(true); setError("")
    void Promise.all([
      supabase.from("character_sheets").select("*").eq("character_id", character.id).maybeSingle(),
      supabase.from("character_inventory_items").select("*").eq("character_id", character.id).order("sort_order", { ascending: true }),
      supabase.from("character_spells").select("*").eq("character_id", character.id).order("spell_level", { ascending: true }),
      supabase.from("character_features").select("*").eq("character_id", character.id).order("sort_order", { ascending: true }),
    ]).then(([sheetResult, inventoryResult, spellsResult, featuresResult]) => {
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
        })
        setContract(view.contract)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Не удалось рассчитать действия персонажа.")
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [character])

  return { contract, loading, error }
}
