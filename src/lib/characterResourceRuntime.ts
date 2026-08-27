import type { ResourceState } from "../character-engine/index.ts"

const registry = new Map<string, Record<string, ResourceState>>()

export function registerCharacterResourceStates(characterId: string, states: Record<string, ResourceState>) {
  registry.set(characterId, states)
}

export function clearCharacterResourceStates(characterId: string) {
  registry.delete(characterId)
}

export function registeredCharacterResourceStates(characterId: string): Record<string, ResourceState> {
  return registry.get(characterId) || {}
}
