import { paladinReferenceCurrent as paladinReferenceBase } from "./paladinReferenceWave2Base.ts"
import { paladinSubclassReferenceDraftWave2 } from "./paladinSubclassReferenceDraftWave2.ts"
import { paladinSubclassReferenceDraftWave3 } from "./paladinSubclassReferenceDraftWave3.ts"
import { paladinSubclassReferenceDraftWave4 } from "./paladinSubclassReferenceDraftWave4.ts"

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
 * The first nine oaths are the official/DMG roster already authored for this project.
 * Wave 4 deliberately extends the literary roster with UA Treachery and the
 * third-party Grim Hollow Pestilence/Zeal oaths; they must not be mistaken for
 * official rules when the independent mechanics pass is implemented.
 *
 * Mechanics remain intentionally inactive until that rules/runtime pass.
 */
export const paladinReferenceComplete = {
  ...paladinReferenceBase,
  description: "Литературный перевод базового Паладина, девяти официальных клятв и трёх дополнительных клятв готов. Предательство помечено как UA-наследие, Мор и Рвение — как сторонний Grim Hollow-контент; точные правила, выдача способностей и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: [
    ...paladinReferenceBase.subclasses.filter((subclass) => firstWaveIds.has(subclass.id)),
    ...paladinSubclassReferenceDraftWave2.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave3.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave4.map(literarySubclass),
  ],
}
