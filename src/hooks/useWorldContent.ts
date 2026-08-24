import { useCallback, useEffect, useState } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import type {
  AchievementEntry,
  CampaignUpdate,
  LocationEntry,
  LocationLink,
  LocationSection,
  WorldArticle,
  WorldSection,
} from "../types/world"

type Result = { ok: boolean; error?: string }

function makeSlug(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)

  return `${base || "section"}-${Date.now().toString(36)}`
}

export function useWorldContent() {
  const { user } = useAuth()
  const { campaignId } = useCharacters()

  const [sections, setSections] = useState<WorldSection[]>([])
  const [articles, setArticles] = useState<WorldArticle[]>([])
  const [locations, setLocations] = useState<LocationEntry[]>([])
  const [locationSections, setLocationSections] = useState<LocationSection[]>([])
  const [locationLinks, setLocationLinks] = useState<LocationLink[]>([])
  const [achievements, setAchievements] = useState<AchievementEntry[]>([])
  const [updates, setUpdates] = useState<CampaignUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return

    setLoading(true)
    setError(null)

    const [
      sectionResult,
      articleResult,
      locationResult,
      locationSectionResult,
      locationLinkResult,
      achievementResult,
      updateResult,
    ] = await Promise.all([
      supabase.from("world_sections")
        .select("id, campaign_id, slug, title, description, sort_order")
        .eq("campaign_id", campaignId)
        .order("sort_order", { ascending: true }),
      supabase.from("world_articles")
        .select("id, campaign_id, section_id, title, summary, body, sort_order")
        .eq("campaign_id", campaignId)
        .order("sort_order", { ascending: true }),
      supabase.from("locations")
        .select("id, campaign_id, parent_location_id, name, summary, description, image_url, sort_order, created_at, updated_at")
        .eq("campaign_id", campaignId)
        .order("updated_at", { ascending: false }),
      supabase.from("location_sections")
        .select("id, location_id, title, body, sort_order")
        .order("sort_order", { ascending: true }),
      supabase.from("location_links")
        .select("id, section_id, target_location_id, label, sort_order")
        .order("sort_order", { ascending: true }),
      supabase.from("achievements")
        .select("id, campaign_id, character_id, title, description, icon, awarded_at")
        .eq("campaign_id", campaignId)
        .order("awarded_at", { ascending: false }),
      supabase.from("campaign_updates")
        .select("id, campaign_id, kind, title, body, published_at")
        .eq("campaign_id", campaignId)
        .order("published_at", { ascending: false })
        .limit(20),
    ])

    const firstError =
      sectionResult.error ||
      articleResult.error ||
      locationResult.error ||
      locationSectionResult.error ||
      locationLinkResult.error ||
      achievementResult.error ||
      updateResult.error

    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    setSections((sectionResult.data || []) as WorldSection[])
    setArticles((articleResult.data || []) as WorldArticle[])
    setLocations((locationResult.data || []) as LocationEntry[])
    setLocationSections((locationSectionResult.data || []) as LocationSection[])
    setLocationLinks((locationLinkResult.data || []) as LocationLink[])
    setAchievements((achievementResult.data || []) as AchievementEntry[])
    setUpdates((updateResult.data || []) as CampaignUpdate[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    void load()
  }, [load])

  const createWorldSection = useCallback(async (title: string, description: string): Promise<Result> => {
    const { error } = await supabase.from("world_sections").insert({
      campaign_id: campaignId,
      slug: makeSlug(title),
      title: title.trim(),
      description: description.trim(),
    })
    if (error) return { ok: false, error: error.message }
    await load()
    return { ok: true }
  }, [campaignId, load])

  const createWorldArticle = useCallback(async (
    sectionId: string,
    title: string,
    summary: string,
    body: string,
  ): Promise<Result> => {
    const { error } = await supabase.from("world_articles").insert({
      campaign_id: campaignId,
      section_id: sectionId,
      title: title.trim(),
      summary: summary.trim(),
      body: body.trim(),
    })
    if (error) return { ok: false, error: error.message }
    await load()
    return { ok: true }
  }, [campaignId, load])

  const createLocation = useCallback(async (input: {
    parent_location_id: string | null
    name: string
    summary: string
    description: string
    image_url: string | null
  }): Promise<Result> => {
    const { error } = await supabase.from("locations").insert({
      campaign_id: campaignId,
      parent_location_id: input.parent_location_id,
      name: input.name.trim(),
      summary: input.summary.trim(),
      description: input.description.trim(),
      image_url: input.image_url?.trim() || null,
    })
    if (error) return { ok: false, error: error.message }
    await load()
    return { ok: true }
  }, [campaignId, load])

  const createLocationSection = useCallback(async (
    locationId: string,
    title: string,
    body: string,
  ): Promise<Result> => {
    const { error } = await supabase.from("location_sections").insert({
      location_id: locationId,
      title: title.trim(),
      body: body.trim(),
    })
    if (error) return { ok: false, error: error.message }
    await load()
    return { ok: true }
  }, [load])

  const createLocationLink = useCallback(async (
    sectionId: string,
    targetLocationId: string,
    label: string,
  ): Promise<Result> => {
    const { error } = await supabase.from("location_links").insert({
      section_id: sectionId,
      target_location_id: targetLocationId,
      label: label.trim(),
    })
    if (error) return { ok: false, error: error.message }
    await load()
    return { ok: true }
  }, [load])

  const createAchievement = useCallback(async (input: {
    character_id: string | null
    title: string
    description: string
    icon: string
  }): Promise<Result> => {
    const { error } = await supabase.from("achievements").insert({
      campaign_id: campaignId,
      character_id: input.character_id,
      title: input.title.trim(),
      description: input.description.trim(),
      icon: input.icon.trim() || "★",
    })
    if (error) return { ok: false, error: error.message }
    await load()
    return { ok: true }
  }, [campaignId, load])

  const createUpdate = useCallback(async (input: {
    kind: "change" | "announcement"
    title: string
    body: string
  }): Promise<Result> => {
    const { error } = await supabase.from("campaign_updates").insert({
      campaign_id: campaignId,
      created_by: user.id,
      kind: input.kind,
      title: input.title.trim(),
      body: input.body.trim(),
    })
    if (error) return { ok: false, error: error.message }
    await load()
    return { ok: true }
  }, [campaignId, load, user.id])

  return {
    sections,
    articles,
    locations,
    locationSections,
    locationLinks,
    achievements,
    updates,
    loading,
    error,
    reload: load,
    createWorldSection,
    createWorldArticle,
    createLocation,
    createLocationSection,
    createLocationLink,
    createAchievement,
    createUpdate,
  }
}
