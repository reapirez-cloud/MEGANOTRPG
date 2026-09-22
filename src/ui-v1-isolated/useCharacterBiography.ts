import { useCallback, useEffect, useState } from "react"

import { supabase } from "../lib/supabase"
import { useUiV1CampaignScope } from "./useUiV1SectionData"

export type BiographyRelationship = {
  id: string
  direction: "from_character" | "toward_character"
  counterpart_character_id: string
  counterpart_name: string
  counterpart_avatar_url?: string | null
  counterpart_character_type?: "pc" | "npc"
  counterpart_life_state?: "alive" | "dead"
  relationship_kind: string
  public_label: string
  attitude_score: number
  player_note: string
  gm_note?: string
  player_visible?: boolean
  state: "active" | "ended"
  started_at?: string | null
  ended_at?: string | null
  updated_at: string
}

export type BiographyAsset = {
  id: string
  asset_kind: string
  ownership_kind: string
  display_name: string
  description: string
  state: "active" | "lost" | "sold" | "destroyed" | "ended"
  location_id: string | null
  location_name: string | null
  npc_character_id: string | null
  npc_name: string | null
  inventory_item_id: string | null
  inventory_item_name: string | null
  world_storage_id: string | null
  world_storage_name: string | null
  player_visible?: boolean
  custom_data?: Record<string, unknown>
  acquired_at: string | null
  ended_at: string | null
  updated_at: string
}

export type BiographyFactionReputation = {
  id: string
  faction_id: string
  faction_name: string
  faction_summary: string
  standing_kind: string
  public_label: string
  reputation_score: number
  player_note: string
  gm_note?: string
  player_visible?: boolean
  state: "active" | "ended"
  updated_at: string
}

export type BiographyFactionMembership = {
  id: string
  faction_id: string
  faction_name: string
  faction_summary: string
  membership_role: string
  rank_label: string
  is_primary: boolean
  player_visible?: boolean
  state: "active" | "ended"
  updated_at: string
}

export type CharacterBiography = {
  character: {
    id: string
    name: string
    avatar_url: string | null
    character_class: string
    level: number
    character_type: "pc" | "npc"
    life_state: "alive" | "dead"
  }
  history: {
    bio: string
    background: string
    alignment: string
    personality_traits: string
    ideals: string
    bonds: string
    flaws: string
    backstory: string
    notes: string
  }
  relationships: BiographyRelationship[]
  assets: BiographyAsset[]
  factionReputations: BiographyFactionReputation[]
  factionMemberships: BiographyFactionMembership[]
  manager: boolean
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function normalizeBiography(rawValue: unknown, manager: boolean): CharacterBiography | null {
  const raw = object(rawValue)
  const character = object(raw.character)
  if (!text(character.id)) return null

  const sourceHistory = manager ? object(raw.sheet) : object(raw.history)

  return {
    character: {
      id: text(character.id),
      name: text(character.name),
      avatar_url: typeof character.avatar_url === "string" ? character.avatar_url : null,
      character_class: text(character.character_class),
      level: Number(character.level || 1),
      character_type: character.character_type === "npc" ? "npc" : "pc",
      life_state: character.life_state === "dead" ? "dead" : "alive",
    },
    history: {
      bio: manager ? text(character.bio) : text(sourceHistory.bio),
      background: text(sourceHistory.background),
      alignment: text(sourceHistory.alignment),
      personality_traits: text(sourceHistory.personality_traits),
      ideals: text(sourceHistory.ideals),
      bonds: text(sourceHistory.bonds),
      flaws: text(sourceHistory.flaws),
      backstory: text(sourceHistory.backstory),
      notes: text(sourceHistory.notes),
    },
    relationships: rows<BiographyRelationship>(raw.relationships),
    assets: rows<BiographyAsset>(raw.assets),
    factionReputations: rows<BiographyFactionReputation>(raw.faction_reputations),
    factionMemberships: rows<BiographyFactionMembership>(raw.faction_memberships),
    manager,
  }
}

export function useCharacterBiography(
  characterId: string,
  enabled: boolean,
  canManage: boolean,
) {
  const scope = useUiV1CampaignScope()
  const [biography, setBiography] = useState<CharacterBiography | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !characterId || !scope.campaignId) {
      setLoading(false)
      return
    }

    setLoading(true)
    const rpcName = canManage
      ? "read_character_biography_manager_v1"
      : "read_character_biography_v1"

    const { data, error: queryError } = await supabase.rpc(rpcName, {
      p_character_id: characterId,
    })

    if (queryError) {
      setBiography(null)
      setError(queryError.message)
    } else {
      setBiography(normalizeBiography(data, canManage))
      setError(null)
    }
    setLoading(false)
  }, [canManage, characterId, enabled, scope.campaignId])

  useEffect(() => {
    if (!enabled || !characterId || !scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }

    let cancelled = false
    void load()

    const reload = () => {
      if (!cancelled) void load()
    }

    const channel = supabase
      .channel(`character-biography-${characterId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters", filter: `id=eq.${characterId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "character_sheets", filter: `character_id=eq.${characterId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "character_assets", filter: `owner_character_id=eq.${characterId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "character_relationships", filter: `campaign_id=eq.${scope.campaignId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "character_faction_reputations", filter: `character_id=eq.${characterId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "faction_memberships", filter: `character_id=eq.${characterId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "factions", filter: `campaign_id=eq.${scope.campaignId}` },
        reload,
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [characterId, enabled, load, scope.campaignId, scope.loading])

  return {
    biography,
    loading: scope.loading || loading,
    error: scope.error || error,
    reload: load,
  }
}
