import { bardReferenceCurrent as bardReferenceBase } from "./bardReferenceBase.ts"
import { bardSubclassReferenceDraft } from "./bardSubclassReferenceDraft.ts"

function literarySubclass(subclass: (typeof bardSubclassReferenceDraft)[number]) {
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
  bardSubclassReferenceDraft.map((subclass) => [subclass.id, literarySubclass(subclass)]),
)

/**
 * Current player-facing Bard literary reference.
 *
 * Base Bard narration is preserved in bardReferenceBase.ts. Finished subclass
 * waves replace only their matching roster placeholders. Exact-rule blocks remain
 * authoring notes until the independent Bard mechanics/runtime audit.
 */
export const bardReferenceCurrent = {
  ...bardReferenceBase,
  description: "Литературный перевод базового Барда и первых трёх коллегий готов. Остальные коллегии остаются в ростере до своих авторских волн; точные правила, ресурсы и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: bardReferenceBase.subclasses.map(
    (subclass) => authoredSubclasses.get(subclass.id) ?? subclass,
  ),
}
