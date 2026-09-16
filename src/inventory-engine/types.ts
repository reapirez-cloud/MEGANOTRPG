import type { CharacterContribution } from "../character-engine/index.ts"
import type { InventoryPlacementTarget } from "./spatial.ts"
import type { EngineCommandContext } from "../engine-contracts/index.ts"
import type {
  EquipmentSlot,
  InventoryInput,
  InventoryItem,
} from "../types/characterSheet.ts"

export type CheburashkaCommand =
  | {
      kind: "inventory.create"
      context: EngineCommandContext
      characterId: string
      input: InventoryInput
    }
  | {
      kind: "inventory.update"
      context: EngineCommandContext
      characterId: string
      itemId: string
      input: InventoryInput
      expectedVersion?: number
    }
  | {
      kind: "inventory.remove"
      context: EngineCommandContext
      characterId: string
      itemId: string
      expectedVersion?: number
    }
  | {
      kind: "inventory.set_equipped"
      context: EngineCommandContext
      characterId: string
      itemId: string
      equipped: boolean
      equipmentSlot: EquipmentSlot | null
      expectedVersion?: number
    }
  | {
      kind: "inventory.consume"
      context: EngineCommandContext
      characterId: string
      itemId: string
      amount: number
      expectedVersion?: number
    }
  | {
      kind: "inventory.move"
      context: EngineCommandContext
      characterId: string
      itemId: string
      holderItemId: string | null
      placement?: InventoryPlacementTarget
      expectedVersion?: number
    }
  | {
      kind: "inventory.transfer"
      context: EngineCommandContext
      fromCharacterId: string
      toCharacterId: string
      itemId: string
      amount: number
      expectedVersion?: number
    }
  | {
      kind: "inventory.store_world"
      context: EngineCommandContext
      characterId: string
      itemId: string
      worldStorageId: string
      amount: number
      placement: Extract<InventoryPlacementTarget, { kind: "grid" }>
      expectedVersion?: number
    }
  | {
      kind: "inventory.take_world"
      context: EngineCommandContext
      worldStorageId: string
      itemId: string
      characterId: string
      amount: number
      placement: InventoryPlacementTarget
      expectedVersion?: number
    }
  | {
      kind: "inventory.create_surface"
      context: EngineCommandContext
      surfaceId: string
      input: InventoryInput
    }
  | {
      kind: "inventory.place_surface"
      context: EngineCommandContext
      characterId: string
      itemId: string
      surfaceId: string
      amount: number
      expectedVersion?: number
    }
  | {
      kind: "inventory.take_surface"
      context: EngineCommandContext
      surfaceId: string
      itemId: string
      characterId: string
      amount: number
      placement: InventoryPlacementTarget
      expectedVersion?: number
    }

export type InventoryItemChange = {
  before: InventoryItem
  after: InventoryItem
}

export type InventoryMutation = {
  kind: CheburashkaCommand["kind"]
  itemId: string
  affectedCharacterIds: string[]
  affectedWorldStorageIds?: string[]
  affectedSurfaceIds?: string[]
  affectedSceneIds?: string[]
  affectedLocationIds?: string[]
  before: InventoryItem | null
  after: InventoryItem | null
  destinationItem?: InventoryItem | null
  relatedChanges?: InventoryItemChange[]
}

export type InventoryLoadProjection = {
  characterId: string
  /** Sum of all character-owned items whose per-unit kg mass is known, including nested contents. */
  knownWeightKg: number
  /** Unknown mass is explicit; it is never silently treated as zero. */
  unknownWeightItemIds: string[]
  complete: boolean
}

export type InventoryMechanicalProjection = {
  characterId: string
  /** Debug/invalidation fingerprint only; not canonical inventory state. */
  revision: string
  activeItemIds: string[]
  contributions: CharacterContribution[]
  load: InventoryLoadProjection
}

export interface CheburashkaStorage {
  listCharacterItems(characterId: string): Promise<InventoryItem[]>
  listWorldStorageItems(worldStorageId: string): Promise<InventoryItem[]>
  listSurfaceItems(surfaceId: string): Promise<InventoryItem[]>
  getItem(itemId: string): Promise<InventoryItem | null>
  execute(command: CheburashkaCommand): Promise<InventoryMutation>
}