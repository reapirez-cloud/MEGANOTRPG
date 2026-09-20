import { EngineCommandError, type EngineCommandContext } from "../engine-contracts/index.ts"
import type { ShapoklyakEngine } from "../entity-engine/index.ts"
import type { CheburashkaEngine } from "../inventory-engine/index.ts"
import type { LarisaEngine } from "../location-engine/index.ts"
import type { ChasovoyEngine } from "../reference-engine/index.ts"
import type { CampaignAdministrationGateway } from "./campaignAdmin.ts"
import type {
  OracleCampaignCommands,
  OracleCharacterCommands,
  OracleDefinitionCommands,
  OracleInventoryCommands,
  OracleWorldCommands,
} from "./types.ts"

export type OracleDependencies = {
  shapoklyak: Pick<ShapoklyakEngine, "execute">
  cheburashka: Pick<CheburashkaEngine, "execute">
  larisa: Pick<LarisaEngine, "execute">
  chasovoy: Pick<ChasovoyEngine, "execute">
  campaignAdmin: CampaignAdministrationGateway
}

function assertOracleAuthority(context: EngineCommandContext): void {
  if (context.authority !== "gm" && context.authority !== "system") {
    throw new EngineCommandError("oracle.gm_required", "Oracle only accepts GM or system authority")
  }
}

/** Oracle is the GM's hands. It stores nothing and never routes through Gena. */
export class OracleEngine {
  readonly campaign: OracleCampaignCommands
  readonly characters: OracleCharacterCommands
  readonly inventory: OracleInventoryCommands
  readonly world: OracleWorldCommands
  readonly definitions: OracleDefinitionCommands

  constructor(dependencies: OracleDependencies) {
    const direct = <T>(context: EngineCommandContext, action: () => T): T => {
      assertOracleAuthority(context)
      return action()
    }

    this.campaign = {
      setMemberRole: (context, userId, role) => direct(
        context,
        () => dependencies.campaignAdmin.setMemberRole(context.campaignId, userId, role),
      ),
      removeMember: (context, userId) => direct(
        context,
        () => dependencies.campaignAdmin.removeMember(context.campaignId, userId),
      ),
      createInvite: (context, input) => direct(
        context,
        () => dependencies.campaignAdmin.createInvite(context.campaignId, input),
      ),
      revokeInvite: (context, code) => direct(
        context,
        () => dependencies.campaignAdmin.revokeInvite(context.campaignId, code),
      ),
    }

    this.characters = {
      create: (context, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create", context, input })),
      update: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update", context, characterId, input })),
      convertType: (context, characterId, characterType, npcVisibilityMode) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.convert_type", context, characterId, characterType, ...(npcVisibilityMode ? { npcVisibilityMode } : {}) })),
      delete: (context, characterId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete", context, characterId })),
      setActive: (context, userId, characterId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_active", context, userId, characterId })),
      setAvatar: (context, characterId, avatarUrl) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_avatar", context, characterId, avatarUrl })),
      setLifeState: (context, characterId, lifeState) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_life_state", context, characterId, lifeState })),
      setPublicationState: (context, characterId, publicationState, visibilityMode) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_publication_state", context, characterId, publicationState, ...(visibilityMode ? { visibilityMode } : {}) })),
      setVisibility: (context, characterId, visibilityMode) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_visibility", context, characterId, visibilityMode })),
      revealNpc: (context, viewerCharacterId, npcCharacterId, discovered = true) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.reveal_npc", context, viewerCharacterId, npcCharacterId, discovered })),
      setHp: (context, characterId, currentHp, options = {}) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.set_hp", context, characterId, currentHp,
        ...(options.maxHp !== undefined ? { maxHp: options.maxHp } : {}),
        ...(options.tempHp !== undefined ? { tempHp: options.tempHp } : {}),
      })),
      updateSheet: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_sheet", context, characterId, input })),
      setSpellcastingEnabled: (context, characterId, enabled) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_spellcasting_enabled", context, characterId, enabled })),
      createSpell: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create_spell", context, characterId, input })),
      updateSpell: (context, characterId, spellId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_spell", context, characterId, spellId, input })),
      deleteSpell: (context, characterId, spellId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete_spell", context, characterId, spellId })),
      createSpellOption: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create_spell_option", context, characterId, input })),
      updateSpellOption: (context, characterId, optionId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_spell_option", context, characterId, optionId, input })),
      deleteSpellOption: (context, characterId, optionId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete_spell_option", context, characterId, optionId })),
      learnSpell: (context, characterId, optionId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.learn_spell", context, characterId, optionId })),
      setSpellPrepared: (context, characterId, spellId, prepared) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_spell_prepared", context, characterId, spellId, prepared })),
      createFeature: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create_feature", context, characterId, input })),
      updateFeature: (context, characterId, featureId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_feature", context, characterId, featureId, input })),
      deleteFeature: (context, characterId, featureId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete_feature", context, characterId, featureId })),
      syncResources: (context, characterId, resources) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.sync_resources", context, characterId, resources })),
      recover: (context, characterId, trigger) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.recover_resources", context, characterId, trigger })),
      assignTemplate: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.assign_template", context, characterId, input })),
      removeTemplateAssignment: (context, characterId, assignmentId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.remove_template_assignment", context, characterId, assignmentId })),
      setSourceSuppressed: (context, characterId, sourceId, suppressed) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_source_suppressed", context, characterId, sourceId, suppressed })),
    }

    this.inventory = {
      create: (context, characterId, input, inventoryProfile) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.create", context, characterId, input, inventoryProfile })),
      update: (context, characterId, itemId, input, expectedVersion, inventoryProfile) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.update", context, characterId, itemId, input, expectedVersion, inventoryProfile })),
      remove: (context, characterId, itemId, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.remove", context, characterId, itemId, expectedVersion })),
      setEquipped: (context, characterId, itemId, equipped, equipmentSlot = null, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.set_equipped", context, characterId, itemId, equipped, equipmentSlot, expectedVersion })),
      consume: (context, characterId, itemId, amount = 1, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.consume", context, characterId, itemId, amount, expectedVersion })),
      move: (context, characterId, itemId, holderItemId, expectedVersion, placement) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.move", context, characterId, itemId, holderItemId, expectedVersion, ...(placement ? { placement } : {}) })),
      transfer: (context, fromCharacterId, toCharacterId, itemId, amount, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.transfer", context, fromCharacterId, toCharacterId, itemId, amount, expectedVersion })),
      storeWorld: (context, characterId, itemId, worldStorageId, amount, placement, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.store_world", context, characterId, itemId, worldStorageId, amount, placement, expectedVersion })),
      takeWorld: (context, worldStorageId, itemId, characterId, amount, placement, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.take_world", context, worldStorageId, itemId, characterId, amount, placement, expectedVersion })),
      createSurface: (context, surfaceId, input, inventoryProfile) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.create_surface", context, surfaceId, input, inventoryProfile })),
      placeSurface: (context, characterId, itemId, surfaceId, amount, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.place_surface", context, characterId, itemId, surfaceId, amount, expectedVersion })),
      takeSurface: (context, surfaceId, itemId, characterId, amount, placement, expectedVersion) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.take_surface", context, surfaceId, itemId, characterId, amount, placement, expectedVersion })),
    }

    this.world = {
      createScene: (context, input) => direct(context, () => dependencies.larisa.execute({ kind: "world.scene_create", context, input })),
      moveCharacterToScene: (context, characterId, roomId, options = {}) => direct(context, () => dependencies.larisa.execute({
        kind: "world.scene_move_character",
        context,
        characterId,
        roomId,
        syncLocation: options.syncLocation ?? true,
        syncTime: options.syncTime ?? true,
      })),
      discoverLocation: (context, characterId, locationId, discovered = true) => direct(context, () => dependencies.larisa.execute({ kind: "world.discover_location", context, characterId, locationId, discovered })),
      moveCharacter: (context, characterId, locationId, campaignDay, dayPeriod) => direct(context, () => dependencies.larisa.execute({ kind: "world.set_character_position", context, characterId, locationId, campaignDay, dayPeriod })),
      setScenePosition: (context, roomId, locationId, campaignDay, dayPeriod) => direct(context, () => dependencies.larisa.execute({ kind: "world.set_scene_position", context, roomId, locationId, campaignDay, dayPeriod })),
      setSceneParticipants: (context, roomId, characterIds) => direct(context, () => dependencies.larisa.execute({ kind: "world.set_scene_participants", context, roomId, characterIds })),
      syncSceneParticipants: (context, roomId, options) => direct(context, () => dependencies.larisa.execute({ kind: "world.sync_scene_participants", context, roomId, syncLocation: options.syncLocation, syncTime: options.syncTime })),
      createLocation: (context, input) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_create", context, input })),
      updateLocation: (context, locationId, input) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_update", context, locationId, input })),
      setLocationVisibility: (context, locationId, visibilityMode) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_set_visibility", context, locationId, visibilityMode })),
      setLocationArchived: (context, locationId, archived) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_set_archived", context, locationId, archived })),
      deleteLocation: (context, locationId) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_delete", context, locationId })),
      publishLocationEvent: (context, locationId, event) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_publish_event", context, locationId, event })),
      publishCampaignAnnouncement: (context, title, body) => direct(context, () => dependencies.larisa.execute({ kind: "world.campaign_announcement_publish", context, title, body })),
      createLocationSection: (context, locationId, title, body) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_section_create", context, locationId, title, body })),
      updateLocationSection: (context, sectionId, title, body) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_section_update", context, sectionId, title, body })),
      deleteLocationSection: (context, sectionId) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_section_delete", context, sectionId })),
      createLocationLink: (context, sectionId, targetLocationId, label, visibilityMode) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_link_create", context, sectionId, targetLocationId, label, visibilityMode })),
      updateLocationLink: (context, linkId, targetLocationId, label, visibilityMode) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_link_update", context, linkId, targetLocationId, label, ...(visibilityMode !== undefined ? { visibilityMode } : {}) })),
      deleteLocationLink: (context, linkId) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_link_delete", context, linkId })),
      setNpcHabitat: (context, npcCharacterId, locationId, attached) => direct(context, () => dependencies.larisa.execute({ kind: "world.npc_habitat_set", context, npcCharacterId, locationId, attached })),
      createStorage: (context, input) => direct(context, () => dependencies.larisa.execute({ kind: "world.storage_create", context, input })),
      updateStorage: (context, worldStorageId, input, expectedVersion) => direct(context, () => dependencies.larisa.execute({ kind: "world.storage_update", context, worldStorageId, input, expectedVersion })),
      moveStorage: (context, worldStorageId, locationId, expectedVersion) => direct(context, () => dependencies.larisa.execute({ kind: "world.storage_move", context, worldStorageId, locationId, expectedVersion })),
      setStorageArchived: (context, worldStorageId, archived, expectedVersion) => direct(context, () => dependencies.larisa.execute({ kind: "world.storage_set_archived", context, worldStorageId, archived, expectedVersion })),
      createSurface: (context, input) => direct(context, () => dependencies.larisa.execute({ kind: "world.surface_create", context, input })),
      updateSurface: (context, surfaceId, input, expectedVersion) => direct(context, () => dependencies.larisa.execute({ kind: "world.surface_update", context, surfaceId, input, expectedVersion })),
      setSurfaceArchived: (context, surfaceId, archived, expectedVersion) => direct(context, () => dependencies.larisa.execute({ kind: "world.surface_set_archived", context, surfaceId, archived, expectedVersion })),
    }

    this.definitions = {
      create: (context, input) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.create", context, input })),
      revise: (context, definitionId, input) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.revise", context, definitionId, input })),
      publishDraft: (context, definitionId) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.publish_draft", context, definitionId })),
      archive: (context, definitionId) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.archive", context, definitionId })),
      setStatus: (context, definitionId, status) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.set_status", context, definitionId, status })),
    }
  }
}