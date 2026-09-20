import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterWorldState, LocationSummary } from "../world-state/types.ts"
import type { LarisaCommand, LarisaSnapshot, LarisaStorage, SceneParticipant, WorldMutation } from "./types.ts"

function copy<T>(value: T): T { return structuredClone(value) }

export class MemoryLarisaStorage implements LarisaStorage {
  private snapshot: LarisaSnapshot
  private readonly discoveries = new Set<string>()
  private readonly sectionLocations = new Map<string, string>()
  private readonly linkSections = new Map<string, { sectionId: string; targetLocationId: string }>()
  private readonly npcHabitats = new Set<string>()

  constructor(initial: LarisaSnapshot = { characterStates: [], locations: [], scenes: [], sceneParticipants: [], sceneSurfaces: [], worldStorages: [] }) {
    this.snapshot = copy(initial)
  }

  async loadCampaignSnapshot(): Promise<LarisaSnapshot> { return copy(this.snapshot) }

  async execute(command: LarisaCommand): Promise<WorldMutation> {
    if (command.kind === "world.scene_create") {
      const roomId = `scene-${command.context.commandId}`
      this.snapshot.scenes = [...this.snapshot.scenes, {
        room_id: roomId,
        title: command.input.title,
        location_id: command.input.locationId,
        campaign_day: command.input.campaignDay,
        day_period: command.input.dayPeriod,
        scene_state: "active",
        room_state: command.input.roomState,
      }]
      return {
        kind: command.kind,
        characterIds: [],
        locationIds: command.input.locationId ? [command.input.locationId] : [],
        sceneIds: [roomId],
        details: { roomId, locationId: command.input.locationId },
      }
    }

    if (command.kind === "world.scene_delete") {
      const scene = this.snapshot.scenes.find((item) => item.room_id === command.roomId)
      if (!scene) {
        throw new EngineCommandError("world.scene_not_found", "Scene was not found")
      }
      this.snapshot.scenes = this.snapshot.scenes.filter(
        (item) => item.room_id !== command.roomId,
      )
      this.snapshot.sceneParticipants = this.snapshot.sceneParticipants.filter(
        (participant) => participant.room_id !== command.roomId,
      )
      this.snapshot.sceneSurfaces = this.snapshot.sceneSurfaces.filter(
        (surface) => surface.room_id !== command.roomId,
      )
      return {
        kind: command.kind,
        characterIds: [],
        locationIds: scene.location_id ? [scene.location_id] : [],
        sceneIds: [command.roomId],
        details: {
          roomId: command.roomId,
          locationId: scene.location_id,
          title: scene.title,
        },
      }
    }

    if (command.kind === "world.scene_move_character") {
      const target = command.roomId
        ? this.snapshot.scenes.find((scene) => scene.room_id === command.roomId && scene.scene_state === "active")
        : null
      if (command.roomId && !target) {
        throw new EngineCommandError("world.scene_not_found", "Target active scene was not found")
      }

      const previousRoomIds = new Set(
        this.snapshot.sceneParticipants
          .filter((participant) => participant.character_id === command.characterId)
          .map((participant) => participant.room_id),
      )
      this.snapshot.sceneParticipants = this.snapshot.sceneParticipants
        .filter((participant) => participant.character_id !== command.characterId)
      for (const surface of this.snapshot.sceneSurfaces) {
        if (previousRoomIds.has(surface.room_id) && surface.room_id !== target?.room_id) {
          surface.selected_character_ids = surface.selected_character_ids
            .filter((id) => id !== command.characterId)
        }
      }
      if (target) {
        this.snapshot.sceneParticipants.push({
          room_id: target.room_id,
          character_id: command.characterId,
        })
      }

      if (target && (command.syncLocation || command.syncTime)) {
        const current = this.snapshot.characterStates.find((state) => state.character_id === command.characterId)
        const next: CharacterWorldState = {
          character_id: command.characterId,
          campaign_id: command.context.campaignId,
          location_id: command.syncLocation ? target.location_id : current?.location_id ?? null,
          campaign_day: command.syncTime ? target.campaign_day : current?.campaign_day ?? 1,
          day_period: command.syncTime ? target.day_period : current?.day_period ?? "day",
          updated_at: command.context.occurredAt,
          updated_by: command.context.requestedBy,
        }
        this.snapshot.characterStates = [
          ...this.snapshot.characterStates.filter((state) => state.character_id !== command.characterId),
          next,
        ]
      }

      return {
        kind: command.kind,
        characterIds: [command.characterId],
        locationIds: target?.location_id ? [target.location_id] : [],
        sceneIds: target ? [target.room_id] : [],
        details: {
          characterId: command.characterId,
          roomId: target?.room_id ?? null,
          locationId: target?.location_id ?? null,
        },
      }
    }

    if (command.kind === "world.surface_create") {
      const scene = this.snapshot.scenes.find((item) =>
        item.room_id === command.input.roomId && item.scene_state === "active"
      )
      if (!scene) throw new EngineCommandError("world.scene_not_found", "Scene was not found")

      if (command.input.accessMode === "selected") {
        const current = new Set(
          this.snapshot.sceneParticipants
            .filter((participant) => participant.room_id === command.input.roomId)
            .map((participant) => participant.character_id),
        )
        if (!command.input.characterIds.length || command.input.characterIds.some((id) => !current.has(id))) {
          throw new EngineCommandError("world.surface_access_invalid", "Selected Surface access requires current scene participants")
        }
      }

      const surfaceId = `surface-${command.context.commandId}`
      this.snapshot.sceneSurfaces = [...this.snapshot.sceneSurfaces, {
        id: surfaceId,
        campaign_id: command.context.campaignId,
        room_id: command.input.roomId,
        name: command.input.name,
        description: command.input.description,
        access_mode: command.input.accessMode,
        lifecycle_state: "active",
        version: 1,
        selected_character_ids: command.input.accessMode === "selected"
          ? [...new Set(command.input.characterIds)]
          : [],
      }]
      return {
        kind: command.kind,
        characterIds: command.input.characterIds,
        locationIds: [],
        sceneIds: [command.input.roomId],
        details: { surfaceId, roomId: command.input.roomId, accessMode: command.input.accessMode },
      }
    }

    if (command.kind === "world.surface_update") {
      const surface = this.snapshot.sceneSurfaces.find((item) => item.id === command.surfaceId)
      if (!surface) throw new EngineCommandError("world.surface_not_found", "Surface was not found")
      if (surface.version !== command.expectedVersion) {
        throw new EngineCommandError("world.version_conflict", "Surface version conflict")
      }
      if (command.input.accessMode === "selected") {
        const current = new Set(
          this.snapshot.sceneParticipants
            .filter((participant) => participant.room_id === surface.room_id)
            .map((participant) => participant.character_id),
        )
        if (!command.input.characterIds.length || command.input.characterIds.some((id) => !current.has(id))) {
          throw new EngineCommandError("world.surface_access_invalid", "Selected Surface access requires current scene participants")
        }
      }
      Object.assign(surface, {
        name: command.input.name,
        description: command.input.description,
        access_mode: command.input.accessMode,
        selected_character_ids: command.input.accessMode === "selected"
          ? [...new Set(command.input.characterIds)]
          : [],
        version: surface.version + 1,
      })
      return {
        kind: command.kind,
        characterIds: command.input.characterIds,
        locationIds: [],
        sceneIds: [surface.room_id],
        details: copy(surface),
      }
    }

    if (command.kind === "world.surface_set_archived") {
      const surface = this.snapshot.sceneSurfaces.find((item) => item.id === command.surfaceId)
      if (!surface) throw new EngineCommandError("world.surface_not_found", "Surface was not found")
      if (surface.version !== command.expectedVersion) {
        throw new EngineCommandError("world.version_conflict", "Surface version conflict")
      }
      surface.lifecycle_state = command.archived ? "archived" : "active"
      surface.version += 1
      return {
        kind: command.kind,
        characterIds: [],
        locationIds: [],
        sceneIds: [surface.room_id],
        details: copy(surface),
      }
    }

    if (command.kind === "world.storage_create") {
      const storageId = `world-storage-${command.context.commandId}`
      const storage = {
        id: storageId,
        campaign_id: command.context.campaignId,
        location_id: command.input.locationId,
        root_item_id: `world-storage-root-${command.context.commandId}`,
        storage_kind: command.input.storageKind,
        name: command.input.name,
        description: command.input.description,
        visibility_mode: command.input.visibilityMode,
        access_mode: command.input.accessMode,
        owner_character_id: command.input.ownerCharacterId,
        lifecycle_state: "active" as const,
        version: 1,
      }
      this.snapshot.worldStorages = [...this.snapshot.worldStorages, storage]
      return { kind: command.kind, characterIds: command.input.ownerCharacterId ? [command.input.ownerCharacterId] : [], locationIds: [command.input.locationId], sceneIds: [], details: { storageId, rootItemId: storage.root_item_id, locationId: command.input.locationId } }
    }

    if (command.kind === "world.storage_update") {
      const storage = this.snapshot.worldStorages.find((item) => item.id === command.worldStorageId)
      if (!storage) throw new EngineCommandError("world.storage_not_found", "World storage was not found")
      if (storage.version !== command.expectedVersion) throw new EngineCommandError("world.version_conflict", "World storage version conflict")
      Object.assign(storage, {
        name: command.input.name,
        description: command.input.description,
        visibility_mode: command.input.visibilityMode,
        access_mode: command.input.accessMode,
        owner_character_id: command.input.ownerCharacterId,
        version: storage.version + 1,
      })
      return { kind: command.kind, characterIds: command.input.ownerCharacterId ? [command.input.ownerCharacterId] : [], locationIds: [storage.location_id], sceneIds: [], details: copy(storage) }
    }

    if (command.kind === "world.storage_move") {
      const storage = this.snapshot.worldStorages.find((item) => item.id === command.worldStorageId)
      if (!storage) throw new EngineCommandError("world.storage_not_found", "World storage was not found")
      if (storage.version !== command.expectedVersion) throw new EngineCommandError("world.version_conflict", "World storage version conflict")
      const fromLocationId = storage.location_id
      storage.location_id = command.locationId
      storage.version += 1
      return { kind: command.kind, characterIds: [], locationIds: [fromLocationId, command.locationId], sceneIds: [], details: { storageId: storage.id, fromLocationId, toLocationId: command.locationId } }
    }

    if (command.kind === "world.storage_set_archived") {
      const storage = this.snapshot.worldStorages.find((item) => item.id === command.worldStorageId)
      if (!storage) throw new EngineCommandError("world.storage_not_found", "World storage was not found")
      if (storage.version !== command.expectedVersion) throw new EngineCommandError("world.version_conflict", "World storage version conflict")
      storage.lifecycle_state = command.archived ? "archived" : "active"
      storage.version += 1
      return { kind: command.kind, characterIds: [], locationIds: [storage.location_id], sceneIds: [], details: { storageId: storage.id, archived: command.archived, locationId: storage.location_id } }
    }

    if (command.kind === "world.discover_location") {
      const key = `${command.characterId}:${command.locationId}`
      if (command.discovered) this.discoveries.add(key); else this.discoveries.delete(key)
      return { kind: command.kind, characterIds: [command.characterId], locationIds: [command.locationId], sceneIds: [], details: { discovered: command.discovered } }
    }

    if (command.kind === "world.set_character_position") {
      if (command.locationId && !this.snapshot.locations.some((location) => location.id === command.locationId)) throw new EngineCommandError("world.location_not_found", "Location was not found")
      const next: CharacterWorldState = {
        character_id: command.characterId,
        campaign_id: command.context.campaignId,
        location_id: command.locationId,
        campaign_day: command.campaignDay,
        day_period: command.dayPeriod,
        updated_at: command.context.occurredAt,
        updated_by: command.context.requestedBy,
      }
      this.snapshot.characterStates = [...this.snapshot.characterStates.filter((state) => state.character_id !== command.characterId), next]
      return { kind: command.kind, characterIds: [command.characterId], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [], details: { position: next } }
    }

    if (command.kind === "world.set_scene_position") {
      const scene = this.snapshot.scenes.find((item) => item.room_id === command.roomId)
      if (!scene) throw new EngineCommandError("world.scene_not_found", "Scene was not found")
      Object.assign(scene, { location_id: command.locationId, campaign_day: command.campaignDay, day_period: command.dayPeriod })
      return { kind: command.kind, characterIds: [], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [command.roomId], details: { position: copy(scene) } }
    }

    if (command.kind === "world.set_scene_participants") {
      const selected = new Set(command.characterIds)
      const removedFromTarget = this.snapshot.sceneParticipants
        .filter((item) => item.room_id === command.roomId && !selected.has(item.character_id))
        .map((item) => item.character_id)
      const movedFromOther = this.snapshot.sceneParticipants
        .filter((item) => item.room_id !== command.roomId && selected.has(item.character_id))
        .map((item) => ({ characterId: item.character_id, roomId: item.room_id }))

      for (const surface of this.snapshot.sceneSurfaces) {
        if (surface.room_id === command.roomId) {
          surface.selected_character_ids = surface.selected_character_ids
            .filter((id) => !removedFromTarget.includes(id))
        } else {
          const leaving = new Set(
            movedFromOther
              .filter((entry) => entry.roomId === surface.room_id)
              .map((entry) => entry.characterId),
          )
          surface.selected_character_ids = surface.selected_character_ids
            .filter((id) => !leaving.has(id))
        }
      }

      const participants: SceneParticipant[] = command.characterIds.map((characterId) => ({ room_id: command.roomId, character_id: characterId }))
      this.snapshot.sceneParticipants = [
        ...this.snapshot.sceneParticipants.filter((item) =>
          item.room_id !== command.roomId && !selected.has(item.character_id)
        ),
        ...participants,
      ]
      return { kind: command.kind, characterIds: command.characterIds, locationIds: [], sceneIds: [command.roomId], details: { characterIds: command.characterIds } }
    }

    if (command.kind === "world.sync_scene_participants") {
      const scene = this.snapshot.scenes.find((item) => item.room_id === command.roomId)
      if (!scene) throw new EngineCommandError("world.scene_not_found", "Scene was not found")
      const ids = this.snapshot.sceneParticipants.filter((item) => item.room_id === command.roomId).map((item) => item.character_id)
      for (const characterId of ids) {
        const current = this.snapshot.characterStates.find((state) => state.character_id === characterId)
        const next: CharacterWorldState = {
          character_id: characterId,
          campaign_id: command.context.campaignId,
          location_id: command.syncLocation ? scene.location_id : current?.location_id ?? null,
          campaign_day: command.syncTime ? scene.campaign_day : current?.campaign_day ?? 1,
          day_period: command.syncTime ? scene.day_period : current?.day_period ?? "day",
          updated_at: command.context.occurredAt,
          updated_by: command.context.requestedBy,
        }
        this.snapshot.characterStates = [...this.snapshot.characterStates.filter((state) => state.character_id !== characterId), next]
      }
      return { kind: command.kind, characterIds: ids, locationIds: scene.location_id ? [scene.location_id] : [], sceneIds: [command.roomId], details: { count: ids.length, syncLocation: command.syncLocation, syncTime: command.syncTime } }
    }

    if (command.kind === "world.location_create") {
      const locationId = `location-${command.context.commandId}`
      const location: LocationSummary = {
        id: locationId,
        name: command.input.name,
        parent_location_id: command.input.parentLocationId,
        image_url: command.input.imageUrl,
        visibility_mode: command.input.visibilityMode,
        lifecycle_state: "active",
      }
      this.snapshot.locations = [...this.snapshot.locations, location]
      return { kind: command.kind, characterIds: [], locationIds: [locationId], sceneIds: [], details: { locationId } }
    }

    if (command.kind === "world.location_update") {
      const location = this.snapshot.locations.find((item) => item.id === command.locationId)
      if (!location) throw new EngineCommandError("world.location_not_found", "Location was not found")
      Object.assign(location, { name: command.input.name, image_url: command.input.imageUrl, visibility_mode: command.input.visibilityMode })
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { locationId: command.locationId } }
    }

    if (command.kind === "world.location_set_visibility") {
      const location = this.snapshot.locations.find((item) => item.id === command.locationId)
      if (!location) throw new EngineCommandError("world.location_not_found", "Location was not found")
      location.visibility_mode = command.visibilityMode
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { visibilityMode: command.visibilityMode } }
    }

    if (command.kind === "world.location_set_archived") {
      const location = this.snapshot.locations.find((item) => item.id === command.locationId)
      if (!location) throw new EngineCommandError("world.location_not_found", "Location was not found")
      location.lifecycle_state = command.archived ? "archived" : "active"
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { archived: command.archived } }
    }

    if (command.kind === "world.location_delete") {
      if (!this.snapshot.locations.some((item) => item.id === command.locationId)) throw new EngineCommandError("world.location_not_found", "Location was not found")
      this.snapshot.locations = this.snapshot.locations.filter((item) => item.id !== command.locationId)
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: {} }
    }

    if (command.kind === "world.location_publish_event") {
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { event: command.event } }
    }

    if (command.kind === "world.campaign_announcement_publish") {
      return {
        kind: command.kind,
        characterIds: [],
        locationIds: [],
        sceneIds: [],
        details: { announcementId: `announcement-${command.context.commandId}`, kind: "announcement" },
      }
    }

    if (command.kind === "world.location_section_create") {
      const sectionId = `section-${command.context.commandId}`
      this.sectionLocations.set(sectionId, command.locationId)
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { sectionId } }
    }

    if (command.kind === "world.location_section_update") {
      const locationId = this.sectionLocations.get(command.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      return { kind: command.kind, characterIds: [], locationIds: [locationId], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_section_delete") {
      const locationId = this.sectionLocations.get(command.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      this.sectionLocations.delete(command.sectionId)
      return { kind: command.kind, characterIds: [], locationIds: [locationId], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_link_create") {
      const locationId = this.sectionLocations.get(command.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      const linkId = `link-${command.context.commandId}`
      this.linkSections.set(linkId, { sectionId: command.sectionId, targetLocationId: command.targetLocationId })
      return { kind: command.kind, characterIds: [], locationIds: [locationId, command.targetLocationId], sceneIds: [], details: { linkId } }
    }

    if (command.kind === "world.location_link_update") {
      const link = this.linkSections.get(command.linkId)
      if (!link) throw new EngineCommandError("world.link_not_found", "Location link was not found")
      const locationId = this.sectionLocations.get(link.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      this.linkSections.set(command.linkId, { ...link, targetLocationId: command.targetLocationId })
      return { kind: command.kind, characterIds: [], locationIds: [locationId, command.targetLocationId], sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.location_link_delete") {
      const link = this.linkSections.get(command.linkId)
      if (!link) throw new EngineCommandError("world.link_not_found", "Location link was not found")
      const locationId = this.sectionLocations.get(link.sectionId)
      this.linkSections.delete(command.linkId)
      return { kind: command.kind, characterIds: [], locationIds: [locationId || "", link.targetLocationId].filter(Boolean), sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.npc_habitat_set") {
      const key = `${command.npcCharacterId}:${command.locationId}`
      if (command.attached) this.npcHabitats.add(key); else this.npcHabitats.delete(key)
      return { kind: command.kind, characterIds: [command.npcCharacterId], locationIds: [command.locationId], sceneIds: [], details: { attached: command.attached } }
    }

    throw new EngineCommandError("world.unsupported_command", `Unsupported Larisa command: ${command satisfies never}`)
  }
}
