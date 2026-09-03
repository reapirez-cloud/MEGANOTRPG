import type { WarlockReferenceDraftFeature } from "./warlockReferenceDraft"

export type WarlockSubclassReferenceDraft = {
  id: string
  name: string
  nameEn: string
  sourceHint: string
  authorDescription: string
  authorComment: string
  features: WarlockReferenceDraftFeature[]
}

/**
 * Wave 1 compatibility entry point.
 *
 * The current Archfey / Fiend / Great Old One literary layer lives in
 * `warlockSubclassReferenceCurrent.ts`. This module keeps the stable export used by
 * `classReference.ts` while ensuring the superseded Gemini narratives can no longer
 * reach the player-facing reference.
 *
 * Mechanics intentionally remain empty until the independent Warlock runtime pass.
 */
export { warlockSubclassReferenceCurrent as warlockSubclassReferenceDraft } from "./warlockSubclassReferenceCurrent.ts"
