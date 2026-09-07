import { warlockReferenceCurrent } from "./warlockReferenceCurrent.ts"
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

  const decoratedTemplates = templates.map((template) => {
    if (template.id !== warlock.id) return template
    return {
      ...template,
      author_description: warlockReferenceCurrent.authorDescription,
      author_comment: warlockReferenceCurrent.authorComment,
      mechanics: decorateMechanics(1, template.mechanics || []),
    }
  })

  const patronChoice = patronChoiceReferenceMechanic()
  const decoratedLevels = levels.map((row) => {
    if (row.template_id !== warlock.id) return row
    let mechanics = decorateMechanics(row.level, row.mechanics || [])
    if (
      row.level === 3 &&
      patronChoice &&
      !mechanics.some((mechanic) => mechanic.sourceKey === patronChoice.sourceKey)
    ) {
      mechanics = [...mechanics, patronChoice]
    }
    return { ...row, mechanics }
  })

  return { templates: decoratedTemplates, levels: decoratedLevels }
}
