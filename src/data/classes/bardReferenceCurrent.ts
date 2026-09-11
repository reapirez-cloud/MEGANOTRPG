import { bardReferenceCurrent as bardReferenceBase } from "./bardReferenceBase.ts"
import {
  bardSubclassReferenceDraft,
  type BardSubclassReferenceDraft,
} from "./bardSubclassReferenceDraft.ts"
import { bardSubclassReferenceDraftWave2 } from "./bardSubclassReferenceDraftWave2.ts"
import { bardSubclassReferenceDraftWave3 } from "./bardSubclassReferenceDraftWave3.ts"
import { bardSubclassReferenceDance } from "./bardSubclassReferenceDance.ts"
import { completeSubclassFeatures } from "./referenceMechanics.ts"

function literarySubclass(subclass: BardSubclassReferenceDraft) {
  return {
    id: subclass.id,
    name: subclass.name,
    summary: "Литературный перевод и точные справочные правила готовы.",
    explanation: subclass.authorDescription,
    voss: subclass.authorComment,
    features: completeSubclassFeatures(subclass.id, subclass.features),
  }
}

const authoredSubclasses = new Map(
  [
    bardSubclassReferenceDance,
    ...bardSubclassReferenceDraft,
    ...bardSubclassReferenceDraftWave2,
    ...bardSubclassReferenceDraftWave3,
  ].map((subclass) => [subclass.id, literarySubclass(subclass)]),
)

/**
 * Current player-facing Bard literary reference.
 *
 * Base Bard narration is preserved in bardReferenceBase.ts. The Player's Handbook 2024
 * College of Dance plus the previous nine-college literary roster now have authored presentations and exact reference
 * rules. Nine approved colleges have Stage 5 runtime mechanics; Tragedy remains reference-only.
 * Runtime roadmap/checklist: ./bardRuntimePlan.md. Keep referenceOnly until its certification gate is complete.
 */
export const bardReferenceCurrent = {
  ...bardReferenceBase,
  description: "Литературный перевод базового Барда и десяти колледжей готов; девять входят в заявленный runtime Stage 5, а Коллегия Трагедии остаётся отдельным reference-only материалом.",
  subclasses: bardReferenceBase.subclasses.map(
    (subclass) => authoredSubclasses.get(subclass.id) ?? subclass,
  ),
}
