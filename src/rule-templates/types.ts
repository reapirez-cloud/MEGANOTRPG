import type { StoredMechanics } from "../types/characterMechanics"

export type RuleTemplateKind = "race" | "class"
export type RuleChoiceTarget = "language" | "proficiency" | "sense" | "trait"

export type RuleChoiceDefinition = {
  key: string
  label: string
  target: RuleChoiceTarget
  options: string[]
  count?: number
}

export type RuleTemplate = {
  id: string
  campaign_id: string
  kind: RuleTemplateKind
  slug: string
  name: string
  description: string
  version: number
  mechanics: StoredMechanics
  choices: RuleChoiceDefinition[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RuleTemplateLevel = {
  id: string
  template_id: string
  level: number
  mechanics: StoredMechanics
  choices: RuleChoiceDefinition[]
}

export type CharacterTemplateAssignment = {
  id: string
  character_id: string
  template_id: string
  template_level: number | null
  selected_choices: Record<string, string | string[]>
  assigned_at: string
  updated_at: string
}

export type CharacterTemplateBundle = {
  assignment: CharacterTemplateAssignment
  template: RuleTemplate
  levels: RuleTemplateLevel[]
}
