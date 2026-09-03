import { paladinReferenceCurrent as paladinReferenceBase } from "./paladinReferenceWave2Base.ts"
import { paladinSubclassReferenceDraftWave2 } from "./paladinSubclassReferenceDraftWave2.ts"
import { paladinSubclassReferenceDraftWave3 } from "./paladinSubclassReferenceDraftWave3.ts"

const firstWaveIds = new Set(["devotion", "vengeance", "ancients"])

function literarySubclass(subclass: (typeof paladinSubclassReferenceDraftWave2)[number]) {
  return {
    id: subclass.id,
    name: subclass.name,
    summary: "Литературный перевод клятвы готов. Точные правила и Character Engine будут подключены отдельным механическим пакетом.",
    explanation: subclass.authorDescription,
    voss: subclass.authorComment,
    features: subclass.features,
  }
}

/**
 * Complete player-facing Paladin literary reference.
 *
 * Mechanics remain intentionally inactive until the independent Paladin rules/runtime pass.
 */
export const paladinReferenceComplete = {
  ...paladinReferenceBase,
  description: "Литературный перевод базового Паладина и всех девяти официальных клятв готов. Точные правила, выдача способностей и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: [
    ...paladinReferenceBase.subclasses.filter((subclass) => firstWaveIds.has(subclass.id)),
    ...paladinSubclassReferenceDraftWave2.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave3.map(literarySubclass),
  ],
}
