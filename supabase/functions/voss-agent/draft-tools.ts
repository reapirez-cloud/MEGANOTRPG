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
        "Create a GM-only structured AI draft for future MEGANOT content. Use only when the GM explicitly asks to create/design/generate content. This NEVER changes canonical game state. If a definition payload contains executable mechanics, those exact mechanics must come from compile_mechanics and payload.mechanics_compilation_id must contain that compilation id.",
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
  {
    type: "function",
    function: {
      name: "read_content_draft",
      description:
        "Read one existing GM-only AI draft before revising it. Returns the current revision, structured nodes, relations and validation warnings. This does not read canonical game state.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          draft_id: { type: "string" },
        },
        required: ["draft_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "revise_content_draft",
      description:
        "Create a new immutable revision of an existing AI draft using targeted changes. Read the draft first. This NEVER changes canonical MEGANOT state. Any executable mechanics in a definition payload must be the exact output of a validated Mechanics Compiler artifact and carry payload.mechanics_compilation_id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          draft_id: { type: "string" },
          expected_revision: {
            type: "integer",
            minimum: 1,
          },
          change_summary: {
            type: "string",
            description: "Short human-readable summary of requested changes.",
          },
          title: { type: "string" },
          summary: { type: "string" },
          nodes_upsert: {
            type: "array",
            maxItems: 16,
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
          node_keys_remove: {
            type: "array",
            maxItems: 16,
            items: { type: "string" },
          },
          relations_add: {
            type: "array",
            maxItems: 24,
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
          relations_remove: {
            type: "array",
            maxItems: 24,
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
                to_existing_id: { type: "string" },
                label: { type: "string" },
              },
              required: ["kind", "from_key"],
            },
          },
        },
        required: [
          "draft_id",
          "expected_revision",
          "change_summary",
          "nodes_upsert",
          "node_keys_remove",
          "relations_add",
          "relations_remove",
        ],
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
    mechanics_compilation_id:
      text(source.mechanics_compilation_id, 100) || null,
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

function relationSelector(raw: unknown) {
  const row = asObject(raw)
  const kindValue = text(row.kind, 40)
  const fromKey = key(row.from_key)
  if (!RELATION_KINDS.has(kindValue) || !fromKey) return null

  return {
    kind: kindValue,
    from_key: fromKey,
    to_key: key(row.to_key) || undefined,
    to_existing_id: text(row.to_existing_id, 100) || undefined,
    label: text(row.label, 240) || undefined,
  }
}

function relationMatches(
  relation: DraftRelation,
  selector: ReturnType<typeof relationSelector>,
) {
  if (!selector) return false
  if (relation.kind !== selector.kind) return false
  if (relation.from_key !== selector.from_key) return false
  if (selector.to_key && relation.to_key !== selector.to_key) return false
  if (
    selector.to_existing_id &&
    relation.to_existing?.id !== selector.to_existing_id
  ) return false
  if (selector.label && relation.label !== selector.label) return false
  return true
}

function relationSignature(relation: DraftRelation) {
  return [
    relation.kind,
    relation.from_key,
    relation.to_key || "",
    relation.to_existing?.entity_type || "",
    relation.to_existing?.id || "",
    relation.label || "",
  ].join("|")
}

async function loadDraft(
  context: VossDraftToolContext,
  draftId: string,
) {
  const { data, error } = await context.admin
    .from("ai_drafts")
    .select("id,campaign_id,created_by,agent_key,draft_type,title,summary,status,schema_version,current_revision,content,validation_warnings,created_at,updated_at")
    .eq("id", draftId)
    .eq("campaign_id", context.campaignId)
    .eq("status", "review")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { draft: data }
}

async function readContentDraft(
  context: VossDraftToolContext,
  args: JsonObject,
) {
  const draftId = text(args.draft_id, 100)
  if (!draftId) return { error: "draft_id is required" }

  const loaded = await loadDraft(context, draftId)
  if ("error" in loaded || "not_found" in loaded) return loaded

  const { data: revisions, error } = await context.admin
    .from("ai_draft_revisions")
    .select("revision,change_summary,operations,validation_warnings,created_by,created_at")
    .eq("draft_id", draftId)
    .order("revision", { ascending: false })
    .limit(12)

  if (error) return { error: error.message }

  return {
    draft: loaded.draft,
    recent_revisions: revisions || [],
    canonical_state_changed: false,
  }
}

async function reviseContentDraft(
  context: VossDraftToolContext,
  args: JsonObject,
) {
  const draftId = text(args.draft_id, 100)
  const expectedRevision = Math.floor(Number(args.expected_revision))
  const changeSummary = text(args.change_summary, 2000)

  if (!draftId) return { error: "draft_id is required" }
  if (!Number.isFinite(expectedRevision) || expectedRevision < 1) {
    return { error: "expected_revision must be a positive integer" }
  }
  if (!changeSummary) return { error: "change_summary is required" }

  const loaded = await loadDraft(context, draftId)
  if ("error" in loaded || "not_found" in loaded) return loaded

  const draft = loaded.draft
  if (draft.current_revision !== expectedRevision) {
    return {
      error: "draft_revision_conflict",
      current_revision: draft.current_revision,
      expected_revision: expectedRevision,
      instruction: "Read the draft again before revising it.",
    }
  }

  const currentContent = asObject(draft.content)
  const currentNodesRaw = Array.isArray(currentContent.nodes)
    ? currentContent.nodes
    : []
  const currentRelationsRaw = Array.isArray(currentContent.relations)
    ? currentContent.relations
    : []

  const currentNodes = currentNodesRaw
    .map(normalizeNode)
    .filter((node): node is DraftNode => Boolean(node))
  const currentRelations = currentRelationsRaw
    .map(normalizeRelation)
    .filter((relation): relation is DraftRelation => Boolean(relation))

  const removeKeys = new Set(
    (Array.isArray(args.node_keys_remove) ? args.node_keys_remove : [])
      .slice(0, 16)
      .map(key)
      .filter(Boolean),
  )

  const upserts = (Array.isArray(args.nodes_upsert) ? args.nodes_upsert : [])
    .slice(0, 16)
    .map(normalizeNode)
    .filter((node): node is DraftNode => Boolean(node))

  const nodeMap = new Map(
    currentNodes
      .filter((node) => !removeKeys.has(node.key))
      .map((node) => [node.key, node]),
  )

  for (const node of upserts) {
    removeKeys.delete(node.key)
    nodeMap.set(node.key, node)
  }

  if (!nodeMap.size) {
    return { error: "A draft must contain at least one node" }
  }

  let relations = currentRelations.filter((relation) => {
    if (removeKeys.has(relation.from_key)) return false
    if (relation.to_key && removeKeys.has(relation.to_key)) return false
    return true
  })

  const removeSelectors = (
    Array.isArray(args.relations_remove) ? args.relations_remove : []
  )
    .slice(0, 24)
    .map(relationSelector)
    .filter((selector): selector is NonNullable<ReturnType<typeof relationSelector>> =>
      Boolean(selector)
    )

  relations = relations.filter(
    (relation) => !removeSelectors.some((selector) =>
      relationMatches(relation, selector)
    ),
  )

  const additions = (
    Array.isArray(args.relations_add) ? args.relations_add : []
  )
    .slice(0, 24)
    .map(normalizeRelation)
    .filter((relation): relation is DraftRelation => Boolean(relation))

  const relationMap = new Map(
    relations.map((relation) => [relationSignature(relation), relation]),
  )
  for (const relation of additions) {
    relationMap.set(relationSignature(relation), relation)
  }
  relations = [...relationMap.values()]

  const nextArgs: JsonObject = {
    draft_type: draft.draft_type,
    title: text(args.title, 160) || draft.title,
    summary:
      typeof args.summary === "string"
        ? text(args.summary, 4000)
        : draft.summary,
    nodes: [...nodeMap.values()],
    relations,
  }

  const validated = validateDraft(nextArgs)
  if ("error" in validated) return validated

  const operations = [
    ...(upserts.length
      ? [{
          kind: "nodes_upsert",
          keys: upserts.map((node) => node.key),
        }]
      : []),
    ...(removeKeys.size
      ? [{
          kind: "nodes_remove",
          keys: [...removeKeys],
        }]
      : []),
    ...(additions.length
      ? [{
          kind: "relations_add",
          count: additions.length,
        }]
      : []),
    ...(removeSelectors.length
      ? [{
          kind: "relations_remove",
          count: removeSelectors.length,
        }]
      : []),
    ...(nextArgs.title !== draft.title
      ? [{ kind: "title_update" }]
      : []),
    ...(nextArgs.summary !== draft.summary
      ? [{ kind: "summary_update" }]
      : []),
  ]

  const nextRevision = expectedRevision + 1
  const { error: revisionError } = await context.admin
    .from("ai_draft_revisions")
    .insert({
      draft_id: draftId,
      revision: nextRevision,
      content: validated.content,
      validation_warnings: validated.warnings,
      created_by: context.userId,
      change_summary: changeSummary,
      operations,
    })

  if (revisionError) {
    if (/duplicate|unique/i.test(revisionError.message)) {
      return {
        error: "draft_revision_conflict",
        instruction: "Read the draft again before revising it.",
      }
    }
    return { error: revisionError.message }
  }

  const { data: updated, error: updateError } = await context.admin
    .from("ai_drafts")
    .update({
      title: validated.title,
      summary: validated.summary,
      current_revision: nextRevision,
      content: validated.content,
      validation_warnings: validated.warnings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("campaign_id", context.campaignId)
    .eq("current_revision", expectedRevision)
    .select("id,title,draft_type,status,current_revision,updated_at")
    .maybeSingle()

  if (updateError || !updated) {
    await context.admin
      .from("ai_draft_revisions")
      .delete()
      .eq("draft_id", draftId)
      .eq("revision", nextRevision)

    return {
      error: updateError?.message || "draft_revision_conflict",
      instruction: "Read the draft again before revising it.",
    }
  }

  return {
    draft: {
      ...updated,
      summary: validated.summary,
      nodes: validated.content.nodes.length,
      relations: validated.content.relations.length,
      warnings: validated.warnings,
      change_summary: changeSummary,
    },
    previous_revision: expectedRevision,
    new_revision: nextRevision,
    operations,
    canonical_state_changed: false,
    next_step:
      "Новая ревизия сохранена только в AI Draft System. Канонические данные MEGANOT не изменены.",
  }
}

export function isVossDraftTool(name: string) {
  return (
    name === "propose_content_draft" ||
    name === "read_content_draft" ||
    name === "revise_content_draft"
  )
}

export async function executeVossDraftTool(
  context: VossDraftToolContext,
  name: string,
  args: JsonObject,
) {
  if (!context.canManage) return { error: "GM authority required" }

  if (name === "read_content_draft") {
    return readContentDraft(context, args)
  }

  if (name === "revise_content_draft") {
    return reviseContentDraft(context, args)
  }

  if (name !== "propose_content_draft") {
    return { error: "Unknown draft tool" }
  }

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
      change_summary: "Первичная версия AI-черновика.",
      operations: [{ kind: "draft_create" }],
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
