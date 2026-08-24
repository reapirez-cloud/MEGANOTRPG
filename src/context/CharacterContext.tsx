import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "./AuthContext"

export type Character = {
  id: string
  campaign_id: string
  owner_user_id: string
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

type CreateCharacterInput = {
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
}

type CharacterContextValue = {
  campaignId: string
  campaignTitle: string
  characters: Character[]
  myCharacters: Character[]
  activeCharacter: Character | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setActiveCharacter: (characterId: string) => Promise<boolean>
  createCharacter: (input: CreateCharacterInput) => Promise<{ ok: boolean; error?: string }>
  updateCharacter: (
    characterId: string,
    input: Partial<CreateCharacterInput>,
  ) => Promise<{ ok: boolean; error?: string }>
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [campaignId, setCampaignId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("")
  const [characters, setCharacters] = useState<Character[]>([])
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null)
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

    const [{ data: characterRows, error: characterError }, { data: member, error: memberError }] =
      await Promise.all([
        supabase
          .from("characters")
          .select(
            "id, campaign_id, owner_user_id, name, character_class, level, bio, avatar_url, created_at, updated_at",
          )
          .eq("campaign_id", campaign.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("campaign_members")
          .select("active_character_id")
          .eq("campaign_id", campaign.id)
          .eq("user_id", user.id)
          .single(),
      ])

    if (characterError) {
      setError(characterError.message)
      setLoading(false)
      return
    }

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    const nextCharacters = (characterRows || []) as Character[]
    setCharacters(nextCharacters)
    setActiveCharacterId(member?.active_character_id ?? null)
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    void load()
  }, [load])

  const myCharacters = useMemo(
    () => characters.filter((character) => character.owner_user_id === user.id),
    [characters, user.id],
  )

  const activeCharacter = useMemo(
    () =>
      characters.find(
        (character) =>
          character.id === activeCharacterId &&
          character.owner_user_id === user.id,
      ) ?? null,
    [activeCharacterId, characters, user.id],
  )

  const setActiveCharacter = useCallback(
    async (characterId: string) => {
      if (!campaignId) return false

      const character = characters.find(
        (item) =>
          item.id === characterId &&
          item.owner_user_id === user.id &&
          item.campaign_id === campaignId,
      )

      if (!character) {
        setError("Можно выбрать активным только своего персонажа.")
        return false
      }

      const { error: updateError } = await supabase
        .from("campaign_members")
        .update({ active_character_id: characterId })
        .eq("campaign_id", campaignId)
        .eq("user_id", user.id)

      if (updateError) {
        setError(updateError.message)
        return false
      }

      setActiveCharacterId(characterId)
      return true
    },
    [campaignId, characters, user.id],
  )

  const createCharacter = useCallback(
    async (input: CreateCharacterInput) => {
      if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }

      const { data, error: insertError } = await supabase
        .from("characters")
        .insert({
          campaign_id: campaignId,
          owner_user_id: user.id,
          name: input.name.trim(),
          character_class: input.character_class.trim() || "Персонаж",
          level: input.level,
          bio: input.bio.trim(),
          avatar_url: input.avatar_url?.trim() || null,
        })
        .select(
          "id, campaign_id, owner_user_id, name, character_class, level, bio, avatar_url, created_at, updated_at",
        )
        .single()

      if (insertError || !data) {
        return { ok: false, error: insertError?.message || "Не удалось создать персонажа." }
      }

      const created = data as Character
      setCharacters((current) => [...current, created])

      if (!activeCharacterId) {
        const { error: activeError } = await supabase
          .from("campaign_members")
          .update({ active_character_id: created.id })
          .eq("campaign_id", campaignId)
          .eq("user_id", user.id)

        if (activeError) {
          return {
            ok: false,
            error: "Персонаж создан, но не удалось сделать его активным.",
          }
        }

        setActiveCharacterId(created.id)
      }

      return { ok: true }
    },
    [activeCharacterId, campaignId, setActiveCharacter, user.id],
  )

  const updateCharacter = useCallback(
    async (characterId: string, input: Partial<CreateCharacterInput>) => {
      const current = characters.find(
        (item) => item.id === characterId && item.owner_user_id === user.id,
      )

      if (!current) {
        return { ok: false, error: "Этот персонаж тебе не принадлежит." }
      }

      const patch: Record<string, string | number | null> = {
        updated_at: new Date().toISOString(),
      }

      if (input.name !== undefined) patch.name = input.name.trim()
      if (input.character_class !== undefined) {
        patch.character_class = input.character_class.trim() || "Персонаж"
      }
      if (input.level !== undefined) patch.level = input.level
      if (input.bio !== undefined) patch.bio = input.bio.trim()
      if (input.avatar_url !== undefined) {
        patch.avatar_url = input.avatar_url?.trim() || null
      }

      const { data, error: updateError } = await supabase
        .from("characters")
        .update(patch)
        .eq("id", characterId)
        .eq("owner_user_id", user.id)
        .select(
          "id, campaign_id, owner_user_id, name, character_class, level, bio, avatar_url, created_at, updated_at",
        )
        .single()

      if (updateError || !data) {
        return { ok: false, error: updateError?.message || "Не удалось обновить персонажа." }
      }

      const updated = data as Character
      setCharacters((currentCharacters) =>
        currentCharacters.map((item) => (item.id === updated.id ? updated : item)),
      )

      return { ok: true }
    },
    [characters, user.id],
  )

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="auth-spinner" />
          <div className="auth-muted">Загружаем персонажей…</div>
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
        myCharacters,
        activeCharacter,
        loading,
        error,
        refresh: load,
        setActiveCharacter,
        createCharacter,
        updateCharacter,
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
