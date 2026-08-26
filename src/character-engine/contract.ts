import { resolveCharacterInput } from "./resolver.ts"
import { CHARACTER_ENGINE_VERSION } from "./version.ts"
import type {
  CharacterEngineInput,
  GrantTarget,
  ResolvedAction,
  ResolvedCharacter,
  ResolvedGrant,
  ResolvedResource,
  ResolvedSpell,
} from "./types.ts"

export const RESOLVED_CHARACTER_CONTRACT_VERSION = 1 as const

export type ResolvedCapabilitySectionKey =
  | "resistances"
  | "immunities"
  | "languages"
  | "proficiencies"
  | "senses"
  | "features"
  | "traits"

export type ResolvedDynamicSectionKey =
  | ResolvedCapabilitySectionKey
  | "resources"
  | "actions"
  | "spells"

export interface ResolvedCapabilities {
  resistances: ResolvedGrant[]
  immunities: ResolvedGrant[]
  languages: ResolvedGrant[]
  proficiencies: ResolvedGrant[]
  senses: ResolvedGrant[]
  features: ResolvedGrant[]
  traits: ResolvedGrant[]
}

/**
 * Stable renderer-facing contract for Character Engine v1.
 *
 * The fixed character skeleton is inherited from ResolvedCharacter. Dynamic
 * content is represented only by resolved entries; renderers must not invent
 * placeholders for empty sections. Use resolvedDynamicSections() when a view
 * wants the engine to decide which optional sections actually exist.
 *
 * `grants` remains available for provenance/advanced consumers. Ordinary sheets
 * should consume `capabilities`, `resources`, `actions` and `spells` instead of
 * re-filtering raw grants themselves.
 */
export interface ResolvedCharacterContract extends ResolvedCharacter {
  /** Semver of the standalone mechanics engine that produced this result. */
  engineVersion: typeof CHARACTER_ENGINE_VERSION
  contractVersion: typeof RESOLVED_CHARACTER_CONTRACT_VERSION
  capabilities: ResolvedCapabilities
}

const CAPABILITY_TARGET_TO_SECTION: Partial<Record<GrantTarget, ResolvedCapabilitySectionKey>> = {
  resistance: "resistances",
  immunity: "immunities",
  language: "languages",
  proficiency: "proficiencies",
  sense: "senses",
  feature: "features",
  trait: "traits",
}

const SECTION_TO_TARGET: Record<ResolvedCapabilitySectionKey, GrantTarget> = {
  resistances: "resistance",
  immunities: "immunity",
  languages: "language",
  proficiencies: "proficiency",
  senses: "sense",
  features: "feature",
  traits: "trait",
}

function compareGrant(left: ResolvedGrant, right: ResolvedGrant): number {
  return left.key.localeCompare(right.key) || left.variantKey.localeCompare(right.variantKey)
}

export function resolveCapabilities(grants: ResolvedGrant[]): ResolvedCapabilities {
  const capabilities: ResolvedCapabilities = {
    resistances: [],
    immunities: [],
    languages: [],
    proficiencies: [],
    senses: [],
    features: [],
    traits: [],
  }

  for (const grant of grants) {
    const section = CAPABILITY_TARGET_TO_SECTION[grant.target]
    if (section) capabilities[section].push(grant)
  }

  for (const section of Object.keys(capabilities) as ResolvedCapabilitySectionKey[]) {
    capabilities[section] = capabilities[section].slice().sort(compareGrant)
  }

  return capabilities
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new ResolvedCharacterContractError(`${label} must contain unique identities`)
  }
}

function resourceIdentity(resource: ResolvedResource): string {
  return resource.stateKey
}

function actionIdentity(action: ResolvedAction): string {
  return action.stateKey
}

function spellIdentity(spell: ResolvedSpell): string {
  return spell.key
}

export class ResolvedCharacterContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ResolvedCharacterContractError"
  }
}

/**
 * Checks renderer-facing invariants without recalculating game mechanics.
 * This is intentionally a contract validator, not a second resolver.
 */
export function validateResolvedCharacterContract(contract: ResolvedCharacterContract): void {
  if (contract.engineVersion !== CHARACTER_ENGINE_VERSION) {
    throw new ResolvedCharacterContractError(
      `unsupported character engine version: ${String(contract.engineVersion)}`,
    )
  }
  if (contract.contractVersion !== RESOLVED_CHARACTER_CONTRACT_VERSION) {
    throw new ResolvedCharacterContractError(
      `unsupported resolved character contract version: ${String(contract.contractVersion)}`,
    )
  }

  if (!contract.id.trim()) throw new ResolvedCharacterContractError("character id must not be empty")
  if (!contract.name.trim()) throw new ResolvedCharacterContractError("character name must not be empty")
  if (!Number.isInteger(contract.level) || contract.level < 1) {
    throw new ResolvedCharacterContractError("character level must be an integer >= 1")
  }

  assertUnique(contract.resources.map(resourceIdentity), "resources")
  assertUnique(contract.actions.map(actionIdentity), "actions")
  assertUnique(contract.spells.map(spellIdentity), "spells")

  for (const spell of contract.spells) {
    if (spell.accesses.length === 0) {
      throw new ResolvedCharacterContractError(`spell ${spell.key} must contain at least one access`)
    }
    assertUnique(spell.accesses.map((access) => access.key), `spell ${spell.key} accesses`)
    for (const access of spell.accesses) {
      if (access.methods.length === 0) {
        throw new ResolvedCharacterContractError(
          `spell ${spell.key} access ${access.key} must contain at least one method`,
        )
      }
      assertUnique(
        access.methods.map((method) => method.key),
        `spell ${spell.key} access ${access.key} methods`,
      )
    }
  }

  for (const section of Object.keys(contract.capabilities) as ResolvedCapabilitySectionKey[]) {
    const expectedTarget = SECTION_TO_TARGET[section]
    const entries = contract.capabilities[section]
    for (const entry of entries) {
      if (entry.target !== expectedTarget) {
        throw new ResolvedCharacterContractError(
          `${section} contains grant target ${entry.target}; expected ${expectedTarget}`,
        )
      }
    }
    assertUnique(
      entries.map((entry) => `${entry.key}:${entry.variantKey}`),
      `capabilities.${section}`,
    )
  }
}

/** Resolves and validates the canonical output consumed by future adapters/UI. */
export function resolveCharacterContract(input: CharacterEngineInput): ResolvedCharacterContract {
  const resolved = resolveCharacterInput(input)
  const contract: ResolvedCharacterContract = {
    ...resolved,
    engineVersion: CHARACTER_ENGINE_VERSION,
    contractVersion: RESOLVED_CHARACTER_CONTRACT_VERSION,
    capabilities: resolveCapabilities(resolved.grants),
  }
  validateResolvedCharacterContract(contract)
  return contract
}

/**
 * Returns only optional sections that contain resolved content.
 * No `showX` flags are stored in character data and no empty placeholder section
 * is created. The renderer can iterate this list directly.
 */
export function resolvedDynamicSections(
  contract: ResolvedCharacterContract,
): ResolvedDynamicSectionKey[] {
  const sections: ResolvedDynamicSectionKey[] = []

  const capabilityOrder: ResolvedCapabilitySectionKey[] = [
    "resistances",
    "immunities",
    "languages",
    "proficiencies",
    "senses",
    "features",
    "traits",
  ]
  for (const section of capabilityOrder) {
    if (contract.capabilities[section].length > 0) sections.push(section)
  }

  if (contract.resources.length > 0) sections.push("resources")
  if (contract.actions.length > 0) sections.push("actions")
  if (contract.spells.length > 0) sections.push("spells")

  return sections
}

export function hasResolvedDynamicSection(
  contract: ResolvedCharacterContract,
  section: ResolvedDynamicSectionKey,
): boolean {
  return resolvedDynamicSections(contract).includes(section)
}
