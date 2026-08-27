import type { CharacterContribution, CharacterSource } from "../character-engine/index.ts"
import { storedMechanicContributions } from "../lib/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"

const registry = new Map<string, CharacterTemplateBundle[]>()

export function registerCharacterTemplateBundles(characterId: string, bundles: CharacterTemplateBundle[]) {
  registry.set(characterId, bundles)
}

export function clearCharacterTemplateBundles(characterId: string) {
  registry.delete(characterId)
}

export function registeredCharacterTemplateBundles(characterId: string) {
  return registry.get(characterId) || []
}

function source(bundle: CharacterTemplateBundle, suffix = "base"): CharacterSource {
  return {
    id: `template:${bundle.template.kind}:${bundle.template.id}:v${bundle.template.version}:${suffix}`,
    name: bundle.template.name,
    sourceType: `${bundle.template.kind}_template`,
    visibility: "campaign",
  }
}

function normalizeSelected(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  return typeof value === "string" && value.trim() ? [value.trim()] : []
}

function choiceContributions(bundle: CharacterTemplateBundle, definition: RuleChoiceDefinition): CharacterContribution[] {
  const selected = normalizeSelected(bundle.assignment.selected_choices?.[definition.key]).slice(0, Math.max(1, definition.count || 1))
  const src = source(bundle, `choice:${definition.key}`)
  return selected.map((key, index) => ({
    id: `${src.id}:${index}:${key}`,
    kind: "grant",
    operation: "GRANT",
    target: definition.target,
    key,
    ...(definition.target === "proficiency" ? { payload: { rank: 1 } } : {}),
    source: src,
  }))
}

export function characterTemplateContributions(characterId: string, characterLevel: number): CharacterContribution[] {
  const result: CharacterContribution[] = []
  for (const bundle of registeredCharacterTemplateBundles(characterId)) {
    result.push(...storedMechanicContributions(bundle.template.mechanics || [], source(bundle)))
    const effectiveLevel = Math.max(1, bundle.assignment.template_level || characterLevel)
    for (const level of bundle.levels.filter((entry) => entry.level <= effectiveLevel).sort((a, b) => a.level - b.level)) {
      result.push(...storedMechanicContributions(level.mechanics || [], source(bundle, `level:${level.level}`)))
      for (const definition of level.choices || []) result.push(...choiceContributions(bundle, definition))
    }
    for (const definition of bundle.template.choices || []) result.push(...choiceContributions(bundle, definition))
  }
  return result
}
