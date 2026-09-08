import { paladinReferenceComplete } from "./paladinReferenceComplete.ts"
import type { RuleTemplate, RuleTemplateLevel } from "../../rule-templates/types.ts"
import type { StoredMechanic } from "../../types/characterMechanics.ts"

type AuthoredFeature = {
  level: number
  name: string
  explanation: string
  mechanics: string
  voss?: string
}

type AuthoredSubclass = {
  id: string
  explanation?: string
  voss?: string
  features?: AuthoredFeature[]
}

type AuthoredPaladin = {
  explanation?: string
  voss?: string
  features?: AuthoredFeature[]
  subclasses: AuthoredSubclass[]
}

const authoredPaladin = paladinReferenceComplete as unknown as AuthoredPaladin

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, "")
}

function mechanicSource(mechanic: StoredMechanic) {
  return mechanic.sourceKey?.trim() || mechanic.id
}

function mechanicLabels(mechanics: StoredMechanic[]) {
  const labels = new Set<string>()
  for (const mechanic of mechanics) {
    if ("label" in mechanic && typeof mechanic.label === "string" && mechanic.label.trim()) {
      labels.add(mechanic.label.trim())
    }
    if (mechanic.type === "grant" && isRecord(mechanic.payload)) {
      const label = mechanic.payload.label
      if (typeof label === "string" && label.trim()) labels.add(label.trim())
    }
  }
  return [...labels]
}

function decorateMechanic(mechanic: StoredMechanic, feature: AuthoredFeature): StoredMechanic {
  const presentation = {
    ...mechanic.presentation,
    authorExplanation: feature.explanation,
    authorComment: feature.voss,
  }

  if (mechanic.type !== "grant" || mechanic.target !== "feature" || !isRecord(mechanic.payload)) {
    return { ...mechanic, presentation } as StoredMechanic
  }

  const existingDescription = typeof mechanic.payload.description === "string"
    ? mechanic.payload.description
    : ""

  return {
    ...mechanic,
    payload: {
      ...mechanic.payload,
      label: feature.name,
      description: feature.mechanics || existingDescription,
      authorExplanation: feature.explanation,
      authorComment: feature.voss,
    },
    presentation,
  } as StoredMechanic
}

function featureAssignments(
  level: number,
  authoredFeatures: AuthoredFeature[] | undefined,
  mechanics: StoredMechanic[],
) {
  const authored = (authoredFeatures || []).filter((feature) => feature.level === level)
  const groups = new Map<string, StoredMechanic[]>()
  for (const mechanic of mechanics) {
    const source = mechanicSource(mechanic)
    groups.set(source, [...(groups.get(source) || []), mechanic])
  }

  const assignment = new Map<string, AuthoredFeature>()
  const usedFeatures = new Set<AuthoredFeature>()

  for (const feature of authored) {
    const authoredName = normalizeName(feature.name)
    if (!authoredName) continue
    const match = [...groups.entries()].find(([source, group]) => {
      if (assignment.has(source)) return false
      return mechanicLabels(group).some((label) => {
        const runtimeName = normalizeName(label)
        return runtimeName.length >= 4 && (
          authoredName.includes(runtimeName) || runtimeName.includes(authoredName)
        )
      })
    })
    if (!match) continue
    assignment.set(match[0], feature)
    usedFeatures.add(feature)
  }

  const unmatchedFeatures = authored.filter((feature) => !usedFeatures.has(feature))
  const unmatchedSources = [...groups.keys()].filter((source) => !assignment.has(source))
  if (unmatchedFeatures.length === unmatchedSources.length) {
    unmatchedFeatures.forEach((feature, index) => assignment.set(unmatchedSources[index], feature))
  }

  return assignment
}

function decorateLevelMechanics(
  level: number,
  authoredFeatures: AuthoredFeature[] | undefined,
  mechanics: StoredMechanic[],
) {
  const assignment = featureAssignments(level, authoredFeatures, mechanics)
  if (!assignment.size) return mechanics
  return mechanics.map((mechanic) => {
    const feature = assignment.get(mechanicSource(mechanic))
    return feature ? decorateMechanic(mechanic, feature) : mechanic
  })
}

function subclassId(template: RuleTemplate) {
  const prefix = "subclass:paladin:"
  const catalogKey = template.catalog_key?.trim() || ""
  return catalogKey.startsWith(prefix) ? catalogKey.slice(prefix.length) : ""
}

/**
 * Restores the authored Russian Paladin reference layer over live CE mechanics.
 * These are presentation-only copies; Character Engine execution is untouched.
 */
export function applyPaladinReferencePresentation(
  templates: RuleTemplate[],
  levels: RuleTemplateLevel[],
) {
  const paladin = templates.find(
    (template) => template.kind === "class" && template.catalog_key === "class:paladin",
  )
  if (!paladin) return { templates, levels }

  const authoredSubclassById = new Map(
    authoredPaladin.subclasses.map((subclass) => [subclass.id, subclass]),
  )
  const authoredSubclassByTemplateId = new Map<string, AuthoredSubclass>()

  for (const template of templates) {
    if (template.kind !== "subclass" || template.parent_template_id !== paladin.id) continue
    const authored = authoredSubclassById.get(subclassId(template))
    if (authored) authoredSubclassByTemplateId.set(template.id, authored)
  }

  const decoratedTemplates = templates.map((template) => {
    if (template.id === paladin.id) {
      return {
        ...template,
        author_description: authoredPaladin.explanation || template.author_description,
        author_comment: authoredPaladin.voss || template.author_comment,
        mechanics: decorateLevelMechanics(1, authoredPaladin.features, template.mechanics || []),
      }
    }

    const authored = authoredSubclassByTemplateId.get(template.id)
    if (!authored) return template
    return {
      ...template,
      author_description: authored.explanation || template.author_description,
      author_comment: authored.voss || template.author_comment,
      mechanics: decorateLevelMechanics(
        Math.max(1, template.unlock_level || 3),
        authored.features,
        template.mechanics || [],
      ),
    }
  })

  const decoratedLevels = levels.map((row) => {
    if (row.template_id === paladin.id) {
      return {
        ...row,
        mechanics: decorateLevelMechanics(row.level, authoredPaladin.features, row.mechanics || []),
      }
    }

    const authored = authoredSubclassByTemplateId.get(row.template_id)
    if (!authored) return row
    return {
      ...row,
      mechanics: decorateLevelMechanics(row.level, authored.features, row.mechanics || []),
    }
  })

  return { templates: decoratedTemplates, levels: decoratedLevels }
}
