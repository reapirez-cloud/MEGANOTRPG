import { useCallback, useEffect, useRef, useState } from "react"

import { cheburashka } from "../inventory-engine/runtime.ts"
import { firstAvailableGridPlacement, type InventoryPlacementTarget } from "../inventory-engine/index.ts"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { oracle } from "../oracle-engine/runtime.ts"
import { shapoklyak } from "../entity-engine/runtime.ts"
import type { CharacterEntity } from "../entity-engine/index.ts"
import { supabase } from "../lib/supabase"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { parseMediaPresentation, type MediaPresentation } from "../media/presentation"
import type {
  CharacterFeature,
  CharacterSheet,
  CharacterSpell,
  InventoryInput,
  InventoryItem,
} from "../types/characterSheet"
import type {
  CharacterTemplateAssignment,
  RuleTemplate,
} from "../rule-templates/types.ts"
import { useUiV1CampaignScope } from "./useUiV1SectionData"

export type UiV1Character = {
  id: string
  name: string
  characterClass: string
  level: number
  bio: string
  characterType: "pc" | "npc"
  assignedUserId: string | null
  lifeState: "alive" | "dead"
  avatarUrl: string | null
  avatarPresentation: MediaPresentation | null
  panelAvatarUrl: string | null
  panelAvatarPresentation: MediaPresentation | null
}

export type UiV1CharacterAchievement = {
  id: string
  title: string
  description: string
  icon: string
  awarded_at: string
}

export type UiV1CharacterWorldStorage = {
  id: string
  location_id: string
  root_item_id: string
  name: string
  storage_kind: string
  item_count: number
  can_operate: boolean
}

type Result = { ok: boolean; error?: string }

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

type UiV1CharacterControlOptions = {
  loadSpells?: boolean
  loadInventory?: boolean
  loadFeatures?: boolean
  loadResources?: boolean
}

export function useUiV1CharacterControl(
  characterId: string,
  options: UiV1CharacterControlOptions = {},
) {
  const scope = useUiV1CampaignScope()
  const loadSpells = options.loadSpells ?? true
  const loadInventory = options.loadInventory ?? true
  const loadFeatures = options.loadFeatures ?? true
  const loadResources = options.loadResources ?? true
  const loadedCharacterIdRef = useRef<string | null>(null)
  const [character, setCharacter] = useState<UiV1Character | null>(null)
  const [runtimeEntity, setRuntimeEntity] = useState<CharacterEntity | null>(null)
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [spells, setSpells] = useState<CharacterSpell[]>([])
  const [features, setFeatures] = useState<CharacterFeature[]>([])
  const [achievements, setAchievements] = useState<UiV1CharacterAchievement[]>([])
  const [assignments, setAssignments] = useState<CharacterTemplateAssignment[]>([])
  const [templates, setTemplates] = useState<RuleTemplate[]>([])
  const [transferTargets, setTransferTargets] = useState<Array<{ id: string; name: string }>>([])
  const [worldStorages, setWorldStorages] = useState<UiV1CharacterWorldStorage[]>([])
  const [resources, setResources] = useState<Array<{
    state_key: string
    label: string | null
    current: number
    max_snapshot: number
    recharge: unknown
  }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId || !characterId) return
    if (loadedCharacterIdRef.current !== characterId) {
      setLoading(true)
    }
    setError(null)

    try {
      const characterResult = await supabase
        .from("characters")
        .select("id,campaign_id,assigned_user_id,name,character_class,level,bio,avatar_url,character_type,visibility,visibility_mode,publication_state,life_state,died_at,created_by,created_at,updated_at")
        .eq("campaign_id", scope.campaignId)
        .eq("id", characterId)
        .maybeSingle()

      if (characterResult.error) throw new Error(characterResult.error.message)
      if (!characterResult.data) {
        throw new Error("Персонаж не найден.")
      }

      const earlyRow = characterResult.data
      const earlyAvatarSource = earlyRow.avatar_url || null
      const earlyAvatarUrl =
        (await resolveCampaignMediaUrl(earlyAvatarSource)) ||
        earlyAvatarSource

      setRuntimeEntity(earlyRow as CharacterEntity)
      loadedCharacterIdRef.current = characterId
      setCharacter({
        id: earlyRow.id,
        name: earlyRow.name,
        characterClass: earlyRow.character_class || "",
        level: earlyRow.level || 1,
        bio: earlyRow.bio || "",
        characterType: earlyRow.character_type === "npc" ? "npc" : "pc",
        assignedUserId: earlyRow.assigned_user_id,
        lifeState: earlyRow.life_state === "dead" ? "dead" : "alive",
        avatarUrl: earlyAvatarUrl,
        avatarPresentation: null,
        panelAvatarUrl: earlyAvatarUrl,
        panelAvatarPresentation: null,
      })
      setLoading(false)

      const emptyRows = { data: [], error: null } as const
      const emptySingle = { data: null, error: null } as const

      const [
        sheetResult,
        spellsResult,
        featuresResult,
        achievementsResult,
        assignmentsResult,
        resourcesResult,
        transferTargetsResult,
        mediaResult,
        worldStateResult,
      ] = await Promise.all([
        supabase.from("character_sheets")
          .select("*")
          .eq("character_id", characterId)
          .maybeSingle(),
        loadSpells
          ? supabase.from("character_spells")
              .select("*")
              .eq("character_id", characterId)
              .order("spell_level")
              .order("sort_order")
          : Promise.resolve(emptyRows),
        loadFeatures
          ? supabase.from("character_features")
              .select("*")
              .eq("character_id", characterId)
              .order("sort_order")
              .order("created_at")
          : Promise.resolve(emptyRows),
        loadFeatures
          ? supabase.from("achievements")
              .select("id,title,description,icon,awarded_at")
              .eq("campaign_id", scope.campaignId)
              .eq("character_id", characterId)
              .order("awarded_at", { ascending: false })
          : Promise.resolve(emptyRows),
        supabase.from("character_template_assignments")
          .select("id,character_id,template_id,template_level,selected_choices,assigned_at,updated_at")
          .eq("character_id", characterId),
        loadResources
          ? supabase.from("character_resource_states")
              .select("state_key,label,current,max_snapshot,recharge")
              .eq("character_id", characterId)
              .order("state_key")
          : Promise.resolve(emptyRows),
        loadInventory
          ? supabase.from("characters")
              .select("id,name")
              .eq("campaign_id", scope.campaignId)
              .neq("id", characterId)
              .eq("publication_state", "campaign")
              .eq("life_state", "alive")
              .order("name")
          : Promise.resolve(emptyRows),
        supabase.rpc("list_character_media_presentations_v1", {
          p_campaign_id: scope.campaignId,
        }),
        loadInventory
          ? supabase.from("character_world_state")
              .select("location_id")
              .eq("character_id", characterId)
              .maybeSingle()
          : Promise.resolve(emptySingle),
      ])

      const firstError =
        sheetResult.error ||
        spellsResult.error ||
        featuresResult.error ||
        achievementsResult.error ||
        assignmentsResult.error ||
        resourcesResult.error ||
        transferTargetsResult.error ||
        mediaResult.error ||
        worldStateResult.error
      if (firstError) throw new Error(firstError.message)

      const assignmentRows =
        (assignmentsResult.data || []) as CharacterTemplateAssignment[]
      const assignedTemplateIds = [
        ...new Set(assignmentRows.map((item) => item.template_id)),
      ]
      const templatesResult = assignedTemplateIds.length
        ? await supabase.from("rule_templates")
            .select("id,campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta,is_active,created_by,created_at,updated_at")
            .eq("campaign_id", scope.campaignId)
            .in("id", assignedTemplateIds)
        : emptyRows
      if (templatesResult.error) throw new Error(templatesResult.error.message)

      const inventoryRows = loadInventory
        ? await cheburashka.listCharacterItems(characterId)
        : []
      const storageResult =
        loadInventory && worldStateResult.data?.location_id
          ? await supabase.rpc("list_world_storages_v1", {
              p_campaign_id: scope.campaignId,
              p_location_id: worldStateResult.data.location_id,
            })
          : { data: [], error: null }
      if (storageResult.error) throw new Error(storageResult.error.message)

      const row = characterResult.data
      const mediaRows = (mediaResult.data || []) as Array<{
        character_id: string
        target_field: string
        storage_path: string
        presentation: unknown
      }>
      const avatarBinding =
        mediaRows.find((item) =>
          item.character_id === characterId &&
          (item.target_field === "avatar" || item.target_field === "avatar_url")
        ) || null
      const panelBinding =
        mediaRows.find((item) =>
          item.character_id === characterId &&
          item.target_field === "panel_avatar"
        ) || null
      const avatarSource = avatarBinding?.storage_path || row.avatar_url || null
      const panelSource = panelBinding?.storage_path || avatarSource
      const [avatarUrl, panelAvatarUrl] = await Promise.all([
        resolveCampaignMediaUrl(avatarSource),
        resolveCampaignMediaUrl(panelSource),
      ])

      setRuntimeEntity(row as CharacterEntity)
      setCharacter({
        id: row.id,
        name: row.name,
        characterClass: row.character_class || "",
        level: row.level || 1,
        bio: row.bio || "",
        characterType: row.character_type === "npc" ? "npc" : "pc",
        assignedUserId: row.assigned_user_id,
        lifeState: row.life_state === "dead" ? "dead" : "alive",
        avatarUrl: avatarUrl || avatarSource,
        avatarPresentation: parseMediaPresentation(avatarBinding?.presentation),
        panelAvatarUrl: panelAvatarUrl || panelSource,
        panelAvatarPresentation: parseMediaPresentation(panelBinding?.presentation),
      })
      setSheet((sheetResult.data || null) as CharacterSheet | null)
      if (loadInventory) setInventory(inventoryRows)
      if (loadSpells) setSpells((spellsResult.data || []) as CharacterSpell[])
      if (loadFeatures) {
        setFeatures((featuresResult.data || []) as CharacterFeature[])
        setAchievements(
          (achievementsResult.data || []) as UiV1CharacterAchievement[],
        )
      }
      setAssignments(assignmentRows)
      setTemplates((templatesResult.data || []) as RuleTemplate[])
      if (loadResources) setResources((resourcesResult.data || []).map((item) => ({
        state_key: item.state_key,
        label: item.label,
        current: Number(item.current || 0),
        max_snapshot: Number(item.max_snapshot || 0),
        recharge: item.recharge,
      })))
      if (loadInventory) setTransferTargets((transferTargetsResult.data || []).map((item) => ({
        id: item.id,
        name: item.name,
      })))
      if (loadInventory) setWorldStorages((storageResult.data || []).map((storage: Record<string, unknown>) => ({
        id: String(storage.id || ""),
        location_id: String(storage.location_id || ""),
        root_item_id: String(storage.root_item_id || ""),
        name: String(storage.name || "Хранилище"),
        storage_kind: String(storage.storage_kind || "stash"),
        item_count: Number(storage.item_count || 0),
        can_operate: storage.can_operate === true,
      })).filter((storage: UiV1CharacterWorldStorage) => Boolean(storage.id && storage.root_item_id)))
    } catch (reason) {
      setError(errorMessage(reason, "Не удалось загрузить персонажа."))
    } finally {
      setLoading(false)
    }
  }, [
    characterId,
    loadFeatures,
    loadInventory,
    loadResources,
    loadSpells,
    scope.campaignId,
  ])

  useEffect(() => {
    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }
    void load()
  }, [load, scope.campaignId, scope.loading])

  const context = useCallback(() => createEngineCommandContext({
    campaignId: scope.campaignId,
    requestedBy: scope.userId,
    authority: "gm",
    actorCharacterId: characterId,
  }), [characterId, scope.campaignId, scope.userId])

  const playerContext = useCallback(() => createEngineCommandContext({
    campaignId: scope.campaignId,
    requestedBy: scope.userId,
    authority: "player",
    actorCharacterId: characterId,
  }), [characterId, scope.campaignId, scope.userId])

  const canControlCharacter = Boolean(
    character && (scope.canManage || character.assignedUserId === scope.userId),
  )

  const gm = useCallback(async (
    action: () => Promise<unknown>,
    fallback: string,
  ): Promise<Result> => {
    if (!scope.canManage) return { ok: false, error: "Недостаточно прав." }
    try {
      await action()
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, fallback) }
    }
  }, [load, scope.canManage])

  const updateSheet = useCallback((patch: Partial<CharacterSheet>) => gm(
    () => oracle.characters.updateSheet(context(), characterId, patch),
    "Не удалось обновить лист.",
  ), [characterId, context, gm])

  const setHp = useCallback((currentHp: number, maxHp: number, tempHp: number) => gm(
    () => oracle.characters.setHp(context(), characterId, currentHp, { maxHp, tempHp }),
    "Не удалось изменить HP.",
  ), [characterId, context, gm])

  const recover = useCallback((trigger: "short_rest" | "long_rest" | "dawn") => gm(
    () => oracle.characters.recover(context(), characterId, trigger),
    "Не удалось восстановить персонажа.",
  ), [characterId, context, gm])

  const setEquipped = useCallback(async (item: InventoryItem, equipped: boolean): Promise<Result> => {
    if (!canControlCharacter) return { ok: false, error: "Недостаточно прав." }
    if (!equipped) {
      return { ok: false, error: "Для снятия выбери реальное место: руку, сумку или внешнюю ячейку." }
    }
    try {
      if (scope.canManage) {
        await oracle.inventory.setEquipped(
          context(),
          characterId,
          item.id,
          equipped,
          item.equipment_slot,
          item.version,
        )
      } else {
        await cheburashka.execute({
          kind: "inventory.set_equipped",
          context: playerContext(),
          characterId,
          itemId: item.id,
          equipped,
          equipmentSlot: item.equipment_slot,
          expectedVersion: item.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      await load()
      return { ok: false, error: errorMessage(reason, "Не удалось изменить экипировку.") }
    }
  }, [canControlCharacter, characterId, context, load, playerContext, scope.canManage])

  const useItem = useCallback(async (item: InventoryItem, amount = 1): Promise<Result> => {
    if (!canControlCharacter) return { ok: false, error: "Недостаточно прав." }
    try {
      if (scope.canManage) {
        await oracle.inventory.consume(context(), characterId, item.id, amount, item.version)
      } else {
        await cheburashka.execute({
          kind: "inventory.consume",
          context: playerContext(),
          characterId,
          itemId: item.id,
          amount,
          expectedVersion: item.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось использовать предмет.") }
    }
  }, [canControlCharacter, characterId, context, load, playerContext, scope.canManage])

  const moveItem = useCallback(async (item: InventoryItem, placement: InventoryPlacementTarget): Promise<Result> => {
    if (!canControlCharacter) return { ok: false, error: "Недостаточно прав." }
    const holderItemId = placement.kind === "grid" ? placement.holderItemId : null
    try {
      if (scope.canManage) {
        await oracle.inventory.move(
          context(),
          characterId,
          item.id,
          holderItemId,
          item.version,
          placement,
        )
      } else {
        await cheburashka.execute({
          kind: "inventory.move",
          context: playerContext(),
          characterId,
          itemId: item.id,
          holderItemId,
          placement,
          expectedVersion: item.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      await load()
      return { ok: false, error: errorMessage(reason, "Не удалось переместить предмет.") }
    }
  }, [canControlCharacter, characterId, context, load, playerContext, scope.canManage])

  const moveItemSimple = useCallback(async (
    item: InventoryItem,
    holderItemId: string | null,
  ): Promise<Result> => {
    if (!canControlCharacter) return { ok: false, error: "Недостаточно прав." }

    try {
      if (scope.canManage) {
        await oracle.inventory.move(
          context(),
          characterId,
          item.id,
          holderItemId,
          item.version,
        )
      } else {
        await cheburashka.execute({
          kind: "inventory.move",
          context: playerContext(),
          characterId,
          itemId: item.id,
          holderItemId,
          expectedVersion: item.version,
        })
      }

      await load()
      return { ok: true }
    } catch (reason) {
      await load()
      return {
        ok: false,
        error: errorMessage(reason, "Не удалось переложить предмет."),
      }
    }
  }, [
    canControlCharacter,
    characterId,
    context,
    load,
    playerContext,
    scope.canManage,
  ])

  const storeItemInWorld = useCallback(async (
    item: InventoryItem,
    storage: UiV1CharacterWorldStorage,
    amount = item.quantity,
  ): Promise<Result> => {
    if (!canControlCharacter) return { ok: false, error: "Недостаточно прав." }
    if (!storage.can_operate) return { ok: false, error: "Это хранилище сейчас недоступно." }
    if (item.equipped) return { ok: false, error: "Сначала сними предмет в реальное место." }
    try {
      const storageItems = await cheburashka.listWorldStorageItems(storage.id)
      const root = storageItems.find((candidate) => candidate.id === storage.root_item_id)
      if (!root) return { ok: false, error: "Корневой контейнер хранилища не найден." }

      const projected: InventoryItem = {
        ...item,
        character_id: null,
        world_storage_id: storage.id,
        holder_item_id: root.id,
        placement_kind: "grid",
        placement_index: null,
        grid_x: null,
        grid_y: null,
        grid_rotation: 0,
        equipped: false,
      }
      const placement = firstAvailableGridPlacement(
        [...storageItems, projected],
        projected,
        root,
      )
      if (!placement) return { ok: false, error: "В хранилище нет места для этого предмета." }

      if (scope.canManage) {
        await oracle.inventory.storeWorld(
          context(), characterId, item.id, storage.id, amount, placement, item.version,
        )
      } else {
        await cheburashka.execute({
          kind: "inventory.store_world",
          context: playerContext(),
          characterId,
          itemId: item.id,
          worldStorageId: storage.id,
          amount,
          placement,
          expectedVersion: item.version,
        })
      }
      await load()
      return { ok: true }
    } catch (reason) {
      await load()
      return { ok: false, error: errorMessage(reason, "Не удалось оставить предмет в мире.") }
    }
  }, [canControlCharacter, characterId, context, load, playerContext, scope.canManage])

  const updateItem = useCallback((item: InventoryItem, patch: Partial<InventoryInput>) => {
    const input: InventoryInput = {
      name: patch.name ?? item.name,
      quantity: patch.quantity ?? item.quantity,
      weight: patch.weight !== undefined ? patch.weight : item.weight,
      equipped: patch.equipped ?? item.equipped,
      category: patch.category ?? item.category,
      equipment_slot: patch.equipment_slot !== undefined ? patch.equipment_slot : item.equipment_slot,
      image_url: patch.image_url !== undefined ? patch.image_url : item.image_url,
      description: patch.description ?? item.description,
      definition_id: item.definition_id ?? null,
      definition_revision: item.definition_revision ?? null,
      mechanics: patch.mechanics ?? item.mechanics ?? [],
      usage_mode: patch.usage_mode ?? item.usage_mode,
      charges_current: patch.charges_current !== undefined ? patch.charges_current : item.charges_current,
      charges_max: patch.charges_max !== undefined ? patch.charges_max : item.charges_max,
      stack_mode: patch.stack_mode ?? item.stack_mode,
      item_state: patch.item_state ?? item.item_state ?? {},
    }
    return gm(
      () => oracle.inventory.update(context(), characterId, item.id, input, item.version),
      "Не удалось изменить предмет.",
    )
  }, [characterId, context, gm])

  const removeItem = useCallback((item: InventoryItem) => gm(
    () => oracle.inventory.remove(context(), characterId, item.id, item.version),
    "Не удалось удалить предмет.",
  ), [characterId, context, gm])

  const transferItem = useCallback((item: InventoryItem, targetCharacterId: string, amount: number) => gm(
    () => oracle.inventory.transfer(context(), characterId, targetCharacterId, item.id, amount, item.version),
    "Не удалось передать предмет.",
  ), [characterId, context, gm])

  const updateSpell = useCallback((spell: CharacterSpell, patch: Partial<CharacterSpell>) => gm(
    () => oracle.characters.updateSpell(context(), characterId, spell.id, {
      name: patch.name ?? spell.name,
      spell_level: patch.spell_level ?? spell.spell_level,
      school: patch.school ?? spell.school,
      casting_time: patch.casting_time ?? spell.casting_time,
      spell_range: patch.spell_range ?? spell.spell_range,
      duration: patch.duration ?? spell.duration,
      components: patch.components ?? spell.components,
      concentration: patch.concentration ?? spell.concentration,
      ritual: patch.ritual ?? spell.ritual,
      prepared: patch.prepared ?? spell.prepared,
      cast_mode: patch.cast_mode ?? spell.cast_mode,
      slot_level: patch.slot_level !== undefined ? patch.slot_level : spell.slot_level,
      description: patch.description ?? spell.description,
      source: patch.source ?? spell.source,
    }),
    "Не удалось изменить заклинание.",
  ), [characterId, context, gm])

  const setSpellPrepared = useCallback(async (spellId: string, prepared: boolean): Promise<Result> => {
    if (!canControlCharacter) return { ok: false, error: "Недостаточно прав." }
    try {
      if (scope.canManage) {
        await oracle.characters.setSpellPrepared(context(), characterId, spellId, prepared)
      } else {
        await shapoklyak.execute({
          kind: "entity.set_spell_prepared",
          context: playerContext(),
          characterId,
          spellId,
          prepared,
        })
      }
      setSpells((current) =>
        current.map((spell) =>
          spell.id === spellId
            ? { ...spell, prepared, updated_at: new Date().toISOString() }
            : spell
        ),
      )
      return { ok: true }
    } catch (reason) {
      return { ok: false, error: errorMessage(reason, "Не удалось изменить подготовку заклинания.") }
    }
  }, [canControlCharacter, characterId, context, playerContext, scope.canManage])

  const deleteSpell = useCallback((spellId: string) => gm(
    () => oracle.characters.deleteSpell(context(), characterId, spellId),
    "Не удалось удалить заклинание.",
  ), [characterId, context, gm])

  const updateFeature = useCallback((feature: CharacterFeature, patch: Partial<CharacterFeature>) => gm(
    () => oracle.characters.updateFeature(context(), characterId, feature.id, {
      kind: patch.kind ?? feature.kind,
      name: patch.name ?? feature.name,
      description: patch.description ?? feature.description,
      mechanics: patch.mechanics ?? feature.mechanics ?? [],
    }),
    "Не удалось изменить особенность.",
  ), [characterId, context, gm])

  const deleteFeature = useCallback((featureId: string) => gm(
    () => oracle.characters.deleteFeature(context(), characterId, featureId),
    "Не удалось удалить особенность.",
  ), [characterId, context, gm])

  return {
    ...scope,
    character,
    runtimeEntity,
    canControlCharacter,
    sheet,
    inventory,
    spells,
    features,
    achievements,
    assignments,
    templates,
    resources,
    transferTargets,
    worldStorages,
    loading: scope.loading || loading,
    error: scope.error || error,
    refresh: load,
    updateSheet,
    setHp,
    recover,
    setEquipped,
    useItem,
    moveItem,
    moveItemSimple,
    storeItemInWorld,
    updateItem,
    removeItem,
    transferItem,
    updateSpell,
    setSpellPrepared,
    deleteSpell,
    updateFeature,
    deleteFeature,
  }
}