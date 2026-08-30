import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../rule-templates/types.ts"

export type CharacterPreparationSession = {
  character_id: string
  generation: number
  is_open: boolean
  opened_at: string | null
  opened_by: string | null
  closed_at: string | null
  closed_by_message_id: number | null
}

export type CharacterPreparationRecord = {
  id: string
  character_id: string
  generation: number
  assignment_id: string
  task_key: string
  input_value: number
  resolved_value: unknown
  created_at?: string
}

type PreparationBase = {
  assignmentId: string
  templateId: string
  sourceName: string
  key: string
  label: string
}

export type SpellPreparationTask = PreparationBase & {
  kind: "spells"
  record: CharacterPreparationRecord | null
}

export type ChoicePreparationTask = PreparationBase & {
  kind: "choice"
  definition: RuleChoiceDefinition
  selected: string[]
}

export type RollPreparationTask = PreparationBase & {
  kind: "roll"
  count: number
  sides: number
  record: CharacterPreparationRecord | null
}

export type CharacterPreparationTask = SpellPreparationTask | ChoicePreparationTask | RollPreparationTask

export type CharacterPreparationModel = {
  session: CharacterPreparationSession | null
  tasks: CharacterPreparationTask[]
  suppressedSourceIds: string[]
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function integer(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function selectedValues(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).map((item) => item.trim()).filter(Boolean)
}

function sourceLevel(
  bundle: CharacterTemplateBundle,
  characterLevel: number,
  classLevels: ReadonlyMap<string, number>,
) {
  if (bundle.template.kind === "subclass" && bundle.template.parent_template_id) {
    return classLevels.get(bundle.template.parent_template_id) ?? Math.max(1, characterLevel)
  }
  return Math.max(1, bundle.assignment.template_level || characterLevel)
}

function unlockedChoices(bundle: CharacterTemplateBundle, effectiveLevel: number): RuleChoiceDefinition[] {
  const definitions = [...(bundle.template.choices || [])]
  for (const level of bundle.levels) {
    if (level.level <= effectiveLevel) definitions.push(...(level.choices || []))
  }
  const latest = new Map<string, RuleChoiceDefinition>()
  for (const definition of definitions) latest.set(definition.key, definition)
  return [...latest.values()]
}

function rootSourceId(bundle: CharacterTemplateBundle) {
  return `template:${bundle.template.kind}:${bundle.template.id}:v${bundle.template.version}`
}

function preparationDefinitions(bundle: CharacterTemplateBundle): JsonRecord[] {
  const definitions = record(bundle.template.rules_meta)?.post_rest_preparations
  return Array.isArray(definitions) ? definitions.map(record).filter((item): item is JsonRecord => item !== null) : []
}

export function buildCharacterPreparationModel(
  bundles: CharacterTemplateBundle[],
  characterLevel: number,
  session: CharacterPreparationSession | null,
  records: CharacterPreparationRecord[],
): CharacterPreparationModel {
  const classLevels = new Map(
    bundles
      .filter((bundle) => bundle.template.kind === "class")
      .map((bundle) => [bundle.template.id, Math.max(1, bundle.assignment.template_level || characterLevel)] as const),
  )
  const currentRecords = new Map<string, CharacterPreparationRecord>()
  if (session) {
    for (const entry of records) {
      if (entry.generation !== session.generation) continue
      currentRecords.set(`${entry.assignment_id}:${entry.task_key}`, entry)
    }
  }

  const tasks: CharacterPreparationTask[] = []
  const suppressedSourceIds = new Set<string>()

  for (const bundle of bundles) {
    const effectiveLevel = sourceLevel(bundle, characterLevel, classLevels)
    const unlockLevel = bundle.template.kind === "subclass" ? Math.max(1, bundle.template.unlock_level || 1) : 1
    if (effectiveLevel < unlockLevel) continue
    const meta = record(bundle.template.rules_meta) || {}

    if (session?.is_open && text(meta.spell_preparation_refresh) === "long_rest") {
      const key = `spells:${bundle.template.id}`
      tasks.push({
        kind: "spells",
        assignmentId: bundle.assignment.id,
        templateId: bundle.template.id,
        sourceName: bundle.template.name,
        key,
        label: `${bundle.template.name}: подготовка заклинаний`,
        record: currentRecords.get(`${bundle.assignment.id}:${key}`) || null,
      })
    }

    for (const definition of unlockedChoices(bundle, effectiveLevel)) {
      const fallbackRefresh = text(meta.choice_refresh) === "long_rest" && text(meta.persistent_choice) === definition.key
      if (!session?.is_open || (definition.refresh !== "long_rest" && !fallbackRefresh)) continue
      tasks.push({
        kind: "choice",
        assignmentId: bundle.assignment.id,
        templateId: bundle.template.id,
        sourceName: bundle.template.name,
        key: definition.key,
        label: definition.label,
        definition,
        selected: selectedValues(bundle.assignment.selected_choices?.[definition.key]),
      })
    }

    for (const definition of preparationDefinitions(bundle)) {
      if (text(definition.trigger) !== "long_rest") continue
      if (effectiveLevel < Math.max(1, integer(definition.unlockLevel, 1))) continue
      const taskKey = text(definition.key)
      if (!taskKey) continue
      const input = record(definition.input)
      const taskRecord = currentRecords.get(`${bundle.assignment.id}:${taskKey}`) || null

      const actionSourceKeys = record(definition.actionSourceKeys)
      if (actionSourceKeys) {
        const resolved = taskRecord && typeof taskRecord.resolved_value === "string" ? taskRecord.resolved_value : ""
        for (const [mode, rawSourceKey] of Object.entries(actionSourceKeys)) {
          const sourceKey = text(rawSourceKey)
          if (!sourceKey || (resolved && mode === resolved)) continue
          suppressedSourceIds.add(`${rootSourceId(bundle)}:source:${sourceKey}`)
        }
      }

      if (!session?.is_open || !input || text(input.kind) !== "roll") continue
      tasks.push({
        kind: "roll",
        assignmentId: bundle.assignment.id,
        templateId: bundle.template.id,
        sourceName: bundle.template.name,
        key: taskKey,
        label: text(definition.label) || taskKey,
        count: Math.max(1, integer(input.count, 1)),
        sides: Math.max(2, integer(input.sides, 20)),
        record: taskRecord,
      })
    }
  }

  return {
    session,
    tasks,
    suppressedSourceIds: [...suppressedSourceIds].sort(),
  }
}
