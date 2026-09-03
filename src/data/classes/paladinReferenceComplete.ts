import { paladinReferenceCurrent as paladinReferenceBase } from "./paladinReferenceCurrent.ts"
import { paladinSubclassReferenceDraftWave2 } from "./paladinSubclassReferenceDraftWave2.ts"
import { paladinSubclassReferenceDraftWave3 } from "./paladinSubclassReferenceDraftWave3.ts"

const firstWaveIds = new Set(["devotion", "vengeance", "ancients"])

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
    ...paladinSubclassReferenceDraftWave2,
    ...paladinSubclassReferenceDraftWave3,
  ],
}
