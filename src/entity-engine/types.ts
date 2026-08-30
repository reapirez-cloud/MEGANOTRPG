import type { EngineCommandContext } from "../engine-contracts/index.ts"

export type EntityKind = "pc" | "npc"
export type EntityVisibility = "campaign" | "private"
export type EntityVisibilityMode = "always" | "discover" | "private"
export type EntityLifeState = "alive" | "dead"

export type CharacterEntity = {
  id: string
  campaign_id: string
  assigned_user_id: string | null
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  character_type: EntityKind
  visibility: EntityVisibility
  visibility_mode?: EntityVisibilityMode
  life_state?: EntityLifeState
  died_at?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CharacterEntityInput = {
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  assigned_user_id: string | null
  character_type: EntityKind
  visibility: EntityVisibility
}

/** Concrete assignment of a Chasovoy definition to one character. */
export type CharacterTemplateAssignmentInput = {
  templateId: string
  templateLevel: number | null
  selectedChoices: Record<string, unknown>
}

export type ShapoklyakCommand =
  | { kind: "entity.create"; context: EngineCommandContext; input: CharacterEntityInput }
  | { kind: "entity.update"; context: EngineCommandContext; characterId: string; input: CharacterEntityInput }
  | { kind: "entity.delete"; context: EngineCommandContext; characterId: string }
  | { kind: "entity.set_active"; context: EngineCommandContext; userId: string; characterId: string | null }
  | { kind: "entity.set_life_state"; context: EngineCommandContext; characterId: string; lifeState: EntityLifeState }
  | { kind: "entity.set_visibility"; context: EngineCommandContext; characterId: string; visibilityMode: EntityVisibilityMode }
  | { kind: "entity.reveal_npc"; context: EngineCommandContext; viewerCharacterId: string; npcCharacterId: string; discovered: boolean }
  | { kind: "entity.set_hp"; context: EngineCommandContext; characterId: string; currentHp: number; maxHp?: number; tempHp?: number }
  | { kind: "entity.assign_template"; context: EngineCommandContext; characterId: string; input: CharacterTemplateAssignmentInput }
  | { kind: "entity.remove_template_assignment"; context: EngineCommandContext; characterId: string; assignmentId: string }

export type EntityMutation = {
  kind: ShapoklyakCommand["kind"]
  characterIds: string[]
  before?: CharacterEntity | null
  after?: CharacterEntity | null
  details?: Record<string, unknown>
  requiresResolution: boolean
}

export interface ShapoklyakStorage {
  listCampaignEntities(campaignId: string): Promise<CharacterEntity[]>
  getEntity(characterId: string): Promise<CharacterEntity | null>
  execute(command: ShapoklyakCommand): Promise<EntityMutation>
}
