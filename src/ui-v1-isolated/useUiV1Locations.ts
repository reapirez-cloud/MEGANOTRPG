import { useCallback, useEffect, useState } from "react"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
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

  return {
    ...scope,
    locations,
    sections,
    links,
    loading: scope.loading || loading,
    error: scope.error || error,
  }
}
