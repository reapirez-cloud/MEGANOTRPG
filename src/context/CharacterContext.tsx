import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "./AuthContext"

export type Character = {
  id: string
  campaign_id: string
  assigned_user_id: string | null
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type CampaignMember = {
  campaign_id: string
  user_id: string
  role: "gm" | "player"
  is_owner: boolean
  active_character_id: string | null
  display_name: string
  telegram_user_id: string | null
  telegram_username: string | null
}

export type CharacterInput = {
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  assigned_user_id: string | null
}

type Result = { ok: boolean; error?: string }

type CharacterContextValue = {
  campaignId: string
  campaignTitle: string
  characters: Character[]
  members: CampaignMember[]
  myCharacters: Character[]
  activeCharacter: Character | null
  myMember: CampaignMember | null
  isGm: boolean
  isOwner: boolean
  canManage: boolean
  hasGm: boolean
  hasOwner: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  claimOwner: () => Promise<Result>
  claimGm: () => Promise<Result>
  setGm: (userId: string) => Promise<Result>
  setMemberRole: (userId: string, role: "gm" | "player") => Promise<Result>
  updateCampaignTitle: (title: string) => Promise<Result>
  createCharacter: (input: CharacterInput) => Promise<Result>
  updateCharacter: (characterId: string, input: CharacterInput) => Promise<Result>
  updateOwnCharacterAvatar: (characterId: string, avatarUrl: string) => Promise<Result>
  assignCharacter: (characterId: string, userId: string | null) => Promise<Result>
  setActiveForMember: (userId: string, characterId: string) => Promise<Result>
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [campaignId, setCampaignId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("")
  const [characters, setCharacters] = useState<Character[]>([])
  const [members, setMembers] = useState<CampaignMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, title")
      .eq("slug", "demo")
      .single()

    if (campaignError || !campaign) {
      setError(campaignError?.message || "Кампания не найдена")
      setLoading(false)
      return
    }

    setCampaignId(campaign.id)
    setCampaignTitle(campaign.title)

    const [characterResult, memberResult, profileResult, telegramResult] =
      await Promise.all([
        supabase
          .from("characters")
          .select(
            "id, campaign_id, assigned_user_id, name, character_class, level, bio, avatar_url, created_at, updated_at",
          )
          .eq("campaign_id", campaign.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("campaign_members")
          .select("campaign_id, user_id, role, is_owner, active_character_id")
          .eq("campaign_id", campaign.id)
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("user_id, display_name"),
        supabase
          .from("telegram_identities")
          .select("user_id, telegram_user_id, username"),
      ])

    const firstError =
      characterResult.error ||
      memberResult.error ||
      profileResult.error ||
      telegramResult.error

    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const profileMap = new Map(
      (profileResult.data || []).map(
        (profile: { user_id: string; display_name: string }) => [
          profile.user_id,
          profile.display_name,
        ],
      ),
    )

    const telegramMap = new Map(
      (telegramResult.data || []).map(
        (identity: {
          user_id: string
          telegram_user_id: string | number
          username: string | null
        }) => [
          identity.user_id,
          {
            telegram_user_id: String(identity.telegram_user_id),
            telegram_username: identity.username || null,
          },
        ],
      ),
    )

    const nextMembers = (memberResult.data || []).map(
      (member: {
        campaign_id: string
        user_id: string
        role: string
        is_owner: boolean
        active_character_id: string | null
      }) => {
        const telegram = telegramMap.get(member.user_id)
        return {
          ...member,
          role: member.role === "gm" ? "gm" : "player",
          is_owner: Boolean(member.is_owner),
          display_name: profileMap.get(member.user_id) || "Игрок",
          telegram_user_id: telegram?.telegram_user_id || null,
          telegram_username: telegram?.telegram_username || null,
        }
      },
    ) as CampaignMember[]

    setCharacters((characterResult.data || []) as Character[])
    setMembers(nextMembers)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const myMember = useMemo(
    () => members.find((member) => member.user_id === user.id) ?? null,
    [members, user.id],
  )

  const myCharacters = useMemo(
    () => characters.filter((character) => character.assigned_user_id === user.id),
    [characters, user.id],
  )

  const activeCharacter = useMemo(() => {
    if (!myMember?.active_character_id) return null

    return (
      characters.find(
        (character) =>
          character.id === myMember.active_character_id &&
          character.assigned_user_id === user.id,
      ) ?? null
    )
  }, [characters, myMember, user.id])

  const isGm = myMember?.role === "gm"
  const isOwner = myMember?.is_owner === true
  const canManage = isGm || isOwner
  const hasGm = members.some((member) => member.role === "gm")
  const hasOwner = members.some((member) => member.is_owner)

  const claimOwner = useCallback(async (): Promise<Result> => {
    const { error: claimError } = await supabase.rpc("claim_demo_owner")
    if (claimError) return { ok: false, error: claimError.message }
    await load()
    return { ok: true }
  }, [load])

  const claimGm = useCallback(async (): Promise<Result> => {
    const { error: claimError } = await supabase.rpc("claim_demo_gm")
    if (claimError) return { ok: false, error: claimError.message }
    await load()
    return { ok: true }
  }, [load])

  const setMemberRole = useCallback(
    async (userId: string, role: "gm" | "player"): Promise<Result> => {
      const { error: roleError } = await supabase.rpc("set_demo_member_role", {
        p_user_id: userId,
        p_role: role,
      })

      if (roleError) return { ok: false, error: roleError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const setGm = useCallback(
    async (userId: string): Promise<Result> => setMemberRole(userId, "gm"),
    [setMemberRole],
  )

  const updateCampaignTitle = useCallback(
    async (title: string): Promise<Result> => {
      const cleaned = title.trim()
      if (!campaignId || !cleaned) {
        return { ok: false, error: "Нужно название кампании." }
      }

      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ title: cleaned })
        .eq("id", campaignId)

      if (updateError) return { ok: false, error: updateError.message }
      setCampaignTitle(cleaned)
      return { ok: true }
    },
    [campaignId],
  )

  const createCharacter = useCallback(
    async (input: CharacterInput): Promise<Result> => {
      if (!campaignId) {
        return { ok: false, error: "Кампания ещё не загружена." }
      }

      const { data, error: insertError } = await supabase
        .from("characters")
        .insert({
          campaign_id: campaignId,
          assigned_user_id: input.assigned_user_id,
          name: input.name.trim(),
          character_class: input.character_class.trim() || "Персонаж",
          level: input.level,
          bio: input.bio.trim(),
          avatar_url: input.avatar_url?.trim() || null,
        })
        .select("id, assigned_user_id")
        .single()

      if (insertError || !data) {
        return {
          ok: false,
          error: insertError?.message || "Не удалось создать персонажа.",
        }
      }

      if (data.assigned_user_id) {
        const member = members.find((item) => item.user_id === data.assigned_user_id)
        if (member && !member.active_character_id) {
          await supabase
            .from("campaign_members")
            .update({ active_character_id: data.id })
            .eq("campaign_id", campaignId)
            .eq("user_id", data.assigned_user_id)
        }
      }

      await load()
      return { ok: true }
    },
    [campaignId, load, members],
  )

  const assignCharacter = useCallback(
    async (characterId: string, userId: string | null): Promise<Result> => {
      if (!campaignId) {
        return { ok: false, error: "Кампания ещё не загружена." }
      }

      const character = characters.find((item) => item.id === characterId)
      if (!character) return { ok: false, error: "Персонаж не найден." }

      const oldUserId = character.assigned_user_id

      const { error: characterError } = await supabase
        .from("characters")
        .update({
          assigned_user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", characterId)

      if (characterError) return { ok: false, error: characterError.message }

      if (oldUserId && oldUserId !== userId) {
        const oldMember = members.find((item) => item.user_id === oldUserId)
        if (oldMember?.active_character_id === characterId) {
          await supabase
            .from("campaign_members")
            .update({ active_character_id: null })
            .eq("campaign_id", campaignId)
            .eq("user_id", oldUserId)
        }
      }

      if (userId) {
        const newMember = members.find((item) => item.user_id === userId)
        if (newMember && !newMember.active_character_id) {
          await supabase
            .from("campaign_members")
            .update({ active_character_id: characterId })
            .eq("campaign_id", campaignId)
            .eq("user_id", userId)
        }
      }

      await load()
      return { ok: true }
    },
    [campaignId, characters, load, members],
  )

  const updateCharacter = useCallback(
    async (characterId: string, input: CharacterInput): Promise<Result> => {
      const character = characters.find((item) => item.id === characterId)
      if (!character) return { ok: false, error: "Персонаж не найден." }

      const { error: updateError } = await supabase
        .from("characters")
        .update({
          name: input.name.trim(),
          character_class: input.character_class.trim() || "Персонаж",
          level: input.level,
          bio: input.bio.trim(),
          avatar_url: input.avatar_url?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", characterId)

      if (updateError) return { ok: false, error: updateError.message }

      if (character.assigned_user_id !== input.assigned_user_id) {
        const assignmentResult = await assignCharacter(
          characterId,
          input.assigned_user_id,
        )
        if (!assignmentResult.ok) return assignmentResult
      } else {
        await load()
      }

      return { ok: true }
    },
    [assignCharacter, characters, load],
  )

  const updateOwnCharacterAvatar = useCallback(
    async (characterId: string, avatarUrl: string): Promise<Result> => {
      const { error: avatarError } = await supabase.rpc("set_my_character_avatar", {
        p_character_id: characterId,
        p_avatar_url: avatarUrl,
      })

      if (avatarError) return { ok: false, error: avatarError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const setActiveForMember = useCallback(
    async (userId: string, characterId: string): Promise<Result> => {
      if (!campaignId) {
        return { ok: false, error: "Кампания ещё не загружена." }
      }

      const character = characters.find(
        (item) =>
          item.id === characterId &&
          item.assigned_user_id === userId &&
          item.campaign_id === campaignId,
      )

      if (!character) {
        return {
          ok: false,
          error: "Сначала прикрепи этого персонажа к выбранному игроку.",
        }
      }

      const { error: updateError } = await supabase
        .from("campaign_members")
        .update({ active_character_id: characterId })
        .eq("campaign_id", campaignId)
        .eq("user_id", userId)

      if (updateError) return { ok: false, error: updateError.message }
      await load()
      return { ok: true }
    },
    [campaignId, characters, load],
  )

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="auth-spinner" />
          <div className="auth-muted">Загружаем кампанию…</div>
        </div>
      </div>
    )
  }

  if (error && !campaignId) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Не удалось загрузить кампанию</h1>
          <p className="auth-muted">{error}</p>
          <button className="auth-primary" type="button" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      </div>
    )
  }

  return (
    <CharacterContext.Provider
      value={{
        campaignId,
        campaignTitle,
        characters,
        members,
        myCharacters,
        activeCharacter,
        myMember,
        isGm,
        isOwner,
        canManage,
        hasGm,
        hasOwner,
        loading,
        error,
        refresh: load,
        claimOwner,
        claimGm,
        setGm,
        setMemberRole,
        updateCampaignTitle,
        createCharacter,
        updateCharacter,
        updateOwnCharacterAvatar,
        assignCharacter,
        setActiveForMember,
      }}
    >
      {children}
    </CharacterContext.Provider>
  )
}

export function useCharacters() {
  const value = useContext(CharacterContext)
  if (!value) {
    throw new Error("useCharacters must be used inside CharacterProvider")
  }
  return value
}
