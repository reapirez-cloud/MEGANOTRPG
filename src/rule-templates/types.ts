import type { StoredMechanics } from "../types/characterMechanics.ts"

export type RuleTemplateKind = "race" | "subrace" | "class" | "subclass"
export type RuleChoiceTarget = "language" | "proficiency" | "sense" | "trait"
export type RuleTemplateSourceKind = "official" | "third_party" | "custom"

export type RuleChoiceDefinition = {
  key: string
  label: string
  target: RuleChoiceTarget
  options: string[]
  count?: number
  /** Human labels for mechanically stable option keys such as skill:nature. */
  option_labels?: Record<string, string>
  /** Extra CE mechanics applied only when this option is selected. */
  option_mechanics?: Record<string, StoredMechanics>
  /**
   * Mechanics unlocked later by the same persistent choice. This avoids asking
   * for the same land/style/pact choice again every time it gains a new tier.
   */
  option_mechanics_by_level?: Record<string, Record<string, StoredMechanics>>
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
  parent_template_id?: string | null
  unlock_level?: number | null
  /** Stable identity across catalog revisions, e.g. class:druid. */
  catalog_key?: string | null
  /** Revision is pinned by assignment because assignments point at a concrete template id. */
  catalog_revision?: string | null
  source_kind?: RuleTemplateSourceKind | null
  source_label?: string | null
  is_builtin?: boolean
  /** Short rules-first explanation, deliberately separate from authored prose. */
  mechanical_summary?: string
  /** Original narrator prose. Never used by Character Engine. */
  author_description?: string
  author_comment?: string
  /** Structured catalog metadata: edition policy, spellcasting profile, feature overrides, etc. */
  rules_meta?: Record<string, unknown>
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
