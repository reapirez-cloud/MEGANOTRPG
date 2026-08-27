import type { CharacterContribution, CharacterSource, SuppressionContribution } from "../character-engine/index.ts"

const registry = new Map<string, Set<string>>()

export function registerCharacterSourceSuppressions(characterId: string, sourceIds: Iterable<string>) {
  registry.set(characterId, new Set(sourceIds))
}

export function clearCharacterSourceSuppressions(characterId: string) {
  registry.delete(characterId)
}

export function registeredCharacterSourceSuppressions(characterId: string): ReadonlySet<string> {
  return registry.get(characterId) || new Set<string>()
}

function controlSource(characterId: string): CharacterSource {
  return {
    id: `gm:suppression:${characterId}`,
    name: "Отключено ведущим",
    sourceType: "gm_control",
    visibility: "campaign",
  }
}

/**
 * Converts persistent GM OFF flags into CE-native universal suppressions.
 * These controls are deliberately separate from parsed class mechanics.
 */
export function characterSourceSuppressionContributions(characterId: string): CharacterContribution[] {
  const source = controlSource(characterId)
  return [...registeredCharacterSourceSuppressions(characterId)]
    .sort()
    .map((sourceId): SuppressionContribution => ({
      id: `${source.id}:${sourceId}`,
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "source", sourceId, includeDescendants: true },
      source,
    }))
}
