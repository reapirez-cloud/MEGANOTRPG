import type { CharacterContribution } from "../character-engine/index.ts"
import type { CharacterTemplateBundle } from "./types.ts"
import { resolveTemplateBundles, type TemplateSourceResolution } from "./resolver.ts"

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

/**
 * Full parser result for source-management UI and Character Engine input.
 * Consumers that only need mechanics should normally use
 * characterTemplateContributions().
 */
export function characterTemplateSourceResolution(
  characterId: string,
  characterLevel: number,
): TemplateSourceResolution {
  return resolveTemplateBundles(registeredCharacterTemplateBundles(characterId), characterLevel)
}

/**
 * CE-facing output. This is intentionally the only thing the generic adapter
 * needs from classes/races/subclasses: native CharacterContribution objects.
 */
export function characterTemplateContributions(
  characterId: string,
  characterLevel: number,
): CharacterContribution[] {
  return characterTemplateSourceResolution(characterId, characterLevel).contributions
}
