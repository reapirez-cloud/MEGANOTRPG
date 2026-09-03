import { paladinReferenceCurrent as paladinReferenceWave1 } from "./paladinReferenceCurrent.ts"
import { paladinSubclassReferenceDraftWave2 } from "./paladinSubclassReferenceDraftWave2.ts"

const wave1Ids = new Set(["devotion", "vengeance", "ancients"])
const remainingIds = new Set(["watchers", "crown", "oathbreaker"])

export const paladinReferenceCurrentWave2 = {
  ...paladinReferenceWave1,
  description: "Литературный перевод базового Паладина и первых шести клятв готов. Точные правила, выдача способностей и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: [
    ...paladinReferenceWave1.subclasses.filter((subclass) => wave1Ids.has(subclass.id)),
    ...paladinSubclassReferenceDraftWave2,
    ...paladinReferenceWave1.subclasses.filter((subclass) => remainingIds.has(subclass.id)),
  ],
}
