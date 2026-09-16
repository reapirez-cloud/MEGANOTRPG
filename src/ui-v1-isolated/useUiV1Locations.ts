import { useCallback, useEffect, useState } from "react"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { cheburashka, firstAvailableGridPlacement } from "../inventory-engine/index.ts"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { larisa } from "../location-engine/runtime.ts"
import type { WorldStorageAccess, WorldStorageKind, WorldStorageVisibility } from "../location-engine/index.ts"
import { oracle } from "../oracle-engine/runtime.ts"
import { supabase } from "../lib/supabase"
import type { InventoryItem } from "../types/characterSheet"
import type { VisibilityMode } from "../types/world"
import { useUiV1CampaignScope } from "./useUiV1SectionData"

export type UiV1Location = {
  id: string
  parent_location_id: string | null
  name: string
  summary: string
  description: string
  image_url: string | null
  display_image_url: string | null
  sort_order: number
  visibility_mode: VisibilityMode
}

export type UiV1LocationSection = {
  id: string
  location_id: string
  title: string
  body: string
  sort_order: number
}

export type UiV1LocationLink = {
  id: string
  section_id: string
  source_location_id: string
  target_location_id: string
  label: string
  sort_order: number
  visibility_mode: VisibilityMode
}

export type UiV1WorldStorage = {
  id: string
  campaign_id: string
  location_id: string
  root_item_id: string
  storage_kind: WorldStorageKind
  name: string
  description: string
  visibility_mode: WorldStorageVisibility
  access_mode: WorldStorageAccess
  owner_character_id: string | null
  lifecycle_state: "active" | "archived"
  version: number
  item_count: number
  can_operate: boolean
}

type MutationResult = { ok: boolean; error?: string }

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export function useUiV1Locations() {
  const scope = useUiV1CampaignScope()
  const [locations, setLocations] = useState<UiV1Location[]>([])
  const [sections, setSections] = useState<UiV1LocationSection[]>([])
  const [links, setLinks] = useState<UiV1LocationLink[]>([])
  const [storages, setStorages] = useState<UiV1WorldStorage[]>([])
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId) return

    setLoading(true)
    const [locationResult, sectionResult, linkResult, memberResult, storageResult] = await Promise.all([
      supabase
        .from("locations")
        .select("id, parent_location_id, name, summary, description, image_url, sort_order, visibility_mode")
        .eq("campaign_id", scope.campaignId)
        .eq("lifecycle_state", "active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("location_sections")
        .select("id, location_id, title, body, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("location_links")
        .select("id, section_id, target_location_id, label, sort_order, visibility_mode")
        .order("sort_order", { ascending: true }),
      supabase
        .from("campaign_members")
        .select("active_character_id")
        .eq("campaign_id", scope.campaignId)
        .eq("user_id", scope.userId)
        .maybeSingle(),
      supabase.rpc("list_world_storages_v1", {
        p_campaign_id: scope.campaignId,
        p_location_id: null,
      }),
    ])

    const firstError = locationResult.error || sectionResult.error || linkResult.error || memberResult.error || storageResult.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const resolvedLocations = await Promise.all(
      (locationResult.data || []).map(async (location) => ({
        ...location,
        display_image_url: await resolveCampaignMediaUrl(location.image_url),
      })),
    )

    const visibleSections = (sectionResult.data || []) as UiV1LocationSection[]
    const sectionById = new Map(visibleSections.map((section) => [section.id, section]))
    const visibleLinks = (linkResult.data || [])
      .map((link) => {
        const section = sectionById.get(link.section_id)
        if (!section) return null
        return {
          ...link,
          source_location_id: section.location_id,
        } as UiV1LocationLink
      })
      .filter((link): link is UiV1LocationLink => link !== null)

    setLocations(resolvedLocations as UiV1Location[])
    setSections(visibleSections)
    setLinks(visibleLinks)
    setActiveCharacterId(memberResult.data?.active_character_id || null)
    setStorages((storageResult.data || []).map((storage) => ({
      ...storage,
      version: Number(storage.version || 1),
      item_count: Number(storage.item_count || 0),
      can_operate: storage.can_operate === true,
    })) as UiV1WorldStorage[])
    setError(null)
    setLoading(false)
  }, [scope.campaignId, scope.userId])

  useEffect(() => {
    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }

    void load()
  }, [load, scope.campaignId, scope.loading])

  const gmContext = useCallback(() => createEngineCommandContext({
    campaignId: scope.campaignId,
    requestedBy: scope.userId,
    authority: "gm",
  }), [scope.campaignId, scope.userId])

  const playerContext = useCallback(() => {
    if (!activeCharacterId) {
      throw new Error("Нужен активный персонаж.")
    }
    return createEngineCommandContext({
      campaignId: scope.campaignId,
      requestedBy: scope.userId,
      authority: "player",
      actorCharacterId: activeCharacterId,
    })
  }, [activeCharacterId, scope.campaignId, scope.userId])

  const mutate = useCallback(async (
    action: () => Promise<unknown>,
    fallback: string,
  ): Promise<MutationResult> => {
    if (!scope.canManage) return { ok: false, error: "Только GM или владелец может менять мир." }
    try {
      await action()
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, fallback) }
    }
  }, [load, scope.canManage])

  const createLocation = useCallback((
    parentLocationId: string | null,
    input: {
      name: string
      summary: string
      description: string
      visibilityMode: VisibilityMode
    },
  ) => mutate(
    () => oracle.world.createLocation(gmContext(), {
      parentLocationId,
      name: input.name,
      summary: input.summary,
      description: input.description,
      imageUrl: null,
      visibilityMode: input.visibilityMode,
    }),
    "Не удалось создать локацию.",
  ), [gmContext, mutate])

  const updateLocation = useCallback((
    location: UiV1Location,
    input: {
      name: string
      summary: string
      description: string
      visibilityMode: VisibilityMode
    },
  ) => mutate(
    () => oracle.world.updateLocation(gmContext(), location.id, {
      name: input.name,
      summary: input.summary,
      description: input.description,
      imageUrl: location.image_url,
      visibilityMode: input.visibilityMode,
    }),
    "Не удалось сохранить локацию.",
  ), [gmContext, mutate])

  const archiveLocation = useCallback((locationId: string) => mutate(
    () => oracle.world.setLocationArchived(gmContext(), locationId, true),
    "Не удалось архивировать локацию.",
  ), [gmContext, mutate])

  const deleteLocation = useCallback((locationId: string) => mutate(
    () => oracle.world.deleteLocation(gmContext(), locationId),
    "Не удалось удалить локацию.",
  ), [gmContext, mutate])

  const createTransition = useCallback(async (
    sourceLocationId: string,
    targetLocationId: string,
    label: string,
    visibilityMode: VisibilityMode,
  ): Promise<MutationResult> => {
    if (!scope.canManage) return { ok: false, error: "Только GM или владелец может менять мир." }
    try {
      let section = sections.find((item) => item.location_id === sourceLocationId) || null
      let sectionId = section?.id || ""

      if (!sectionId) {
        const created = await oracle.world.createLocationSection(
          gmContext(),
          sourceLocationId,
          "Переходы",
          "",
        )
        sectionId = String(created.value.details.sectionId || "")
      }

      if (!sectionId) return { ok: false, error: "Не удалось создать секцию переходов." }

      await oracle.world.createLocationLink(
        gmContext(),
        sectionId,
        targetLocationId,
        label.trim(),
        visibilityMode,
      )
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось создать переход.") }
    }
  }, [gmContext, load, scope.canManage, sections])

  const loadStorageItems = useCallback(
    (worldStorageId: string) => cheburashka.listWorldStorageItems(worldStorageId),
    [],
  )

  const loadActiveInventory = useCallback(
    () => activeCharacterId ? cheburashka.listCharacterItems(activeCharacterId) : Promise.resolve([] as InventoryItem[]),
    [activeCharacterId],
  )

  const createStorage = useCallback(async (
    locationId: string,
    input: {
      name: string
      description?: string
      storageKind?: WorldStorageKind
      visibilityMode?: WorldStorageVisibility
      accessMode?: WorldStorageAccess
      ownerCharacterId?: string | null
    },
  ): Promise<MutationResult> => {
    try {
      const ownerCharacterId = scope.canManage
        ? input.ownerCharacterId ?? null
        : activeCharacterId
      const payload = {
        locationId,
        storageKind: input.storageKind || "stash" as WorldStorageKind,
        name: input.name.trim(),
        description: input.description?.trim() || "",
        visibilityMode: scope.canManage
          ? input.visibilityMode || "campaign" as WorldStorageVisibility
          : "owner" as WorldStorageVisibility,
        accessMode: scope.canManage
          ? input.accessMode || "shared" as WorldStorageAccess
          : "owner" as WorldStorageAccess,
        ownerCharacterId,
      }
      if (!payload.name) return { ok: false, error: "Нужно название хранилища." }
      if (scope.canManage) await oracle.world.createStorage(gmContext(), payload)
      else await larisa.execute({ kind: "world.storage_create", context: playerContext(), input: payload })
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось создать хранилище.") }
    }
  }, [activeCharacterId, gmContext, load, playerContext, scope.canManage])

  const updateStorage = useCallback(async (
    storage: UiV1WorldStorage,
    input: {
      name: string
      description: string
      visibilityMode: WorldStorageVisibility
      accessMode: WorldStorageAccess
      ownerCharacterId: string | null
    },
  ): Promise<MutationResult> => {
    try {
      if (scope.canManage) {
        await oracle.world.updateStorage(gmContext(), storage.id, input, storage.version)
      } else {
        await larisa.execute({
          kind: "world.storage_update",
          context: playerContext(),
          worldStorageId: storage.id,
          input,
          expectedVersion: storage.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось изменить хранилище.") }
    }
  }, [gmContext, load, playerContext, scope.canManage])

  const moveStorage = useCallback(async (
    storage: UiV1WorldStorage,
    locationId: string,
  ): Promise<MutationResult> => {
    if (!scope.canManage) return { ok: false, error: "Перемещать мировое хранилище может только GM." }
    try {
      await oracle.world.moveStorage(gmContext(), storage.id, locationId, storage.version)
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось переместить хранилище.") }
    }
  }, [gmContext, load, scope.canManage])

  const archiveStorage = useCallback(async (
    storage: UiV1WorldStorage,
  ): Promise<MutationResult> => {
    try {
      if (scope.canManage) {
        await oracle.world.setStorageArchived(gmContext(), storage.id, true, storage.version)
      } else {
        await larisa.execute({
          kind: "world.storage_set_archived",
          context: playerContext(),
          worldStorageId: storage.id,
          archived: true,
          expectedVersion: storage.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось убрать хранилище в архив.") }
    }
  }, [gmContext, load, playerContext, scope.canManage])

  const storeItem = useCallback(async (
    storage: UiV1WorldStorage,
    item: InventoryItem,
    amount = item.quantity,
  ): Promise<MutationResult> => {
    if (!activeCharacterId || item.character_id !== activeCharacterId) {
      return { ok: false, error: "Нужен предмет активного персонажа." }
    }
    try {
      const storageItems = await cheburashka.listWorldStorageItems(storage.id)
      const root = storageItems.find((candidate) => candidate.id === storage.root_item_id)
      if (!root) return { ok: false, error: "Корневой контейнер хранилища не найден." }

      const projectedItem: InventoryItem = {
        ...item,
        character_id: null,
        world_storage_id: storage.id,
        holder_item_id: root.id,
        placement_kind: "grid",
        equipped: false,
      }
      const placement = firstAvailableGridPlacement(
        [...storageItems, projectedItem],
        projectedItem,
        root,
      )
      if (!placement) return { ok: false, error: "В хранилище нет подходящего места." }

      if (scope.canManage) {
        await oracle.inventory.storeWorld(
          gmContext(), activeCharacterId, item.id, storage.id, amount, placement, item.version,
        )
      } else {
        await cheburashka.execute({
          kind: "inventory.store_world",
          context: playerContext(),
          characterId: activeCharacterId,
          itemId: item.id,
          worldStorageId: storage.id,
          amount,
          placement,
          expectedVersion: item.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось оставить предмет в хранилище.") }
    }
  }, [activeCharacterId, gmContext, load, playerContext, scope.canManage])

  const takeItem = useCallback(async (
    storage: UiV1WorldStorage,
    item: InventoryItem,
    amount = item.quantity,
  ): Promise<MutationResult> => {
    if (!activeCharacterId) return { ok: false, error: "Нужен активный персонаж." }
    try {
      const placement = { kind: "root" as const }
      if (scope.canManage) {
        await oracle.inventory.takeWorld(
          gmContext(), storage.id, item.id, activeCharacterId, amount, placement, item.version,
        )
      } else {
        await cheburashka.execute({
          kind: "inventory.take_world",
          context: playerContext(),
          worldStorageId: storage.id,
          itemId: item.id,
          characterId: activeCharacterId,
          amount,
          placement,
          expectedVersion: item.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось забрать предмет.") }
    }
  }, [activeCharacterId, gmContext, load, playerContext, scope.canManage])

  return {
    ...scope,
    locations,
    sections,
    links,
    storages,
    activeCharacterId,
    loading: scope.loading || loading,
    error: scope.error || error,
    refresh: load,
    createLocation,
    updateLocation,
    archiveLocation,
    deleteLocation,
    createTransition,
    updateTransition: (link: UiV1LocationLink, targetLocationId: string, label: string, visibilityMode: VisibilityMode) => mutate(
      () => oracle.world.updateLocationLink(
        gmContext(),
        link.id,
        targetLocationId,
        label.trim(),
        visibilityMode,
      ),
      "Не удалось изменить переход.",
    ),
    deleteTransition: (linkId: string) => mutate(
      () => oracle.world.deleteLocationLink(gmContext(), linkId),
      "Не удалось удалить переход.",
    ),
    loadStorageItems,
    loadActiveInventory,
    createStorage,
    updateStorage,
    moveStorage,
    archiveStorage,
    storeItem,
    takeItem,
  }
}
