// INTERNAL AI/DEV CONTRACT: before changing template/choice semantics, read ./AGENTS.md.
// Do not add source-specific choice runtimes for feats/classes; extend the generic CE contract first.
import type { StoredMechanics } from "../types/characterMechanics.ts"

export type RuleTemplateKind = "race" | "subrace" | "class" | "subclass"
export type RuleChoiceTarget = "language" | "proficiency" | "sense" | "trait"
export type RuleTemplateSourceKind = "official" | "third_party" | "custom"
export type RuleChoiceSelectionMode = "manager" | "player_once"
export type RuleChoiceRefreshPolicy = "long_rest" | "short_rest" | "short_or_long_rest"
export type RuleChoiceReplacementPolicy = "locked" | "always" | "preparation" | "on_level_change" | "preparation_or_level_change"

export type RuleChoiceRequirement = {
  /** Another persistent choice in the same assignment. */
  key: string
  /** This choice is active only while the parent choice contains this option. */
  option: string
}

export type RuleChoiceSourceRequirement = {
  /** Stable catalog identity of another assigned template required by this option. */
  catalog_key: string
  /** Optional persistent choice on that source assignment. */
  choice_key?: string
  /** Optional required option inside choice_key. */
  choice_option?: string
}

export type RuleChoiceSelectorOption = {
  value: string
  label?: string
}

export type RuleChoiceSelector = {
  key: string
  options?: Array<string | RuleChoiceSelectorOption>
}

export type RuleChoiceOptionRule = {
  min_level?: number
  unlock_level?: number
  repeatable?: boolean
  selector?: string | RuleChoiceSelector
  selector_options?: Array<string | RuleChoiceSelectorOption>
  required_options?: string[]
  required_invocations?: string[]
  required_choices?: Array<string | RuleChoiceRequirement>
  /** Option is active when at least one cross-template source requirement is satisfied. */
  source_requirements_any?: RuleChoiceSourceRequirement[]
  mechanics?: StoredMechanics
}

export type RuleChoiceDefinition = {
  key: string
  label: string
  target: RuleChoiceTarget
  options: string[]
  count?: number
  /** The number of persistent selections allowed once source.level reaches each threshold. */
  count_by_level?: Record<string, number>
  /** Minimum source.level for an option to be selectable/emitted. */
  option_unlock_level?: Record<string, number>
  /** Human labels for mechanically stable option keys such as skill:nature. */
  option_labels?: Record<string, string>
  /** Optional dependency on another persistent choice in this template assignment. */
  requires_choice?: RuleChoiceRequirement
  /**
   * Who resolves this choice. Existing definitions default to manager.
   * player_once choices are offered to the assigned player and become append-only
   * after confirmation; a later count increase may request only the new slots.
   */
  selection_mode?: RuleChoiceSelectionMode
  /**
   * Explicit rest refresh. Server authority still decides whether the matching
   * short/long-rest window is currently open.
   */
  refresh?: RuleChoiceRefreshPolicy
  /** Generic structured Choice Runtime v2 rules keyed by stable option identity. */
  option_rules?: Record<string, RuleChoiceOptionRule>
  /** Whether a complete choice can be replaced, and under which server-owned window. */
  replacement_policy?: RuleChoiceReplacementPolicy
  /** Maximum number of previously stored instances that may be replaced in one commit. */
  replacement_limit?: number
  /** Choice-wide repeatability for sources that do not need per-option rules. */
  repeatable?: boolean
  /** Extra CE mechanics applied only when this option is selected. */
  option_mechanics?: Record<string, StoredMechanics>
  /**
   * Mechanics unlocked later by the same persistent choice. This avoids asking
   * for the same land/style/pact choice again every time it gains a new tier.
   */
  option_mechanics_by_level?: Record<string, Record<string, StoredMechanics>>
  /** Optional authoring metadata used by catalog/runtime presentation. */
  required?: boolean
  resolved_as?: string
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
