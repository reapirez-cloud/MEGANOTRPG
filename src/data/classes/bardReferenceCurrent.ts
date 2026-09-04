import { bardReferenceCurrent as bardReferenceBase } from "./bardReferenceBase.ts"
import {
  bardSubclassReferenceDraft,
  type BardSubclassReferenceDraft,
} from "./bardSubclassReferenceDraft.ts"
import { bardSubclassReferenceDraftWave2 } from "./bardSubclassReferenceDraftWave2.ts"
import { bardSubclassReferenceDraftWave3 } from "./bardSubclassReferenceDraftWave3.ts"
import { completeSubclassFeatures } from "./referenceMechanics.ts"

function literarySubclass(subclass: BardSubclassReferenceDraft) {
  return {
    id: subclass.id,
    name: subclass.name,
    summary: "Литературный перевод и точные справочные правила готовы. Character Engine остаётся отдельным будущим механическим пакетом.",
    explanation: subclass.authorDescription,
    voss: subclass.authorComment,
    features: completeSubclassFeatures(subclass.id, subclass.features),
  }
}

const authoredSubclasses = new Map(
  [
    ...bardSubclassReferenceDraft,
    ...bardSubclassReferenceDraftWave2,
    ...bardSubclassReferenceDraftWave3,
  ].map((subclass) => [subclass.id, literarySubclass(subclass)]),
)

/**
 * Current player-facing Bard literary reference.
 *
 * Base Bard narration is preserved in bardReferenceBase.ts. All nine current
 * roster colleges now have authored literary presentations and exact reference
 * rules. Runtime mechanics remain a separate future package.
 */
export const bardReferenceCurrent = {
  ...bardReferenceBase,
  description: "Литературный перевод базового Барда и всех девяти коллегий текущего ростера готов; карточки содержат точные справочные правила. Ресурсы и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: bardReferenceBase.subclasses.map(
    (subclass) => authoredSubclasses.get(subclass.id) ?? subclass,
  ),
}
