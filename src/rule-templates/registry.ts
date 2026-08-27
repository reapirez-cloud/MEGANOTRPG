import type { CharacterContribution, CharacterSource, FormulaExpression } from "../character-engine/index.ts"
import { storedMechanicContributions } from "../lib/characterMechanics.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"

const registry = new Map<string, CharacterTemplateBundle[]>()
export function registerCharacterTemplateBundles(characterId: string, bundles: CharacterTemplateBundle[]) { registry.set(characterId, bundles) }
export function clearCharacterTemplateBundles(characterId: string) { registry.delete(characterId) }
export function registeredCharacterTemplateBundles(characterId: string) { return registry.get(characterId) || [] }

function source(bundle: CharacterTemplateBundle, suffix = "base"): CharacterSource { return { id: `template:${bundle.template.kind}:${bundle.template.id}:v${bundle.template.version}:${suffix}`, name: bundle.template.name, sourceType: `${bundle.template.kind}_template`, visibility: "campaign" } }
function normalizeSelected(value: string | string[] | undefined): string[] { if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean); return typeof value === "string" && value.trim() ? [value.trim()] : [] }
function choiceContributions(bundle: CharacterTemplateBundle, definition: RuleChoiceDefinition): CharacterContribution[] {
  const selected = normalizeSelected(bundle.assignment.selected_choices?.[definition.key]).slice(0, Math.max(1, definition.count || 1)); const src = source(bundle, `choice:${definition.key}`)
  return selected.map((key, index) => ({ id: `${src.id}:${index}:${key}`, kind: "grant", operation: "GRANT", target: definition.target, key, ...(definition.target === "proficiency" ? { payload: { rank: 1 } } : {}), source: src }))
}

function substituteFormula(expression: FormulaExpression, sourceLevel: number): FormulaExpression {
  switch (expression.kind) {
    case "reference": return expression.key === "source.level" ? { kind: "literal", value: sourceLevel } : expression
    case "add": return { ...expression, terms: expression.terms.map((term) => substituteFormula(term, sourceLevel)) }
    case "subtract": return { ...expression, left: substituteFormula(expression.left, sourceLevel), right: substituteFormula(expression.right, sourceLevel) }
    case "multiply": return { ...expression, factors: expression.factors.map((factor) => substituteFormula(factor, sourceLevel)) }
    case "min": return { ...expression, values: expression.values.map((value) => substituteFormula(value, sourceLevel)) }
    case "max": return { ...expression, values: expression.values.map((value) => substituteFormula(value, sourceLevel)) }
    case "clamp": return { ...expression, value: substituteFormula(expression.value, sourceLevel) }
    default: return expression
  }
}
function mechanicsAtSourceLevel(mechanics: StoredMechanics, sourceLevel: number): StoredMechanics {
  return (mechanics || []).map((mechanic): StoredMechanic => {
    if (mechanic.type !== "resource" || typeof mechanic.max === "number") return mechanic
    return { ...mechanic, max: substituteFormula(mechanic.max, sourceLevel) }
  })
}

export function characterTemplateContributions(characterId: string, characterLevel: number): CharacterContribution[] {
  const result: CharacterContribution[] = []
  for (const bundle of registeredCharacterTemplateBundles(characterId)) {
    const effectiveLevel = Math.max(1, bundle.assignment.template_level || characterLevel)
    result.push(...storedMechanicContributions(mechanicsAtSourceLevel(bundle.template.mechanics || [], effectiveLevel), source(bundle)))
    for (const level of bundle.levels.filter((entry) => entry.level <= effectiveLevel).sort((a, b) => a.level - b.level)) {
      result.push(...storedMechanicContributions(mechanicsAtSourceLevel(level.mechanics || [], effectiveLevel), source(bundle, `level:${level.level}`)))
      for (const definition of level.choices || []) result.push(...choiceContributions(bundle, definition))
    }
    for (const definition of bundle.template.choices || []) result.push(...choiceContributions(bundle, definition))
  }
  return result
}
