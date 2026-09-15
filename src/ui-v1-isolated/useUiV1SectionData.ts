import { useCallback, useEffect, useState } from "react"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"

export type AchievementPreview = {
  id: string
  title: string
  icon: string
  character_id: string | null
  awarded_at: string
}

export type SocietyAnnouncement = {
  id: string
  title: string
  body: string
  published_at: string
  created_by: string | null
}

export type WorldLocationPreview = {
  id: string
  name: string
  summary: string
}

export type WorldCharacterPreview = {
  id: string
  name: string
  character_class: string
  character_type: "pc" | "npc"
}

export type WorldLorePreview = {
  id: string
  title: string
  summary: string
}

export type KnowledgeCatalogRow = {
  id: string
  title: string
  meta: string
}

type CampaignMembership = {
  campaign_id: string
  role: string
  is_owner: boolean
}

type CampaignScope = {
  campaignId: string
  userId: string
  canManage: boolean
  isOwner: boolean
  loading: boolean
  error: string | null
}

export function useUiV1CampaignScope(): CampaignScope {
  const [state, setState] = useState<CampaignScope>({
    campaignId: "",
    userId: "",
    canManage: false,
    isOwner: false,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return

      if (authError || !authData.user) {
        setState({
          campaignId: "",
          userId: "",
          canManage: false,
          loading: false,
          error: authError?.message || "Сессия не найдена",
        })
        return
      }

      const userId = authData.user.id
      let membership: CampaignMembership | null = null
      const remembered =
        window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
        window.localStorage.getItem("meganotrpg:campaign-id") ||
        ""

      if (remembered) {
        const { data } = await supabase
          .from("campaign_members")
          .select("campaign_id, role, is_owner")
          .eq("campaign_id", remembered)
          .eq("user_id", userId)
          .maybeSingle()

        membership = data as CampaignMembership | null
      }

      if (!membership) {
        const { data, error } = await supabase
          .from("campaign_members")
          .select("campaign_id, role, is_owner, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)

        if (cancelled) return
        if (error) {
          setState({ campaignId: "", userId, canManage: false, isOwner: false, loading: false, error: error.message })
          return
        }

        membership = (data?.[0] || null) as CampaignMembership | null
      }

      if (!membership) {
        setState({ campaignId: "", userId, canManage: false, isOwner: false, loading: false, error: "Кампания не найдена" })
        return
      }

      window.localStorage.setItem("meganotrpg:v1:campaign-id", membership.campaign_id)
      setState({
        campaignId: membership.campaign_id,
        userId,
        canManage: membership.role === "gm" || membership.is_owner === true,
        isOwner: membership.is_owner === true,
        loading: false,
        error: null,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function useUiV1Achievements() {
  const scope = useUiV1CampaignScope()
  const [items, setItems] = useState<AchievementPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId) return
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from("achievements")
      .select("id, title, icon, character_id, awarded_at")
      .eq("campaign_id", scope.campaignId)
      .order("awarded_at", { ascending: false })

    if (queryError) {
      setItems([])
      setError(queryError.message)
    } else {
      setItems((data || []) as AchievementPreview[])
      setError(null)
    }
    setLoading(false)
  }, [scope.campaignId])

  useEffect(() => {
    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }

    void load()

    const channel = supabase
      .channel(`ui-v1-achievements-${scope.campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_items", filter: `campaign_id=eq.${scope.campaignId}` },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, scope.campaignId, scope.loading])

  return { ...scope, items, loading: scope.loading || loading, error: scope.error || error }
}

export function useUiV1SocietyNews() {
  const scope = useUiV1CampaignScope()
  const [items, setItems] = useState<SocietyAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId) return
    setLoading(true)

    const { data, error: queryError } = await supabase
      .from("campaign_updates")
      .select("id, title, body, published_at, created_by")
      .eq("campaign_id", scope.campaignId)
      .eq("kind", "announcement")
      .order("published_at", { ascending: false })

    if (queryError) {
      setItems([])
      setError(queryError.message)
    } else {
      setItems((data || []) as SocietyAnnouncement[])
      setError(null)
    }
    setLoading(false)
  }, [scope.campaignId])

  useEffect(() => {
    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }

    void load()

    const channel = supabase
      .channel(`ui-v1-society-news-${scope.campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_items", filter: `campaign_id=eq.${scope.campaignId}` },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, scope.campaignId, scope.loading])

  const publish = useCallback(async (title: string, body: string) => {
    if (!scope.canManage || !scope.campaignId || !scope.userId) {
      return { ok: false, error: "Недостаточно прав." }
    }

    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    if (!cleanTitle || !cleanBody) {
      return { ok: false, error: "Нужны заголовок и текст." }
    }

    try {
      await oracle.world.publishCampaignAnnouncement(
        createEngineCommandContext({
          campaignId: scope.campaignId,
          requestedBy: scope.userId,
          authority: "gm",
        }),
        cleanTitle,
        cleanBody,
      )
    } catch (publishError) {
      return {
        ok: false,
        error: publishError instanceof Error ? publishError.message : "Не удалось опубликовать.",
      }
    }

    await load()
    return { ok: true as const }
  }, [load, scope.campaignId, scope.canManage, scope.userId])

  return {
    ...scope,
    items,
    loading: scope.loading || loading,
    error: scope.error || error,
    publish,
  }
}

export function useUiV1WorldData() {
  const scope = useUiV1CampaignScope()
  const [locations, setLocations] = useState<WorldLocationPreview[]>([])
  const [characters, setCharacters] = useState<WorldCharacterPreview[]>([])
  const [lore, setLore] = useState<WorldLorePreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }

    let cancelled = false
    void (async () => {
      setLoading(true)
      const [locationResult, characterResult, loreResult] = await Promise.all([
        supabase
          .from("locations")
          .select("id, name, summary")
          .eq("campaign_id", scope.campaignId)
          .eq("lifecycle_state", "active")
          .order("sort_order", { ascending: true }),
        supabase
          .from("characters")
          .select("id, name, character_class, character_type")
          .eq("campaign_id", scope.campaignId)
          .eq("character_type", "npc")
          .eq("publication_state", "campaign")
          .order("name", { ascending: true }),
        supabase
          .from("world_articles")
          .select("id, title, summary")
          .eq("campaign_id", scope.campaignId)
          .order("sort_order", { ascending: true }),
      ])

      if (cancelled) return
      const firstError = locationResult.error || characterResult.error || loreResult.error
      if (firstError) {
        setError(firstError.message)
      } else {
        setLocations((locationResult.data || []) as WorldLocationPreview[])
        setCharacters((characterResult.data || []) as WorldCharacterPreview[])
        setLore((loreResult.data || []) as WorldLorePreview[])
        setError(null)
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [scope.campaignId, scope.loading])

  return {
    ...scope,
    locations,
    characters,
    lore,
    loading: scope.loading || loading,
    error: scope.error || error,
  }
}

export function useUiV1KnowledgeCatalog(section: string | undefined) {
  const scope = useUiV1CampaignScope()
  const [rows, setRows] = useState<KnowledgeCatalogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!section || !scope.campaignId || !["spells", "bestiary"].includes(section)) {
      setRows([])
      setLoading(false)
      return
    }

    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)

      if (section === "spells") {
        const { data, error: queryError } = await supabase
          .from("spell_catalog")
          .select("id, name_ru, name_en, spell_level, school")
          .order("spell_level", { ascending: true })
          .order("name_ru", { ascending: true })

        if (cancelled) return
        if (queryError) setError(queryError.message)
        else {
          setRows((data || []).map((row) => ({
            id: row.id,
            title: row.name_ru || row.name_en || "Без названия",
            meta: `${row.spell_level === 0 ? "Заговор" : `${row.spell_level} уровень`}${row.school ? ` · ${row.school}` : ""}`,
          })))
        }
      } else {
        const { data, error: queryError } = await supabase
          .from("bestiary_catalog")
          .select("id, name_en, creature_type, challenge_rating")
          .eq("rules_year", 2014)
          .order("sort_order", { ascending: true })

        if (cancelled) return
        if (queryError) setError(queryError.message)
        else {
          setRows((data || []).map((row) => ({
            id: row.id,
            title: row.name_en || "Creature",
            meta: `CR ${row.challenge_rating ?? "—"}${row.creature_type ? ` · ${row.creature_type}` : ""}`,
          })))
        }
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [scope.campaignId, section])

  return { ...scope, rows, loading: scope.loading || loading, error: scope.error || error }
}
