import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterWorldState, DayPeriod, LocationSummary, SceneWorldState } from "../world-state/types.ts"
import type { LarisaCommand, LarisaSnapshot, LarisaStorage, SceneParticipant, WorldMutation, WorldStorage } from "./types.ts"

function fail(error: { message: string } | null, fallback: string): never {
  throw new EngineCommandError("world.persistence", error?.message || fallback)
}

export class SupabaseLarisaStorage implements LarisaStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) { this.client = client }

  async loadCampaignSnapshot(campaignId: string): Promise<LarisaSnapshot> {
    const [stateResult, locationResult, sceneResult, participantResult, storageResult] = await Promise.all([
      this.client.from("character_world_state").select("character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by").eq("campaign_id", campaignId),
      this.client.from("locations").select("id,name,parent_location_id,image_url,visibility_mode,lifecycle_state").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      this.client.from("chat_rooms").select("id,title,location_id,campaign_day,day_period,scene_state,room_state").eq("campaign_id", campaignId).eq("room_type", "scene"),
      this.client.from("scene_participants").select("room_id,character_id"),
      this.client.from("world_storages")
        .select("id,campaign_id,location_id,root_item_id,storage_kind,name,description,visibility_mode,access_mode,owner_character_id,lifecycle_state,version")
        .eq("campaign_id", campaignId)
        .eq("lifecycle_state", "active"),
    ])
    const error = stateResult.error || locationResult.error || sceneResult.error || participantResult.error || storageResult.error
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
      worldStorages: (storageResult.data || []).map((storage) => ({
        ...storage,
        version: Number(storage.version || 1),
      })) as WorldStorage[],
    }
  }

  async execute(command: LarisaCommand): Promise<WorldMutation> {
    if (command.kind === "world.storage_create") {
      const { data, error } = await this.client.rpc("create_world_storage_v1", {
        p_location_id: command.input.locationId,
        p_storage_kind: command.input.storageKind,
        p_name: command.input.name,
        p_description: command.input.description,
        p_visibility_mode: command.input.visibilityMode,
        p_access_mode: command.input.accessMode,
        p_owner_character_id: command.input.ownerCharacterId,
        p_command_id: command.context.commandId,
      })
      if (error) fail(error, "Could not create world storage")
      const row = (data || {}) as Record<string, unknown>
      return {
        kind: command.kind,
        characterIds: command.input.ownerCharacterId ? [command.input.ownerCharacterId] : [],
        locationIds: [String(row.locationId || command.input.locationId)],
        sceneIds: [],
        details: row,
      }
    }

    if (command.kind === "world.storage_update") {
      const { data, error } = await this.client.rpc("update_world_storage_v1", {
        p_world_storage_id: command.worldStorageId,
        p_name: command.input.name,
        p_description: command.input.description,
        p_visibility_mode: command.input.visibilityMode,
        p_access_mode: command.input.accessMode,
        p_owner_character_id: command.input.ownerCharacterId,
        p_expected_version: command.expectedVersion,
        p_command_id: command.context.commandId,
      })
      if (error) fail(error, "Could not update world storage")
      const row = (data || {}) as Record<string, unknown>
      return {
        kind: command.kind,
        characterIds: command.input.ownerCharacterId ? [command.input.ownerCharacterId] : [],
        locationIds: row.location_id ? [String(row.location_id)] : [],
        sceneIds: [],
        details: row,
      }
    }

    if (command.kind === "world.storage_move") {
      const { data, error } = await this.client.rpc("move_world_storage_v1", {
        p_world_storage_id: command.worldStorageId,
        p_location_id: command.locationId,
        p_expected_version: command.expectedVersion,
        p_command_id: command.context.commandId,
      })
      if (error) fail(error, "Could not move world storage")
      const row = (data || {}) as Record<string, unknown>
      const locations = [row.fromLocationId, row.toLocationId]
        .filter((id): id is string => typeof id === "string" && Boolean(id))
      return {
        kind: command.kind,
        characterIds: [],
        locationIds: [...new Set(locations)],
        sceneIds: [],
        details: row,
      }
    }

    if (command.kind === "world.storage_set_archived") {
      const { data, error } = await this.client.rpc("set_world_storage_archived_v1", {
        p_world_storage_id: command.worldStorageId,
        p_archived: command.archived,
        p_expected_version: command.expectedVersion,
        p_command_id: command.context.commandId,
      })
      if (error) fail(error, "Could not change world storage lifecycle")
      const row = (data || {}) as Record<string, unknown>
      return {
        kind: command.kind,
        characterIds: [],
        locationIds: row.locationId ? [String(row.locationId)] : [],
        sceneIds: [],
        details: row,
      }
    }

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

    if (command.kind === "world.sync_scene_participants") {
      const { data, error } = await this.client.rpc("sync_scene_participants", { p_room_id: command.roomId, p_sync_location: command.syncLocation, p_sync_time: command.syncTime })
      if (error) fail(error, "Could not synchronize scene participants")
      return { kind: command.kind, characterIds: [], locationIds: [], sceneIds: [command.roomId], details: { count: Number(data || 0), syncLocation: command.syncLocation, syncTime: command.syncTime } }
    }

    if (command.kind === "world.location_create") {
      const { data, error } = await this.client.from("locations").insert({
        campaign_id: command.context.campaignId,
        parent_location_id: command.input.parentLocationId,
        name: command.input.name.trim(),
        summary: command.input.summary.trim(),
        description: command.input.description.trim(),
        image_url: command.input.imageUrl?.trim() || null,
        visibility_mode: command.input.visibilityMode,
        created_by: command.context.requestedBy,
      }).select("id").single()
      if (error || !data) fail(error, "Could not create location")
      return { kind: command.kind, characterIds: [], locationIds: [data.id], sceneIds: [], details: { locationId: data.id } }
    }

    if (command.kind === "world.location_update") {
      const { error } = await this.client.from("locations").update({
        name: command.input.name.trim(),
        summary: command.input.summary.trim(),
        description: command.input.description.trim(),
        image_url: command.input.imageUrl?.trim() || null,
        visibility_mode: command.input.visibilityMode,
        updated_at: new Date().toISOString(),
      }).eq("id", command.locationId)
      if (error) fail(error, "Could not update location")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { locationId: command.locationId } }
    }

    if (command.kind === "world.location_set_visibility") {
      const { error } = await this.client.from("locations").update({ visibility_mode: command.visibilityMode, updated_at: new Date().toISOString() }).eq("id", command.locationId)
      if (error) fail(error, "Could not change location visibility")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { visibilityMode: command.visibilityMode } }
    }

    if (command.kind === "world.location_set_archived") {
      const { error } = await this.client.from("locations").update({
        lifecycle_state: command.archived ? "archived" : "active",
        archived_at: command.archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", command.locationId)
      if (error) fail(error, "Could not change location lifecycle")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { archived: command.archived } }
    }

    if (command.kind === "world.location_delete") {
      const { error } = await this.client.from("locations").delete().eq("id", command.locationId)
      if (error) fail(error, "Could not delete location")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: {} }
    }

    if (command.kind === "world.location_publish_event") {
      const { error } = await this.client.rpc("publish_location_chronicle_event", { p_location_id: command.locationId, p_event: command.event })
      if (error) fail(error, "Could not publish location chronicle event")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { event: command.event } }
    }

    if (command.kind === "world.campaign_announcement_publish") {
      const { data, error } = await this.client.from("campaign_updates").insert({
        campaign_id: command.context.campaignId,
        created_by: command.context.requestedBy,
        kind: "announcement",
        title: command.title.trim(),
        body: command.body.trim(),
        published_at: command.context.occurredAt,
      }).select("id").single()
      if (error || !data) fail(error, "Could not publish campaign announcement")
      return {
        kind: command.kind,
        characterIds: [],
        locationIds: [],
        sceneIds: [],
        details: { announcementId: data.id, kind: "announcement" },
      }
    }

    if (command.kind === "world.location_section_create") {
      const { data, error } = await this.client.from("location_sections").insert({ location_id: command.locationId, title: command.title.trim(), body: command.body.trim() }).select("id").single()
      if (error || !data) fail(error, "Could not create location section")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { sectionId: data.id } }
    }

    if (command.kind === "world.location_section_update") {
      const { data: section, error: readError } = await this.client.from("location_sections").select("location_id").eq("id", command.sectionId).maybeSingle()
      if (readError || !section) fail(readError, "Could not load location section")
      const { error } = await this.client.from("location_sections").update({ title: command.title.trim(), body: command.body.trim() }).eq("id", command.sectionId)
      if (error) fail(error, "Could not update location section")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_section_delete") {
      const { data: section, error: readError } = await this.client.from("location_sections").select("location_id").eq("id", command.sectionId).maybeSingle()
      if (readError || !section) fail(readError, "Could not load location section")
      const { error } = await this.client.from("location_sections").delete().eq("id", command.sectionId)
      if (error) fail(error, "Could not delete location section")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_link_create") {
      const { data: section, error: readError } = await this.client.from("location_sections").select("location_id").eq("id", command.sectionId).maybeSingle()
      if (readError || !section) fail(readError, "Could not load link section")
      const { data, error } = await this.client.from("location_links").insert({
        section_id: command.sectionId,
        target_location_id: command.targetLocationId,
        label: command.label.trim(),
        visibility_mode: command.visibilityMode,
        created_by: command.context.requestedBy,
      }).select("id").single()
      if (error || !data) fail(error, "Could not create location link")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id, command.targetLocationId], sceneIds: [], details: { linkId: data.id } }
    }

    if (command.kind === "world.location_link_update") {
      const { data: link, error: readError } = await this.client.from("location_links").select("section_id,target_location_id").eq("id", command.linkId).maybeSingle()
      if (readError || !link) fail(readError, "Could not load location link")
      const { data: section, error: sectionError } = await this.client.from("location_sections").select("location_id").eq("id", link.section_id).maybeSingle()
      if (sectionError || !section) fail(sectionError, "Could not load link section")
      const payload: Record<string, unknown> = { target_location_id: command.targetLocationId, label: command.label.trim() }
      if (command.visibilityMode) payload.visibility_mode = command.visibilityMode
      const { error } = await this.client.from("location_links").update(payload).eq("id", command.linkId)
      if (error) fail(error, "Could not update location link")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id, command.targetLocationId], sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.location_link_delete") {
      const { data: link, error: readError } = await this.client.from("location_links").select("section_id,target_location_id").eq("id", command.linkId).maybeSingle()
      if (readError || !link) fail(readError, "Could not load location link")
      const { data: section, error: sectionError } = await this.client.from("location_sections").select("location_id").eq("id", link.section_id).maybeSingle()
      if (sectionError || !section) fail(sectionError, "Could not load link section")
      const { error } = await this.client.from("location_links").delete().eq("id", command.linkId)
      if (error) fail(error, "Could not delete location link")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id, link.target_location_id], sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.npc_habitat_set") {
      const { error } = await this.client.rpc("set_npc_zone_habitat", {
        p_npc_character_id: command.npcCharacterId,
        p_location_id: command.locationId,
        p_attached: command.attached,
      })
      if (error) fail(error, "Could not change NPC habitat")
      return { kind: command.kind, characterIds: [command.npcCharacterId], locationIds: [command.locationId], sceneIds: [], details: { attached: command.attached } }
    }

    throw new EngineCommandError("world.unsupported_command", "Unsupported Larisa command")
  }
}
