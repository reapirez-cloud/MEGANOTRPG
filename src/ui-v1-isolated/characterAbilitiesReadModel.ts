import type {
  CharacterContribution,
  ResolvedCharacterContract,
  ResolvedSourceRef,
} from "../character-engine/index.ts"
import type { TemplateSourceNode } from "../rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../rule-templates/types.ts"
import type {
  StoredMechanic,
  StoredMechanicPresentation,
} from "../types/characterMechanics.ts"

export const CHARACTER_ABILITY_GROUP_ORDER = [
  "class",
  "subclass",
  "race",
  "background",
  "effect",
] as const

export type CharacterAbilityGroupKey =
  typeof CHARACTER_ABILITY_GROUP_ORDER[number]

export type CharacterAbilityStatus = "active" | "suppressed"

export type CharacterAbilityVossContent = {
  explanation: string
  nuances: string[]
  comment: string
}

export type CharacterAbilityMechanicalRule =
  ResolvedCharacterContract["rules"][number]

export type CharacterAbilityCapabilities = {
  inspect: true
  /**
   * Domain capability only. Viewer authority is applied later by the Snake
   * action provider. A row with no single granular canonical source must not
   * expose a suppression command.
   */
  suppress: boolean
}

export type CharacterAbilityRow = {
  id: string
  group: CharacterAbilityGroupKey
  sourceId: string | null
  sourceIds: string[]
  sourceName: string
  sourceNames: string[]
  sourceType: string
  label: string
  shortDescription: string
  unlockLevel: number | null
  icon: string
  status: CharacterAbilityStatus
  runtimeAvailable: boolean | null
  mechanics: CharacterAbilityMechanicalRule[]
  voss: CharacterAbilityVossContent
  capabilities: CharacterAbilityCapabilities
}

export type CharacterAbilityGroup = {
  key: CharacterAbilityGroupKey
  label: string
  sourceNames: string[]
  rows: CharacterAbilityRow[]
  totalCount: number
  activeCount: number
  suppressedCount: number
}

export type CharacterAbilitiesReadModel = {
  groups: CharacterAbilityGroup[]
  /**
   * Sources that looked ability-like but could not be assigned safely to one
   * of the five approved player-facing groups. Keeping this explicit prevents
   * a future renderer from silently shoving unknown data into "Эффекты".
   */
  unclassifiedSourceIds: string[]
}

export type CharacterAbilitiesReadModelInput = {
  contract: ResolvedCharacterContract
  /**
   * Use the already-built Character Runtime input. It still contains
   * contributions that CE later suppresses, which lets the read-model keep a
   * suppressed ability visible in its original position.
   */
  contributions: readonly CharacterContribution[]
  /** Source graph from the same Character Runtime snapshot. */
  sourceNodes: readonly TemplateSourceNode[]
  /** Character + preparation suppressions effective for this snapshot. */
  suppressedSourceIds?: Iterable<string>
  /**
   * Optional authoring metadata from the same runtime-owned template bundles.
   * This enriches rows with icons/Voss text without changing mechanics.
   */
  templateBundles?: readonly CharacterTemplateBundle[]
}

const GROUP_LABELS: Record<CharacterAbilityGroupKey, string> = {
  class: "Класс",
  subclass: "Подкласс",
  race: "Раса",
  background: "Предыстория",
  effect: "Эффекты",
}

const TEMPLATE_KIND_RANK = new Map([
  ["class", 0],
  ["subclass", 1],
  ["race", 2],
  ["subrace", 3],
] as const)

type SourceBucket = {
  identity: string
  sourceIds: Set<string>
  sourceNames: Set<string>
  sourceTypes: Set<string>
  contributions: CharacterContribution[]
}

type AuthoredMetadata = {
  icon: string
  explanation: string
  nuances: string[]
  comment: string
  description: string
  label: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function uniqueSorted(values: Iterable<string>, locale = "ru") {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, locale))
}

function titleFromKey(value: string) {
  const clean = value
    .replace(/[._:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean) return "Умение"
  return clean.charAt(0).toLocaleUpperCase("ru-RU") + clean.slice(1)
}

function normalizedSourceIdentity(sourceId: string) {
  const legacyFeatureId = sourceId.match(/^legacy-feature:(.+)$/)?.[1]
  if (legacyFeatureId) return "feature:" + legacyFeatureId
  return sourceId
}

function sourceIdsMatch(left: string, right: string) {
  return normalizedSourceIdentity(left) === normalizedSourceIdentity(right)
}

function payloadForContribution(
  contribution: CharacterContribution,
): Record<string, unknown> | null {
  if (contribution.kind !== "grant") return null
  return record(contribution.payload)
}

function contributionLooksLikeAbility(contribution: CharacterContribution) {
  if (contribution.kind === "suppression") return false
  if (contribution.kind === "numeric" || contribution.kind === "formula") {
    return true
  }

  return ![
    "spell",
    "proficiency",
    "language",
  ].includes(contribution.target)
}

function payloadKind(bucket: SourceBucket) {
  for (const contribution of bucket.contributions) {
    const value = text(payloadForContribution(contribution)?.kind)
    if (value) return value
  }
  return ""
}

function groupFromSourceType(
  sourceType: string,
  featureKind: string,
): CharacterAbilityGroupKey | null {
  const value = sourceType.toLocaleLowerCase("ru-RU")

  if (value.includes("subclass")) return "subclass"
  if (value.includes("class")) return "class"
  if (value.includes("subrace") || value.includes("race")) return "race"
  if (
    value.includes("background") ||
    value.includes("origin")
  ) return "background"
  if (
    value.includes("effect") ||
    value.includes("status") ||
    value.includes("condition") ||
    value.includes("curse")
  ) return "effect"

  if (value === "legacy_feature") {
    if (featureKind === "class_feature") return "class"
    if (featureKind === "racial_trait") return "race"
    if (
      featureKind === "background_feature" ||
      featureKind === "background"
    ) return "background"
    if (
      featureKind === "effect" ||
      featureKind === "condition"
    ) return "effect"
  }

  return null
}

function groupForBucket(
  bucket: SourceBucket,
  sourceNode: TemplateSourceNode | null,
): CharacterAbilityGroupKey | null {
  if (sourceNode) {
    if (sourceNode.templateKind === "class") return "class"
    if (sourceNode.templateKind === "subclass") return "subclass"
    if (
      sourceNode.templateKind === "race" ||
      sourceNode.templateKind === "subrace"
    ) return "race"
  }

  const featureKind = payloadKind(bucket)
  for (const sourceType of bucket.sourceTypes) {
    const group = groupFromSourceType(sourceType, featureKind)
    if (group) return group
  }
  return null
}

function sourceNodeForBucket(
  bucket: SourceBucket,
  sourceNodesById: ReadonlyMap<string, TemplateSourceNode>,
) {
  for (const sourceId of bucket.sourceIds) {
    const direct = sourceNodesById.get(sourceId)
    if (direct) return direct

    const normalized = normalizedSourceIdentity(sourceId)
    const normalizedNode = sourceNodesById.get(normalized)
    if (normalizedNode) return normalizedNode
  }
  return null
}

function primaryPayload(bucket: SourceBucket) {
  const ordered = bucket.contributions
    .filter(
      (
        contribution,
      ): contribution is Extract<CharacterContribution, { kind: "grant" }> =>
        contribution.kind === "grant",
    )
    .slice()
    .sort((left, right) => {
      const rank = (
        value: Extract<CharacterContribution, { kind: "grant" }>,
      ) => {
        if (value.target === "feature" || value.target === "trait") return 0
        if (value.target === "action") return 1
        if (value.target === "resource") return 2
        return 3
      }
      return rank(left) - rank(right)
    })

  for (const contribution of ordered) {
    const payload = payloadForContribution(contribution)
    if (payload) return payload
  }
  return null
}

function contributionLabel(bucket: SourceBucket, sourceNode: TemplateSourceNode | null) {
  const payload = primaryPayload(bucket)
  const payloadLabel = text(payload?.label)
  if (payloadLabel) return payloadLabel
  if (sourceNode?.nodeKind !== "template" && sourceNode?.name.trim()) {
    return sourceNode.name.trim()
  }

  for (const contribution of bucket.contributions) {
    if (contribution.source.name?.trim()) return contribution.source.name.trim()
    if (contribution.kind === "grant" && contribution.key.trim()) {
      return titleFromKey(contribution.key)
    }
  }

  return "Умение"
}

function contributionDescription(bucket: SourceBucket) {
  for (const contribution of bucket.contributions) {
    const description = text(payloadForContribution(contribution)?.description)
    if (description) return description
  }
  return ""
}

function allBundleMechanics(bundle: CharacterTemplateBundle): StoredMechanic[] {
  return [
    ...(bundle.template.mechanics || []),
    ...bundle.levels.flatMap((level) => level.mechanics || []),
  ]
}

function authoredMetadataForNode(
  sourceNode: TemplateSourceNode | null,
  bundlesByTemplateId: ReadonlyMap<string, CharacterTemplateBundle>,
): AuthoredMetadata {
  if (!sourceNode) {
    return {
      icon: "",
      explanation: "",
      nuances: [],
      comment: "",
      description: "",
      label: "",
    }
  }

  const bundle = bundlesByTemplateId.get(sourceNode.templateId)
  if (!bundle) {
    return {
      icon: "",
      explanation: "",
      nuances: [],
      comment: "",
      description: "",
      label: "",
    }
  }

  const mechanicIds = new Set(sourceNode.mechanicIds)
  const mechanics = allBundleMechanics(bundle)
    .filter((mechanic) => mechanicIds.has(mechanic.id))

  const presentations = mechanics
    .map((mechanic) => mechanic.presentation)
    .filter(
      (value): value is StoredMechanicPresentation => Boolean(value),
    )

  const label = mechanics
    .map((mechanic) => {
      if ("label" in mechanic) return text(mechanic.label)
      if (mechanic.type === "grant") {
        return text(record(mechanic.payload)?.label)
      }
      return ""
    })
    .find(Boolean) || ""

  const description = mechanics
    .filter(
      (mechanic): mechanic is Extract<StoredMechanic, { type: "grant" }> =>
        mechanic.type === "grant",
    )
    .map((mechanic) => text(record(mechanic.payload)?.description))
    .find(Boolean) || ""

  return {
    icon: presentations.map((value) => text(value.icon)).find(Boolean) || "",
    explanation:
      presentations
        .map((value) => text(value.authorExplanation))
        .find(Boolean) || "",
    nuances: uniqueSorted(
      presentations.flatMap((value) =>
        (value.authorNuances || []).map((item) => text(item)).filter(Boolean)
      ),
    ),
    comment:
      presentations
        .map((value) => text(value.authorComment))
        .find(Boolean) || "",
    description,
    label,
  }
}

function sourceNameForRow(
  bucket: SourceBucket,
  sourceNode: TemplateSourceNode | null,
  templateRootsById: ReadonlyMap<string, TemplateSourceNode>,
) {
  if (sourceNode) {
    const root = templateRootsById.get(sourceNode.templateId)
    if (root?.name.trim()) return root.name.trim()
  }

  const sourceNames = uniqueSorted(bucket.sourceNames)
  return sourceNames[0] || "Источник"
}

function sourceTypeForRow(bucket: SourceBucket, sourceNode: TemplateSourceNode | null) {
  if (sourceNode?.sourceType.trim()) return sourceNode.sourceType.trim()
  return uniqueSorted(bucket.sourceTypes, "en")[0] || "unknown"
}

function suppressedBySourceGraph(
  sourceId: string,
  suppressed: ReadonlySet<string>,
  sourceNodesById: ReadonlyMap<string, TemplateSourceNode>,
) {
  let current: string | undefined = sourceId
  const visited = new Set<string>()

  while (current && !visited.has(current)) {
    visited.add(current)
    if (suppressed.has(current)) return true
    current = sourceNodesById.get(current)?.parentSourceId
  }

  return false
}

function granularSourceId(
  bucket: SourceBucket,
  sourceNode: TemplateSourceNode | null,
) {
  if (sourceNode && sourceNode.nodeKind !== "template") return sourceNode.id

  const exact = uniqueSorted(bucket.sourceIds, "en")
  return exact.length === 1 ? exact[0] : null
}

function sourceRefsMatchBucket(
  refs: readonly ResolvedSourceRef[],
  bucket: SourceBucket,
) {
  return refs.some((ref) =>
    [...bucket.sourceIds].some((sourceId) =>
      sourceIdsMatch(ref.source.id, sourceId)
    )
  )
}

function runtimeAvailability(
  contract: ResolvedCharacterContract,
  bucket: SourceBucket,
): boolean | null {
  const actions = contract.actions.filter((action) =>
    sourceRefsMatchBucket(action.sources, bucket)
  )
  if (!actions.length) return null
  return actions.some((action) => action.available)
}

function mechanicalRules(
  contract: ResolvedCharacterContract,
  bucket: SourceBucket,
) {
  return contract.rules.filter((rule) =>
    sourceRefsMatchBucket(rule.sources, bucket)
  )
}

function rowSort(
  left: CharacterAbilityRow,
  right: CharacterAbilityRow,
) {
  return (
    left.sourceName.localeCompare(right.sourceName, "ru") ||
    (left.unlockLevel ?? Number.MAX_SAFE_INTEGER) -
      (right.unlockLevel ?? Number.MAX_SAFE_INTEGER) ||
    left.label.localeCompare(right.label, "ru") ||
    left.id.localeCompare(right.id)
  )
}

function buildBuckets(
  contributions: readonly CharacterContribution[],
) {
  const buckets = new Map<string, SourceBucket>()

  for (const contribution of contributions) {
    if (!contributionLooksLikeAbility(contribution)) continue
    const rawSourceId = contribution.source.id.trim()
    if (!rawSourceId) continue

    const identity = normalizedSourceIdentity(rawSourceId)
    const current = buckets.get(identity) || {
      identity,
      sourceIds: new Set<string>(),
      sourceNames: new Set<string>(),
      sourceTypes: new Set<string>(),
      contributions: [],
    }

    current.sourceIds.add(rawSourceId)
    if (contribution.source.name?.trim()) {
      current.sourceNames.add(contribution.source.name.trim())
    }
    if (contribution.source.sourceType?.trim()) {
      current.sourceTypes.add(contribution.source.sourceType.trim())
    }
    current.contributions.push(contribution)
    buckets.set(identity, current)
  }

  return [...buckets.values()]
}

function templateKindRank(node: TemplateSourceNode | null) {
  return node
    ? TEMPLATE_KIND_RANK.get(node.templateKind) ?? 99
    : 99
}

export function buildCharacterAbilitiesReadModel(
  input: CharacterAbilitiesReadModelInput,
): CharacterAbilitiesReadModel {
  const sourceNodesById = new Map(
    input.sourceNodes.map((node) => [node.id, node]),
  )
  const templateRootsById = new Map(
    input.sourceNodes
      .filter((node) => node.nodeKind === "template")
      .map((node) => [node.templateId, node]),
  )
  const bundlesByTemplateId = new Map(
    (input.templateBundles || []).map((bundle) => [
      bundle.template.id,
      bundle,
    ]),
  )
  const suppressed = new Set(input.suppressedSourceIds || [])
  const unclassified = new Set<string>()

  const rows = buildBuckets(input.contributions)
    .map((bucket) => {
      const sourceNode = sourceNodeForBucket(bucket, sourceNodesById)
      const group = groupForBucket(bucket, sourceNode)

      if (!group) {
        for (const sourceId of bucket.sourceIds) unclassified.add(sourceId)
        return null
      }

      const authored = authoredMetadataForNode(
        sourceNode,
        bundlesByTemplateId,
      )
      const sourceIds = uniqueSorted(bucket.sourceIds, "en")
      const sourceId = granularSourceId(bucket, sourceNode)
      const fullySuppressed = sourceId
        ? suppressedBySourceGraph(sourceId, suppressed, sourceNodesById)
        : sourceIds.length > 0 &&
          sourceIds.every((candidate) =>
            suppressedBySourceGraph(candidate, suppressed, sourceNodesById)
          )

      const label =
        authored.label ||
        contributionLabel(bucket, sourceNode)
      const shortDescription =
        contributionDescription(bucket) ||
        authored.description ||
        authored.explanation

      const row: CharacterAbilityRow = {
        id: group + ":" + bucket.identity,
        group,
        sourceId,
        sourceIds,
        sourceName: sourceNameForRow(
          bucket,
          sourceNode,
          templateRootsById,
        ),
        sourceNames: uniqueSorted(bucket.sourceNames),
        sourceType: sourceTypeForRow(bucket, sourceNode),
        label,
        shortDescription,
        unlockLevel: sourceNode?.unlockLevel ?? null,
        icon: authored.icon || "ability:" + group,
        status: fullySuppressed ? "suppressed" : "active",
        runtimeAvailable: runtimeAvailability(input.contract, bucket),
        mechanics: mechanicalRules(input.contract, bucket),
        voss: {
          explanation: authored.explanation,
          nuances: authored.nuances,
          comment: authored.comment,
        },
        capabilities: {
          inspect: true,
          suppress: Boolean(sourceId),
        },
      }

      return {
        row,
        templateRank: templateKindRank(sourceNode),
      }
    })
    .filter(
      (
        entry,
      ): entry is {
        row: CharacterAbilityRow
        templateRank: number
      } => Boolean(entry),
    )
    .sort((left, right) =>
      left.templateRank - right.templateRank ||
      rowSort(left.row, right.row)
    )
    .map((entry) => entry.row)

  const rootSourceNames = new Map<CharacterAbilityGroupKey, string[]>()
  for (const node of input.sourceNodes) {
    if (node.nodeKind !== "template") continue

    const key: CharacterAbilityGroupKey | null =
      node.templateKind === "class"
        ? "class"
        : node.templateKind === "subclass"
          ? "subclass"
          : node.templateKind === "race" || node.templateKind === "subrace"
            ? "race"
            : null
    if (!key) continue

    rootSourceNames.set(key, [
      ...(rootSourceNames.get(key) || []),
      node.name,
    ])
  }

  const groups = CHARACTER_ABILITY_GROUP_ORDER.map((key) => {
    const groupRows = rows
      .filter((row) => row.group === key)
      .sort(rowSort)
    const sourceNames = uniqueSorted([
      ...(rootSourceNames.get(key) || []),
      ...groupRows.map((row) => row.sourceName),
    ])
    const suppressedCount = groupRows.filter(
      (row) => row.status === "suppressed",
    ).length

    return {
      key,
      label: GROUP_LABELS[key],
      sourceNames,
      rows: groupRows,
      totalCount: groupRows.length,
      activeCount: groupRows.length - suppressedCount,
      suppressedCount,
    } satisfies CharacterAbilityGroup
  })

  return {
    groups,
    unclassifiedSourceIds: uniqueSorted(unclassified, "en"),
  }
}
