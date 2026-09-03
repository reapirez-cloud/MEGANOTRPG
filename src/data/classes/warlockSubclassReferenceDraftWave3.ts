import { warlockSubclassReferenceCurrentWave3 } from "./warlockSubclassReferenceCurrentWave3.ts"
import { warlockSubclassReferenceDraftWave4 } from "./warlockSubclassReferenceDraftWave4.ts"

/**
 * Wave 3 compatibility/aggregation entry point.
 *
 * `classReference.ts` already consumes this stable export. Keep the current
 * Genie / Undead / Undying literary layer here and append the expanded
 * Raven Queen / Seeker / Great Wyrm literary roster without touching the
 * mechanics package.
 *
 * Mechanics intentionally remain empty until the independent Warlock runtime pass.
 */
export const warlockSubclassReferenceDraftWave3 = [
  ...warlockSubclassReferenceCurrentWave3,
  ...warlockSubclassReferenceDraftWave4,
]
