import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { engineRuntime } from "../engine-runtime/runtime.ts"
import { supabase } from "../lib/supabase"
import type { ChasovoyDefinitionKind, ChasovoyJson } from "../reference-engine/index.ts"
import type {
  EquipmentSlot,
  InventoryCategory,
  InventoryInput,
  ItemUsageMode,
} from "../types/characterSheet.ts"
import type { StoredMechanics } from "../types/characterMechanics.ts"
import type { AIDraft, AIDraftNode, AIDraftRelation } from "./AIProvider"

type ApplyStep = {
  key: string
  kind: string
  label: string
}

type CanonicalRef = {
  type: "location" | "character" | "definition" | "item" | "section"
  id: string
}

export type AIDraftApplyResult =
  | {
      ok: true
      runId: string
      entityMap: Record<string, CanonicalRef>
    }
  | {
      ok: false
      runId?: string
      partial: boolean
      error: string
    }

const LOCATION_VISIBILITY = new Set(["always", "discover", "private"])
const DEFINITION_KINDS = new Set<ChasovoyDefinitionKind>([
  "spell",
  "item",
  "feat",
  "feature",
  "condition",
  "reference",
])
const INVENTORY_CATEGORIES = new Set<InventoryCategory>([
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
])
const EQUIPMENT_SLOTS = new Set<EquipmentSlot>([
  "main_hand",
  "off_hand",
  "two_hands",
  "head",
  "neck",
  "shoulders",
  "chest",
  "hands",
  "wrists",
  "waist",
  "legs",
  "feet",
  "back",
  "ring_left",
  "ring_right",
  "ammo",
  "other",
])
const USAGE_MODES = new Set<ItemUsageMode>(["none", "quantity", "charges"])

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function mechanics(value: unknown): StoredMechanics {
  return Array.isArray(value) ? value as StoredMechanics : []
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(stableJson).join(",") + "]"
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>
    return "{" + Object.keys(row).sort().map((key) =>
      JSON.stringify(key) + ":" + stableJson(row[key])
    ).join(",") + "}"
  }
  return JSON.stringify(value)
}

async function verifyCompiledMechanics(
  node: AIDraftNode,
  campaignId: string,
) {
  if (node.entity_type !== "definition") return

  const payload = object(node.payload)
  const rawMechanics = Array.isArray(payload.mechanics)
    ? payload.mechanics
    : []

  if (!rawMechanics.length) return

  const compilationId = string(payload.mechanics_compilation_id)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(compilationId)
  ) {
    throw new Error(
      "Исполняемая механика AI Draft должна сначала пройти Mechanics Compiler.",
    )
  }

  const { data, error } = await supabase
    .from("ai_mechanics_compilations")
    .select("id,campaign_id,status,mechanics")
    .eq("id", compilationId)
    .maybeSingle()

  if (
    error ||
    !data ||
    data.campaign_id !== campaignId ||
    !["validated", "applied"].includes(data.status)
  ) {
    throw new Error(
      "Mechanics Compiler не подтвердил исполняемую механику этого AI Draft.",
    )
  }

  if (stableJson(data.mechanics) !== stableJson(rawMechanics)) {
    throw new Error(
      "Механика AI Draft отличается от проверенного результата Mechanics Compiler. Скомпилируй её заново.",
    )
  }
}

function chasovoyJson(value: unknown): ChasovoyJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) return value
  if (Array.isArray(value)) return value.map(chasovoyJson)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, chasovoyJson(item)]),
    )
  }
  return null
}

function visibility(value: unknown) {
  const candidate = string(value)
  return LOCATION_VISIBILITY.has(candidate)
    ? candidate as "always" | "discover" | "private"
    : "discover"
}

function relationTargetKey(relation: AIDraftRelation) {
  return relation.to_key || null
}

function relationTargetExisting(relation: AIDraftRelation) {
  return relation.to_existing || null
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "draft"
}

function makeContext(campaignId: string, userId: string) {
  return createEngineCommandContext({
    campaignId,
    requestedBy: userId,
    authority: "gm",
  })
}

function nodesByKey(draft: AIDraft) {
  return new Map((draft.content.nodes || []).map((node) => [node.key, node]))
}

function resolveNodeOrExisting(
  relation: AIDraftRelation,
  map: Record<string, CanonicalRef>,
  expectedType: "location" | "character" | "definition",
) {
  if (relation.to_key) {
    const resolved = map[relation.to_key]
    if (!resolved || resolved.type !== expectedType) {
      throw new Error("Связь не может найти созданную сущность «" + relation.to_key + "».")
    }
    return resolved.id
  }

  const existing = relation.to_existing
  if (!existing || existing.entity_type !== expectedType) {
    throw new Error("Связь не содержит допустимую существующую сущность.")
  }
  return existing.id
}

function parentRelations(draft: AIDraft) {
  return (draft.content.relations || []).filter(
    (relation) => relation.kind === "parent_location",
  )
}

function topologicalLocations(draft: AIDraft) {
  const locations = (draft.content.nodes || []).filter(
    (node) => node.entity_type === "location",
  )
  const byKey = new Map(locations.map((node) => [node.key, node]))
  const parents = new Map<string, string>()

  for (const relation of parentRelations(draft)) {
    if (!byKey.has(relation.from_key)) continue
    const parentKey = relationTargetKey(relation)
    if (parentKey && byKey.has(parentKey)) parents.set(relation.from_key, parentKey)
  }

  const ordered: AIDraftNode[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()

  function visit(key: string) {
    if (visited.has(key)) return
    if (visiting.has(key)) {
      throw new Error("В AI Draft обнаружен цикл родительских локаций.")
    }
    visiting.add(key)
    const parent = parents.get(key)
    if (parent) visit(parent)
    const node = byKey.get(key)
    if (node) ordered.push(node)
    visiting.delete(key)
    visited.add(key)
  }

  for (const node of locations) visit(node.key)
  return ordered
}

function parentRelationFor(draft: AIDraft, nodeKey: string) {
  return parentRelations(draft).find((relation) => relation.from_key === nodeKey) || null
}

async function verifyExistingTarget(
  campaignId: string,
  relation: AIDraftRelation,
) {
  const existing = relationTargetExisting(relation)
  if (!existing) return

  if (existing.entity_type === "location") {
    const { data, error } = await supabase
      .from("locations")
      .select("id")
      .eq("id", existing.id)
      .eq("campaign_id", campaignId)
      .maybeSingle()
    if (error || !data) throw new Error("Существующая локация связи недоступна.")
    return
  }

  if (existing.entity_type === "character") {
    const { data, error } = await supabase
      .from("characters")
      .select("id")
      .eq("id", existing.id)
      .eq("campaign_id", campaignId)
      .maybeSingle()
    if (error || !data) throw new Error("Существующий персонаж связи недоступен.")
    return
  }

  const { data, error } = await supabase
    .from("reference_definitions")
    .select("id,scope,campaign_id")
    .eq("id", existing.id)
    .maybeSingle()
  if (
    error ||
    !data ||
    (data.scope === "campaign" && data.campaign_id !== campaignId)
  ) {
    throw new Error("Существующее определение связи недоступно.")
  }
}

async function preflight(
  draft: AIDraft,
  campaignId: string,
) {
  if (draft.status !== "review") {
    throw new Error("Этот AI Draft уже не находится на проверке.")
  }

  const nodes = draft.content.nodes || []
  if (!nodes.length) throw new Error("AI Draft пуст.")

  const keys = new Set<string>()
  for (const node of nodes) {
    if (keys.has(node.key)) throw new Error("В AI Draft есть повторяющиеся ключи сущностей.")
    keys.add(node.key)

    if (
      node.entity_type === "definition" &&
      !DEFINITION_KINDS.has((node.entity_subtype || "reference") as ChasovoyDefinitionKind)
    ) {
      throw new Error("Тип определения «" + (node.entity_subtype || "") + "» пока нельзя применить.")
    }

    await verifyCompiledMechanics(node, campaignId)
  }

  topologicalLocations(draft)

  for (const relation of draft.content.relations || []) {
    if (!keys.has(relation.from_key)) {
      throw new Error("Связь ссылается на отсутствующий источник «" + relation.from_key + "».")
    }
    if (relation.to_key && !keys.has(relation.to_key)) {
      throw new Error("Связь ссылается на отсутствующую цель «" + relation.to_key + "».")
    }
    if (relation.kind === "depends_on") {
      throw new Error(
        "Связь depends_on пока не имеет канонического владельца. Удали или замени её перед применением.",
      )
    }
    await verifyExistingTarget(campaignId, relation)
  }

  for (const node of nodes.filter((item) => item.entity_type === "character")) {
    const payload = object(node.payload)
    const templateId = string(payload.class_template_id)
    if (!templateId) continue
    const { data, error } = await supabase
      .from("rule_templates")
      .select("id")
      .eq("id", templateId)
      .eq("campaign_id", campaignId)
      .maybeSingle()
    if (error || !data) {
      throw new Error("Класс для персонажа «" + node.name + "» недоступен.")
    }
  }
}

function plannedSteps(draft: AIDraft): ApplyStep[] {
  const steps: ApplyStep[] = []
  const relations = draft.content.relations || []

  for (const node of topologicalLocations(draft)) {
    steps.push({
      key: "location:" + node.key,
      kind: "location.create",
      label: "Создать локацию «" + node.name + "»",
    })
    const sections = Array.isArray(object(node.payload).sections)
      ? object(node.payload).sections as unknown[]
      : []
    sections.forEach((_, index) => steps.push({
      key: "section:" + node.key + ":" + index,
      kind: "location.section.create",
      label: "Создать секцию локации «" + node.name + "»",
    }))

    const needsTransitionAnchor =
      relations.some((relation) =>
        relation.kind === "location_transition" && relation.from_key === node.key
      ) && sections.length === 0

    if (needsTransitionAnchor) {
      steps.push({
        key: "section:" + node.key + ":transitions",
        kind: "location.section.create",
        label: "Создать секцию переходов «" + node.name + "»",
      })
    }
  }

  for (const node of draft.content.nodes || []) {
    if (node.entity_type === "character") {
      steps.push({
        key: "character:" + node.key,
        kind: "character.create",
        label: "Создать персонажа «" + node.name + "»",
      })
      if (string(object(node.payload).class_template_id)) {
        steps.push({
          key: "template:" + node.key,
          kind: "character.assign_template",
          label: "Назначить класс персонажу «" + node.name + "»",
        })
      }
    }

    if (node.entity_type === "definition") {
      steps.push({
        key: "definition:" + node.key,
        kind: "definition.create",
        label: "Создать определение «" + node.name + "»",
      })
    }
  }

  for (const relation of relations) {
    if (relation.kind === "location_transition") {
      steps.push({
        key: "transition:" + relation.from_key + ":" + (relation.to_key || relation.to_existing?.id || ""),
        kind: "location.link.create",
        label: "Создать переход «" + (relation.label || "Переход") + "»",
      })
    } else if (relation.kind === "npc_habitat") {
      steps.push({
        key: "habitat:" + relation.from_key,
        kind: "location.npc_habitat",
        label: "Привязать NPC к локации",
      })
    } else if (relation.kind === "inventory_owner") {
      steps.push({
        key: "inventory:" + relation.from_key,
        kind: "inventory.create",
        label: "Выдать предмет персонажу",
      })
    }
  }

  return steps
}

async function beginRun(draft: AIDraft, steps: ApplyStep[]) {
  const { data, error } = await supabase.rpc("begin_ai_draft_apply_v1", {
    p_draft_id: draft.id,
    p_expected_revision: draft.current_revision,
    p_planned_steps: steps,
  })
  if (error || !data) throw new Error(error?.message || "Не удалось начать применение AI Draft.")
  return String(data)
}

async function recordStep(
  runId: string,
  step: ApplyStep,
  entity?: { key: string; ref: CanonicalRef },
) {
  const { error } = await supabase.rpc("record_ai_draft_apply_step_v1", {
    p_run_id: runId,
    p_step: step,
    p_entity_key: entity?.key || null,
    p_entity_type: entity?.ref.type || null,
    p_entity_id: entity?.ref.id || null,
  })
  if (error) throw new Error(error.message)
}

async function finishRun(
  runId: string,
  succeeded: boolean,
  partialHint: boolean,
  errorMessage?: string,
) {
  const { data, error } = await supabase.rpc("finish_ai_draft_apply_v2", {
    p_run_id: runId,
    p_succeeded: succeeded,
    p_partial_hint: partialHint,
    p_error: errorMessage || null,
  })
  if (error) throw new Error(error.message)
  return String(data || "")
}

function inventoryInput(
  node: AIDraftNode,
  relation: AIDraftRelation,
  definitionId: string,
): InventoryInput {
  const payload = object(node.payload)
  const data = object(payload.data)
  const relationData = object(relation.data)
  const categoryRaw = string(relationData.category || data.category)
  const category = INVENTORY_CATEGORIES.has(categoryRaw as InventoryCategory)
    ? categoryRaw as InventoryCategory
    : "other"

  const slotRaw = string(relationData.equipment_slot || data.equipment_slot)
  const equipmentSlot = EQUIPMENT_SLOTS.has(slotRaw as EquipmentSlot)
    ? slotRaw as EquipmentSlot
    : null

  const usageRaw = string(relationData.usage_mode || data.usage_mode)
  const usageMode = USAGE_MODES.has(usageRaw as ItemUsageMode)
    ? usageRaw as ItemUsageMode
    : category === "consumable"
      ? "quantity"
      : "none"

  const chargesMax = usageMode === "charges"
    ? Math.max(1, number(relationData.charges_max || data.charges_max, 1))
    : null

  return {
    name: node.name,
    quantity: Math.max(1, Math.floor(number(relationData.quantity, 1))),
    weight: data.weight == null ? null : Math.max(0, number(data.weight)),
    equipped: category === "equipment" && bool(relationData.equipped),
    category,
    equipment_slot: category === "equipment" ? equipmentSlot : null,
    image_url: null,
    description: string(payload.rules_text) || node.summary,
    definition_id: definitionId,
    definition_revision: 1,
    mechanics: mechanics(payload.mechanics),
    usage_mode: usageMode,
    charges_current: chargesMax == null
      ? null
      : Math.max(0, Math.min(chargesMax, number(relationData.charges_current, chargesMax))),
    charges_max: chargesMax,
    item_state: object(relationData.item_state),
  }
}

export async function applyAIDraft(
  draft: AIDraft,
  campaignId: string,
  userId: string,
): Promise<AIDraftApplyResult> {
  let runId: string | undefined
  let completed = 0
  const entityMap: Record<string, CanonicalRef> = {}
  const sectionMap = new Map<string, string[]>()

  try {
    await preflight(draft, campaignId)
    const steps = plannedSteps(draft)
    runId = await beginRun(draft, steps)
    const nodeMap = nodesByKey(draft)

    for (const node of topologicalLocations(draft)) {
      const payload = object(node.payload)
      const parent = parentRelationFor(draft, node.key)
      let parentLocationId: string | null = null
      if (parent) {
        parentLocationId = resolveNodeOrExisting(parent, entityMap, "location")
      }

      const result = await engineRuntime.oracle.world.createLocation(
        makeContext(campaignId, userId),
        {
          parentLocationId,
          name: node.name,
          summary: node.summary,
          description: string(payload.description),
          imageUrl: null,
          visibilityMode: visibility(payload.visibility_mode),
        },
      )
      const locationId = String(
        result.value.details.locationId ||
        result.value.locationIds[0] ||
        "",
      )
      if (!locationId) throw new Error("Larisa не вернула ID созданной локации.")

      const ref: CanonicalRef = { type: "location", id: locationId }
      entityMap[node.key] = ref
      completed += 1
      const locationStep = steps.find((step) => step.key === "location:" + node.key)!
      await recordStep(runId, locationStep, { key: node.key, ref })

      const sections = Array.isArray(payload.sections)
        ? payload.sections.map(object)
        : []
      const sectionIds: string[] = []

      for (let index = 0; index < sections.length; index += 1) {
        const section = sections[index]
        const sectionResult = await engineRuntime.oracle.world.createLocationSection(
          makeContext(campaignId, userId),
          locationId,
          string(section.title) || "Раздел",
          string(section.body),
        )
        const sectionId = String(sectionResult.value.details.sectionId || "")
        if (!sectionId) throw new Error("Larisa не вернула ID секции локации.")
        sectionIds.push(sectionId)
        completed += 1
        await recordStep(
          runId,
          steps.find((step) => step.key === "section:" + node.key + ":" + index)!,
          { key: "section:" + node.key + ":" + index, ref: { type: "section", id: sectionId } },
        )
      }

      const needsTransitionAnchor =
        (draft.content.relations || []).some((relation) =>
          relation.kind === "location_transition" && relation.from_key === node.key
        ) && sectionIds.length === 0

      if (needsTransitionAnchor) {
        const sectionResult = await engineRuntime.oracle.world.createLocationSection(
          makeContext(campaignId, userId),
          locationId,
          "Переходы",
          "",
        )
        const sectionId = String(sectionResult.value.details.sectionId || "")
        if (!sectionId) throw new Error("Larisa не вернула ID секции переходов.")
        sectionIds.push(sectionId)
        completed += 1
        await recordStep(
          runId,
          steps.find((step) => step.key === "section:" + node.key + ":transitions")!,
          { key: "section:" + node.key + ":transitions", ref: { type: "section", id: sectionId } },
        )
      }

      sectionMap.set(node.key, sectionIds)
    }

    for (const node of draft.content.nodes || []) {
      if (node.entity_type !== "character") continue
      const payload = object(node.payload)
      const characterType = node.entity_subtype === "pc" ? "pc" : "npc"
      const visibilityMode = visibility(payload.visibility_mode)

      const result = await engineRuntime.oracle.characters.create(
        makeContext(campaignId, userId),
        {
          name: node.name,
          character_class: string(payload.character_class) || "Персонаж",
          level: Math.max(1, Math.min(20, Math.floor(number(payload.level, 1)))),
          bio: string(payload.bio),
          avatar_url: null,
          assigned_user_id: null,
          character_type: characterType,
          visibility: visibilityMode === "private" ? "private" : "campaign",
          visibility_mode: visibilityMode,
          publication_state: "campaign",
        },
      )

      const characterId = result.value.after?.id || result.value.characterIds[0] || ""
      if (!characterId) throw new Error("Шапокляк не вернула ID созданного персонажа.")

      const ref: CanonicalRef = { type: "character", id: characterId }
      entityMap[node.key] = ref
      completed += 1
      await recordStep(
        runId,
        steps.find((step) => step.key === "character:" + node.key)!,
        { key: node.key, ref },
      )

      const templateId = string(payload.class_template_id)
      if (templateId) {
        await engineRuntime.oracle.characters.assignTemplate(
          makeContext(campaignId, userId),
          characterId,
          {
            templateId,
            templateLevel: Math.max(1, Math.min(20, Math.floor(number(payload.level, 1)))),
            selectedChoices: {},
          },
        )
        completed += 1
        await recordStep(
          runId,
          steps.find((step) => step.key === "template:" + node.key)!,
        )
      }
    }

    for (const node of draft.content.nodes || []) {
      if (node.entity_type !== "definition") continue
      const payload = object(node.payload)
      const kind = (node.entity_subtype || "reference") as ChasovoyDefinitionKind

      const result = await engineRuntime.oracle.definitions.create(
        makeContext(campaignId, userId),
        {
          kind,
          scope: "campaign",
          campaignId,
          slug: "ai-" + draft.id.slice(0, 8) + "-" + slugPart(node.key),
          visibility: string(payload.visibility) === "campaign" ? "campaign" : "gm",
          status: "active",
          sourceKind: "custom",
          sourceLabel: "Voss AI Draft",
          externalId: "ai-draft:" + draft.id + ":" + node.key,
          name: node.name,
          summary: string(payload.summary) || node.summary,
          rulesText: string(payload.rules_text),
          mechanics: chasovoyJson(payload.mechanics),
          data: object(payload.data) as Record<string, ChasovoyJson>,
        },
      )

      const definitionId = result.value.definitionId || result.value.after?.id || ""
      if (!definitionId) throw new Error("Часовой не вернул ID созданного определения.")

      const ref: CanonicalRef = { type: "definition", id: definitionId }
      entityMap[node.key] = ref
      completed += 1
      await recordStep(
        runId,
        steps.find((step) => step.key === "definition:" + node.key)!,
        { key: node.key, ref },
      )
    }

    for (const relation of draft.content.relations || []) {
      if (relation.kind === "location_transition") {
        const source = entityMap[relation.from_key]
        if (!source || source.type !== "location") {
          throw new Error("Не найдена исходная локация перехода.")
        }
        const targetId = resolveNodeOrExisting(relation, entityMap, "location")
        const sectionId = sectionMap.get(relation.from_key)?.[0]
        if (!sectionId) throw new Error("Для перехода не создана секция-источник.")

        await engineRuntime.oracle.world.createLocationLink(
          makeContext(campaignId, userId),
          sectionId,
          targetId,
          relation.label || "Переход",
          visibility(object(relation.data).visibility_mode),
        )
        completed += 1
        await recordStep(
          runId,
          steps.find((step) =>
            step.key ===
            "transition:" + relation.from_key + ":" +
            (relation.to_key || relation.to_existing?.id || "")
          )!,
        )
      }

      if (relation.kind === "npc_habitat") {
        const source = entityMap[relation.from_key]
        if (!source || source.type !== "character") {
          throw new Error("Не найден NPC для привязки к локации.")
        }
        const locationId = resolveNodeOrExisting(relation, entityMap, "location")
        await engineRuntime.oracle.world.setNpcHabitat(
          makeContext(campaignId, userId),
          source.id,
          locationId,
          true,
        )
        completed += 1
        await recordStep(
          runId,
          steps.find((step) => step.key === "habitat:" + relation.from_key)!,
        )
      }

      if (relation.kind === "inventory_owner") {
        const itemNode = nodeMap.get(relation.from_key)
        const definition = entityMap[relation.from_key]
        if (
          !itemNode ||
          itemNode.entity_type !== "definition" ||
          itemNode.entity_subtype !== "item" ||
          !definition ||
          definition.type !== "definition"
        ) {
          throw new Error("Не найдено каноническое определение выдаваемого предмета.")
        }

        const characterId = resolveNodeOrExisting(relation, entityMap, "character")
        const result = await engineRuntime.oracle.inventory.create(
          makeContext(campaignId, userId),
          characterId,
          inventoryInput(itemNode, relation, definition.id),
        )
        const itemId = result.value.itemId
        if (!itemId) throw new Error("Чебурашка не вернула ID выданного предмета.")

        completed += 1
        await recordStep(
          runId,
          steps.find((step) => step.key === "inventory:" + relation.from_key)!,
          {
            key: "inventory:" + relation.from_key,
            ref: { type: "item", id: itemId },
          },
        )
      }
    }

    await finishRun(runId, true, false)
    return { ok: true, runId, entityMap }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    if (runId) {
      try {
        await finishRun(runId, false, completed > 0, message)
      } catch {
        // The canonical error remains the useful failure. The run can be inspected manually.
      }
    }
    return {
      ok: false,
      ...(runId ? { runId } : {}),
      partial: completed > 0,
      error: message,
    }
  }
}
