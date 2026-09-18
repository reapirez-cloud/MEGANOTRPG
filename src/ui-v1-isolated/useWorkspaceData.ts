import { useCallback, useEffect, useMemo, useState } from "react"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { shapoklyak } from "../entity-engine/runtime.ts"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { uploadCampaignImage } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import { parseMediaPresentation, type MediaPresentation } from "../media/presentation"
import { oracle } from "../oracle-engine/runtime.ts"
import type { SnakeActionInput } from "../snake-engine"
import {
  activeOtherPlayerCharacterIds,
  canSelectWorkspaceSpeaker,
  sortOwnedWorkspaceCharacters,
  type WorkspaceIdentityMembership,
} from "./workspaceIdentityRules"

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
  avatarSource: string | null
  avatarAssetId: string | null
  avatarPresentation: MediaPresentation | null
  panelAvatarUrl: string | null
  panelAvatarSource: string | null
  panelAvatarAssetId: string | null
  panelAvatarPresentation: MediaPresentation | null
  sheetHeroUrl: string | null
  sheetHeroSource: string | null
  sheetHeroAssetId: string | null
  sheetHeroPresentation: MediaPresentation | null
  characterType: "pc" | "npc"
  visibility: "campaign" | "private"
  lifeState: "alive" | "dead"
  diedAt: string | null
  sheet: WorkspaceSheetPreview | null
}

type MembershipRow = {
  campaign_id: string
  user_id: string
  role: string
  is_owner: boolean
  active_character_id: string | null
  created_at: string
}

type CampaignMembershipRow = {
  user_id: string
  active_character_id: string | null
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
  publication_state: "draft" | "campaign"
  life_state: "alive" | "dead" | null
  died_at: string | null
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

type CharacterMediaBindingRow = {
  character_id: string
  target_field: "avatar" | "avatar_url" | "panel_avatar" | "sheet_hero"
  asset_id: string
  storage_path: string
  presentation: unknown
}

export type CharacterMediaSlot = "avatar" | "panel_avatar" | "sheet_hero"

type MutationResult = { ok: boolean; error?: string }

type WorkspaceData = {
  campaignId: string
  campaignTitle: string
  campaignCoverUrl: string | null
  canManage: boolean
  canEditActiveAvatar: boolean
  activeCharacter: WorkspaceCharacter | null
  characters: WorkspaceCharacter[]
  playerCharacters: WorkspaceCharacter[]
  ownCharacters: WorkspaceCharacter[]
  worldSpeakerCharacters: WorkspaceCharacter[]
  narratorSelected: boolean
  loading: boolean
  error: string | null
  selectSpeaker: (characterId: string | null) => void
  applyCharacterMedia: (
    characterId: string,
    slot: CharacterMediaSlot,
    input: SnakeActionInput,
  ) => Promise<MutationResult>
  resetCharacterMedia: (
    characterId: string,
    slot: CharacterMediaSlot,
  ) => Promise<MutationResult>
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

type WorkspaceDataOptions = {
  enabled?: boolean
  characterId?: string | null
  minimal?: boolean
}

export function useWorkspaceData(
  options: WorkspaceDataOptions = {},
): WorkspaceData {
  const enabled = options.enabled ?? true
  const scopedCharacterId = options.characterId?.trim() || null
  const minimal = options.minimal ?? false
  const [campaignId, setCampaignId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("Мунтар")
  const [campaignCoverUrl, setCampaignCoverUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState("")
  const [membership, setMembership] = useState<MembershipRow | null>(null)
  const [campaignMemberships, setCampaignMemberships] = useState<CampaignMembershipRow[]>([])
  const [characters, setCharacters] = useState<WorkspaceCharacter[]>([])
  const [speakerCharacterId, setSpeakerCharacterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

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
        .select("campaign_id, user_id, role, is_owner, active_character_id, created_at")
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

      const emptyRows = { data: [], error: null } as const
      const emptySingle = { data: null, error: null } as const
      const [campaignResult, characterResult, campaignMembersResult, mediaResult] = await Promise.all([
        minimal
          ? Promise.resolve(emptySingle)
          : supabase
              .from("campaigns")
              .select("title, cover_url")
              .eq("id", nextCampaignId)
              .maybeSingle(),
        scopedCharacterId
          ? supabase
              .from("characters")
              .select("id, assigned_user_id, name, character_class, level, avatar_url, character_type, visibility, publication_state, life_state, died_at")
              .eq("campaign_id", nextCampaignId)
              .eq("id", scopedCharacterId)
              .limit(1)
          : supabase
              .from("characters")
              .select("id, assigned_user_id, name, character_class, level, avatar_url, character_type, visibility, publication_state, life_state, died_at")
              .eq("campaign_id", nextCampaignId)
              .eq("publication_state", "campaign")
              .order("created_at", { ascending: true }),
        minimal
          ? Promise.resolve(emptyRows)
          : supabase
              .from("campaign_members")
              .select("user_id, active_character_id")
              .eq("campaign_id", nextCampaignId),
        supabase.rpc("list_character_media_presentations_v1", {
          p_campaign_id: nextCampaignId,
        }),
      ])

      if (cancelled) return

      const firstError =
        campaignResult.error ||
        characterResult.error ||
        campaignMembersResult.error ||
        mediaResult.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const rawCharacters = (characterResult.data || []) as CharacterRow[]
      const characterIds = rawCharacters.map((character) => character.id)

      const sheetResult =
        !minimal && characterIds.length
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
      const mediaRows = (mediaResult.data || []) as CharacterMediaBindingRow[]
      const mediaByKey = new Map(
        mediaRows.map((row) => [
          row.character_id + ":" + row.target_field,
          row,
        ] as const),
      )

      const resolvedCharacters = await Promise.all(
        rawCharacters.map(async (character) => {
          const avatarBinding =
            mediaByKey.get(character.id + ":avatar") ||
            mediaByKey.get(character.id + ":avatar_url") ||
            null
          const panelBinding =
            mediaByKey.get(character.id + ":panel_avatar") || null
          const sheetHeroBinding =
            mediaByKey.get(character.id + ":sheet_hero") || null
          const avatarSource =
            avatarBinding?.storage_path || character.avatar_url || null
          const panelAvatarSource =
            panelBinding?.storage_path || avatarSource
          const sheetHeroSource =
            sheetHeroBinding?.storage_path || panelAvatarSource || avatarSource
          const [avatarUrl, panelAvatarUrl, sheetHeroUrl] = await Promise.all([
            resolveCampaignMediaUrl(avatarSource),
            resolveCampaignMediaUrl(panelAvatarSource),
            resolveCampaignMediaUrl(sheetHeroSource),
          ])

          return {
            id: character.id,
            assignedUserId: character.assigned_user_id,
            name: character.name,
            characterClass: character.character_class,
            level: character.level,
            avatarUrl: avatarUrl || avatarSource,
            avatarSource,
            avatarAssetId: avatarBinding?.asset_id || null,
            avatarPresentation: parseMediaPresentation(
              avatarBinding?.presentation,
            ),
            panelAvatarUrl: panelAvatarUrl || panelAvatarSource,
            panelAvatarSource,
            panelAvatarAssetId: panelBinding?.asset_id || null,
            panelAvatarPresentation: parseMediaPresentation(
              panelBinding?.presentation,
            ),
            sheetHeroUrl: sheetHeroUrl || sheetHeroSource,
            sheetHeroSource,
            sheetHeroAssetId: sheetHeroBinding?.asset_id || null,
            sheetHeroPresentation: parseMediaPresentation(
              sheetHeroBinding?.presentation,
            ),
            characterType: character.character_type,
            visibility: character.visibility,
            lifeState:
              character.life_state === "dead" ? "dead" as const : "alive" as const,
            diedAt: character.died_at,
            sheet: sheetPreview(sheetsByCharacter.get(character.id)),
          }
        }),
      )

      if (cancelled) return

      const nextCanManage =
        nextMembership.role === "gm" || nextMembership.is_owner === true
      const nextSpeakerCandidates = resolvedCharacters.filter(
        (character) => canSelectWorkspaceSpeaker(character, nextUserId),
      )

      let nextSpeakerCharacterId: string | null = null
      if (nextCanManage) {
        const key = speakerStorageKey(nextCampaignId, nextUserId)
        const stored = window.localStorage.getItem(key)

        if (stored?.startsWith("character:")) {
          const candidate = stored.slice("character:".length)
          if (nextSpeakerCandidates.some((character) => character.id === candidate)) {
            nextSpeakerCharacterId = candidate
          } else {
            window.localStorage.setItem(key, "narrator")
          }
        }
      }

      setUserId(nextUserId)
      setCampaignId(nextCampaignId)
      setCampaignTitle(campaignResult.data?.title || "Мунтар")
      setCampaignCoverUrl(
        minimal
          ? null
          : (await resolveCampaignMediaUrl(campaignResult.data?.cover_url || null)) ||
              campaignResult.data?.cover_url ||
              null,
      )
      setMembership(nextMembership)
      setCampaignMemberships(
        minimal
          ? []
          : (campaignMembersResult.data || []) as CampaignMembershipRow[],
      )
      setCharacters(resolvedCharacters)
      setSpeakerCharacterId(nextSpeakerCharacterId)
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [enabled, minimal, scopedCharacterId])

  const canManage =
    membership?.role === "gm" || membership?.is_owner === true

  const ownCharacters = useMemo(
    () =>
      sortOwnedWorkspaceCharacters(
        characters.filter(
          (character) =>
            character.characterType === "pc" &&
            character.assignedUserId === userId,
        ),
      ),
    [characters, userId],
  )

  const speakerCharacters = useMemo(
    () =>
      characters.filter(
        (character) => canSelectWorkspaceSpeaker(character, userId),
      ),
    [characters, userId],
  )

  const worldSpeakerCharacters = useMemo(
    () =>
      speakerCharacters.filter(
        (character) => character.characterType === "npc",
      ),
    [speakerCharacters],
  )

  const playerCharacters = useMemo(() => {
    const memberships: WorkspaceIdentityMembership[] = campaignMemberships.map(
      (item) => ({
        userId: item.user_id,
        activeCharacterId: item.active_character_id,
      }),
    )
    const ids = new Set(
      activeOtherPlayerCharacterIds(characters, memberships, userId),
    )
    return characters.filter((character) => ids.has(character.id))
  }, [campaignMemberships, characters, userId])

  const activeCharacter = useMemo(() => {
    if (canManage) {
      if (!speakerCharacterId) return null
      return speakerCharacters.find(
        (character) => character.id === speakerCharacterId,
      ) || null
    }

    if (!membership?.active_character_id) return null
    return ownCharacters.find(
      (character) => character.id === membership.active_character_id,
    ) || null
  }, [
    canManage,
    membership?.active_character_id,
    ownCharacters,
    speakerCharacterId,
    speakerCharacters,
  ])

  const selectSpeaker = useCallback(
    (characterId: string | null) => {
      if (!canManage || !campaignId || !userId) return
      if (
        characterId &&
        !speakerCharacters.some((character) => character.id === characterId)
      ) return

      setSpeakerCharacterId(characterId)
      window.localStorage.setItem(
        speakerStorageKey(campaignId, userId),
        characterId ? `character:${characterId}` : "narrator",
      )
    },
    [campaignId, canManage, speakerCharacters, userId],
  )

  const applyCharacterMedia = useCallback(async (
    characterId: string,
    slot: CharacterMediaSlot,
    input: SnakeActionInput,
  ): Promise<MutationResult> => {
    if (!campaignId || !userId) {
      return { ok: false, error: "Кампания ещё не загружена." }
    }

    const character = characters.find((item) => item.id === characterId)
    if (!character) return { ok: false, error: "Персонаж не найден." }

    const presentation = parseMediaPresentation(input?.presentation)
    if (!presentation) {
      return { ok: false, error: "Кадр изображения не определён." }
    }

    const facts =
      input?.itemFacts &&
      typeof input.itemFacts === "object" &&
      !Array.isArray(input.itemFacts)
        ? input.itemFacts as Record<string, unknown>
        : {}

    let assetId =
      typeof facts.assetId === "string" ? facts.assetId : ""
    let storagePath =
      typeof facts.storagePath === "string" ? facts.storagePath : ""
    const file =
      typeof File !== "undefined" && input?.file instanceof File
        ? input.file
        : null

    const setCanonicalAvatar = async (avatarUrl: string | null) => {
      const context = createEngineCommandContext({
        campaignId,
        requestedBy: userId,
        authority: canManage ? "gm" : "player",
        actorCharacterId: characterId,
      })

      if (canManage) {
        await oracle.characters.setAvatar(context, characterId, avatarUrl)
        return
      }

      await shapoklyak.execute({
        kind: "entity.set_avatar",
        context,
        characterId,
        avatarUrl,
      })
    }

    try {
      if (file) {
        const upload = await uploadCampaignImage(
          file,
          slot === "avatar"
            ? "avatars"
            : slot === "panel_avatar"
              ? "panel-avatars"
              : "sheet-heroes",
          campaignId,
        )
        if (!upload.ok) return { ok: false, error: upload.error }

        storagePath = upload.url
        const { data: registered, error: registerError } = await supabase.rpc(
          "register_manual_media_v1",
          {
            p_campaign_id: campaignId,
            p_storage_path: storagePath,
            p_mime_type: upload.mimeType,
            p_width: upload.width,
            p_height: upload.height,
            p_purpose: slot === "avatar" ? "portrait" : slot === "panel_avatar" ? "panel" : "hero_art",
            p_profile: slot === "avatar" ? "portrait" : slot === "panel_avatar" ? "panel" : "hero_art",
          },
        )
        if (registerError || !registered) {
          return {
            ok: false,
            error:
              registerError?.message ||
              "Не удалось зарегистрировать изображение.",
          }
        }
        assetId = String(registered)
      } else if (!assetId && storagePath) {
        const existing = await supabase
          .from("media_assets")
          .select("id")
          .eq("storage_path", storagePath)
          .maybeSingle()

        if (!existing.error && existing.data?.id) {
          assetId = String(existing.data.id)
        } else {
          const sourceWidth = Math.max(1, Number(input?.sourceWidth || 1))
          const sourceHeight = Math.max(1, Number(input?.sourceHeight || 1))
          const { data: registered, error: registerError } = await supabase.rpc(
            "register_manual_media_v1",
            {
              p_campaign_id: campaignId,
              p_storage_path: storagePath,
              p_mime_type: "image/webp",
              p_width: sourceWidth,
              p_height: sourceHeight,
              p_purpose: slot === "avatar" ? "portrait" : slot === "panel_avatar" ? "panel" : "hero_art",
              p_profile: slot === "avatar" ? "portrait" : slot === "panel_avatar" ? "panel" : "hero_art",
            },
          )
          if (!registerError && registered) assetId = String(registered)
        }
      }

      if (!assetId || !storagePath) {
        return {
          ok: false,
          error:
            "Старый арт не зарегистрирован в медиасистеме. Выбери файл заново, и плеер сохранит оригинал правильно.",
        }
      }

      if (slot === "avatar") {
        await setCanonicalAvatar(storagePath)
      }

      const { error: bindError } = await supabase.rpc(
        "bind_media_presentation_v1",
        {
          p_asset_id: assetId,
          p_target_type: "character",
          p_target_id: characterId,
          p_target_field: slot,
          p_presentation: presentation,
        },
      )

      if (bindError) {
        if (slot === "avatar") {
          try {
            await setCanonicalAvatar(character.avatarSource)
          } catch {
            // Keep the binding error as the actionable failure.
          }
        }
        return { ok: false, error: bindError.message }
      }

      const resolvedUrl =
        (await resolveCampaignMediaUrl(storagePath)) || storagePath

      setCharacters((current) =>
        current.map((item) => {
          if (item.id !== characterId) return item

          if (slot === "sheet_hero") {
            return {
              ...item,
              sheetHeroUrl: resolvedUrl,
              sheetHeroSource: storagePath,
              sheetHeroAssetId: assetId,
              sheetHeroPresentation: presentation,
            }
          }

          if (slot === "panel_avatar") {
            const hasDedicatedSheetHero = Boolean(item.sheetHeroAssetId)
            return {
              ...item,
              panelAvatarUrl: resolvedUrl,
              panelAvatarSource: storagePath,
              panelAvatarAssetId: assetId,
              panelAvatarPresentation: presentation,
              ...(hasDedicatedSheetHero
                ? {}
                : {
                    sheetHeroUrl: resolvedUrl,
                    sheetHeroSource: storagePath,
                    sheetHeroPresentation: null,
                  }),
            }
          }

          const hasDedicatedPanel = Boolean(item.panelAvatarAssetId)
          const hasDedicatedSheetHero = Boolean(item.sheetHeroAssetId)
          return {
            ...item,
            avatarUrl: resolvedUrl,
            avatarSource: storagePath,
            avatarAssetId: assetId,
            avatarPresentation: presentation,
            ...(hasDedicatedPanel
              ? {}
              : {
                  panelAvatarUrl: resolvedUrl,
                  panelAvatarSource: storagePath,
                  panelAvatarPresentation: null,
                }),
            ...(!hasDedicatedPanel && !hasDedicatedSheetHero
              ? {
                  sheetHeroUrl: resolvedUrl,
                  sheetHeroSource: storagePath,
                  sheetHeroPresentation: null,
                }
              : {}),
          }
        }),
      )

      return { ok: true }
    } catch (reason) {
      return {
        ok: false,
        error:
          reason instanceof Error
            ? reason.message
            : "Не удалось применить изображение.",
      }
    }
  }, [campaignId, canManage, characters, userId])

  const resetCharacterMedia = useCallback(async (
    characterId: string,
    slot: CharacterMediaSlot,
  ): Promise<MutationResult> => {
    if (!campaignId || !userId) {
      return { ok: false, error: "Кампания ещё не загружена." }
    }

    const character = characters.find((item) => item.id === characterId)
    if (!character) return { ok: false, error: "Персонаж не найден." }

    if (!canManage && character.assignedUserId !== userId) {
      return { ok: false, error: "Недостаточно прав." }
    }

    const setCanonicalAvatar = async (avatarUrl: string | null) => {
      const context = createEngineCommandContext({
        campaignId,
        requestedBy: userId,
        authority: canManage ? "gm" : "player",
        actorCharacterId: characterId,
      })

      if (canManage) {
        await oracle.characters.setAvatar(context, characterId, avatarUrl)
        return
      }

      await shapoklyak.execute({
        kind: "entity.set_avatar",
        context,
        characterId,
        avatarUrl,
      })
    }

    try {
      if (slot === "avatar") {
        await setCanonicalAvatar(null)
      }

      const { error: resetError } = await supabase.rpc(
        "unbind_media_presentation_v1",
        {
          p_campaign_id: campaignId,
          p_target_type: "character",
          p_target_id: characterId,
          p_target_field: slot,
        },
      )

      if (resetError) {
        if (slot === "avatar") {
          try {
            await setCanonicalAvatar(character.avatarSource)
          } catch {
            // Keep resetError as the actionable failure.
          }
        }
        return { ok: false, error: resetError.message }
      }

      setCharacters((current) =>
        current.map((item) => {
          if (item.id !== characterId) return item

          if (slot === "sheet_hero") {
            return {
              ...item,
              sheetHeroUrl: item.panelAvatarUrl || item.avatarUrl,
              sheetHeroSource: item.panelAvatarSource || item.avatarSource,
              sheetHeroAssetId: null,
              sheetHeroPresentation: null,
            }
          }

          if (slot === "panel_avatar") {
            const hasDedicatedSheetHero = Boolean(item.sheetHeroAssetId)
            return {
              ...item,
              panelAvatarUrl: item.avatarUrl,
              panelAvatarSource: item.avatarSource,
              panelAvatarAssetId: null,
              panelAvatarPresentation: null,
              ...(hasDedicatedSheetHero
                ? {}
                : {
                    sheetHeroUrl: item.avatarUrl,
                    sheetHeroSource: item.avatarSource,
                    sheetHeroPresentation: null,
                  }),
            }
          }

          const hasDedicatedPanel = Boolean(item.panelAvatarAssetId)
          const hasDedicatedSheetHero = Boolean(item.sheetHeroAssetId)
          return {
            ...item,
            avatarUrl: null,
            avatarSource: null,
            avatarAssetId: null,
            avatarPresentation: null,
            ...(hasDedicatedPanel
              ? {}
              : {
                  panelAvatarUrl: null,
                  panelAvatarSource: null,
                  panelAvatarPresentation: null,
                }),
            ...(!hasDedicatedPanel && !hasDedicatedSheetHero
              ? {
                  sheetHeroUrl: null,
                  sheetHeroSource: null,
                  sheetHeroPresentation: null,
                }
              : {}),
          }
        }),
      )

      return { ok: true }
    } catch (reason) {
      return {
        ok: false,
        error:
          reason instanceof Error
            ? reason.message
            : "Не удалось сбросить изображение.",
      }
    }
  }, [campaignId, canManage, characters, userId])

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
    characters,
    playerCharacters,
    ownCharacters,
    worldSpeakerCharacters,
    narratorSelected: canManage && activeCharacter === null,
    loading,
    error,
    selectSpeaker,
    applyCharacterMedia,
    resetCharacterMedia,
  }
}
