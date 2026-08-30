import type {
  CharacterResolutionRequest,
  CharacterResolutionRequester,
} from "../engine-contracts/index.ts"

export type CharacterResolutionListener = (request: CharacterResolutionRequest) => void

/**
 * Ephemeral invalidation only. This bus stores no character or CE result.
 * Canonical facts remain in their owning engines and every listener must build
 * a fresh snapshot before invoking CE.
 */
export class CharacterResolutionBus implements CharacterResolutionRequester {
  private readonly listeners = new Map<string, Set<CharacterResolutionListener>>()

  requestCharacterResolution(request: CharacterResolutionRequest): void {
    for (const listener of this.listeners.get(request.characterId) ?? []) listener(request)
  }

  subscribe(characterId: string, listener: CharacterResolutionListener): () => void {
    const current = this.listeners.get(characterId) ?? new Set<CharacterResolutionListener>()
    current.add(listener)
    this.listeners.set(characterId, current)
    return () => {
      current.delete(listener)
      if (current.size === 0) this.listeners.delete(characterId)
    }
  }
}

export const characterResolutionBus = new CharacterResolutionBus()

