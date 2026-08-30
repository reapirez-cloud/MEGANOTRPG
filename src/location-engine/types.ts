import type { EngineCommandContext } from "../engine-contracts/index.ts"
import type {
  CharacterWorldState,
  DayPeriod,
  LocationSummary,
  SceneWorldState,
} from "../world-state/types.ts"

export type SceneParticipant = { room_id: string; character_id: string }

export type LarisaSnapshot = {
  characterStates: CharacterWorldState[]
  locations: LocationSummary[]
  scenes: SceneWorldState[]
  sceneParticipants: SceneParticipant[]
}

export type LarisaCommand =
  | { kind: "world.discover_location"; context: EngineCommandContext; characterId: string; locationId: string; discovered: boolean }
  | { kind: "world.set_character_position"; context: EngineCommandContext; characterId: string; locationId: string | null; campaignDay: number; dayPeriod: DayPeriod }
  | { kind: "world.set_scene_position"; context: EngineCommandContext; roomId: string; locationId: string | null; campaignDay: number; dayPeriod: DayPeriod }
  | { kind: "world.set_scene_participants"; context: EngineCommandContext; roomId: string; characterIds: string[] }
  | { kind: "world.sync_scene_participants"; context: EngineCommandContext; roomId: string; syncLocation: boolean; syncTime: boolean }

export type WorldMutation = {
  kind: LarisaCommand["kind"]
  characterIds: string[]
  locationIds: string[]
  sceneIds: string[]
  details: Record<string, unknown>
}

export interface LarisaStorage {
  loadCampaignSnapshot(campaignId: string): Promise<LarisaSnapshot>
  execute(command: LarisaCommand): Promise<WorldMutation>
}

