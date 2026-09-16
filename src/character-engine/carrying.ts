/** Canonical metric carrying rule used by Character Engine. */
export const KG_PER_STRENGTH_POINT = 6.8

function roundKg(value: number) {
  return Math.round(value * 1000) / 1000
}

/** Metric form of the ruleset's 15 lb carrying allowance per Strength point. */
export function baseCarryingCapacityKg(strengthScore: number): number {
  if (!Number.isFinite(strengthScore)) return 0
  return roundKg(Math.max(0, strengthScore) * KG_PER_STRENGTH_POINT)
}
