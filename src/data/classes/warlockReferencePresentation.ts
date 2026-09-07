import { warlockReferenceCurrent } from "./warlockReferenceCurrent.ts"
import { warlockSubclassReferenceDraft } from "./warlockSubclassReferenceDraft.ts"
import { warlockSubclassReferenceDraftWave2 } from "./warlockSubclassReferenceDraftWave2.ts"
import { warlockSubclassReferenceDraftWave3 } from "./warlockSubclassReferenceDraftWave3.ts"
import type { WarlockSubclassReferenceDraft } from "./warlockSubclassReferenceDraft.ts"
import type { RuleTemplate, RuleTemplateLevel } from "../../rule-templates/types.ts"
import type { StoredMechanic } from "../../types/characterMechanics.ts"

type AuthoredFeature = (typeof warlockReferenceCurrent.features)[number]

const authoredBaseFeatures = warlockReferenceCurrent.features.filter(
  (feature) => !feature.name.startsWith("Воззвание:"),
)

const authoredByLevel = new Map<number, AuthoredFeature>()
for (const feature of authoredBaseFeatures) {
  if (!authoredByLevel.has(feature.level)) authoredByLevel.set(feature.level, feature)
}

const authoredSubclassDrafts: WarlockSubclassReferenceDraft[] = [
  ...warlockSubclassReferenceDraft,
  ...warlockSubclassReferenceDraftWave2,
  ...warlockSubclassReferenceDraftWave3,
]

const authoredSubclassById = new Map(
  authoredSubclassDrafts.map((subclass) => [subclass.id, subclass]),
)

function authoredFeatureForSource(level: number, sourceKey: string | undefined) {
  if (!sourceKey) return undefined
  if (level === 1 && sourceKey === "warlock-base:pact-magic") return authoredByLevel.get(1)
  if (level === 2 && sourceKey === "warlock-base:magical-cunning") return authoredByLevel.get(2)
  if (level === 9 && sourceKey === "warlock-base:contact-patron") return authoredByLevel.get(9)
  if (level === 11 && sourceKey === "warlock-base:mystic-arcanum-6") return authoredByLevel.get(11)
  if (level === 20 && sourceKey === "warlock-base:eldritch-master") return authoredByLevel.get(20)
  return undefined
}

function decorateMechanics(level: number, mechanics: StoredMechanic[]) {
  return mechanics.map((mechanic) => {
    const authored = authoredFeatureForSource(level, mechanic.sourceKey)
    if (!authored) return mechanic
    return {
      ...mechanic,
      presentation: {
        ...mechanic.presentation,
        authorExplanation: authored.explanation,
        authorComment: authored.voss,
      },
    }
  })
}

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "")
}

function mechanicLabels(mechanics: StoredMechanic[]) {
  const labels = new Set<string>()
  for (const mechanic of mechanics) {
    if ("label" in mechanic && typeof mechanic.label === "string" && mechanic.label.trim()) {
      labels.add(mechanic.label.trim())
    }
    if (mechanic.type === "grant" && mechanic.payload && typeof mechanic.payload === "object") {
      const label = (mechanic.payload as { label?: unknown }).label
      if (typeof label === "string" && label.trim()) labels.add(label.trim())
    }
  }
  return [...labels]
}

function decorateSubclassMechanics(
  subclass: WarlockSubclassReferenceDraft,
  level: number,
  mechanics: StoredMechanic[],
) {
  const authored = subclass.features.filter((feature) => feature.level === level)
  if (!authored.length || !mechanics.length) return mechanics

  const groups = new Map<string, StoredMechanic[]>()
  for (const mechanic of mechanics) {
    const key = mechanic.sourceKey?.trim() || mechanic.id
    groups.set(key, [...(groups.get(key) || []), mechanic])
  }

  const featureBySource = new Map<string, (typeof authored)[number]>()
  for (const feature of authored) {
    const authoredName = normalizeName(feature.name)
    const matched = [...groups.entries()]
      .filter(([, group]) => mechanicLabels(group).some((label) => {
        const runtimeName = normalizeName(label)
        return runtimeName.length >= 5 && (authoredName.includes(runtimeName) || runtimeName.includes(authoredName))
      }))
      .map(([source]) => source)

    if (matched.length) {
      for (const source of matched) if (!featureBySource.has(source)) featureBySource.set(source, feature)
      continue
    }

    if (authored.length === 1 && groups.size === 1) {
      featureBySource.set([...groups.keys()][0], feature)
    }
  }

  return mechanics.map((mechanic) => {
    const source = mechanic.sourceKey?.trim() || mechanic.id
    const feature = featureBySource.get(source)
    if (!feature) return mechanic
    return {
      ...mechanic,
      presentation: {
        ...mechanic.presentation,
        authorExplanation: feature.explanation,
        authorComment: feature.voss,
      },
    }
  })
}

function patronChoiceReferenceMechanic(): StoredMechanic | null {
  const authored = authoredByLevel.get(3)
  if (!authored) return null

  return {
    id: "reference:warlock:patron-choice",
    type: "grant",
    target: "feature",
    key: "warlock_patron_choice_reference",
    sourceKey: "reference:warlock:patron-choice",
    payload: {
      label: authored.name,
      description: authored.mechanics,
    },
    presentation: {
      authorExplanation: authored.explanation,
      authorComment: authored.voss,
    },
  } as unknown as StoredMechanic
}

function subclassId(template: RuleTemplate) {
  const prefix = "subclass:warlock:"
  const catalogKey = template.catalog_key?.trim() || ""
  return catalogKey.startsWith(prefix) ? catalogKey.slice(prefix.length) : ""
}

/**
 * Runtime owns mechanics; this adapter restores the authored Warlock reference
 * layer that existed before the class was switched from static cards to live
 * rule_templates. It never writes to Supabase and never changes CE execution.
 */
export function applyWarlockReferencePresentation(
  templates: RuleTemplate[],
  levels: RuleTemplateLevel[],
) {
  const warlock = templates.find(
    (template) => template.kind === "class" && template.catalog_key === "class:warlock",
  )
  if (!warlock) return { templates, levels }

  const subclassByTemplateId = new Map<string, WarlockSubclassReferenceDraft>()
  for (const template of templates) {
    if (template.kind !== "subclass" || template.parent_template_id !== warlock.id) continue
    const authored = authoredSubclassById.get(subclassId(template))
    if (authored) subclassByTemplateId.set(template.id, authored)
  }

  const decoratedTemplates = templates.map((template) => {
    if (template.id === warlock.id) {
      return {
        ...template,
        author_description: warlockReferenceCurrent.authorDescription,
        author_comment: warlockReferenceCurrent.authorComment,
        mechanics: decorateMechanics(1, template.mechanics || []),
      }
    }

    const subclass = subclassByTemplateId.get(template.id)
    if (!subclass) return template
    return {
      ...template,
      author_description: subclass.authorDescription,
      author_comment: subclass.authorComment,
      mechanics: decorateSubclassMechanics(
        subclass,
        Math.max(1, template.unlock_level || 3),
        template.mechanics || [],
      ),
    }
  })

  const patronChoice = patronChoiceReferenceMechanic()
  const decoratedLevels = levels.map((row) => {
    if (row.template_id === warlock.id) {
      let mechanics = decorateMechanics(row.level, row.mechanics || [])
      if (
        row.level === 3 &&
        patronChoice &&
        !mechanics.some((mechanic) => mechanic.sourceKey === patronChoice.sourceKey)
      ) {
        mechanics = [...mechanics, patronChoice]
      }
      return { ...row, mechanics }
    }

    const subclass = subclassByTemplateId.get(row.template_id)
    if (!subclass) return row
    return {
      ...row,
      mechanics: decorateSubclassMechanics(subclass, row.level, row.mechanics || []),
    }
  })

  return { templates: decoratedTemplates, levels: decoratedLevels }
}
