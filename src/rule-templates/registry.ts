import type { CharacterContribution } from "../character-engine/index.ts"
import type { CharacterTemplateBundle } from "./types.ts"
import { resolveTemplateBundles, type TemplateSourceResolution } from "./resolver.ts"

const registry = new Map<string, CharacterTemplateBundle[]>()
const listeners = new Map<string, Set<(bundles: CharacterTemplateBundle[]) => void>>()

function notify(characterId: string) {
  const bundles = registry.get(characterId) || []
  for (const listener of listeners.get(characterId) || []) listener(bundles)
}

export function registerCharacterTemplateBundles(characterId: string, bundles: CharacterTemplateBundle[]) {
  registry.set(characterId, bundles)
  notify(characterId)
}

export function clearCharacterTemplateBundles(characterId: string) {
  registry.delete(characterId)
}

export function registeredCharacterTemplateBundles(characterId: string) {
  return registry.get(characterId) || []
}

export function subscribeCharacterTemplateBundles(
  characterId: string,
  listener: (bundles: CharacterTemplateBundle[]) => void,
) {
  const current = listeners.get(characterId) || new Set<(bundles: CharacterTemplateBundle[]) => void>()
  current.add(listener)
  listeners.set(characterId, current)
  return () => {
    current.delete(listener)
    if (!current.size) listeners.delete(characterId)
  }
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
