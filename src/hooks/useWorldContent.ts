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
  VisibilityMode,
  WorldArticle,
  WorldSection,
} from "../types/world"

type Result = { ok: boolean; error?: string }
type WorldTable = "world_sections" | "world_articles" | "locations" | "location_sections" | "location_links" | "achievements" | "campaign_updates"

function makeSlug(title: string) {
  const base = title.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40)
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
    setLoading(true); setError(null)
    const [sectionResult, articleResult, locationResult, achievementResult, updateResult] = await Promise.all([
      supabase.from("world_sections").select("id,campaign_id,slug,title,description,sort_order").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      supabase.from("world_articles").select("id,campaign_id,section_id,title,summary,body,sort_order").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      supabase.from("locations").select("id,campaign_id,parent_location_id,name,summary,description,image_url,sort_order,visibility_mode,lifecycle_state,created_by,archived_at,created_at,updated_at").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      supabase.from("achievements").select("id,campaign_id,character_id,title,description,icon,awarded_at").eq("campaign_id", campaignId).order("awarded_at", { ascending: false }),
      supabase.from("campaign_updates").select("id,campaign_id,kind,title,body,published_at").eq("campaign_id", campaignId).order("published_at", { ascending: false }).limit(20),
    ])
    const firstError = sectionResult.error || articleResult.error || locationResult.error || achievementResult.error || updateResult.error
    if (firstError) { setError(firstError.message); setLoading(false); return }

    const nextLocations = (locationResult.data || []) as LocationEntry[]
    const locationIds = nextLocations.map((location) => location.id)
    let nextLocationSections: LocationSection[] = []
    let nextLocationLinks: LocationLink[] = []
    if (locationIds.length) {
      const sectionRows = await supabase.from("location_sections").select("id,location_id,title,body,sort_order").in("location_id", locationIds).order("sort_order", { ascending: true })
      if (sectionRows.error) { setError(sectionRows.error.message); setLoading(false); return }
      nextLocationSections = (sectionRows.data || []) as LocationSection[]
      const sectionIds = nextLocationSections.map((section) => section.id)
      if (sectionIds.length) {
        const linkRows = await supabase.from("location_links").select("id,section_id,target_location_id,label,sort_order,visibility_mode,created_by").in("section_id", sectionIds).order("sort_order", { ascending: true })
        if (linkRows.error) { setError(linkRows.error.message); setLoading(false); return }
        nextLocationLinks = (linkRows.data || []) as LocationLink[]
      }
    }
    setSections((sectionResult.data || []) as WorldSection[])
    setArticles((articleResult.data || []) as WorldArticle[])
    setLocations(nextLocations)
    setLocationSections(nextLocationSections)
    setLocationLinks(nextLocationLinks)
    setAchievements((achievementResult.data || []) as AchievementEntry[])
    setUpdates((updateResult.data || []) as CampaignUpdate[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!campaignId) return
    let timer: number | null = null
    const refresh = () => { if (timer !== null) window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 120) }
    const channel = supabase.channel(`world-content:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "locations", filter: `campaign_id=eq.${campaignId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "location_sections" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "location_links" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_location_discoveries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_location_link_discoveries" }, refresh)
      .subscribe()
    return () => { if (timer !== null) window.clearTimeout(timer); void supabase.removeChannel(channel) }
  }, [campaignId, load])

  const createWorldSection = useCallback(async (title: string, description: string): Promise<Result> => {
    const { error } = await supabase.from("world_sections").insert({ campaign_id: campaignId, slug: makeSlug(title), title: title.trim(), description: description.trim() })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load])

  const updateWorldSection = useCallback(async (sectionId: string, title: string, description: string): Promise<Result> => {
    const { error } = await supabase.from("world_sections").update({ title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() }).eq("id", sectionId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createWorldArticle = useCallback(async (sectionId: string, title: string, summary: string, body: string): Promise<Result> => {
    const { error } = await supabase.from("world_articles").insert({ campaign_id: campaignId, section_id: sectionId, title: title.trim(), summary: summary.trim(), body: body.trim() })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load])

  const updateWorldArticle = useCallback(async (articleId: string, title: string, summary: string, body: string): Promise<Result> => {
    const { error } = await supabase.from("world_articles").update({ title: title.trim(), summary: summary.trim(), body: body.trim(), updated_at: new Date().toISOString() }).eq("id", articleId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createLocation = useCallback(async (input: { parent_location_id: string | null; name: string; summary: string; description: string; image_url: string | null; visibility_mode?: VisibilityMode }): Promise<Result> => {
    const { error } = await supabase.from("locations").insert({ campaign_id: campaignId, parent_location_id: input.parent_location_id, name: input.name.trim(), summary: input.summary.trim(), description: input.description.trim(), image_url: input.image_url?.trim() || null, visibility_mode: input.visibility_mode || "discover", created_by: user.id })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load, user.id])

  const updateLocation = useCallback(async (locationId: string, input: { name: string; summary: string; description: string; image_url: string | null; visibility_mode?: VisibilityMode }): Promise<Result> => {
    const payload: Record<string, unknown> = { name: input.name.trim(), summary: input.summary.trim(), description: input.description.trim(), image_url: input.image_url?.trim() || null, updated_at: new Date().toISOString() }
    if (input.visibility_mode) payload.visibility_mode = input.visibility_mode
    const { error } = await supabase.from("locations").update(payload).eq("id", locationId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const setLocationVisibility = useCallback(async (locationId: string, visibilityMode: VisibilityMode): Promise<Result> => {
    const { error } = await supabase.from("locations").update({ visibility_mode: visibilityMode, updated_at: new Date().toISOString() }).eq("id", locationId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const setLocationArchived = useCallback(async (locationId: string, archived: boolean): Promise<Result> => {
    const { error } = await supabase.from("locations").update({ lifecycle_state: archived ? "archived" : "active", archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", locationId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const publishLocationEvent = useCallback(async (locationId: string, event: "opened" | "updated" | "destroyed" = "updated"): Promise<Result> => {
    const { error } = await supabase.rpc("publish_location_chronicle_event", { p_location_id: locationId, p_event: event })
    return error ? { ok: false, error: error.message } : { ok: true }
  }, [])

  const createLocationSection = useCallback(async (locationId: string, title: string, body: string): Promise<Result> => {
    const { error } = await supabase.from("location_sections").insert({ location_id: locationId, title: title.trim(), body: body.trim() })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const updateLocationSection = useCallback(async (sectionId: string, title: string, body: string): Promise<Result> => {
    const { error } = await supabase.from("location_sections").update({ title: title.trim(), body: body.trim() }).eq("id", sectionId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createLocationLink = useCallback(async (sectionId: string, targetLocationId: string, label: string, visibilityMode: VisibilityMode = "discover"): Promise<Result> => {
    const { error } = await supabase.from("location_links").insert({ section_id: sectionId, target_location_id: targetLocationId, label: label.trim(), visibility_mode: visibilityMode, created_by: user.id })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load, user.id])

  const updateLocationLink = useCallback(async (linkId: string, targetLocationId: string, label: string, visibilityMode?: VisibilityMode): Promise<Result> => {
    const payload: Record<string, unknown> = { target_location_id: targetLocationId, label: label.trim() }
    if (visibilityMode) payload.visibility_mode = visibilityMode
    const { error } = await supabase.from("location_links").update(payload).eq("id", linkId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createAchievement = useCallback(async (input: { character_id: string | null; title: string; description: string; icon: string }): Promise<Result> => {
    const { error } = await supabase.from("achievements").insert({ campaign_id: campaignId, character_id: input.character_id, title: input.title.trim(), description: input.description.trim(), icon: input.icon.trim() || "★" })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load])

  const updateAchievement = useCallback(async (achievementId: string, input: { character_id: string | null; title: string; description: string; icon: string }): Promise<Result> => {
    const { error } = await supabase.from("achievements").update({ character_id: input.character_id, title: input.title.trim(), description: input.description.trim(), icon: input.icon.trim() || "★" }).eq("id", achievementId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createUpdate = useCallback(async (input: { kind: "change" | "announcement"; title: string; body: string }): Promise<Result> => {
    const { error } = await supabase.from("campaign_updates").insert({ campaign_id: campaignId, created_by: user.id, kind: input.kind, title: input.title.trim(), body: input.body.trim() })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load, user.id])

  const updateUpdate = useCallback(async (updateId: string, input: { kind: "change" | "announcement"; title: string; body: string }): Promise<Result> => {
    const { error } = await supabase.from("campaign_updates").update({ kind: input.kind, title: input.title.trim(), body: input.body.trim() }).eq("id", updateId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const deleteWorldItem = useCallback(async (table: WorldTable, id: string): Promise<Result> => {
    const { error: deleteError } = await supabase.from(table).delete().eq("id", id)
    if (deleteError) return { ok: false, error: deleteError.message }; await load(); return { ok: true }
  }, [load])

  return { sections, articles, locations, locationSections, locationLinks, achievements, updates, loading, error, reload: load, createWorldSection, updateWorldSection, createWorldArticle, updateWorldArticle, createLocation, updateLocation, setLocationVisibility, setLocationArchived, publishLocationEvent, createLocationSection, updateLocationSection, createLocationLink, updateLocationLink, createAchievement, updateAchievement, createUpdate, updateUpdate, deleteWorldItem }
}
