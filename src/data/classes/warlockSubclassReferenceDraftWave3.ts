/**
 * Wave 3 compatibility entry point.
 *
 * The current Genie / Undead / Undying literary layer lives in
 * `warlockSubclassReferenceCurrentWave3.ts`. This module keeps the stable export used by
 * `classReference.ts` while ensuring the superseded narratives can no longer reach the
 * player-facing reference.
 *
 * Mechanics intentionally remain empty until the independent Warlock runtime pass.
 */
export { warlockSubclassReferenceCurrentWave3 as warlockSubclassReferenceDraftWave3 } from "./warlockSubclassReferenceCurrentWave3.ts"
