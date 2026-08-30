import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { Character } from "../context/CharacterContext.tsx"
import {
  CharacterRuntimeResolveError,
  type CharacterRuntimeResolveErrorCode,
  type CharacterRuntimeSnapshot,
} from "../engine-runtime/characterRuntimeResolver.ts"
import { characterRuntimeResolver } from "../engine-runtime/characterRuntime.ts"
import { characterResolutionBus } from "../engine-runtime/characterResolutionBus.ts"
import { watchCheburashkaCharacter } from "../inventory-engine/runtime.ts"
import type { CharacterPreparationModel } from "../lib/characterPreparation.ts"
import { supabase } from "../lib/supabase.ts"
import { useCharacterResourceStates } from "./useCharacterResourceStates.ts"
import { useCharacterTemplateRegistry } from "./useCharacterTemplateRegistry.ts"

export type CharacterRuntimeStatus = "idle" | "loading" | "ready" | "stale" | "error"

const EMPTY_PREPARATION: CharacterPreparationModel = {
  session: null,
  tasks: [],
  suppressedSourceIds: [],
}

/**
 * Shared React adapter over CharacterRuntimeResolver.
 *
 * The hook owns subscriptions and presentation state only. It never assembles
 * CE input itself, so Chat/Sheet/Revolver can consume the same runtime snapshot.
 */
export function useResolvedCharacterRuntime(character: Character | null) {
  const characterId = character?.id || null
  const {
    bundles: templateBundles,
    error: templateError,
    loading: templateLoading,
    reload: reloadTemplates,
    suppressions,
  } = useCharacterTemplateRegistry(characterId)
  const {
    error: resourceError,
    loading: resourceLoading,
    rows: resourceRows,
    state: resourceState,
    sync: syncResources,
  } = useCharacterResourceStates(characterId)

  const [snapshot, setSnapshot] = useState<CharacterRuntimeSnapshot | null>(null)
  const snapshotRef = useRef<CharacterRuntimeSnapshot | null>(null)
  const [status, setStatus] = useState<CharacterRuntimeStatus>(characterId ? "loading" : "idle")
  const [error, setError] = useState("")
  const [errorCode, setErrorCode] = useState<CharacterRuntimeResolveErrorCode | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => {
    setStatus(snapshotRef.current ? "stale" : "loading")
    setRevision((value) => value + 1)
  }, [])

  const rowByKey = useMemo(
    () => new Map(resourceRows.map((row) => [row.state_key, row])),
    [resourceRows],
  )

  useEffect(() => {
    snapshotRef.current = null
    setSnapshot(null)
    setError("")
    setErrorCode(null)
    setWarnings([])
    setStatus(characterId ? "loading" : "idle")
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    return characterResolutionBus.subscribe(characterId, refresh)
  }, [characterId, refresh])

  useEffect(() => {
    if (!character?.campaign_id) return
    return characterResolutionBus.subscribeCampaign(character.campaign_id, refresh)
  }, [character?.campaign_id, refresh])

  useEffect(() => {
    if (!characterId) return
    return watchCheburashkaCharacter(characterId)
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    let channel: RealtimeChannel | null = supabase
      .channel(`character-runtime-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_sheets", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_spells", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_features", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_sessions", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_records", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_template_assignments", filter: `character_id=eq.${characterId}` }, () => {
        void reloadTemplates().finally(refresh)
      })
      .subscribe()

    return () => {
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [characterId, refresh, reloadTemplates])

  useEffect(() => {
    let cancelled = false

    if (!character) {
      snapshotRef.current = null
      setSnapshot(null)
      setStatus("idle")
      setError("")
      setErrorCode(null)
      return () => { cancelled = true }
    }

    if (templateLoading || resourceLoading) {
      setStatus(snapshotRef.current ? "stale" : "loading")
      return () => { cancelled = true }
    }

    const sourceError = templateError || resourceError
    if (sourceError) {
      setError(sourceError)
      setErrorCode("read_failed")
      setStatus("error")
      return () => { cancelled = true }
    }

    setStatus(snapshotRef.current ? "stale" : "loading")
    setError("")
    setErrorCode(null)

    void characterRuntimeResolver.resolve({
      character,
      templateBundles,
      resourceState,
      suppressedSourceIds: suppressions.sourceIds,
    }).then(async (next) => {
      if (cancelled) return

      snapshotRef.current = next
      setSnapshot(next)
      setWarnings(next.warnings)
      setStatus("ready")

      const needsSync = next.resourceSyncInputs.some((item) => {
        const row = rowByKey.get(item.stateKey)
        return !row ||
          row.max_snapshot !== item.max ||
          row.label !== item.label ||
          JSON.stringify(row.recharge) !== JSON.stringify(item.recharge)
      })

      if (!needsSync) return
      const result = await syncResources(next.resourceSyncInputs)
      if (cancelled || result.ok) return
      setWarnings((current) => [...new Set([
        ...current,
        result.error || "Не удалось синхронизировать persistent-ресурсы персонажа.",
      ])])
    }).catch((reason) => {
      if (cancelled) return
      const runtimeError = reason instanceof CharacterRuntimeResolveError ? reason : null
      setError(runtimeError?.message || (reason instanceof Error ? reason.message : "Не удалось рассчитать персонажа."))
      setErrorCode(runtimeError?.code || "resolve_failed")
      setStatus("error")
    })

    return () => { cancelled = true }
  }, [
    character,
    resourceError,
    resourceLoading,
    resourceState,
    revision,
    rowByKey,
    suppressions.sourceIds,
    syncResources,
    templateBundles,
    templateError,
    templateLoading,
  ])

  return {
    snapshot,
    contract: snapshot?.contract || null,
    preparation: snapshot?.preparation || EMPTY_PREPARATION,
    status,
    loading: status === "loading",
    stale: status === "stale" || (status === "error" && Boolean(snapshot)),
    error,
    errorCode,
    warnings,
    refresh,
  }
}
