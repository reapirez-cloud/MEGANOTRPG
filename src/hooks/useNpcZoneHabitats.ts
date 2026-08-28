import { useCallback, useEffect, useMemo, useState } from "react"
import { useCharacters } from "../context/CharacterContext"
import { supabase } from "../lib/supabase"

export type NpcZoneHabitat = {
  location_id: string
  npc_character_id: string
  campaign_id: string
  created_at: string
}

export type NpcHabitatZone = {
  id: string
  name: string
  parent_location_id: string | null
  lifecycle_state: "active" | "archived"
  sort_order: number
}

export function zonePathLabel(zones: NpcHabitatZone[], zoneId: string): string {
  const byId = new Map(zones.map((zone) => [zone.id, zone]))
  const names: string[] = []
  const seen = new Set<string>()
  let current = byId.get(zoneId) || null
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    names.unshift(current.name)
    current = current.parent_location_id ? byId.get(current.parent_location_id) || null : null
  }
  return names.join(" › ")
}

export function useNpcZoneHabitats() {
  const { campaignId } = useCharacters()
  const [links, setLinks] = useState<NpcZoneHabitat[]>([])
  const [zones, setZones] = useState<NpcHabitatZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingKey, setSavingKey] = useState("")

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    const [linkResult, zoneResult] = await Promise.all([
      supabase
        .from("location_npc_habitats")
        .select("location_id,npc_character_id,campaign_id,created_at")
        .eq("campaign_id", campaignId),
      supabase
        .from("locations")
        .select("id,name,parent_location_id,lifecycle_state,sort_order")
        .eq("campaign_id", campaignId)
        .order("sort_order", { ascending: true }),
    ])
    const firstError = linkResult.error || zoneResult.error
    if (firstError) setError(firstError.message)
    else {
      setError("")
      setLinks((linkResult.data || []) as NpcZoneHabitat[])
      setZones((zoneResult.data || []) as NpcHabitatZone[])
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
    const channel = supabase
      .channel(`npc-zone-habitats:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "location_npc_habitats", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [campaignId, load])

  const activeZones = useMemo(
    () => zones.filter((zone) => zone.lifecycle_state === "active"),
    [zones],
  )

  const linkSet = useMemo(
    () => new Set(links.map((link) => `${link.npc_character_id}:${link.location_id}`)),
    [links],
  )

  const isAttached = useCallback(
    (npcCharacterId: string, locationId: string) => linkSet.has(`${npcCharacterId}:${locationId}`),
    [linkSet],
  )

  const zonesForNpc = useCallback(
    (npcCharacterId: string) => links.filter((link) => link.npc_character_id === npcCharacterId).map((link) => link.location_id),
    [links],
  )

  const npcIdsForZone = useCallback(
    (locationId: string) => links.filter((link) => link.location_id === locationId).map((link) => link.npc_character_id),
    [links],
  )

  const setAttached = useCallback(async (npcCharacterId: string, locationId: string, attached: boolean) => {
    const key = `${npcCharacterId}:${locationId}`
    setSavingKey(key)
    setError("")
    const { error: rpcError } = await supabase.rpc("set_npc_zone_habitat", {
      p_npc_character_id: npcCharacterId,
      p_location_id: locationId,
      p_attached: attached,
    })
    setSavingKey("")
    if (rpcError) return { ok: false, error: rpcError.message }
    await load()
    return { ok: true }
  }, [load])

  return {
    links,
    zones,
    activeZones,
    loading,
    error,
    savingKey,
    refresh: load,
    isAttached,
    zonesForNpc,
    npcIdsForZone,
    setAttached,
  }
}
