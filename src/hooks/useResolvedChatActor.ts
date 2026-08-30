import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { ResolvedCharacterContract } from "../character-engine/index.ts"
import type { Character } from "../context/CharacterContext.tsx"
import { characterResolutionBus } from "../engine-runtime/characterResolutionBus.ts"
import { cheburashka, watchCheburashkaCharacter } from "../inventory-engine/runtime.ts"
import type { InventoryMechanicalProjection } from "../inventory-engine/index.ts"
import {
  buildCharacterPreparationModel,
  type CharacterPreparationModel,
  type CharacterPreparationRecord,
  type CharacterPreparationSession,
} from "../lib/characterPreparation.ts"
import { resolveLegacyCharacterEngineView } from "../lib/legacyCharacterEngineAdapter.ts"
import { resourceSyncInputs } from "../lib/resourceRuntime.ts"
import { supabase } from "../lib/supabase.ts"
import type { CharacterFeature, CharacterSheet, CharacterSpell } from "../types/characterSheet.ts"
import { useCharacterResourceStates } from "./useCharacterResourceStates.ts"
import { useCharacterTemplateRegistry } from "./useCharacterTemplateRegistry.ts"

type CharacterSpellCatalogLink = CharacterSpell & { catalog_spell_id?: string | null }
type SpellCatalogRoutingRow = {
  id: string
  slug: string
  damage: string | null
  roll_recipe: unknown
}
type RoutedSpellIdentity = { dealsDamage?: boolean }

const EMPTY_PREPARATION: CharacterPreparationModel = { session: null, tasks: [], suppressedSourceIds: [] }

async function loadInventoryProjection(characterId: string): Promise<{
  data: InventoryMechanicalProjection | null
  error: { message: string } | null
}> {
  try {
    return { data: await cheburashka.mechanicalProjection(characterId), error: null }
  } catch (reason) {
    return { data: null, error: { message: reason instanceof Error ? reason.message : "Не удалось получить проекцию инвентаря." } }
  }
}

function rollRecipeDealsDamage(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(rollRecipeDealsDamage)
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (record.kind === "damage") return true
  return Object.values(record).some(rollRecipeDealsDamage)
}

function catalogDealsDamage(row: Pick<SpellCatalogRoutingRow, "damage" | "roll_recipe"> | undefined): boolean {
  if (!row) return false
  if (typeof row.damage === "string" && row.damage.trim()) return true
  return rollRecipeDealsDamage(row.roll_recipe)
}

function catalogSlugFromResolvedKey(key: string): string | null {
  if (!key.startsWith("spell:")) return null
  const slug = key.slice("spell:".length).trim()
  return slug && /^[a-z0-9-]+$/i.test(slug) ? slug : null
}

function withCatalogDamageRouting(
  contract: ResolvedCharacterContract,
  characterSpells: CharacterSpellCatalogLink[],
  catalogRows: SpellCatalogRoutingRow[],
): ResolvedCharacterContract {
  const catalogById = new Map(catalogRows.map((row) => [row.id, row]))
  const catalogBySlug = new Map(catalogRows.map((row) => [row.slug, row]))
  const damageSpellKeys = new Set<string>()

  for (const characterSpell of characterSpells) {
    if (!characterSpell.catalog_spell_id || !catalogDealsDamage(catalogById.get(characterSpell.catalog_spell_id))) continue
    const accessKey = `legacy-${characterSpell.id}`
    const resolved = contract.spells.find((spell) => spell.accesses.some((access) => access.key === accessKey))
    if (resolved) damageSpellKeys.add(resolved.key)
  }

  for (const spell of contract.spells) {
    const slug = catalogSlugFromResolvedKey(spell.key)
    if (slug && catalogDealsDamage(catalogBySlug.get(slug))) damageSpellKeys.add(spell.key)
  }

  const spells = contract.spells.map((spell) => ({
    ...spell,
    identity: {
      ...spell.identity,
      dealsDamage: damageSpellKeys.has(spell.key),
    },
  }))

  return { ...contract, spells }
}

function routedIdentity(spell: ResolvedCharacterContract["spells"][number]): RoutedSpellIdentity {
  return spell.identity as typeof spell.identity & RoutedSpellIdentity
}

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
  const [preparation, setPreparation] = useState<CharacterPreparationModel>(EMPTY_PREPARATION)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const rowByKey = useMemo(() => new Map(resourceRows.map((row) => [row.state_key, row])), [resourceRows])

  useEffect(() => {
    if (!characterId) return
    return characterResolutionBus.subscribe(characterId, refresh)
  }, [characterId, refresh])

  useEffect(() => {
    if (!characterId) return
    return watchCheburashkaCharacter(characterId)
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    let channel: RealtimeChannel | null = supabase.channel(`character-sheet-runtime-${characterId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "character_sheets", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_spells", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_sessions", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_records", filter: `character_id=eq.${characterId}` }, refresh)
      .subscribe()
    return () => { if (channel) { void supabase.removeChannel(channel); channel = null } }
  }, [characterId, refresh])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!character) { setContract(null); setPreparation(EMPTY_PREPARATION); setError(""); setLoading(false); return }
      if (templateLoading || resourceLoading) { setLoading(true); return }
      setLoading(true); setError(templateError || resourceError || "")
      void Promise.all([
        supabase.from("character_sheets").select("*").eq("character_id", character.id).maybeSingle(),
        loadInventoryProjection(character.id),
        supabase.from("character_spells").select("*").eq("character_id", character.id).order("spell_level", { ascending: true }),
        supabase.from("character_features").select("*").eq("character_id", character.id).order("sort_order", { ascending: true }),
        supabase.from("character_preparation_sessions").select("*").eq("character_id", character.id).maybeSingle(),
        supabase.from("character_preparation_records").select("*").eq("character_id", character.id).order("generation", { ascending: false }).limit(100),
      ]).then(async ([sheetResult, inventoryResult, spellsResult, featuresResult, preparationResult, preparationRecordsResult]) => {
        if (cancelled) return
        const firstError = sheetResult.error || inventoryResult.error || spellsResult.error || featuresResult.error || preparationResult.error || preparationRecordsResult.error
        if (firstError) { setError(firstError.message); setLoading(false); return }
        const sheet = sheetResult.data as CharacterSheet | null
        if (!sheet) { setContract(null); setPreparation(EMPTY_PREPARATION); setLoading(false); return }
        try {
          const characterSpells = (spellsResult.data || []) as CharacterSpellCatalogLink[]
          const preparationModel = buildCharacterPreparationModel(
            templateBundles,
            Math.max(1, character.level || 1),
            preparationResult.data as CharacterPreparationSession | null,
            (preparationRecordsResult.data || []) as CharacterPreparationRecord[],
          )
          setPreparation(preparationModel)
          const effectiveSuppressions = new Set([...suppressedSourceIds, ...preparationModel.suppressedSourceIds])
          const view = resolveLegacyCharacterEngineView({
            character,
            sheet,
            inventoryContributions: inventoryResult.data?.contributions ?? [],
            spells: characterSpells,
            features: (featuresResult.data || []) as CharacterFeature[],
            resourceStates: resourceState,
            templateBundles,
            suppressedSourceIds: effectiveSuppressions,
          })
          if (cancelled) return

          const catalogIds = [...new Set(characterSpells.map((spell) => spell.catalog_spell_id).filter((id): id is string => Boolean(id)))]
          const catalogSlugs = [...new Set(view.contract.spells.map((spell) => catalogSlugFromResolvedKey(spell.key)).filter((slug): slug is string => Boolean(slug)))]
          const catalogQueries = await Promise.all([
            catalogIds.length
              ? supabase.from("spell_catalog").select("id, slug, damage, roll_recipe").in("id", catalogIds)
              : Promise.resolve({ data: [], error: null }),
            catalogSlugs.length
              ? supabase.from("spell_catalog").select("id, slug, damage, roll_recipe").in("slug", catalogSlugs)
              : Promise.resolve({ data: [], error: null }),
          ])
          if (cancelled) return
          const catalogError = catalogQueries[0].error || catalogQueries[1].error
          if (catalogError) setError(catalogError.message)
          const catalogRows = [
            ...((catalogQueries[0].data || []) as SpellCatalogRoutingRow[]),
            ...((catalogQueries[1].data || []) as SpellCatalogRoutingRow[]),
          ]
          const routedContract = withCatalogDamageRouting(view.contract, characterSpells, catalogRows)
          setContract(routedContract)

          // Keep the routing metadata renderer-only. This guard makes accidental
          // CE branching on dealsDamage obvious during future refactors.
          for (const spell of routedContract.spells) void routedIdentity(spell).dealsDamage

          const desired = resourceSyncInputs(routedContract)
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

  return { contract, preparation, loading, error, refresh }
}
