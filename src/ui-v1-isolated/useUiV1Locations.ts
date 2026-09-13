import { useCallback, useEffect, useState } from "react"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { oracle } from "../oracle-engine/runtime.ts"
import { supabase } from "../lib/supabase"
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

type MutationResult = { ok: boolean; error?: string }

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export function useUiV1Locations() {
  const scope = useUiV1CampaignScope()
  const [locations, setLocations] = useState<UiV1Location[]>([])
  const [sections, setSections] = useState<UiV1LocationSection[]>([])
  const [links, setLinks] = useState<UiV1LocationLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId) return

    setLoading(true)
    const [locationResult, sectionResult, linkResult] = await Promise.all([
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
    ])

    const firstError = locationResult.error || sectionResult.error || linkResult.error
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
    setError(null)
    setLoading(false)
  }, [scope.campaignId])

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

  return {
    ...scope,
    locations,
    sections,
    links,
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
  }
}
