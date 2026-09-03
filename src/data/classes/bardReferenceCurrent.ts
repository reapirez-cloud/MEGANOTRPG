import { bardReferenceCurrent as bardReferenceBase } from "./bardReferenceBase.ts"
import {
  bardSubclassReferenceDraft,
  type BardSubclassReferenceDraft,
} from "./bardSubclassReferenceDraft.ts"
import { bardSubclassReferenceDraftWave2 } from "./bardSubclassReferenceDraftWave2.ts"

function literarySubclass(subclass: BardSubclassReferenceDraft) {
  return {
    id: subclass.id,
    name: subclass.name,
    summary: "Литературный перевод коллегии готов. Точные правила и Character Engine будут подключены отдельным механическим пакетом.",
    explanation: subclass.authorDescription,
    voss: subclass.authorComment,
    features: subclass.features,
  }
}

const authoredSubclasses = new Map(
  [...bardSubclassReferenceDraft, ...bardSubclassReferenceDraftWave2].map((subclass) => [
    subclass.id,
    literarySubclass(subclass),
  ]),
)

/**
 * Current player-facing Bard literary reference.
 *
 * Base Bard narration is preserved in bardReferenceBase.ts. Six finished subclass
 * narratives replace only their matching roster placeholders. Exact-rule blocks
 * remain authoring notes until the independent Bard mechanics/runtime audit.
 */
export const bardReferenceCurrent = {
  ...bardReferenceBase,
  description: "Литературный перевод базового Барда и шести коллегий готов. Коллегии Творения, Духов и Трагедии остаются в ростере до своей авторской волны; точные правила, ресурсы и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: bardReferenceBase.subclasses.map(
    (subclass) => authoredSubclasses.get(subclass.id) ?? subclass,
  ),
}
