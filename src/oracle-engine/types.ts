import type { EngineCommandContext, EngineCommandResult } from "../engine-contracts/index.ts"
import type {
  CharacterEntityInput,
  CharacterSheetPatch,
  CharacterTemplateAssignmentInput,
  EntityKind,
  EntityLifeState,
  EntityPublicationState,
  EntityMutation,
  EntityRecoveryTrigger,
  EntityVisibilityMode,
} from "../entity-engine/index.ts"
import type { InventoryMutation, InventoryPlacementTarget } from "../inventory-engine/index.ts"
import type { InventoryPhysicalProfile } from "../inventory-engine/profile.ts"
import type {
  GameSceneCreateInput,
  LocationCreateInput,
  LocationUpdateInput,
  SceneSurfaceCreateInput,
  SceneSurfaceUpdateInput,
  WorldMutation,
  WorldStorageCreateInput,
  WorldStorageUpdateInput,
} from "../location-engine/index.ts"
import type {
  ChasovoyCreateInput,
  ChasovoyMutation,
  ChasovoyRevisionInput,
} from "../reference-engine/index.ts"
import type { ResourceSyncInput } from "../types/characterResources.ts"
import type { EquipmentSlot, FeatureInput, InventoryInput, SpellInput } from "../types/characterSheet.ts"
import type { DayPeriod } from "../world-state/types.ts"

/** Oracle is the GM's imperative control plane. Every method targets one explicit owner directly. */
export type OracleContext = EngineCommandContext

export type OracleCampaignCommands = {
  setMemberRole(context: OracleContext, userId: string, role: "gm" | "player"): Promise<void>
  removeMember(context: OracleContext, userId: string): Promise<void>
  createInvite(context: OracleContext, input: { maxUses: number; expiresDays: number }): Promise<string>
  revokeInvite(context: OracleContext, code: string): Promise<void>
}

export type OracleEntityResult = Promise<EngineCommandResult<EntityMutation>>
export type OracleInventoryResult = Promise<EngineCommandResult<InventoryMutation>>
export type OracleWorldResult = Promise<EngineCommandResult<WorldMutation>>
export type OracleDefinitionResult = Promise<EngineCommandResult<ChasovoyMutation>>

export type OracleCharacterCommands = {
  create(context: OracleContext, input: CharacterEntityInput): OracleEntityResult
  update(context: OracleContext, characterId: string, input: CharacterEntityInput): OracleEntityResult
  convertType(context: OracleContext, characterId: string, characterType: EntityKind, npcVisibilityMode?: "always" | "discover"): OracleEntityResult
  delete(context: OracleContext, characterId: string): OracleEntityResult
  setActive(context: OracleContext, userId: string, characterId: string | null): OracleEntityResult
  setAvatar(context: OracleContext, characterId: string, avatarUrl: string | null): OracleEntityResult
  setLifeState(context: OracleContext, characterId: string, lifeState: EntityLifeState): OracleEntityResult
  setPublicationState(context: OracleContext, characterId: string, publicationState: EntityPublicationState, visibilityMode?: EntityVisibilityMode): OracleEntityResult
  setVisibility(context: OracleContext, characterId: string, visibilityMode: EntityVisibilityMode): OracleEntityResult
  revealNpc(context: OracleContext, viewerCharacterId: string, npcCharacterId: string, discovered?: boolean): OracleEntityResult
  setHp(context: OracleContext, characterId: string, currentHp: number, options?: { maxHp?: number; tempHp?: number }): OracleEntityResult
  updateSheet(context: OracleContext, characterId: string, input: CharacterSheetPatch): OracleEntityResult
  setSpellcastingEnabled(context: OracleContext, characterId: string, enabled: boolean): OracleEntityResult
  createSpell(context: OracleContext, characterId: string, input: SpellInput): OracleEntityResult
  updateSpell(context: OracleContext, characterId: string, spellId: string, input: SpellInput): OracleEntityResult
  deleteSpell(context: OracleContext, characterId: string, spellId: string): OracleEntityResult
  createSpellOption(context: OracleContext, characterId: string, input: SpellInput): OracleEntityResult
  updateSpellOption(context: OracleContext, characterId: string, optionId: string, input: SpellInput): OracleEntityResult
  deleteSpellOption(context: OracleContext, characterId: string, optionId: string): OracleEntityResult
  learnSpell(context: OracleContext, characterId: string, optionId: string): OracleEntityResult
  setSpellPrepared(context: OracleContext, characterId: string, spellId: string, prepared: boolean): OracleEntityResult
  createFeature(context: OracleContext, characterId: string, input: FeatureInput): OracleEntityResult
  updateFeature(context: OracleContext, characterId: string, featureId: string, input: FeatureInput): OracleEntityResult
  deleteFeature(context: OracleContext, characterId: string, featureId: string): OracleEntityResult
  syncResources(context: OracleContext, characterId: string, resources: ResourceSyncInput[]): OracleEntityResult
  recover(context: OracleContext, characterId: string, trigger: EntityRecoveryTrigger): OracleEntityResult
  assignTemplate(context: OracleContext, characterId: string, input: CharacterTemplateAssignmentInput): OracleEntityResult
  removeTemplateAssignment(context: OracleContext, characterId: string, assignmentId: string): OracleEntityResult
  setSourceSuppressed(context: OracleContext, characterId: string, sourceId: string, suppressed: boolean): OracleEntityResult
}

export type OracleInventoryCommands = {
  create(context: OracleContext, characterId: string, input: InventoryInput, inventoryProfile?: InventoryPhysicalProfile | null): OracleInventoryResult
  update(context: OracleContext, characterId: string, itemId: string, input: InventoryInput, expectedVersion?: number, inventoryProfile?: InventoryPhysicalProfile | null): OracleInventoryResult
  remove(context: OracleContext, characterId: string, itemId: string, expectedVersion?: number): OracleInventoryResult
  setEquipped(context: OracleContext, characterId: string, itemId: string, equipped: boolean, equipmentSlot?: EquipmentSlot | null, expectedVersion?: number): OracleInventoryResult
  consume(context: OracleContext, characterId: string, itemId: string, amount?: number, expectedVersion?: number): OracleInventoryResult
  move(context: OracleContext, characterId: string, itemId: string, holderItemId: string | null, expectedVersion?: number, placement?: InventoryPlacementTarget): OracleInventoryResult
  transfer(context: OracleContext, fromCharacterId: string, toCharacterId: string, itemId: string, amount: number, expectedVersion?: number): OracleInventoryResult
  storeWorld(context: OracleContext, characterId: string, itemId: string, worldStorageId: string, amount: number, placement: Extract<InventoryPlacementTarget, { kind: "grid" }>, expectedVersion?: number): OracleInventoryResult
  takeWorld(context: OracleContext, worldStorageId: string, itemId: string, characterId: string, amount: number, placement: InventoryPlacementTarget, expectedVersion?: number): OracleInventoryResult
  createSurface(context: OracleContext, surfaceId: string, input: InventoryInput, inventoryProfile?: InventoryPhysicalProfile | null): OracleInventoryResult
  placeSurface(context: OracleContext, characterId: string, itemId: string, surfaceId: string, amount: number, expectedVersion?: number): OracleInventoryResult
  takeSurface(context: OracleContext, surfaceId: string, itemId: string, characterId: string, amount: number, placement: InventoryPlacementTarget, expectedVersion?: number): OracleInventoryResult
}

export type OracleWorldCommands = {
  discoverLocation(context: OracleContext, characterId: string, locationId: string, discovered?: boolean): OracleWorldResult
  moveCharacter(context: OracleContext, characterId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod): OracleWorldResult
  createScene(context: OracleContext, input: GameSceneCreateInput): OracleWorldResult
  moveCharacterToScene(context: OracleContext, characterId: string, roomId: string | null, options?: { syncLocation?: boolean; syncTime?: boolean }): OracleWorldResult
  setScenePosition(context: OracleContext, roomId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod): OracleWorldResult
  setSceneParticipants(context: OracleContext, roomId: string, characterIds: string[]): OracleWorldResult
  syncSceneParticipants(context: OracleContext, roomId: string, options: { syncLocation: boolean; syncTime: boolean }): OracleWorldResult
  createLocation(context: OracleContext, input: LocationCreateInput): OracleWorldResult
  updateLocation(context: OracleContext, locationId: string, input: LocationUpdateInput): OracleWorldResult
  setLocationVisibility(context: OracleContext, locationId: string, visibilityMode: LocationCreateInput["visibilityMode"]): OracleWorldResult
  setLocationArchived(context: OracleContext, locationId: string, archived: boolean): OracleWorldResult
  deleteLocation(context: OracleContext, locationId: string): OracleWorldResult
  publishLocationEvent(context: OracleContext, locationId: string, event: "opened" | "updated" | "destroyed"): OracleWorldResult
  publishCampaignAnnouncement(context: OracleContext, title: string, body: string): OracleWorldResult
  createLocationSection(context: OracleContext, locationId: string, title: string, body: string): OracleWorldResult
  updateLocationSection(context: OracleContext, sectionId: string, title: string, body: string): OracleWorldResult
  deleteLocationSection(context: OracleContext, sectionId: string): OracleWorldResult
  createLocationLink(context: OracleContext, sectionId: string, targetLocationId: string, label: string, visibilityMode: LocationCreateInput["visibilityMode"]): OracleWorldResult
  updateLocationLink(context: OracleContext, linkId: string, targetLocationId: string, label: string, visibilityMode?: LocationCreateInput["visibilityMode"]): OracleWorldResult
  deleteLocationLink(context: OracleContext, linkId: string): OracleWorldResult
  setNpcHabitat(context: OracleContext, npcCharacterId: string, locationId: string, attached: boolean): OracleWorldResult
  createStorage(context: OracleContext, input: WorldStorageCreateInput): OracleWorldResult
  updateStorage(context: OracleContext, worldStorageId: string, input: WorldStorageUpdateInput, expectedVersion: number): OracleWorldResult
  moveStorage(context: OracleContext, worldStorageId: string, locationId: string, expectedVersion: number): OracleWorldResult
  setStorageArchived(context: OracleContext, worldStorageId: string, archived: boolean, expectedVersion: number): OracleWorldResult
  createSurface(context: OracleContext, input: SceneSurfaceCreateInput): OracleWorldResult
  updateSurface(context: OracleContext, surfaceId: string, input: SceneSurfaceUpdateInput, expectedVersion: number): OracleWorldResult
  setSurfaceArchived(context: OracleContext, surfaceId: string, archived: boolean, expectedVersion: number): OracleWorldResult
}

export type OracleDefinitionCommands = {
  create(context: OracleContext, input: ChasovoyCreateInput): OracleDefinitionResult
  revise(context: OracleContext, definitionId: string, input: ChasovoyRevisionInput): OracleDefinitionResult
  publishDraft(context: OracleContext, definitionId: string): OracleDefinitionResult
  archive(context: OracleContext, definitionId: string): OracleDefinitionResult
  setStatus(context: OracleContext, definitionId: string, status: "draft" | "active" | "archived"): OracleDefinitionResult
}