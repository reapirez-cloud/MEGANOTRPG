import {
  choiceCountAtLevel,
  choiceDefinitionAvailable,
  choiceOptionAvailableAtLevel,
} from "./resolver.ts"
import { choiceOptionSourceAvailable } from "./choiceSourceRequirements.ts"
import { storedStructuredChoiceInstances, type StructuredChoiceInstance } from "./choiceRuntimeV2.ts"
import type {
  CharacterTemplateBundle,
  RuleChoiceDefinition,
  RuleChoiceOptionRule,
  RuleChoiceRefreshPolicy,
  RuleChoiceReplacementPolicy,
  RuleChoiceSelectionMode,
  RuleChoiceTarget,
  RuleTemplateKind,
} from "./types.ts"

export type TemplateChoiceStatus = "hidden" | "pending" | "editable" | "locked"

export type TemplateChoiceSelectorOptionState = {
  value: string
  label: string
}

export type TemplateChoiceSelectorState = {
  key: string
  options: TemplateChoiceSelectorOptionState[]
}

export type TemplateChoiceOptionState = {
  key: string
  label: string
  available: boolean
  selected: boolean
  repeatable: boolean
  minLevel: number
  requiredOptions: string[]
  lockedReason: string | null
  selector: TemplateChoiceSelectorState | null
}

export type TemplateChoiceState = {
  id: string
  assignmentId: string
  templateId: string
  templateKind: RuleTemplateKind
  sourceName: string
  sourceLevel: number
  unlockLevel: number
  key: string
  label: string
  target: RuleChoiceTarget
  selectionMode: RuleChoiceSelectionMode
  required: number
  selected: string[]
  instances: StructuredChoiceInstance[]
  remaining: number
  status: TemplateChoiceStatus
  options: TemplateChoiceOptionState[]
  runtimeVersion: 1 | 2
  refresh: RuleChoiceRefreshPolicy | null
  replacementPolicy: RuleChoiceReplacementPolicy
  replacementLimit: number | null
  previousSourceLevel: number | null
  canReplaceNow: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function normalizedSelected(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
}

function sourceLevelForChoice(
  bundle: CharacterTemplateBundle,
  characterLevel: number,
  classLevels: ReadonlyMap<string, number>,
): number {
  if (bundle.template.kind === "subclass" && bundle.template.parent_template_id) {
    const parentLevel = classLevels.get(bundle.template.parent_template_id)
    if (parentLevel !== undefined) return Math.max(1, parentLevel)
  }
  return Math.max(1, bundle.assignment.template_level || characterLevel)
}

function unlockedDefinitions(bundle: CharacterTemplateBundle, sourceLevel: number) {
  const definitions = new Map<string, { definition: RuleChoiceDefinition; unlockLevel: number }>()

  for (const definition of bundle.template.choices || []) {
    definitions.set(definition.key, { definition, unlockLevel: 1 })
  }

  for (const level of bundle.levels
    .filter((entry) => entry.level <= sourceLevel)
    .sort((left, right) => left.level - right.level)) {
    for (const definition of level.choices || []) {
      const previous = definitions.get(definition.key)
      definitions.set(definition.key, {
        definition,
        unlockLevel: Math.min(previous?.unlockLevel || level.level, level.level),
      })
    }
  }

  return [...definitions.values()]
}

function optionRule(definition: RuleChoiceDefinition, key: string): RuleChoiceOptionRule {
  return definition.option_rules?.[key] || {}
}

function selectorState(rule: RuleChoiceOptionRule): TemplateChoiceSelectorState | null {
  const selector = rule.selector
  const key = typeof selector === "string" ? selector : selector?.key
  if (!key || key === "none") return null
  const rawOptions = typeof selector === "object" ? selector.options || rule.selector_options || [] : rule.selector_options || []
  return {
    key,
    options: rawOptions.flatMap((entry) => {
      if (typeof entry === "string") return entry.trim() ? [{ value: entry.trim(), label: entry.trim() }] : []
      if (!entry || typeof entry.value !== "string" || !entry.value.trim()) return []
      return [{ value: entry.value.trim(), label: entry.label?.trim() || entry.value.trim() }]
    }),
  }
}

function runtimeEntry(selectedChoicesInput: unknown, choiceKey: string): Record<string, unknown> | null {
  const selectedChoices = asRecord(selectedChoicesInput)
  const runtime = asRecord(selectedChoices?._choice_runtime_v2)
  const choices = asRecord(runtime?.choices)
  return asRecord(choices?.[choiceKey])
}

function choiceUsesV2(definition: RuleChoiceDefinition, selectedChoicesInput: unknown) {
  return Boolean(
    definition.option_rules
    || definition.replacement_policy
    || definition.replacement_limit
    || definition.repeatable
    || definition.refresh === "short_rest"
    || definition.refresh === "short_or_long_rest"
    || runtimeEntry(selectedChoicesInput, definition.key),
  )
}

function requiredOptionsForRule(rule: RuleChoiceOptionRule): string[] {
  const required = [...(rule.required_options || []), ...(rule.required_invocations || [])]
  for (const entry of rule.required_choices || []) {
    if (typeof entry === "string") required.push(entry)
    else if (entry?.option) required.push(entry.option)
  }
  return [...new Set(required)]
}

function selectedOptionLabels(definition: RuleChoiceDefinition, keys: string[]) {
  return keys.map((key) => definition.option_labels?.[key] || key).join(", ")
}

export function resolveTemplateChoiceStates(
  bundles: CharacterTemplateBundle[],
  characterLevel: number,
): TemplateChoiceState[] {
  const classLevels = new Map(
    bundles
      .filter((bundle) => bundle.template.kind === "class")
      .map((bundle) => [bundle.template.id, Math.max(1, bundle.assignment.template_level || characterLevel)] as const),
  )
  const result: TemplateChoiceState[] = []

  for (const bundle of bundles) {
    const sourceLevel = sourceLevelForChoice(bundle, characterLevel, classLevels)
    const rootUnlockLevel = bundle.template.kind === "subclass" ? Math.max(1, bundle.template.unlock_level || 1) : 1
    if (bundle.template.kind === "subclass" && sourceLevel < rootUnlockLevel) continue

    for (const { definition, unlockLevel } of unlockedDefinitions(bundle, sourceLevel)) {
      const selectionMode = definition.selection_mode || "manager"
      if (selectionMode !== "player_once") continue

      const required = choiceCountAtLevel(definition, sourceLevel)
      const usesV2 = choiceUsesV2(definition, bundle.assignment.selected_choices)
      const instances = usesV2
        ? storedStructuredChoiceInstances(definition, bundle.assignment.selected_choices)
        : normalizedSelected(bundle.assignment.selected_choices?.[definition.key]).map((option) => ({ option }))
      const selected = instances.map((instance) => instance.option)
      const selectedOptionSet = new Set(selected)
      const dependencyAvailable = choiceDefinitionAvailable(definition, bundle.assignment.selected_choices)
      const entry = runtimeEntry(bundle.assignment.selected_choices, definition.key)
      const previousSourceLevel = typeof entry?.source_level === "number"
        ? entry.source_level
        : typeof entry?.source_level === "string" && /^\d+$/.test(entry.source_level)
          ? Number(entry.source_level)
          : null
      const replacementPolicy = definition.replacement_policy || "locked"
      const replacementLimit = Number.isFinite(definition.replacement_limit) && Number(definition.replacement_limit) > 0
        ? Math.floor(Number(definition.replacement_limit))
        : null
      const canReplaceNow = replacementPolicy === "always"
        || replacementPolicy === "preparation"
        || replacementPolicy === "preparation_or_level_change"
        || (replacementPolicy === "on_level_change" && previousSourceLevel !== null && sourceLevel > previousSourceLevel)
        || Boolean(definition.refresh)
      const status: TemplateChoiceStatus = !dependencyAvailable
        ? "hidden"
        : instances.length < required
          ? "pending"
          : canReplaceNow
            ? "editable"
            : "locked"

      const known = new Set(definition.options)
      const options: TemplateChoiceOptionState[] = definition.options.map((key) => {
        const rule = optionRule(definition, key)
        const minLevel = Math.max(
          1,
          Number(definition.option_unlock_level?.[key] || 1),
          Number(rule.min_level || 1),
          Number(rule.unlock_level || 1),
        )
        const requiredOptions = requiredOptionsForRule(rule)
        const missing = requiredOptions.filter((option) => !selectedOptionSet.has(option))
        const levelAvailable = choiceOptionAvailableAtLevel(definition, key, sourceLevel) && sourceLevel >= minLevel
        const sourceAvailable = choiceOptionSourceAvailable(rule, bundles, characterLevel)
        const available = levelAvailable && missing.length === 0 && sourceAvailable
        const lockedReason = !levelAvailable
          ? `Доступно с ${minLevel} уровня`
          : missing.length > 0
            ? `Нужно: ${selectedOptionLabels(definition, missing)}`
            : !sourceAvailable
              ? "Требуется подходящий активный класс или подкласс"
              : null
        return {
          key,
          label: definition.option_labels?.[key] || key,
          available,
          selected: selectedOptionSet.has(key),
          repeatable: Boolean(rule.repeatable || definition.repeatable),
          minLevel,
          requiredOptions,
          lockedReason,
          selector: selectorState(rule),
        }
      })
      for (const key of selected.filter((key) => !known.has(key))) {
        options.push({
          key,
          label: key,
          available: false,
          selected: true,
          repeatable: false,
          minLevel: 1,
          requiredOptions: [],
          lockedReason: "Вариант больше не существует в текущем пакете правил",
          selector: null,
        })
      }

      result.push({
        id: `${bundle.assignment.id}:${definition.key}`,
        assignmentId: bundle.assignment.id,
        templateId: bundle.template.id,
        templateKind: bundle.template.kind,
        sourceName: bundle.template.name,
        sourceLevel,
        unlockLevel: Math.max(rootUnlockLevel, unlockLevel),
        key: definition.key,
        label: definition.label,
        target: definition.target,
        selectionMode,
        required,
        selected,
        instances,
        remaining: Math.max(0, required - instances.length),
        status,
        options,
        runtimeVersion: usesV2 ? 2 : 1,
        refresh: definition.refresh || null,
        replacementPolicy,
        replacementLimit,
        previousSourceLevel,
        canReplaceNow,
      })
    }
  }

  const statusOrder: Record<TemplateChoiceStatus, number> = { pending: 0, editable: 1, locked: 2, hidden: 3 }
  return result.sort((left, right) =>
    statusOrder[left.status] - statusOrder[right.status]
    || left.templateKind.localeCompare(right.templateKind)
    || left.unlockLevel - right.unlockLevel
    || left.label.localeCompare(right.label, "ru"),
  )
}
