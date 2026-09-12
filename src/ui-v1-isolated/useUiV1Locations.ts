import { useCallback, useEffect, useState } from "react"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"
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

export type UiV1LocationDraft = {
  name: string
  summary: string
  visibilityMode: VisibilityMode
}

export type UiV1MutationResult = {
  ok: boolean
  error?: string
  id?: string
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

  const gmContext = useCallback(() => {
    if (!scope.campaignId || !scope.userId || !scope.canManage) {
      throw new Error("Недостаточно прав.")
    }

    return createEngineCommandContext({
      campaignId: scope.campaignId,
      requestedBy: scope.userId,
      authority: "gm",
    })
  }, [scope.campaignId, scope.canManage, scope.userId])

  const createLocation = useCallback(async (
    parentLocationId: string | null,
    draft: UiV1LocationDraft,
  ): Promise<UiV1MutationResult> => {
    try {
      const result = await oracle.world.createLocation(gmContext(), {
        parentLocationId,
        name: draft.name.trim(),
        summary: draft.summary.trim(),
        description: "",
        imageUrl: null,
        visibilityMode: draft.visibilityMode,
      })
      await load()
      const locationId = result.value.details.locationId
      return {
        ok: true,
        id: typeof locationId === "string" ? locationId : result.value.locationIds[0],
      }
    } catch (mutationError) {
      return {
        ok: false,
        error: mutationError instanceof Error ? mutationError.message : "Не удалось создать зону.",
      }
    }
  }, [gmContext, load])

  const updateLocation = useCallback(async (
    location: UiV1Location,
    draft: UiV1LocationDraft,
  ): Promise<UiV1MutationResult> => {
    try {
      await oracle.world.updateLocation(gmContext(), location.id, {
        name: draft.name.trim(),
        summary: draft.summary.trim(),
        description: location.description,
        imageUrl: location.image_url,
        visibilityMode: draft.visibilityMode,
      })
      await load()
      return { ok: true }
    } catch (mutationError) {
      return {
        ok: false,
        error: mutationError instanceof Error ? mutationError.message : "Не удалось обновить зону.",
      }
    }
  }, [gmContext, load])

  const deleteLocation = useCallback(async (locationId: string): Promise<UiV1MutationResult> => {
    try {
      await oracle.world.deleteLocation(gmContext(), locationId)
      await load()
      return { ok: true }
    } catch (mutationError) {
      return {
        ok: false,
        error: mutationError instanceof Error ? mutationError.message : "Не удалось удалить зону.",
      }
    }
  }, [gmContext, load])

  const createTransition = useCallback(async (
    sourceLocationId: string,
    targetLocationId: string,
    label: string,
    visibilityMode: VisibilityMode,
  ): Promise<UiV1MutationResult> => {
    try {
      if (links.some(
        (link) =>
          link.source_location_id === sourceLocationId &&
          link.target_location_id === targetLocationId,
      )) {
        return { ok: false, error: "Такой переход из этой зоны уже существует." }
      }

      let section = sections.find(
        (item) =>
          item.location_id === sourceLocationId &&
          item.title.trim().toLocaleLowerCase("ru") === "переходы",
      )

      if (!section) {
        const created = await oracle.world.createLocationSection(
          gmContext(),
          sourceLocationId,
          "Переходы",
          "",
        )
        const sectionId = created.value.details.sectionId
        if (typeof sectionId !== "string" || !sectionId) {
          return { ok: false, error: "Не удалось подготовить раздел переходов." }
        }
        section = {
          id: sectionId,
          location_id: sourceLocationId,
          title: "Переходы",
          body: "",
          sort_order: 0,
        }
      }

      const createdLink = await oracle.world.createLocationLink(
        gmContext(),
        section.id,
        targetLocationId,
        label.trim(),
        visibilityMode,
      )
      await load()
      const linkId = createdLink.value.details.linkId
      return {
        ok: true,
        id: typeof linkId === "string" ? linkId : undefined,
      }
    } catch (mutationError) {
      return {
        ok: false,
        error: mutationError instanceof Error ? mutationError.message : "Не удалось создать переход.",
      }
    }
  }, [gmContext, links, load, sections])

  return {
    ...scope,
    locations,
    sections,
    links,
    loading: scope.loading || loading,
    error: scope.error || error,
    createLocation,
    updateLocation,
    deleteLocation,
    createTransition,
  }
}
