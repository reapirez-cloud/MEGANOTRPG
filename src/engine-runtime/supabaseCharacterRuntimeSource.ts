import { cheburashka } from "../inventory-engine/runtime.ts"
import { supabase } from "../lib/supabase.ts"
import type {
  CharacterRuntimeCatalogData,
  CharacterRuntimeCatalogQuery,
  CharacterRuntimeCoreData,
  CharacterRuntimeDataSource,
  CharacterSpellCatalogLink,
  SpellCatalogRoutingRow,
} from "./characterRuntimeResolver.ts"
import type {
  CharacterPreparationRecord,
  CharacterPreparationSession,
} from "../lib/characterPreparation.ts"
import type { CharacterFeature, CharacterSheet } from "../types/characterSheet.ts"

/** Production read adapter. It translates persistence into resolver inputs only. */
export class SupabaseCharacterRuntimeDataSource implements CharacterRuntimeDataSource {
  async loadCore(characterId: string): Promise<CharacterRuntimeCoreData> {
    const [
      sheetResult,
      inventoryProjection,
      spellsResult,
      featuresResult,
      preparationResult,
      preparationRecordsResult,
    ] = await Promise.all([
      supabase.from("character_sheets").select("*").eq("character_id", characterId).maybeSingle(),
      cheburashka.mechanicalProjection(characterId),
      supabase.from("character_spells").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }),
      supabase.from("character_features").select("*").eq("character_id", characterId).order("sort_order", { ascending: true }),
      supabase.from("character_preparation_sessions").select("*").eq("character_id", characterId).maybeSingle(),
      supabase.from("character_preparation_records").select("*").eq("character_id", characterId).order("generation", { ascending: false }).limit(100),
    ])

    const firstError =
      sheetResult.error ||
      spellsResult.error ||
      featuresResult.error ||
      preparationResult.error ||
      preparationRecordsResult.error
    if (firstError) throw new Error(firstError.message)

    return {
      sheet: sheetResult.data as CharacterSheet | null,
      inventoryProjection,
      spells: (spellsResult.data || []) as CharacterSpellCatalogLink[],
      features: (featuresResult.data || []) as CharacterFeature[],
      preparationSession: preparationResult.data as CharacterPreparationSession | null,
      preparationRecords: (preparationRecordsResult.data || []) as CharacterPreparationRecord[],
    }
  }

  async loadCatalog(query: CharacterRuntimeCatalogQuery): Promise<CharacterRuntimeCatalogData> {
    const rows: SpellCatalogRoutingRow[] = []
    const warnings: string[] = []

    if (query.catalogIds.length) {
      const result = await supabase
        .from("spell_catalog")
        .select("id, slug, damage, roll_recipe")
        .in("id", query.catalogIds)
      if (result.error) warnings.push(result.error.message)
      else rows.push(...((result.data || []) as SpellCatalogRoutingRow[]))
    }

    if (query.catalogSlugs.length) {
      const result = await supabase
        .from("spell_catalog")
        .select("id, slug, damage, roll_recipe")
        .in("slug", query.catalogSlugs)
      if (result.error) warnings.push(result.error.message)
      else rows.push(...((result.data || []) as SpellCatalogRoutingRow[]))
    }

    const uniqueRows = new Map<string, SpellCatalogRoutingRow>()
    for (const row of rows) uniqueRows.set(row.id, row)
    return { rows: [...uniqueRows.values()], warnings: [...new Set(warnings)] }
  }
}

export const supabaseCharacterRuntimeDataSource = new SupabaseCharacterRuntimeDataSource()
