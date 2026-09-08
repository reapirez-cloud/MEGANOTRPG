import { paladinReferenceComplete } from "./paladinReferenceComplete.ts"
import type { ClassReferenceSubclassFeature } from "../classReferenceCatalog.ts"
import type { RuleTemplate, RuleTemplateLevel } from "../../rule-templates/types.ts"
import type { StoredMechanic } from "../../types/characterMechanics.ts"

type AuthoredFeature = ClassReferenceSubclassFeature

type AuthoredSubclass = (typeof paladinReferenceComplete.subclasses)[number]

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
  authoredFeatures: readonly AuthoredFeature[] | undefined,
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

  // Runtime groups and authored cards are normally one-to-one by sourceKey. When
  // localized labels drift, preserve the old authored order rather than dropping
  // the translation entirely. This only decorates client-side presentation copies.
  if (unmatchedFeatures.length === unmatchedSources.length) {
    unmatchedFeatures.forEach((feature, index) => assignment.set(unmatchedSources[index], feature))
  } else if (unmatchedFeatures.length === 1 && unmatchedSources.length === 1) {
    assignment.set(unmatchedSources[0], unmatchedFeatures[0])
  }

  return assignment
}

function decorateLevelMechanics(
  level: number,
  authoredFeatures: readonly AuthoredFeature[] | undefined,
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
 *
 * The returned templates are presentation copies only. Runtime resource/action/
 * spell mechanics remain untouched; we restore names, translated rules, stories
 * and Voss comments that existed before the Paladin switched to rule_templates.
 */
export function applyPaladinReferencePresentation(
  templates: RuleTemplate[],
  levels: RuleTemplateLevel[],
) {
  const paladin = templates.find(
    (template) => template.kind === "class" && template.catalog_key === "class:paladin",
  )
  if (!paladin) return { templates, levels }

  const authoredClassFeatures = paladinReferenceComplete.features || []
  const authoredSubclassById = new Map<string, AuthoredSubclass>(
    paladinReferenceComplete.subclasses.map((subclass) => [subclass.id, subclass]),
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
        author_description: paladinReferenceComplete.explanation || template.author_description,
        author_comment: paladinReferenceComplete.voss || template.author_comment,
        mechanics: decorateLevelMechanics(1, authoredClassFeatures, template.mechanics || []),
      }
    }

    const authored = authoredSubclassByTemplateId.get(template.id)
    if (!authored) return template
    const features = "features" in authored ? authored.features : undefined
    return {
      ...template,
      author_description: authored.explanation || template.author_description,
      author_comment: authored.voss || template.author_comment,
      mechanics: decorateLevelMechanics(
        Math.max(1, template.unlock_level || 3),
        features,
        template.mechanics || [],
      ),
    }
  })

  const decoratedLevels = levels.map((row) => {
    if (row.template_id === paladin.id) {
      return {
        ...row,
        mechanics: decorateLevelMechanics(row.level, authoredClassFeatures, row.mechanics || []),
      }
    }

    const authored = authoredSubclassByTemplateId.get(row.template_id)
    if (!authored) return row
    const features = "features" in authored ? authored.features : undefined
    return {
      ...row,
      mechanics: decorateLevelMechanics(row.level, features, row.mechanics || []),
    }
  })

  return { templates: decoratedTemplates, levels: decoratedLevels }
}
