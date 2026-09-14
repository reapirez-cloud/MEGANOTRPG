import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

type JsonObject = Record<string, unknown>

type DraftNode = {
  key: string
  entity_type: "location" | "character" | "definition"
  entity_subtype?: "npc" | "pc" | "item" | "spell" | "feature" | "condition" | "feat" | "reference"
  name: string
  summary: string
  payload: JsonObject
}

type DraftRelation = {
  kind:
    | "parent_location"
    | "location_transition"
    | "npc_habitat"
    | "inventory_owner"
    | "depends_on"
  from_key: string
  to_key?: string
  to_existing?: {
    entity_type: "location" | "character" | "definition"
    id: string
    label?: string
  }
  label?: string
  data?: JsonObject
}

export type VossDraftToolContext = {
  admin: SupabaseClient
  campaignId: string
  userId: string
  threadId: string
  canManage: boolean
}

export const VOSS_DRAFT_TOOLS = [
  {
    type: "function",
    function: {
      name: "propose_content_draft",
      description:
        "Create a GM-only structured AI draft for future MEGANOT content. Use only when the GM explicitly asks to create/design/generate content. This NEVER changes canonical game state.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          draft_type: {
            type: "string",
            enum: ["bundle", "location", "character", "definition"],
          },
          title: { type: "string" },
          summary: { type: "string" },
          nodes: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                key: { type: "string" },
                entity_type: {
                  type: "string",
                  enum: ["location", "character", "definition"],
                },
                entity_subtype: {
                  type: "string",
                  enum: [
                    "npc",
                    "pc",
                    "item",
                    "spell",
                    "feature",
                    "condition",
                    "feat",
                    "reference",
                  ],
                },
                name: { type: "string" },
                summary: { type: "string" },
                payload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              required: ["key", "entity_type", "name", "summary", "payload"],
            },
          },
          relations: {
            type: "array",
            maxItems: 40,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: {
                  type: "string",
                  enum: [
                    "parent_location",
                    "location_transition",
                    "npc_habitat",
                    "inventory_owner",
                    "depends_on",
                  ],
                },
                from_key: { type: "string" },
                to_key: { type: "string" },
                to_existing: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    entity_type: {
                      type: "string",
                      enum: ["location", "character", "definition"],
                    },
                    id: { type: "string" },
                    label: { type: "string" },
                  },
                  required: ["entity_type", "id"],
                },
                label: { type: "string" },
                data: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              required: ["kind", "from_key"],
            },
          },
        },
        required: ["draft_type", "title", "summary", "nodes", "relations"],
      },
    },
  },
] as const

const NODE_TYPES = new Set(["location", "character", "definition"])
const CHARACTER_SUBTYPES = new Set(["npc", "pc"])
const DEFINITION_SUBTYPES = new Set([
  "item",
  "spell",
  "feature",
  "condition",
  "feat",
  "reference",
])
const RELATION_KINDS = new Set([
  "parent_location",
  "location_transition",
  "npc_habitat",
  "inventory_owner",
  "depends_on",
])

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function key(value: unknown) {
  return text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 6) return null
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") return value.slice(0, 6000)
  if (Array.isArray(value)) {
    return value.slice(0, 64).map((item) => sanitizeJson(item, depth + 1))
  }
  if (value && typeof value === "object") {
    const output: JsonObject = {}
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, 64)) {
      const cleanKey = rawKey.slice(0, 96)
      if (!cleanKey) continue
      output[cleanKey] = sanitizeJson(rawValue, depth + 1)
    }
    return output
  }
  return null
}

function asObject(value: unknown): JsonObject {
  const sanitized = sanitizeJson(value)
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as JsonObject
    : {}
}

function visibility(value: unknown, fallback: "always" | "discover" | "private" = "discover") {
  const candidate = text(value, 24)
  return ["always", "discover", "private"].includes(candidate)
    ? candidate
    : fallback
}

function normalizePayload(
  entityType: DraftNode["entity_type"],
  subtype: DraftNode["entity_subtype"] | undefined,
  raw: unknown,
): JsonObject {
  const source = asObject(raw)

  if (entityType === "location") {
    const rawSections = Array.isArray(source.sections) ? source.sections.slice(0, 16) : []
    return {
      description: text(source.description, 12000),
      visibility_mode: visibility(source.visibility_mode),
      sections: rawSections.map((section) => {
        const row = asObject(section)
        return {
          title: text(row.title, 160),
          body: text(row.body, 12000),
        }
      }).filter((section) => section.title || section.body),
    }
  }

  if (entityType === "character") {
    const level = Math.max(1, Math.min(20, Number(source.level) || 1))
    return {
      character_type: subtype === "pc" ? "pc" : "npc",
      character_class: text(source.character_class, 120),
      class_template_id: text(source.class_template_id, 100) || null,
      level,
      bio: text(source.bio, 12000),
      visibility_mode: visibility(
        source.visibility_mode,
        subtype === "pc" ? "private" : "discover",
      ),
      design_notes: text(source.design_notes, 6000),
    }
  }

  return {
    definition_kind: subtype || "reference",
    visibility: text(source.visibility, 24) === "campaign" ? "campaign" : "gm",
    summary: text(source.summary, 4000),
    rules_text: text(source.rules_text ?? source.rulesText, 16000),
    mechanics: sanitizeJson(source.mechanics),
    data: asObject(source.data),
    design_notes: text(source.design_notes, 6000),
  }
}

function normalizeNode(raw: unknown): DraftNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as JsonObject
  const entityType = text(row.entity_type, 32)
  if (!NODE_TYPES.has(entityType)) return null

  const nodeKey = key(row.key)
  const name = text(row.name, 160)
  if (!nodeKey || !name) return null

  let subtype = text(row.entity_subtype, 32)
  if (entityType === "location") subtype = ""
  if (entityType === "character" && !CHARACTER_SUBTYPES.has(subtype)) {
    subtype = "npc"
  }
  if (entityType === "definition" && !DEFINITION_SUBTYPES.has(subtype)) {
    subtype = "reference"
  }

  const typedEntity = entityType as DraftNode["entity_type"]
  const typedSubtype = subtype
    ? subtype as DraftNode["entity_subtype"]
    : undefined

  return {
    key: nodeKey,
    entity_type: typedEntity,
    ...(typedSubtype ? { entity_subtype: typedSubtype } : {}),
    name,
    summary: text(row.summary, 2000),
    payload: normalizePayload(typedEntity, typedSubtype, row.payload),
  }
}

function normalizeRelation(raw: unknown): DraftRelation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as JsonObject
  const kindValue = text(row.kind, 40)
  if (!RELATION_KINDS.has(kindValue)) return null

  const fromKey = key(row.from_key)
  const toKey = key(row.to_key)
  const existing =
    row.to_existing &&
    typeof row.to_existing === "object" &&
    !Array.isArray(row.to_existing)
      ? row.to_existing as JsonObject
      : null

  let toExisting: DraftRelation["to_existing"]
  if (existing) {
    const entityType = text(existing.entity_type, 32)
    const id = text(existing.id, 100)
    if (NODE_TYPES.has(entityType) && id) {
      toExisting = {
        entity_type: entityType as "location" | "character" | "definition",
        id,
        ...(text(existing.label, 160)
          ? { label: text(existing.label, 160) }
          : {}),
      }
    }
  }

  if (!fromKey || (!toKey && !toExisting)) return null

  return {
    kind: kindValue as DraftRelation["kind"],
    from_key: fromKey,
    ...(toKey ? { to_key: toKey } : {}),
    ...(toExisting ? { to_existing: toExisting } : {}),
    ...(text(row.label, 240) ? { label: text(row.label, 240) } : {}),
    ...(row.data ? { data: asObject(row.data) } : {}),
  }
}

function compatibleTarget(
  relation: DraftRelation,
  nodes: Map<string, DraftNode>,
  expected: DraftNode["entity_type"],
) {
  if (relation.to_key) return nodes.get(relation.to_key)?.entity_type === expected
  return relation.to_existing?.entity_type === expected
}

function validateDraft(args: JsonObject) {
  const draftType = text(args.draft_type, 32)
  if (!["bundle", "location", "character", "definition"].includes(draftType)) {
    return { error: "Invalid draft_type" }
  }

  const title = text(args.title, 160)
  if (!title) return { error: "Draft title is required" }

  const rawNodes = Array.isArray(args.nodes) ? args.nodes.slice(0, 24) : []
  const nodes = rawNodes
    .map(normalizeNode)
    .filter((node): node is DraftNode => Boolean(node))
  if (!nodes.length) return { error: "Draft requires at least one valid node" }

  const keys = new Set<string>()
  for (const node of nodes) {
    if (keys.has(node.key)) return { error: "Draft node keys must be unique" }
    keys.add(node.key)
  }

  const nodeByKey = new Map(nodes.map((node) => [node.key, node]))
  const rawRelations = Array.isArray(args.relations)
    ? args.relations.slice(0, 40)
    : []
  const relations = rawRelations
    .map(normalizeRelation)
    .filter((relation): relation is DraftRelation => Boolean(relation))

  for (const relation of relations) {
    const from = nodeByKey.get(relation.from_key)
    if (!from) return { error: "Relation source node does not exist" }
    if (relation.to_key && !nodeByKey.has(relation.to_key)) {
      return { error: "Relation target node does not exist" }
    }

    if (
      relation.kind === "parent_location" &&
      (from.entity_type !== "location" ||
        !compatibleTarget(relation, nodeByKey, "location"))
    ) {
      return { error: "parent_location must connect locations" }
    }

    if (
      relation.kind === "location_transition" &&
      (from.entity_type !== "location" ||
        !compatibleTarget(relation, nodeByKey, "location"))
    ) {
      return { error: "location_transition must connect locations" }
    }

    if (
      relation.kind === "npc_habitat" &&
      (from.entity_type !== "character" ||
        from.entity_subtype !== "npc" ||
        !compatibleTarget(relation, nodeByKey, "location"))
    ) {
      return { error: "npc_habitat must connect an NPC to a location" }
    }

    if (
      relation.kind === "inventory_owner" &&
      (from.entity_type !== "definition" ||
        from.entity_subtype !== "item" ||
        !compatibleTarget(relation, nodeByKey, "character"))
    ) {
      return { error: "inventory_owner must connect an item definition to a character" }
    }
  }

  const warnings: string[] = []
  if (draftType !== "bundle" && nodes.length > 1) {
    warnings.push("Черновик содержит несколько сущностей; при публикации он будет обрабатываться как связанный набор.")
  }

  for (const node of nodes) {
    if (node.entity_type === "location" && !text(node.payload.description, 6000)) {
      warnings.push("У локации «" + node.name + "» нет полного описания.")
    }
    if (node.entity_type === "character" && !text(node.payload.bio, 6000)) {
      warnings.push("У персонажа «" + node.name + "» нет биографии/описания.")
    }
    if (
      node.entity_type === "definition" &&
      !text(node.payload.rules_text, 6000) &&
      !text(node.payload.rulesText, 6000)
    ) {
      warnings.push("У определения «" + node.name + "» нет текста правил.")
    }
  }

  const content = {
    schemaVersion: 1,
    nodes,
    relations,
  }

  const rawContent = JSON.stringify(content)
  if (rawContent.length > 60000) {
    return { error: "Draft is too large" }
  }

  return {
    draftType: draftType as "bundle" | "location" | "character" | "definition",
    title,
    summary: text(args.summary, 4000),
    content,
    warnings: warnings.slice(0, 24),
  }
}

export function isVossDraftTool(name: string) {
  return name === "propose_content_draft"
}

export async function executeVossDraftTool(
  context: VossDraftToolContext,
  name: string,
  args: JsonObject,
) {
  if (!context.canManage) return { error: "GM authority required" }
  if (name !== "propose_content_draft") return { error: "Unknown draft tool" }

  const validated = validateDraft(args)
  if ("error" in validated) return validated

  const { data: draft, error: draftError } = await context.admin
    .from("ai_drafts")
    .insert({
      campaign_id: context.campaignId,
      thread_id: context.threadId,
      created_by: context.userId,
      agent_key: "voss",
      draft_type: validated.draftType,
      title: validated.title,
      summary: validated.summary,
      status: "review",
      schema_version: 1,
      current_revision: 1,
      content: validated.content,
      validation_warnings: validated.warnings,
    })
    .select("id,title,draft_type,status,current_revision")
    .single()

  if (draftError || !draft) {
    return { error: draftError?.message || "Could not create AI draft" }
  }

  const { error: revisionError } = await context.admin
    .from("ai_draft_revisions")
    .insert({
      draft_id: draft.id,
      revision: 1,
      content: validated.content,
      validation_warnings: validated.warnings,
      created_by: context.userId,
    })

  if (revisionError) {
    await context.admin.from("ai_drafts").delete().eq("id", draft.id)
    return { error: revisionError.message }
  }

  return {
    draft: {
      ...draft,
      summary: validated.summary,
      nodes: validated.content.nodes.length,
      relations: validated.content.relations.length,
      warnings: validated.warnings,
    },
    canonical_state_changed: false,
    next_step:
      "Черновик сохранён только в AI Draft System. Он ещё не создан в мире, персонажах, инвентаре или Chasovoy.",
  }
}
