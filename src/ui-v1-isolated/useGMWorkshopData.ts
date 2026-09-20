import { useCallback, useEffect, useMemo, useState } from "react"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { deleteCampaignMediaObject, uploadCampaignFile } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"
import { chasovoy } from "../reference-engine/runtime.ts"
import {
  normalizeDefinitionSlug,
  type ChasovoyDefinition,
  type ChasovoyDefinitionKind,
  type ChasovoyJson,
} from "../reference-engine/index.ts"
import type { StoredMechanics } from "../types/characterMechanics"
import type { InventoryCategory, InventoryInput, SpellInput } from "../types/characterSheet"
import type {
  CharacterTemplateAssignment,
  RuleTemplate,
} from "../rule-templates/types.ts"

export type WorkshopSection = "review" | "members" | "characters" | "library" | "materials"

export type WorkshopCharacter = {
  id: string
  assignedUserId: string | null
  name: string
  characterClass: string
  level: number
  bio: string
  avatarUrl: string | null
  avatarStoragePath: string | null
  characterType: "pc" | "npc"
  visibilityMode: "always" | "discover" | "private"
  publicationState: "draft" | "campaign"
  lifeState: "alive" | "dead"
  diedAt: string | null
  createdAt: string
}

export type WorkshopMember = {
  userId: string
  displayName: string
  role: "gm" | "player"
  isOwner: boolean
  activeCharacterId: string | null
}

export type WorkshopFolder = {
  id: string
  parentId: string | null
  name: string
  sortOrder: number
}

export type WorkshopMaterial = {
  id: string
  folderId: string | null
  kind: "note" | "upload"
  title: string
  body: string
  fileUrl: string | null
  storagePath: string | null
  originalName: string | null
  mimeType: string | null
  updatedAt: string
}

export type WorkshopLocation = {
  id: string
  parentId: string | null
  name: string
  lifecycleState: "active" | "archived"
}

export type WorkshopNpcHabitat = {
  npcCharacterId: string
  locationId: string
}

export type WorkshopInvite = {
  code: string
  maxUses: number
  usesCount: number
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export type DraftDefinitionInput = {
  name: string
  summary?: string
  rulesText?: string
  data?: Record<string, ChasovoyJson>
  mechanics?: ChasovoyJson
}

export type WorkshopMutationResult = {
  ok: boolean
  error?: string
  refreshError?: string
}

export type WorkshopOperations = {
  refresh: () => Promise<void>
  createDraftCharacter: (
    type: "pc" | "npc",
    input: { name: string; classTemplateId?: string | null; level?: number; bio?: string },
  ) => Promise<WorkshopMutationResult & { id?: string }>
  updateCharacter: (
    characterId: string,
    input: { name: string; bio: string },
  ) => Promise<WorkshopMutationResult>
  convertCharacterType: (
    characterId: string,
    characterType: "pc" | "npc",
    npcVisibilityMode?: "always" | "discover",
  ) => Promise<WorkshopMutationResult>
  assignTemplate: (
    characterId: string,
    templateId: string,
    templateLevel: number | null,
  ) => Promise<WorkshopMutationResult>
  removeTemplateAssignment: (
    characterId: string,
    assignmentId: string,
  ) => Promise<WorkshopMutationResult>
  deleteCharacter: (characterId: string) => Promise<WorkshopMutationResult>
  publishCharacter: (
    characterId: string,
    visibilityMode?: "always" | "discover",
  ) => Promise<WorkshopMutationResult>
  returnCharacterToDraft: (characterId: string) => Promise<WorkshopMutationResult>
  setCharacterLifeState: (
    characterId: string,
    state: "alive" | "dead",
  ) => Promise<WorkshopMutationResult>
  setNpcVisibility: (
    characterId: string,
    mode: "always" | "discover",
  ) => Promise<WorkshopMutationResult>
  setNpcHabitat: (
    characterId: string,
    locationId: string,
    attached: boolean,
  ) => Promise<WorkshopMutationResult>
  assignCharacter: (
    characterId: string,
    userId: string | null,
  ) => Promise<WorkshopMutationResult>
  setActiveCharacter: (
    userId: string,
    characterId: string | null,
  ) => Promise<WorkshopMutationResult>
  setMemberRole: (
    userId: string,
    role: "gm" | "player",
  ) => Promise<WorkshopMutationResult>
  removeMember: (userId: string) => Promise<WorkshopMutationResult>
  createInvite: (
    maxUses?: number,
    expiresDays?: number,
  ) => Promise<WorkshopMutationResult & { code?: string }>
  revokeInvite: (code: string) => Promise<WorkshopMutationResult>
  createDraftDefinition: (
    kind: ChasovoyDefinitionKind,
    input: DraftDefinitionInput,
  ) => Promise<WorkshopMutationResult & { id?: string }>
  reviseDefinition: (
    definitionId: string,
    input: DraftDefinitionInput,
  ) => Promise<WorkshopMutationResult>
  publishDefinition: (definitionId: string) => Promise<WorkshopMutationResult>
  archiveDefinition: (definitionId: string) => Promise<WorkshopMutationResult>
  restoreDefinition: (definitionId: string) => Promise<WorkshopMutationResult>
  cloneDefinition: (
    definition: ChasovoyDefinition,
  ) => Promise<WorkshopMutationResult & { id?: string }>
  issueDefinition: (
    definition: ChasovoyDefinition,
    characterId: string,
    quantity?: number,
  ) => Promise<WorkshopMutationResult>
  linkDefinitionToItem: (
    definition: ChasovoyDefinition,
    itemDefinitionId: string,
  ) => Promise<WorkshopMutationResult>
  unlinkDefinitionFromItem: (
    definition: ChasovoyDefinition,
    itemDefinitionId: string,
  ) => Promise<WorkshopMutationResult>
  createNote: (
    title: string,
    body: string,
    folderId?: string | null,
  ) => Promise<WorkshopMutationResult>
  updateNote: (
    id: string,
    title: string,
    body: string,
  ) => Promise<WorkshopMutationResult>
  uploadMaterial: (
    file: File,
    folderId?: string | null,
  ) => Promise<WorkshopMutationResult>
  createFolder: (
    name: string,
    parentId?: string | null,
  ) => Promise<WorkshopMutationResult>
  renameFolder: (id: string, name: string) => Promise<WorkshopMutationResult>
  moveFolder: (
    id: string,
    parentId: string | null,
  ) => Promise<WorkshopMutationResult>
  moveMaterial: (
    id: string,
    folderId: string | null,
  ) => Promise<WorkshopMutationResult>
  renameMaterial: (id: string, title: string) => Promise<WorkshopMutationResult>
  reorderFolder: (
    id: string,
    direction: "up" | "down",
  ) => Promise<WorkshopMutationResult>
  deleteMaterial: (id: string) => Promise<WorkshopMutationResult>
  deleteFolder: (id: string) => Promise<WorkshopMutationResult>
}

type WorkshopState = {
  campaignId: string
  campaignTitle: string
  campaignCoverUrl: string | null
  userId: string
  canManage: boolean
  isOwner: boolean
  members: WorkshopMember[]
  characters: WorkshopCharacter[]
  definitions: ChasovoyDefinition[]
  templates: RuleTemplate[]
  templateAssignments: CharacterTemplateAssignment[]
  locations: WorkshopLocation[]
  npcHabitats: WorkshopNpcHabitat[]
  folders: WorkshopFolder[]
  materials: WorkshopMaterial[]
  invite: WorkshopInvite | null
  invites: WorkshopInvite[]
  loading: boolean
  error: string | null
}

const EMPTY_STATE: WorkshopState = {
  campaignId: "",
  campaignTitle: "",
  campaignCoverUrl: null,
  userId: "",
  canManage: false,
  isOwner: false,
  members: [],
  characters: [],
  definitions: [],
  templates: [],
  templateAssignments: [],
  locations: [],
  npcHabitats: [],
  folders: [],
  materials: [],
  invite: null,
  invites: [],
  loading: true,
  error: null,
}

function rememberedCampaignId() {
  return (
    window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
    window.localStorage.getItem("meganotrpg:campaign-id") ||
    ""
  )
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

function jsonString(data: Record<string, ChasovoyJson>, key: string, fallback = "") {
  const value = data[key]
  return typeof value === "string" ? value : fallback
}

function jsonNumber(data: Record<string, ChasovoyJson>, key: string, fallback = 0) {
  const value = data[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function jsonBoolean(data: Record<string, ChasovoyJson>, key: string, fallback = false) {
  const value = data[key]
  return typeof value === "boolean" ? value : fallback
}

const INVENTORY_CATEGORIES: InventoryCategory[] = [
  "equipment",
  "consumable",
  "tool",
  "book",
  "trinket",
  "quest",
  "material",
  "currency",
  "container",
  "other",
]

function definitionWeightKg(definition: ChasovoyDefinition): number | null {
  const rawProfile = definition.data.inventory_profile
  if (rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile)) {
    const weight = (rawProfile as Record<string, ChasovoyJson>).weight_per_unit
    if (typeof weight === "number" && Number.isFinite(weight) && weight >= 0) return weight
  }
  const legacyWeight = definition.data.weight
  return definition.data.weight_unit === "kg"
    && typeof legacyWeight === "number"
    && Number.isFinite(legacyWeight)
    && legacyWeight >= 0
    ? legacyWeight
    : null
}

type LinkedDefinitionRef = {
  id: string
  revision?: number | null
}

function linkedDefinitionRefs(definition: ChasovoyDefinition): LinkedDefinitionRef[] {
  const raw = definition.data.linked_definitions
  if (Array.isArray(raw)) {
    return raw.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return []
      const record = value as Record<string, ChasovoyJson>
      const id = typeof record.id === "string" ? record.id : ""
      const revision = typeof record.revision === "number" ? record.revision : null
      return id ? [{ id, revision }] : []
    })
  }

  const legacy = definition.data.linked_definition_ids
  return Array.isArray(legacy)
    ? legacy.flatMap((value) => typeof value === "string" ? [{ id: value, revision: null }] : [])
    : []
}

async function itemInput(
  definition: ChasovoyDefinition,
  quantityOverride?: number,
): Promise<InventoryInput> {
  const rawCategory = jsonString(definition.data, "category", "other")
  const category = INVENTORY_CATEGORIES.includes(rawCategory as InventoryCategory)
    ? rawCategory as InventoryCategory
    : "other"
  const ownMechanics = Array.isArray(definition.mechanics)
    ? definition.mechanics as unknown as StoredMechanics
    : []
  const refs = linkedDefinitionRefs(definition)
  const linkedMechanics: StoredMechanics = []

  for (const ref of refs) {
    const linked = await chasovoy.getDefinition({
      id: ref.id,
      revision: ref.revision ?? undefined,
    })
    if (!linked || linked.status === "archived") continue
    if (Array.isArray(linked.mechanics)) {
      linkedMechanics.push(...linked.mechanics as unknown as StoredMechanics)
    }
  }

  return {
    name: definition.name,
    quantity: Math.max(1, Math.floor(quantityOverride ?? jsonNumber(definition.data, "quantity", 1))),
    weight: definitionWeightKg(definition),
    equipped: false,
    category,
    equipment_slot: category === "equipment"
      ? (jsonString(definition.data, "equipment_slot") || null) as InventoryInput["equipment_slot"]
      : null,
    image_url: jsonString(definition.data, "image_url") || null,
    description: definition.rulesText || definition.summary,
    definition_id: definition.id,
    definition_revision: definition.revision,
    mechanics: [...ownMechanics, ...linkedMechanics],
    usage_mode: (jsonString(definition.data, "usage_mode", "none") || "none") as InventoryInput["usage_mode"],
    charges_current: typeof definition.data.charges_current === "number" ? definition.data.charges_current : null,
    charges_max: typeof definition.data.charges_max === "number" ? definition.data.charges_max : null,
    item_state: {
      source_definition_id: definition.id,
      source_definition_revision: definition.revision,
      linked_definition_refs: refs,
    },
  }
}

function spellInput(definition: ChasovoyDefinition): SpellInput {
  const level = Math.max(0, Math.min(9, jsonNumber(definition.data, "spell_level", 0)))
  return {
    name: definition.name,
    spell_level: level,
    school: jsonString(definition.data, "school", "Особая"),
    casting_time: jsonString(definition.data, "casting_time", "1 действие"),
    spell_range: jsonString(definition.data, "spell_range", "На себя"),
    duration: jsonString(definition.data, "duration", "Мгновенно"),
    components: jsonString(definition.data, "components", ""),
    concentration: jsonBoolean(definition.data, "concentration"),
    ritual: jsonBoolean(definition.data, "ritual"),
    prepared: false,
    cast_mode: level === 0 ? "cantrip" : "slot",
    slot_level: level === 0 ? null : level,
    description: definition.rulesText || definition.summary,
    source: "GM Library",
  }
}

export function useGMWorkshopData(
  enabled = true,
  focusedCharacterIdInput?: string | null,
) {
  const focusedCharacterId = focusedCharacterIdInput?.trim() || null
  const [state, setState] = useState<WorkshopState>(EMPTY_STATE)

  const load = useCallback(async () => {
    if (!enabled) return

    setState((current) => ({ ...current, loading: true, error: null }))

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      setState({ ...EMPTY_STATE, loading: false, error: authError?.message || "Сессия не найдена" })
      return
    }

    const userId = authData.user.id
    const { data: ownRows, error: ownError } = await supabase
      .from("campaign_members")
      .select("campaign_id, role, is_owner, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (ownError) {
      setState({ ...EMPTY_STATE, userId, loading: false, error: ownError.message })
      return
    }

    const remembered = rememberedCampaignId()
    const ownMembership =
      (ownRows || []).find((row) => row.campaign_id === remembered) ||
      ownRows?.[0] ||
      null

    if (!ownMembership) {
      setState({ ...EMPTY_STATE, userId, loading: false, error: "Кампания не найдена" })
      return
    }

    const campaignId = ownMembership.campaign_id
    const canManage = ownMembership.role === "gm" || ownMembership.is_owner === true
    window.localStorage.setItem("meganotrpg:v1:campaign-id", campaignId)

    if (!canManage) {
      setState({
        ...EMPTY_STATE,
        campaignId,
        userId,
        canManage: false,
        loading: false,
        error: "Мастерская доступна только GM или владельцу кампании.",
      })
      return
    }

    const emptyRows = { data: [], error: null } as const
    const emptySingle = { data: null, error: null } as const
    const characterQuery = supabase.from("characters")
      .select("id,assigned_user_id,name,character_class,level,bio,avatar_url,character_type,visibility_mode,publication_state,life_state,died_at,created_at")
      .eq("campaign_id", campaignId)
    const habitatQuery = supabase.from("location_npc_habitats")
      .select("npc_character_id,location_id")
      .eq("campaign_id", campaignId)

    const results = await Promise.all([
      focusedCharacterId
        ? Promise.resolve(emptySingle)
        : supabase.from("campaigns").select("title, cover_url").eq("id", campaignId).maybeSingle(),
      supabase.from("campaign_members").select("user_id, role, is_owner, active_character_id").eq("campaign_id", campaignId).order("created_at"),
      focusedCharacterId
        ? characterQuery.eq("id", focusedCharacterId).limit(1)
        : characterQuery.order("created_at"),
      focusedCharacterId
        ? Promise.resolve(emptyRows)
        : supabase.from("gm_workspace_folders")
            .select("id,parent_id,name,sort_order")
            .eq("campaign_id", campaignId)
            .eq("workspace_user_id", userId)
            .order("sort_order"),
      focusedCharacterId
        ? Promise.resolve(emptyRows)
        : supabase.from("gm_workspace_files")
            .select("id,folder_id,kind,title,body,file_url,original_name,mime_type,updated_at")
            .eq("campaign_id", campaignId)
            .eq("workspace_user_id", userId)
            .order("updated_at", { ascending: false }),
      focusedCharacterId
        ? Promise.resolve(emptyRows)
        : supabase.from("campaign_invites")
            .select("code,max_uses,uses_count,expires_at,revoked_at,created_at")
            .eq("campaign_id", campaignId)
            .order("created_at", { ascending: false })
            .limit(20),
      focusedCharacterId
        ? Promise.resolve([] as ChasovoyDefinition[])
        : chasovoy.listDefinitions({ scope: "campaign", campaignId }),
      supabase.from("rule_templates")
        .select("id,campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta,is_active,created_by,created_at,updated_at")
        .eq("campaign_id", campaignId)
        .in("kind", ["class", "subclass"])
        .order("kind")
        .order("name"),
      supabase.from("locations")
        .select("id,parent_location_id,name,lifecycle_state")
        .eq("campaign_id", campaignId)
        .order("sort_order"),
      focusedCharacterId
        ? habitatQuery.eq("npc_character_id", focusedCharacterId)
        : habitatQuery,
    ])

    const [
      campaignResult,
      membersResult,
      charactersResult,
      foldersResult,
      materialsResult,
      invitesResult,
      definitionsResult,
      templatesResult,
      locationsResult,
      habitatsResult,
    ] = results

    const firstError =
      campaignResult.error ||
      membersResult.error ||
      charactersResult.error ||
      foldersResult.error ||
      materialsResult.error ||
      invitesResult.error ||
      templatesResult.error ||
      locationsResult.error ||
      habitatsResult.error

    if (firstError) {
      setState({
        ...EMPTY_STATE,
        campaignId,
        userId,
        canManage,
        isOwner: ownMembership.is_owner === true,
        loading: false,
        error: firstError.message,
      })
      return
    }

    const characterIds = (charactersResult.data || []).map((character) => character.id)
    const assignmentsResult = characterIds.length
      ? await supabase.from("character_template_assignments")
          .select("id,character_id,template_id,template_level,selected_choices,assigned_at,updated_at")
          .in("character_id", characterIds)
      : { data: [], error: null }

    if (assignmentsResult.error) {
      setState({
        ...EMPTY_STATE,
        campaignId,
        userId,
        canManage,
        isOwner: ownMembership.is_owner === true,
        loading: false,
        error: assignmentsResult.error.message,
      })
      return
    }

    const memberRows = membersResult.data || []
    const memberIds = memberRows.map((row) => row.user_id)
    const { data: profiles, error: profileError } = memberIds.length
      ? await supabase.from("profiles").select("user_id,display_name").in("user_id", memberIds)
      : { data: [], error: null }

    if (profileError) {
      setState({
        ...EMPTY_STATE,
        campaignId,
        userId,
        canManage,
        isOwner: ownMembership.is_owner === true,
        loading: false,
        error: profileError.message,
      })
      return
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile.display_name]))
    const rawCharacters = charactersResult.data || []
    const characters: WorkshopCharacter[] = await Promise.all(
      rawCharacters.map(async (character) => ({
        id: character.id,
        assignedUserId: character.assigned_user_id,
        name: character.name,
        characterClass: character.character_class,
        level: character.level,
        bio: character.bio,
        avatarUrl:
          (await resolveCampaignMediaUrl(character.avatar_url)) ||
          character.avatar_url ||
          null,
        avatarStoragePath: character.avatar_url || null,
        characterType: character.character_type as "pc" | "npc",
        visibilityMode: (character.visibility_mode || "always") as WorkshopCharacter["visibilityMode"],
        publicationState: (character.publication_state || "campaign") as WorkshopCharacter["publicationState"],
        lifeState: (character.life_state || "alive") as WorkshopCharacter["lifeState"],
        diedAt: character.died_at,
        createdAt: character.created_at,
      })),
    )

    const now = Date.now()
    const inviteRows = invitesResult.data || []
    const activeInvite = inviteRows.find((item) => {
      const validDate = !item.expires_at || new Date(item.expires_at).getTime() > now
      return !item.revoked_at && validDate && item.uses_count < item.max_uses
    }) || null

    setState({
      campaignId,
      campaignTitle: campaignResult.data?.title || "Кампания",
      campaignCoverUrl:
        focusedCharacterId
          ? null
          : (await resolveCampaignMediaUrl(campaignResult.data?.cover_url || null)) ||
              campaignResult.data?.cover_url ||
              null,
      userId,
      canManage,
      isOwner: ownMembership.is_owner === true,
      members: memberRows.map((member) => ({
        userId: member.user_id,
        displayName: profileMap.get(member.user_id) || "Игрок",
        role: member.role === "gm" ? "gm" : "player",
        isOwner: Boolean(member.is_owner),
        activeCharacterId: member.active_character_id,
      })),
      characters,
      definitions: definitionsResult,
      templates: (templatesResult.data || []) as RuleTemplate[],
      templateAssignments: (assignmentsResult.data || []) as CharacterTemplateAssignment[],
      locations: (locationsResult.data || []).map((location) => ({
        id: location.id,
        parentId: location.parent_location_id,
        name: location.name,
        lifecycleState: location.lifecycle_state === "archived" ? "archived" : "active",
      })),
      npcHabitats: (habitatsResult.data || []).map((link) => ({
        npcCharacterId: link.npc_character_id,
        locationId: link.location_id,
      })),
      folders: (foldersResult.data || []).map((folder) => ({
        id: folder.id,
        parentId: folder.parent_id,
        name: folder.name,
        sortOrder: folder.sort_order,
      })),
      materials: await Promise.all((materialsResult.data || []).map(async (material) => ({
        id: material.id,
        folderId: material.folder_id,
        kind: material.kind as "note" | "upload",
        title: material.title,
        body: material.body,
        fileUrl:
          (await resolveCampaignMediaUrl(material.file_url)) ||
          material.file_url ||
          null,
        storagePath: material.file_url,
        originalName: material.original_name,
        mimeType: material.mime_type,
        updatedAt: material.updated_at,
      }))),
      invite: activeInvite ? {
        code: activeInvite.code,
        maxUses: activeInvite.max_uses,
        usesCount: activeInvite.uses_count,
        expiresAt: activeInvite.expires_at,
        revokedAt: activeInvite.revoked_at,
        createdAt: activeInvite.created_at,
      } : null,
      invites: inviteRows.map((item) => ({
        code: item.code,
        maxUses: item.max_uses,
        usesCount: item.uses_count,
        expiresAt: item.expires_at,
        revokedAt: item.revoked_at,
        createdAt: item.created_at,
      })),
      loading: false,
      error: null,
    })
  }, [enabled, focusedCharacterId])

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY_STATE)
      return
    }
    void load()
  }, [enabled, load])

  const context = useCallback(() => createEngineCommandContext({
    campaignId: state.campaignId,
    requestedBy: state.userId,
    authority: "gm",
  }), [state.campaignId, state.userId])

  const mutate = useCallback(async (
    action: () => Promise<unknown>,
    fallback: string,
  ): Promise<WorkshopMutationResult> => {
    try {
      await action()
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, fallback) }
    }

    try {
      await load()
      return { ok: true }
    } catch (reason) {
      return {
        ok: true,
        refreshError: errorMessage(reason, "Изменение сохранено, но экран не удалось обновить."),
      }
    }
  }, [load])

  const operations = useMemo<WorkshopOperations>(() => ({
    refresh: load,

    async createDraftCharacter(type, input) {
      let createdId: string | null = null
      try {
        const classTemplate = input.classTemplateId
          ? state.templates.find((template) =>
              template.id === input.classTemplateId &&
              template.kind === "class" &&
              template.is_active
            ) || null
          : null
        if (input.classTemplateId && !classTemplate) {
          return { ok: false, error: "Выбранный класс недоступен." }
        }

        const result = await oracle.characters.create(context(), {
          name: input.name.trim(),
          character_class: classTemplate?.name || "",
          level: Math.max(1, Math.min(30, input.level || 1)),
          bio: input.bio?.trim() || "",
          avatar_url: null,
          assigned_user_id: null,
          character_type: type,
          visibility: "private",
          visibility_mode: "private",
          publication_state: "draft",
        })
        createdId = result.value.after?.id || null

        if (createdId && classTemplate) {
          await oracle.characters.assignTemplate(context(), createdId, {
            templateId: classTemplate.id,
            templateLevel: Math.max(1, Math.min(30, input.level || 1)),
            selectedChoices: {},
          })
        }

        await load()
        return { ok: true, id: createdId || undefined }
      } catch (reason) {
        if (createdId) {
          try {
            await oracle.characters.delete(context(), createdId)
          } catch {
            // Creation compensation is best-effort; original failure is returned below.
          }
        }
        await load()
        return { ok: false, error: errorMessage(reason, "Не удалось создать черновик персонажа.") }
      }
    },

    async updateCharacter(characterId, input) {
      const character = state.characters.find((item) => item.id === characterId)
      if (!character) return { ok: false, error: "Персонаж не найден." }

      return mutate(
        () => oracle.characters.update(context(), characterId, {
          name: input.name.trim(),
          character_class: character.characterClass,
          level: character.level,
          bio: input.bio.trim(),
          avatar_url: character.avatarStoragePath,
          assigned_user_id: character.characterType === "pc"
            ? character.assignedUserId
            : null,
          character_type: character.characterType,
          visibility: character.publicationState === "draft"
            ? "private"
            : character.visibilityMode === "private" ? "private" : "campaign",
          visibility_mode: character.visibilityMode,
          publication_state: character.publicationState,
        }),
        "Не удалось сохранить персонажа.",
      )
    },

    convertCharacterType(characterId, characterType, npcVisibilityMode) {
      const character = state.characters.find((item) => item.id === characterId)
      if (!character) return Promise.resolve({ ok: false, error: "Персонаж не найден." })
      if (character.characterType === characterType) return Promise.resolve({ ok: true })

      return mutate(
        () => oracle.characters.convertType(
          context(),
          characterId,
          characterType,
          npcVisibilityMode,
        ),
        "Не удалось преобразовать персонажа.",
      )
    },

    assignTemplate(characterId, templateId, templateLevel) {
      const existing = state.templateAssignments.find(
        (assignment) =>
          assignment.character_id === characterId &&
          assignment.template_id === templateId,
      )
      return mutate(
        () => oracle.characters.assignTemplate(context(), characterId, {
          templateId,
          templateLevel,
          selectedChoices: existing?.selected_choices || {},
        }),
        "Не удалось назначить класс или подкласс.",
      )
    },

    removeTemplateAssignment(characterId, assignmentId) {
      return mutate(
        () => oracle.characters.removeTemplateAssignment(context(), characterId, assignmentId),
        "Не удалось снять класс или подкласс.",
      )
    },

    deleteCharacter(characterId) {
      return mutate(
        () => oracle.characters.delete(context(), characterId),
        "Не удалось удалить персонажа.",
      )
    },

    publishCharacter(characterId, visibilityMode) {
      return mutate(
        () => oracle.characters.setPublicationState(context(), characterId, "campaign", visibilityMode),
        "Не удалось отправить персонажа в кампанию.",
      )
    },

    returnCharacterToDraft(characterId) {
      return mutate(
        () => oracle.characters.setPublicationState(context(), characterId, "draft", "private"),
        "Не удалось вернуть персонажа в черновик.",
      )
    },

    setCharacterLifeState(characterId, lifeState) {
      return mutate(
        () => oracle.characters.setLifeState(context(), characterId, lifeState),
        "Не удалось изменить состояние персонажа.",
      )
    },

    setNpcVisibility(characterId, mode) {
      return mutate(
        () => oracle.characters.setVisibility(context(), characterId, mode),
        "Не удалось изменить видимость персонажа.",
      )
    },

    setNpcHabitat(characterId, locationId, attached) {
      return mutate(
        () => oracle.world.setNpcHabitat(context(), characterId, locationId, attached),
        "Не удалось изменить обычную зону NPC.",
      )
    },

    async assignCharacter(characterId, userId) {
      const character = state.characters.find((item) => item.id === characterId)
      if (!character) return { ok: false, error: "Персонаж не найден." }

      return mutate(
        () => oracle.characters.update(context(), characterId, {
          name: character.name,
          character_class: character.characterClass,
          level: character.level,
          bio: character.bio,
          avatar_url: character.avatarStoragePath,
          assigned_user_id: userId,
          character_type: character.characterType,
          visibility: character.publicationState === "draft" ? "private" : "campaign",
          visibility_mode: character.visibilityMode,
          publication_state: character.publicationState,
        }),
        "Не удалось назначить персонажа.",
      )
    },

    setActiveCharacter(userId, characterId) {
      return mutate(
        () => oracle.characters.setActive(context(), userId, characterId),
        "Не удалось изменить активного персонажа.",
      )
    },

    async setMemberRole(userId, role) {
      if (!state.isOwner) return { ok: false, error: "Роли меняет только владелец кампании." }
      try {
        await oracle.campaign.setMemberRole(context(), userId, role)
        await load()
        return { ok: true }
      } catch (reason) {
        return { ok: false, error: errorMessage(reason, "Не удалось изменить роль участника.") }
      }
    },

    async removeMember(userId) {
      if (!state.isOwner) return { ok: false, error: "Удалять участников может только владелец кампании." }
      try {
        await oracle.campaign.removeMember(context(), userId)
        await load()
        return { ok: true }
      } catch (reason) {
        return { ok: false, error: errorMessage(reason, "Не удалось удалить участника.") }
      }
    },

    async createInvite(maxUses = 20, expiresDays = 30) {
      try {
        const code = await oracle.campaign.createInvite(context(), {
          maxUses: Math.max(1, Math.min(500, Math.floor(maxUses))),
          expiresDays: Math.max(1, Math.min(365, Math.floor(expiresDays))),
        })
        await load()
        return { ok: true, code }
      } catch (reason) {
        return { ok: false, error: errorMessage(reason, "Не удалось создать приглашение.") }
      }
    },

    async revokeInvite(code) {
      try {
        await oracle.campaign.revokeInvite(context(), code)
        await load()
        return { ok: true }
      } catch (reason) {
        return { ok: false, error: errorMessage(reason, "Не удалось отозвать приглашение.") }
      }
    },

    async createDraftDefinition(kind, input) {
      try {
        const name = input.name.trim()
        const result = await oracle.definitions.create(context(), {
          kind,
          scope: "campaign",
          campaignId: state.campaignId,
          slug: (normalizeDefinitionSlug(name) || "draft") + "-" + Date.now().toString(36),
          visibility: "gm",
          status: "draft",
          sourceKind: "custom",
          name,
          summary: input.summary?.trim() || "",
          rulesText: input.rulesText?.trim() || "",
          mechanics: input.mechanics ?? [],
          data: input.data ?? {},
        })
        await load()
        return { ok: true, id: result.value.after.id }
      } catch (reason) {
        return { ok: false, error: errorMessage(reason, "Не удалось создать черновик.") }
      }
    },

    reviseDefinition(definitionId, input) {
      const current = state.definitions.find((definition) => definition.id === definitionId)
      if (!current) return Promise.resolve({ ok: false, error: "Определение не найдено." })

      return mutate(
        () => oracle.definitions.revise(context(), definitionId, {
          name: input.name.trim(),
          summary: input.summary?.trim() || "",
          rulesText: input.rulesText?.trim() || "",
          mechanics: input.mechanics ?? current.mechanics,
          data: input.data ?? current.data,
        }),
        "Не удалось сохранить новую ревизию.",
      )
    },

    publishDefinition(definitionId) {
      return mutate(
        () => oracle.definitions.setStatus(context(), definitionId, "active"),
        "Не удалось отправить заготовку в кампанию.",
      )
    },

    archiveDefinition(definitionId) {
      return mutate(
        () => oracle.definitions.archive(context(), definitionId),
        "Не удалось архивировать определение.",
      )
    },

    restoreDefinition(definitionId) {
      return mutate(
        () => oracle.definitions.setStatus(context(), definitionId, "active"),
        "Не удалось вернуть определение из архива.",
      )
    },

    async cloneDefinition(definition) {
      try {
        const result = await oracle.definitions.create(context(), {
          kind: definition.kind,
          scope: "campaign",
          campaignId: state.campaignId,
          slug: (normalizeDefinitionSlug(definition.name) || "copy") + "-copy-" + Date.now().toString(36),
          visibility: "gm",
          status: "draft",
          sourceKind: "custom",
          sourceLabel: "Копия: " + definition.name,
          name: definition.name + " · копия",
          summary: definition.summary,
          rulesText: definition.rulesText,
          mechanics: definition.mechanics,
          data: definition.data,
        })
        await load()
        return { ok: true, id: result.value.after.id }
      } catch (reason) {
        return { ok: false, error: errorMessage(reason, "Не удалось создать копию.") }
      }
    },

    issueDefinition(definition, characterId, quantity) {
      if (definition.kind === "item") {
        return mutate(
          () => oracle.inventory.create(context(), characterId, itemInput(definition, quantity)),
          "Не удалось выдать предмет.",
        )
      }

      if (definition.kind === "spell") {
        return mutate(
          () => oracle.characters.createSpell(context(), characterId, spellInput(definition)),
          "Не удалось выдать заклинание.",
        )
      }

      if (definition.kind === "feature" || definition.kind === "condition" || definition.kind === "feat") {
        const mechanics = Array.isArray(definition.mechanics)
          ? definition.mechanics as unknown as StoredMechanics
          : []
        return mutate(
          () => oracle.characters.createFeature(context(), characterId, {
            kind: "feature",
            name: definition.name,
            description: definition.rulesText || definition.summary,
            mechanics,
          }),
          "Не удалось выдать способность или эффект.",
        )
      }

      return Promise.resolve({ ok: false, error: "Этот тип пока нельзя выдать персонажу." })
    },

    async linkDefinitionToItem(definition, itemDefinitionId) {
      const item = state.definitions.find((candidate) =>
        candidate.id === itemDefinitionId &&
        candidate.kind === "item" &&
        candidate.status === "active"
      )
      if (!item) return { ok: false, error: "Предмет не найден." }

      const rawLinked = item.data.linked_definition_ids
      const linked = Array.isArray(rawLinked)
        ? rawLinked.filter((value): value is string => typeof value === "string")
        : []
      if (linked.includes(definition.id)) return { ok: true }

      const itemMechanics = Array.isArray(item.mechanics) ? item.mechanics : []
      const linkedMechanics = Array.isArray(definition.mechanics) ? definition.mechanics : []

      return mutate(
        () => oracle.definitions.revise(context(), item.id, {
          name: item.name,
          summary: item.summary,
          rulesText: item.rulesText,
          mechanics: [...itemMechanics, ...linkedMechanics] as ChasovoyJson,
          data: {
            ...item.data,
            linked_definition_ids: [...linked, definition.id],
          },
        }),
        "Не удалось привязать механику к предмету.",
      )
    },

    async unlinkDefinitionFromItem(definition, itemDefinitionId) {
      const item = state.definitions.find((candidate) =>
        candidate.id === itemDefinitionId &&
        candidate.kind === "item"
      )
      if (!item) return { ok: false, error: "Предмет не найден." }

      const rawLinked = item.data.linked_definition_ids
      const linked = Array.isArray(rawLinked)
        ? rawLinked.filter((value): value is string => typeof value === "string")
        : []
      if (!linked.includes(definition.id)) return { ok: true }

      const linkedMechanicIds = new Set(
        (Array.isArray(definition.mechanics) ? definition.mechanics : [])
          .map((mechanic) =>
            mechanic && typeof mechanic === "object" && "id" in mechanic
              ? String((mechanic as { id?: unknown }).id || "")
              : ""
          )
          .filter(Boolean),
      )
      const nextMechanics = (Array.isArray(item.mechanics) ? item.mechanics : [])
        .filter((mechanic) => {
          if (!mechanic || typeof mechanic !== "object" || !("id" in mechanic)) return true
          return !linkedMechanicIds.has(String((mechanic as { id?: unknown }).id || ""))
        })

      return mutate(
        () => oracle.definitions.revise(context(), item.id, {
          name: item.name,
          summary: item.summary,
          rulesText: item.rulesText,
          mechanics: nextMechanics as ChasovoyJson,
          data: {
            ...item.data,
            linked_definition_ids: linked.filter((id) => id !== definition.id),
          },
        }),
        "Не удалось отвязать механику от предмета.",
      )
    },

    async createNote(title, body, folderId = null) {
      const cleanTitle = title.trim()
      if (!cleanTitle) return { ok: false, error: "Нужно название заметки." }

      const { error } = await supabase.from("gm_workspace_files").insert({
        campaign_id: state.campaignId,
        workspace_user_id: state.userId,
        folder_id: folderId,
        created_by: state.userId,
        kind: "note",
        title: cleanTitle,
        body: body.trim(),
        updated_at: new Date().toISOString(),
      })
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },

    async updateNote(id, title, body) {
      const cleanTitle = title.trim()
      if (!cleanTitle) return { ok: false, error: "Нужно название заметки." }

      const { error } = await supabase
        .from("gm_workspace_files")
        .update({
          title: cleanTitle,
          body: body.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("campaign_id", state.campaignId)
        .eq("workspace_user_id", state.userId)

      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },

    async uploadMaterial(file, folderId = null) {
      const upload = await uploadCampaignFile(file, "gm-private", state.campaignId)
      if (!upload.ok) return { ok: false, error: upload.error }

      const { error } = await supabase.from("gm_workspace_files").insert({
        campaign_id: state.campaignId,
        workspace_user_id: state.userId,
        folder_id: folderId,
        created_by: state.userId,
        kind: "upload",
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        file_url: upload.url,
        original_name: file.name,
        mime_type: file.type || null,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        await deleteCampaignMediaObject(upload.url)
        return { ok: false, error: error.message }
      }

      await load()
      return { ok: true }
    },

    async createFolder(name, parentId = null) {
      const cleanName = name.trim()
      if (!cleanName) return { ok: false, error: "Нужно название папки." }
      if (parentId && !state.folders.some((folder) => folder.id === parentId)) {
        return { ok: false, error: "Родительская папка не найдена." }
      }

      const { error } = await supabase.from("gm_workspace_folders").insert({
        campaign_id: state.campaignId,
        workspace_user_id: state.userId,
        parent_id: parentId,
        name: cleanName,
      })
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },

    async renameFolder(id, name) {
      const cleanName = name.trim()
      if (!cleanName) return { ok: false, error: "Нужно название папки." }

      const { error } = await supabase
        .from("gm_workspace_folders")
        .update({ name: cleanName })
        .eq("id", id)
        .eq("campaign_id", state.campaignId)
        .eq("workspace_user_id", state.userId)

      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },

    async moveFolder(id, parentId) {
      const folder = state.folders.find((item) => item.id === id)
      if (!folder) return { ok: false, error: "Папка не найдена." }
      if (parentId === id) return { ok: false, error: "Папку нельзя вложить саму в себя." }

      const children = new Map<string, string[]>()
      for (const item of state.folders) {
        if (!item.parentId) continue
        const list = children.get(item.parentId) || []
        list.push(item.id)
        children.set(item.parentId, list)
      }
      const descendants = new Set<string>()
      const stack = [...(children.get(id) || [])]
      while (stack.length) {
        const next = stack.pop()!
        if (descendants.has(next)) continue
        descendants.add(next)
        stack.push(...(children.get(next) || []))
      }
      if (parentId && descendants.has(parentId)) {
        return { ok: false, error: "Папку нельзя переместить внутрь её собственной ветки." }
      }
      if (parentId && !state.folders.some((item) => item.id === parentId)) {
        return { ok: false, error: "Папка назначения не найдена." }
      }

      const { error } = await supabase
        .from("gm_workspace_folders")
        .update({ parent_id: parentId })
        .eq("id", id)
        .eq("campaign_id", state.campaignId)
        .eq("workspace_user_id", state.userId)

      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },

    async moveMaterial(id, folderId) {
      if (folderId && !state.folders.some((folder) => folder.id === folderId)) {
        return { ok: false, error: "Папка назначения не найдена." }
      }

      const { error } = await supabase
        .from("gm_workspace_files")
        .update({
          folder_id: folderId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("campaign_id", state.campaignId)
        .eq("workspace_user_id", state.userId)

      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },

    async renameMaterial(id, title) {
      const cleanTitle = title.trim()
      if (!cleanTitle) return { ok: false, error: "Нужно название материала." }

      const { error } = await supabase
        .from("gm_workspace_files")
        .update({
          title: cleanTitle,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("campaign_id", state.campaignId)
        .eq("workspace_user_id", state.userId)

      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },

    async reorderFolder(id, direction) {
      const folder = state.folders.find((item) => item.id === id)
      if (!folder) return { ok: false, error: "Папка не найдена." }

      const siblings = state.folders
        .filter((item) => item.parentId === folder.parentId)
        .sort((a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, "ru") ||
          a.id.localeCompare(b.id)
        )
      const index = siblings.findIndex((item) => item.id === id)
      const targetIndex = direction === "up" ? index - 1 : index + 1
      if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
        return { ok: true }
      }

      const ordered = [...siblings]
      ;[ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]]

      for (let position = 0; position < ordered.length; position += 1) {
        const item = ordered[position]
        const { error } = await supabase
          .from("gm_workspace_folders")
          .update({ sort_order: position })
          .eq("id", item.id)
          .eq("campaign_id", state.campaignId)
          .eq("workspace_user_id", state.userId)
        if (error) return { ok: false, error: error.message }
      }

      await load()
      return { ok: true }
    },

    async deleteMaterial(id) {
      const material = state.materials.find((item) => item.id === id) || null
      const { error } = await supabase
        .from("gm_workspace_files")
        .delete()
        .eq("id", id)
        .eq("campaign_id", state.campaignId)
        .eq("workspace_user_id", state.userId)
      if (error) return { ok: false, error: error.message }

      if (material?.kind === "upload" && material.storagePath) {
        await deleteCampaignMediaObject(material.storagePath)
      }

      await load()
      return { ok: true }
    },

    async deleteFolder(id) {
      const { error } = await supabase
        .from("gm_workspace_folders")
        .delete()
        .eq("id", id)
        .eq("campaign_id", state.campaignId)
        .eq("workspace_user_id", state.userId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
  }), [context, load, mutate, state])

  return {
    ...state,
    draftCharacters: state.characters.filter((character) => character.publicationState === "draft"),
    campaignCharacters: state.characters.filter((character) => character.publicationState === "campaign"),
    draftDefinitions: state.definitions.filter((definition) => definition.status === "draft"),
    activeDefinitions: state.definitions.filter((definition) => definition.status === "active"),
    archivedDefinitions: state.definitions.filter((definition) => definition.status === "archived"),
    classTemplates: state.templates.filter((template) => template.kind === "class" && template.is_active),
    subclassTemplates: state.templates.filter((template) => template.kind === "subclass" && template.is_active),
    operations,
  }
}
