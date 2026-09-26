import type {
  ResolvedResource,
  ResolvedSpell,
} from "../../character-engine/index.ts"

export function spellSlotLevel(resource: ResolvedResource): number | null {
  // Runtime stateKey is the canonical resolved slot identity. The source key can
  // legitimately repeat when several resolved resources originate from one rule.
  // Keep key only as a legacy fallback for older runtime snapshots.
  for (const candidate of [resource.stateKey, resource.key]) {
    const match = candidate?.match(/^spell_slot_(\d+)$/)
    if (match) return Number(match[1])
  }
  return null
}

export function spellSlotResources(resources: ResolvedResource[]) {
  return resources
    .map((resource) => ({ resource, level: spellSlotLevel(resource) }))
    .filter((entry): entry is { resource: ResolvedResource; level: number } =>
      entry.level !== null && entry.resource.max.value > 0,
    )
    .sort((left, right) => left.level - right.level)
}

/**
 * CE-native casting channels for the action/spell picker.
 *
 * Do not infer casting resources from class names or state-key naming. A spell
 * access already declares the exact resource it spends and the cast level in
 * its resolved resourceOptions. This keeps Pact Magic, Mystic Arcanum and any
 * future non-standard casting resource on the same generic path as ordinary
 * spell slots.
 */
export function spellCastingResources(
  resources: ResolvedResource[],
  spells: ResolvedSpell[],
) {
  const resourceByStateKey = new Map(
    resources
      .filter((resource) => resource.max.value > 0)
      .map((resource) => [resource.stateKey, resource] as const),
  )
  const byStateKey = new Map<
    string,
    { resource: ResolvedResource; level: number }
  >()

  for (const spell of spells) {
    for (const access of spell.accesses) {
      for (const method of access.methods) {
        for (const option of method.resourceOptions) {
          const level = Math.max(
            0,
            Math.round(option.castLevel ?? spell.identity.level),
          )
          if (level <= 0) continue

          for (const cost of option.costs) {
            const resource = resourceByStateKey.get(cost.stateKey)
            if (!resource) continue

            const current = byStateKey.get(resource.stateKey)
            if (!current || level > current.level) {
              byStateKey.set(resource.stateKey, { resource, level })
            }
          }
        }
      }
    }
  }

  return [...byStateKey.values()].sort(
    (left, right) =>
      left.level - right.level ||
      left.resource.stateKey.localeCompare(right.resource.stateKey),
  )
}
