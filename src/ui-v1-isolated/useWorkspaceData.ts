import { useCallback, useEffect, useMemo, useState } from "react"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { supabase } from "../lib/supabase"

export type WorkspaceAbilityKey =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma"

export type WorkspaceSkillSummary = {
  id: string
  label: string
  bonus: number
  rank: number
}

export type WorkspaceAbilitySummary = {
  key: WorkspaceAbilityKey
  short: string
  label: string
  score: number
  modifier: number
  skills: WorkspaceSkillSummary[]
}

export type WorkspaceSheetPreview = {
  currentHp: number
  maxHp: number
  abilities: WorkspaceAbilitySummary[]
}

export type WorkspaceCharacter = {
  id: string
  assignedUserId: string | null
  name: string
  characterClass: string
  level: number
  avatarUrl: string | null
  characterType: "pc" | "npc"
  visibility: "campaign" | "private"
  sheet: WorkspaceSheetPreview | null
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

type CharacterSheetPreviewRow = {
  character_id: string
  current_hp: number
  max_hp: number
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
  proficiency_bonus: number
  skill_proficiencies: unknown
}

type WorkspaceData = {
  campaignId: string
  campaignTitle: string
  campaignCoverUrl: string | null
  canManage: boolean
  canEditActiveAvatar: boolean
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

const ABILITY_META: Array<{
  key: WorkspaceAbilityKey
  short: string
  label: string
}> = [
  { key: "strength", short: "СИЛ", label: "Сила" },
  { key: "dexterity", short: "ЛВК", label: "Ловкость" },
  { key: "constitution", short: "ТЕЛ", label: "Телосложение" },
  { key: "intelligence", short: "ИНТ", label: "Интеллект" },
  { key: "wisdom", short: "МДР", label: "Мудрость" },
  { key: "charisma", short: "ХАР", label: "Харизма" },
]

const SKILLS: Array<{
  id: string
  label: string
  ability: WorkspaceAbilityKey
}> = [
  { id: "athletics", label: "Атлетика", ability: "strength" },
  { id: "acrobatics", label: "Акробатика", ability: "dexterity" },
  { id: "sleight_of_hand", label: "Ловкость рук", ability: "dexterity" },
  { id: "stealth", label: "Скрытность", ability: "dexterity" },
  { id: "arcana", label: "Магия", ability: "intelligence" },
  { id: "history", label: "История", ability: "intelligence" },
  { id: "investigation", label: "Расследование", ability: "intelligence" },
  { id: "nature", label: "Природа", ability: "intelligence" },
  { id: "religion", label: "Религия", ability: "intelligence" },
  { id: "animal_handling", label: "Уход за животными", ability: "wisdom" },
  { id: "insight", label: "Проницательность", ability: "wisdom" },
  { id: "medicine", label: "Медицина", ability: "wisdom" },
  { id: "perception", label: "Внимательность", ability: "wisdom" },
  { id: "survival", label: "Выживание", ability: "wisdom" },
  { id: "deception", label: "Обман", ability: "charisma" },
  { id: "intimidation", label: "Запугивание", ability: "charisma" },
  { id: "performance", label: "Выступление", ability: "charisma" },
  { id: "persuasion", label: "Убеждение", ability: "charisma" },
]

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

function modifier(score: number) {
  return Math.floor((score - 10) / 2)
}

function skillRanks(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, rank]) => typeof rank === "number" && Number.isFinite(rank))
      .map(([key, rank]) => [key, Math.max(0, Math.min(2, Number(rank)))]),
  )
}

function abilityScore(
  row: CharacterSheetPreviewRow,
  key: WorkspaceAbilityKey,
) {
  return row[key]
}

function sheetPreview(
  row: CharacterSheetPreviewRow | undefined,
): WorkspaceSheetPreview | null {
  if (!row) return null

  const ranks = skillRanks(row.skill_proficiencies)
  const proficiencyBonus = Number.isFinite(row.proficiency_bonus)
    ? row.proficiency_bonus
    : 0

  return {
    currentHp: row.current_hp,
    maxHp: row.max_hp,
    abilities: ABILITY_META.map((ability) => {
      const score = abilityScore(row, ability.key)
      const abilityModifier = modifier(score)

      return {
        ...ability,
        score,
        modifier: abilityModifier,
        skills: SKILLS
          .filter((skill) => skill.ability === ability.key)
          .map((skill) => {
            const rank = ranks[skill.id] || 0
            return {
              id: skill.id,
              label: skill.label,
              rank,
              bonus: abilityModifier + rank * proficiencyBonus,
            }
          }),
      }
    }),
  }
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
      const characterIds = rawCharacters.map((character) => character.id)

      const sheetResult = characterIds.length
        ? await supabase
            .from("character_sheets")
            .select("character_id,current_hp,max_hp,strength,dexterity,constitution,intelligence,wisdom,charisma,proficiency_bonus,skill_proficiencies")
            .in("character_id", characterIds)
        : { data: [] as CharacterSheetPreviewRow[], error: null }

      if (cancelled) return
      if (sheetResult.error) {
        setError(sheetResult.error.message)
        setLoading(false)
        return
      }

      const sheetsByCharacter = new Map(
        ((sheetResult.data || []) as CharacterSheetPreviewRow[])
          .map((sheet) => [sheet.character_id, sheet] as const),
      )

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
          sheet: sheetPreview(sheetsByCharacter.get(character.id)),
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
    canEditActiveAvatar: Boolean(
      activeCharacter &&
      (canManage || activeCharacter.assignedUserId === userId),
    ),
    activeCharacter,
    otherCharacters,
    narratorSelected: canManage && activeCharacter === null,
    loading,
    error,
    selectSpeaker,
  }
}
