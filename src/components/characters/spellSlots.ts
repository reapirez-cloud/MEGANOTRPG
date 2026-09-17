import type { ResolvedResource } from "../../character-engine/index.ts"

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
