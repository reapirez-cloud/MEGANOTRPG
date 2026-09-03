/**
 * Wave 2 compatibility entry point.
 *
 * The current Celestial / Hexblade / Fathomless literary layer lives in
 * `warlockSubclassReferenceCurrentWave2.ts`. This module keeps the stable export used by
 * `classReference.ts` while ensuring the superseded narratives can no longer reach the
 * player-facing reference.
 *
 * Mechanics intentionally remain empty until the independent Warlock runtime pass.
 */
export { warlockSubclassReferenceCurrentWave2 as warlockSubclassReferenceDraftWave2 } from "./warlockSubclassReferenceCurrentWave2.ts"
