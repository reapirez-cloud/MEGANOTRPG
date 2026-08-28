import { useCallback, useEffect, useMemo, useState } from "react"
import { useCharacters } from "../context/CharacterContext"
import { supabase } from "../lib/supabase"
import { resolveNearbyCharacters, resolveOtherTimeCharacters, resolveScenesAtPosition } from "../world-state/resolver.ts"
import type { CharacterWorldState, DayPeriod, LocationSummary, SceneWorldState } from "../world-state/types.ts"

export function useWorldState(subjectCharacterId?: string | null) {
  const { campaignId, activeCharacter, characters, canManage } = useCharacters()
  const subjectId = subjectCharacterId ?? activeCharacter?.id ?? null
  const [states, setStates] = useState<CharacterWorldState[]>([])
  const [locations, setLocations] = useState<LocationSummary[]>([])
  const [scenes, setScenes] = useState<SceneWorldState[]>([])
  const [sceneParticipants, setSceneParticipants] = useState<Array<{ room_id: string; character_id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    const [stateResult, locationResult, sceneResult, participantResult] = await Promise.all([
      supabase.from("character_world_state").select("character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by").eq("campaign_id", campaignId),
      supabase.from("locations").select("id,name,parent_location_id,image_url,visibility_mode,lifecycle_state").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      supabase.from("chat_rooms").select("id,title,location_id,campaign_day,day_period,scene_state,room_state").eq("campaign_id", campaignId).eq("room_type", "scene"),
      supabase.from("scene_participants").select("room_id,character_id"),
    ])
    const firstError = stateResult.error || locationResult.error || sceneResult.error || participantResult.error
    if (firstError) setError(firstError.message)
    else {
      setError(null)
      setStates((stateResult.data || []) as CharacterWorldState[])
      setLocations((locationResult.data || []) as LocationSummary[])
      setScenes((sceneResult.data || []).map((room) => ({
        room_id: room.id,
        title: room.title,
        location_id: room.location_id,
        campaign_day: room.campaign_day,
        day_period: room.day_period as DayPeriod,
        scene_state: room.scene_state as "active" | "closed",
        room_state: room.room_state as "open" | "gm_only" | "closed",
      })))
      setSceneParticipants((participantResult.data || []) as Array<{ room_id: string; character_id: string }>)
    }
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    if (!campaignId) return
    const channel = supabase.channel(`world-state:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_world_state", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "locations", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_rooms", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_npc_discoveries" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_location_discoveries" }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [campaignId, load])

  const currentState = useMemo(() => states.find((state) => state.character_id === subjectId) || null, [states, subjectId])
  const currentLocation = useMemo(() => locations.find((location) => location.id === currentState?.location_id) || null, [locations, currentState])
  const presenceCharacters = useMemo(() => characters.map((character) => ({
    id: character.id,
    name: character.name,
    avatar_url: character.avatar_url,
    character_type: character.character_type,
    life_state: "alive" as const,
  })), [characters])
  const nearby = useMemo(() => subjectId ? resolveNearbyCharacters(subjectId, states, presenceCharacters) : [], [presenceCharacters, states, subjectId])
  const otherTimes = useMemo(() => subjectId ? resolveOtherTimeCharacters(subjectId, states, presenceCharacters) : [], [presenceCharacters, states, subjectId])
  const activeScenes = useMemo(() => resolveScenesAtPosition(currentState, scenes), [currentState, scenes])

  const setCharacterPosition = useCallback(async (characterId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod) => {
    if (!canManage) return { ok: false, error: "Только ГМ может менять позицию." }
    const { error: rpcError } = await supabase.rpc("set_character_world_position", { p_character_id: characterId, p_location_id: locationId, p_campaign_day: campaignDay, p_day_period: dayPeriod })
    if (rpcError) return { ok: false, error: rpcError.message }
    await load(); return { ok: true }
  }, [canManage, load])

  const setScenePosition = useCallback(async (roomId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod) => {
    const { error: rpcError } = await supabase.rpc("set_scene_position", { p_room_id: roomId, p_location_id: locationId, p_campaign_day: campaignDay, p_day_period: dayPeriod })
    if (rpcError) return { ok: false, error: rpcError.message }
    await load(); return { ok: true }
  }, [load])

  const setParticipants = useCallback(async (roomId: string, characterIds: string[]) => {
    const { error: rpcError } = await supabase.rpc("set_scene_participants", { p_room_id: roomId, p_character_ids: characterIds })
    if (rpcError) return { ok: false, error: rpcError.message }
    await load(); return { ok: true }
  }, [load])

  const syncScene = useCallback(async (roomId: string, syncLocation = true, syncTime = true) => {
    const { data, error: rpcError } = await supabase.rpc("sync_scene_participants", { p_room_id: roomId, p_sync_location: syncLocation, p_sync_time: syncTime })
    if (rpcError) return { ok: false, error: rpcError.message, count: 0 }
    await load(); return { ok: true, count: Number(data || 0) }
  }, [load])

  return { loading, error, states, locations, scenes, sceneParticipants, currentState, currentLocation, nearby, otherTimes, activeScenes, refresh: load, setCharacterPosition, setScenePosition, setParticipants, syncScene }
}
