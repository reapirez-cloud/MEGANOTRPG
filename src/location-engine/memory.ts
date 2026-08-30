import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterWorldState } from "../world-state/types.ts"
import type { LarisaCommand, LarisaSnapshot, LarisaStorage, SceneParticipant, WorldMutation } from "./types.ts"

function copy<T>(value: T): T { return structuredClone(value) }

export class MemoryLarisaStorage implements LarisaStorage {
  private snapshot: LarisaSnapshot
  private readonly discoveries = new Set<string>()

  constructor(initial: LarisaSnapshot = { characterStates: [], locations: [], scenes: [], sceneParticipants: [] }) {
    this.snapshot = copy(initial)
  }

  async loadCampaignSnapshot(): Promise<LarisaSnapshot> { return copy(this.snapshot) }

  async execute(command: LarisaCommand): Promise<WorldMutation> {
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
      const participants: SceneParticipant[] = command.characterIds.map((characterId) => ({ room_id: command.roomId, character_id: characterId }))
      this.snapshot.sceneParticipants = [...this.snapshot.sceneParticipants.filter((item) => item.room_id !== command.roomId), ...participants]
      return { kind: command.kind, characterIds: command.characterIds, locationIds: [], sceneIds: [command.roomId], details: { characterIds: command.characterIds } }
    }

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
}

