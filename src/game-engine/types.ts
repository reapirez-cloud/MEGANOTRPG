import type { EngineCommandContext, EngineCommandResult } from "../engine-contracts/index.ts"
import type { EntityMutation } from "../entity-engine/index.ts"
import type { InventoryMutation } from "../inventory-engine/index.ts"
import type { WorldMutation } from "../location-engine/index.ts"
import type { DayPeriod } from "../world-state/types.ts"
import type { RollExecutionResult, TobikRollRequest } from "../roll-engine/index.ts"

export type GenaCommand =
  | { kind: "session.declare"; context: EngineCommandContext; label: string; payload?: Record<string, unknown> }
  | { kind: "inventory.use"; context: EngineCommandContext; characterId: string; itemId: string; amount?: number; label: string }
  | { kind: "inventory.transfer"; context: EngineCommandContext; fromCharacterId: string; toCharacterId: string; itemId: string; amount: number }
  | { kind: "entity.reveal_npc"; context: EngineCommandContext; viewerCharacterId: string; npcCharacterId: string; discovered?: boolean }
  | { kind: "world.discover_location"; context: EngineCommandContext; characterId: string; locationId: string; discovered?: boolean }
  | { kind: "world.move_character"; context: EngineCommandContext; characterId: string; locationId: string | null; campaignDay: number; dayPeriod: DayPeriod }
  | { kind: "world.set_scene_position"; context: EngineCommandContext; roomId: string; locationId: string | null; campaignDay: number; dayPeriod: DayPeriod }
  | { kind: "world.set_scene_participants"; context: EngineCommandContext; roomId: string; characterIds: string[] }
  | { kind: "world.sync_scene_participants"; context: EngineCommandContext; roomId: string; syncLocation: boolean; syncTime: boolean }
  | { kind: "character.set_hp"; context: EngineCommandContext; characterId: string; currentHp: number; maxHp?: number; tempHp?: number }
  | { kind: "roll.request"; context: EngineCommandContext; label: string; request: TobikRollRequest }

export type GenaDelegatedValue =
  | { engine: "none"; declaration: { label: string; payload: Record<string, unknown> } }
  | { engine: "cheburashka"; mutation: InventoryMutation }
  | { engine: "shapoklyak"; mutation: EntityMutation }
  | { engine: "larisa"; mutation: WorldMutation }
  | { engine: "tobik"; result: RollExecutionResult }

export type GenaCommandResult = EngineCommandResult<GenaDelegatedValue>
