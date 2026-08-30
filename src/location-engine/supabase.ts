import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterWorldState, DayPeriod, LocationSummary, SceneWorldState } from "../world-state/types.ts"
import type { LarisaCommand, LarisaSnapshot, LarisaStorage, SceneParticipant, WorldMutation } from "./types.ts"

function fail(error: { message: string } | null, fallback: string): never {
  throw new EngineCommandError("world.persistence", error?.message || fallback)
}

export class SupabaseLarisaStorage implements LarisaStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) { this.client = client }

  async loadCampaignSnapshot(campaignId: string): Promise<LarisaSnapshot> {
    const [stateResult, locationResult, sceneResult, participantResult] = await Promise.all([
      this.client.from("character_world_state").select("character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by").eq("campaign_id", campaignId),
      this.client.from("locations").select("id,name,parent_location_id,image_url,visibility_mode,lifecycle_state").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      this.client.from("chat_rooms").select("id,title,location_id,campaign_day,day_period,scene_state,room_state").eq("campaign_id", campaignId).eq("room_type", "scene"),
      this.client.from("scene_participants").select("room_id,character_id"),
    ])
    const error = stateResult.error || locationResult.error || sceneResult.error || participantResult.error
    if (error) fail(error, "Could not load world state")
    return {
      characterStates: (stateResult.data || []) as CharacterWorldState[],
      locations: (locationResult.data || []) as LocationSummary[],
      scenes: (sceneResult.data || []).map((room) => ({
        room_id: room.id,
        title: room.title,
        location_id: room.location_id,
        campaign_day: room.campaign_day,
        day_period: room.day_period as DayPeriod,
        scene_state: room.scene_state as "active" | "closed",
        room_state: room.room_state as "open" | "gm_only" | "closed",
      })) satisfies SceneWorldState[],
      sceneParticipants: (participantResult.data || []) as SceneParticipant[],
    }
  }

  async execute(command: LarisaCommand): Promise<WorldMutation> {
    if (command.kind === "world.discover_location") {
      const { error } = await this.client.rpc("set_world_discovery", { p_character_id: command.characterId, p_entity_type: "location", p_entity_id: command.locationId, p_discovered: command.discovered })
      if (error) fail(error, "Could not update location discovery")
      return { kind: command.kind, characterIds: [command.characterId], locationIds: [command.locationId], sceneIds: [], details: { discovered: command.discovered } }
    }
    if (command.kind === "world.set_character_position") {
      const { error } = await this.client.rpc("set_character_world_position", { p_character_id: command.characterId, p_location_id: command.locationId, p_campaign_day: command.campaignDay, p_day_period: command.dayPeriod })
      if (error) fail(error, "Could not move character")
      return { kind: command.kind, characterIds: [command.characterId], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [], details: { locationId: command.locationId, campaignDay: command.campaignDay, dayPeriod: command.dayPeriod } }
    }
    if (command.kind === "world.set_scene_position") {
      const { error } = await this.client.rpc("set_scene_position", { p_room_id: command.roomId, p_location_id: command.locationId, p_campaign_day: command.campaignDay, p_day_period: command.dayPeriod })
      if (error) fail(error, "Could not move scene")
      return { kind: command.kind, characterIds: [], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [command.roomId], details: { locationId: command.locationId, campaignDay: command.campaignDay, dayPeriod: command.dayPeriod } }
    }
    if (command.kind === "world.set_scene_participants") {
      const { error } = await this.client.rpc("set_scene_participants", { p_room_id: command.roomId, p_character_ids: command.characterIds })
      if (error) fail(error, "Could not update scene participants")
      return { kind: command.kind, characterIds: command.characterIds, locationIds: [], sceneIds: [command.roomId], details: { characterIds: command.characterIds } }
    }
    const { data, error } = await this.client.rpc("sync_scene_participants", { p_room_id: command.roomId, p_sync_location: command.syncLocation, p_sync_time: command.syncTime })
    if (error) fail(error, "Could not synchronize scene participants")
    return { kind: command.kind, characterIds: [], locationIds: [], sceneIds: [command.roomId], details: { count: Number(data || 0), syncLocation: command.syncLocation, syncTime: command.syncTime } }
  }
}
