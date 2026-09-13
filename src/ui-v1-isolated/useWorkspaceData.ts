import { useCallback, useEffect, useMemo, useState } from "react"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { supabase } from "../lib/supabase"

export type WorkspaceCharacter = {
  id: string
  assignedUserId: string | null
  name: string
  characterClass: string
  level: number
  avatarUrl: string | null
  characterType: "pc" | "npc"
  visibility: "campaign" | "private"
}

type MembershipRow = {
  campaign_id: string
  role: string
  is_owner: boolean
  active_character_id: string | null
  created_at: string
}

type CharacterRow = {
  id: string
  assigned_user_id: string | null
  name: string
  character_class: string
  level: number
  avatar_url: string | null
  character_type: "pc" | "npc"
  visibility: "campaign" | "private"
}

type WorkspaceData = {
  campaignId: string
  campaignTitle: string
  campaignCoverUrl: string | null
  canManage: boolean
  activeCharacter: WorkspaceCharacter | null
  otherCharacters: WorkspaceCharacter[]
  narratorSelected: boolean
  loading: boolean
  error: string | null
  selectSpeaker: (characterId: string | null) => void
}

const CAMPAIGN_STORAGE_KEYS = [
  "meganotrpg:v1:campaign-id",
  "meganotrpg:campaign-id",
] as const

function rememberedCampaignId() {
  for (const key of CAMPAIGN_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key)
    if (value) return value
  }
  return ""
}

function speakerStorageKey(campaignId: string, userId: string) {
  return `meganotrpg:v1:speaking-identity:${campaignId}:${userId}`
}

export function useWorkspaceData(): WorkspaceData {
  const [campaignId, setCampaignId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("Мунтар")
  const [campaignCoverUrl, setCampaignCoverUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState("")
  const [membership, setMembership] = useState<MembershipRow | null>(null)
  const [characters, setCharacters] = useState<WorkspaceCharacter[]>([])
  const [speakerCharacterId, setSpeakerCharacterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return

      if (authError || !authData.user) {
        setError(authError?.message || "Сессия не найдена")
        setLoading(false)
        return
      }

      const nextUserId = authData.user.id
      const { data: memberships, error: membershipError } = await supabase
        .from("campaign_members")
        .select("campaign_id, role, is_owner, active_character_id, created_at")
        .eq("user_id", nextUserId)
        .order("created_at", { ascending: true })

      if (cancelled) return
      if (membershipError) {
        setError(membershipError.message)
        setLoading(false)
        return
      }

      const rows = (memberships || []) as MembershipRow[]
      const remembered = rememberedCampaignId()
      const nextMembership =
        rows.find((item) => item.campaign_id === remembered) ||
        rows[0] ||
        null

      if (!nextMembership) {
        setError("Кампания не найдена")
        setLoading(false)
        return
      }

      const nextCampaignId = nextMembership.campaign_id
      window.localStorage.setItem("meganotrpg:v1:campaign-id", nextCampaignId)

      const [campaignResult, characterResult] = await Promise.all([
        supabase
          .from("campaigns")
          .select("title, cover_url")
          .eq("id", nextCampaignId)
          .maybeSingle(),
        supabase
          .from("characters")
          .select("id, assigned_user_id, name, character_class, level, avatar_url, character_type, visibility")
          .eq("campaign_id", nextCampaignId)
          .order("created_at", { ascending: true }),
      ])

      if (cancelled) return

      const firstError = campaignResult.error || characterResult.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const rawCharacters = (characterResult.data || []) as CharacterRow[]
      const resolvedCharacters = await Promise.all(
        rawCharacters.map(async (character) => ({
          id: character.id,
          assignedUserId: character.assigned_user_id,
          name: character.name,
          characterClass: character.character_class,
          level: character.level,
          avatarUrl:
            (await resolveCampaignMediaUrl(character.avatar_url)) ||
            character.avatar_url,
          characterType: character.character_type,
          visibility: character.visibility,
        })),
      )

      if (cancelled) return

      const nextCanManage =
        nextMembership.role === "gm" || nextMembership.is_owner === true

      let nextSpeakerCharacterId: string | null = null
      if (nextCanManage) {
        const stored = window.localStorage.getItem(
          speakerStorageKey(nextCampaignId, nextUserId),
        )
        if (stored?.startsWith("character:")) {
          const candidate = stored.slice("character:".length)
          if (resolvedCharacters.some((character) => character.id === candidate)) {
            nextSpeakerCharacterId = candidate
          }
        }
      }

      setUserId(nextUserId)
      setCampaignId(nextCampaignId)
      setCampaignTitle(campaignResult.data?.title || "Мунтар")
      setCampaignCoverUrl(
        (await resolveCampaignMediaUrl(campaignResult.data?.cover_url || null)) ||
          campaignResult.data?.cover_url ||
          null,
      )
      setMembership(nextMembership)
      setCharacters(resolvedCharacters)
      setSpeakerCharacterId(nextSpeakerCharacterId)
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const canManage =
    membership?.role === "gm" || membership?.is_owner === true

  const ownCharacters = useMemo(
    () =>
      characters.filter(
        (character) =>
          character.characterType === "pc" &&
          character.assignedUserId === userId,
      ),
    [characters, userId],
  )

  const activeCharacter = useMemo(() => {
    if (canManage) {
      if (!speakerCharacterId) return null
      return characters.find((character) => character.id === speakerCharacterId) || null
    }

    if (!membership?.active_character_id) return null
    return ownCharacters.find(
      (character) => character.id === membership.active_character_id,
    ) || null
  }, [
    canManage,
    characters,
    membership?.active_character_id,
    ownCharacters,
    speakerCharacterId,
  ])

  const otherCharacters = useMemo(() => {
    const source = canManage ? characters : ownCharacters
    return source.filter((character) => character.id !== activeCharacter?.id)
  }, [activeCharacter?.id, canManage, characters, ownCharacters])

  const selectSpeaker = useCallback(
    (characterId: string | null) => {
      if (!canManage || !campaignId || !userId) return
      if (characterId && !characters.some((character) => character.id === characterId)) return

      setSpeakerCharacterId(characterId)
      window.localStorage.setItem(
        speakerStorageKey(campaignId, userId),
        characterId ? `character:${characterId}` : "narrator",
      )
    },
    [campaignId, canManage, characters, userId],
  )

  return {
    campaignId,
    campaignTitle,
    campaignCoverUrl,
    canManage,
    activeCharacter,
    otherCharacters,
    narratorSelected: canManage && activeCharacter === null,
    loading,
    error,
    selectSpeaker,
  }
}
