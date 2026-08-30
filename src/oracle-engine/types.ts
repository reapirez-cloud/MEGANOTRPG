import type { EngineCommandContext, EngineCommandResult } from "../engine-contracts/index.ts"
import type {
  CharacterEntityInput,
  CharacterTemplateAssignmentInput,
  EntityLifeState,
  EntityMutation,
  EntityVisibilityMode,
} from "../entity-engine/index.ts"
import type { InventoryMutation } from "../inventory-engine/index.ts"
import type { WorldMutation } from "../location-engine/index.ts"
import type {
  ChasovoyCreateInput,
  ChasovoyMutation,
  ChasovoyRevisionInput,
} from "../reference-engine/index.ts"
import type { EquipmentSlot, InventoryInput } from "../types/characterSheet.ts"
import type { DayPeriod } from "../world-state/types.ts"

/** Oracle is the GM's imperative control plane. Every method targets one explicit owner directly. */
export type OracleContext = EngineCommandContext

export type OracleEntityResult = Promise<EngineCommandResult<EntityMutation>>
export type OracleInventoryResult = Promise<EngineCommandResult<InventoryMutation>>
export type OracleWorldResult = Promise<EngineCommandResult<WorldMutation>>
export type OracleDefinitionResult = Promise<EngineCommandResult<ChasovoyMutation>>

export type OracleCharacterCommands = {
  create(context: OracleContext, input: CharacterEntityInput): OracleEntityResult
  update(context: OracleContext, characterId: string, input: CharacterEntityInput): OracleEntityResult
  delete(context: OracleContext, characterId: string): OracleEntityResult
  setActive(context: OracleContext, userId: string, characterId: string | null): OracleEntityResult
  setLifeState(context: OracleContext, characterId: string, lifeState: EntityLifeState): OracleEntityResult
  setVisibility(context: OracleContext, characterId: string, visibilityMode: EntityVisibilityMode): OracleEntityResult
  revealNpc(context: OracleContext, viewerCharacterId: string, npcCharacterId: string, discovered?: boolean): OracleEntityResult
  setHp(context: OracleContext, characterId: string, currentHp: number, options?: { maxHp?: number; tempHp?: number }): OracleEntityResult
  assignTemplate(context: OracleContext, characterId: string, input: CharacterTemplateAssignmentInput): OracleEntityResult
  removeTemplateAssignment(context: OracleContext, characterId: string, assignmentId: string): OracleEntityResult
  setSourceSuppressed(context: OracleContext, characterId: string, sourceId: string, suppressed: boolean): OracleEntityResult
}

export type OracleInventoryCommands = {
  create(context: OracleContext, characterId: string, input: InventoryInput): OracleInventoryResult
  update(context: OracleContext, characterId: string, itemId: string, input: InventoryInput): OracleInventoryResult
  remove(context: OracleContext, characterId: string, itemId: string): OracleInventoryResult
  setEquipped(context: OracleContext, characterId: string, itemId: string, equipped: boolean, equipmentSlot?: EquipmentSlot | null): OracleInventoryResult
  consume(context: OracleContext, characterId: string, itemId: string, amount?: number): OracleInventoryResult
  transfer(context: OracleContext, fromCharacterId: string, toCharacterId: string, itemId: string, amount: number): OracleInventoryResult
}

export type OracleWorldCommands = {
  discoverLocation(context: OracleContext, characterId: string, locationId: string, discovered?: boolean): OracleWorldResult
  moveCharacter(context: OracleContext, characterId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod): OracleWorldResult
  setScenePosition(context: OracleContext, roomId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod): OracleWorldResult
  setSceneParticipants(context: OracleContext, roomId: string, characterIds: string[]): OracleWorldResult
  syncSceneParticipants(context: OracleContext, roomId: string, options: { syncLocation: boolean; syncTime: boolean }): OracleWorldResult
}

export type OracleDefinitionCommands = {
  create(context: OracleContext, input: ChasovoyCreateInput): OracleDefinitionResult
  revise(context: OracleContext, definitionId: string, input: ChasovoyRevisionInput): OracleDefinitionResult
  archive(context: OracleContext, definitionId: string): OracleDefinitionResult
}
