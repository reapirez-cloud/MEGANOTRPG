import type {
  CharacterTemplateBundle,
  RuleChoiceOptionRule,
  RuleChoiceSourceRequirement,
} from "./types.ts"

function normalizedSelected(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
}

function sourceLevelForBundle(
  bundle: CharacterTemplateBundle,
  bundles: readonly CharacterTemplateBundle[],
  characterLevel: number,
): number {
  if (bundle.template.kind === "subclass" && bundle.template.parent_template_id) {
    const parent = bundles.find((candidate) =>
      candidate.template.kind === "class" && candidate.template.id === bundle.template.parent_template_id,
    )
    if (parent) return Math.max(1, parent.assignment.template_level || characterLevel)
  }
  return Math.max(1, bundle.assignment.template_level || characterLevel)
}

function requirementMatches(
  requirement: RuleChoiceSourceRequirement,
  bundles: readonly CharacterTemplateBundle[],
  characterLevel: number,
): boolean {
  if (!requirement.catalog_key?.trim()) return false

  return bundles.some((bundle) => {
    if (!bundle.template.is_active || bundle.template.catalog_key !== requirement.catalog_key) return false

    const sourceLevel = sourceLevelForBundle(bundle, bundles, characterLevel)
    if (bundle.template.kind === "subclass" && sourceLevel < Math.max(1, bundle.template.unlock_level || 1)) return false

    if (!requirement.choice_key) return true
    const selected = normalizedSelected(bundle.assignment.selected_choices?.[requirement.choice_key])
    if (!requirement.choice_option) return selected.length > 0
    return selected.includes(requirement.choice_option)
  })
}

/**
 * Generic cross-template choice gate. Exact class/subclass identities remain
 * authored data; Choice Runtime only understands "one of these sources must be active".
 */
export function choiceOptionSourceAvailable(
  rule: RuleChoiceOptionRule,
  bundles: readonly CharacterTemplateBundle[],
  characterLevel: number,
): boolean {
  const requirements = (rule.source_requirements_any || []).filter((entry) => entry?.catalog_key?.trim())
  if (requirements.length === 0) return true
  return requirements.some((requirement) => requirementMatches(requirement, bundles, characterLevel))
}
