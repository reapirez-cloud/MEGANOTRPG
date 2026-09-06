import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { RuleChoiceDefinition } from "./types.ts"

export type StructuredChoiceInstance = {
  option: string
  selector?: string
  selector_value?: string
  config?: Record<string, unknown>
}

type ChoiceRuleRecord = {
  min_level?: number
  unlock_level?: number
  required_options?: string[]
  required_invocations?: string[]
  mechanics?: StoredMechanics
}

type ChoiceDefinitionV2 = RuleChoiceDefinition & {
  option_rules?: Record<string, ChoiceRuleRecord>
}

type ChoiceRuntimeEnvelope = {
  choices?: Record<string, { instances?: unknown }>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function cleanInstance(value: unknown): StructuredChoiceInstance | null {
  if (typeof value === "string" && value.trim()) return { option: value.trim() }
  const record = asRecord(value)
  if (!record) return null
  const option = typeof record.option === "string" ? record.option.trim() : ""
  if (!option) return null
  const selector = typeof record.selector === "string" && record.selector.trim() ? record.selector.trim() : undefined
  const selectorValue = typeof record.selector_value === "string" && record.selector_value.trim()
    ? record.selector_value.trim()
    : undefined
  const config = asRecord(record.config) || undefined
  return {
    option,
    ...(selector ? { selector } : {}),
    ...(selectorValue ? { selector_value: selectorValue } : {}),
    ...(config ? { config } : {}),
  }
}

function legacyInstances(selectedChoices: Record<string, unknown>, choiceKey: string): StructuredChoiceInstance[] {
  const value = selectedChoices[choiceKey]
  if (typeof value === "string" && value.trim()) return [{ option: value.trim() }]
  if (!Array.isArray(value)) return []
  return value.map(cleanInstance).filter((entry): entry is StructuredChoiceInstance => Boolean(entry))
}

export function structuredChoiceInstances(
  definition: RuleChoiceDefinition,
  selectedChoicesInput: unknown,
  sourceLevel: number,
): StructuredChoiceInstance[] {
  const selectedChoices = asRecord(selectedChoicesInput) || {}
  const runtime = asRecord(selectedChoices._choice_runtime_v2) as ChoiceRuntimeEnvelope | null
  const rawInstances = runtime?.choices?.[definition.key]?.instances
  const candidates = Array.isArray(rawInstances)
    ? rawInstances.map(cleanInstance).filter((entry): entry is StructuredChoiceInstance => Boolean(entry))
    : legacyInstances(selectedChoices, definition.key)

  const rules = (definition as ChoiceDefinitionV2).option_rules || {}
  const optionSet = new Set(definition.options)
  const selectedOptionSet = new Set(candidates.map((instance) => instance.option))
  const count = Math.max(1, definition.count || 1, ...Object.entries(definition.count_by_level || {})
    .filter(([level]) => Number(level) <= sourceLevel)
    .map(([, value]) => Number(value) || 1))

  return candidates
    .filter((instance) => {
      if (!optionSet.has(instance.option)) return false
      const rule = rules[instance.option]
      const minLevel = Math.max(
        1,
        Number(definition.option_unlock_level?.[instance.option] || 1),
        Number(rule?.min_level || 1),
        Number(rule?.unlock_level || 1),
      )
      if (sourceLevel < minLevel) return false
      const required = [...(rule?.required_options || []), ...(rule?.required_invocations || [])]
      return required.every((option) => selectedOptionSet.has(option))
    })
    .slice(0, count)
}

function replaceStringTokens(value: string, instance: StructuredChoiceInstance, index: number): string {
  return value
    .replaceAll("{{choice.option}}", instance.option)
    .replaceAll("{{choice.selector}}", instance.selector || "")
    .replaceAll("{{choice.selector_value}}", instance.selector_value || "")
    .replaceAll("{{choice.instance_index}}", String(index))
}

function substituteUnknown(value: unknown, instance: StructuredChoiceInstance, index: number): unknown {
  if (typeof value === "string") return replaceStringTokens(value, instance, index)
  if (Array.isArray(value)) return value.map((entry) => substituteUnknown(entry, instance, index))
  const record = asRecord(value)
  if (!record) return value
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, substituteUnknown(entry, instance, index)]))
}

export function mechanicsForStructuredChoiceInstance(
  definition: RuleChoiceDefinition,
  instance: StructuredChoiceInstance,
  sourceLevel: number,
  index: number,
): StoredMechanics {
  const ruleMechanics = ((definition as ChoiceDefinitionV2).option_rules?.[instance.option]?.mechanics || []) as StoredMechanics
  const levelMechanics = Object.entries(definition.option_mechanics_by_level?.[instance.option] || {})
    .filter(([level]) => Number(level) <= sourceLevel)
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([, mechanics]) => mechanics || [])
  const mechanics = [
    ...(definition.option_mechanics?.[instance.option] || []),
    ...ruleMechanics,
    ...levelMechanics,
  ]
  return substituteUnknown(mechanics, instance, index) as StoredMechanic[]
}

export function structuredChoiceInstanceIdentity(
  instance: StructuredChoiceInstance,
  index: number,
  siblingInstances: StructuredChoiceInstance[],
): string {
  if (instance.selector_value) return `${instance.option}:${instance.selector_value}`
  if (siblingInstances.filter((candidate) => candidate.option === instance.option).length > 1) {
    return `${instance.option}:${index}`
  }
  return instance.option
}
