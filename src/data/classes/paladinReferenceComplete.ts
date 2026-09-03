import { paladinReferenceCurrent as paladinReferenceBase } from "./paladinReferenceWave2Base.ts"
import { paladinSubclassReferenceDraftWave2 } from "./paladinSubclassReferenceDraftWave2.ts"
import { paladinSubclassReferenceDraftWave3 } from "./paladinSubclassReferenceDraftWave3.ts"
import { paladinSubclassReferenceDraftWave4 } from "./paladinSubclassReferenceDraftWave4.ts"
import { paladinSubclassReferenceDraftWave5 } from "./paladinSubclassReferenceDraftWave5.ts"

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
 * third-party Grim Hollow Pestilence/Zeal oaths.
 * Wave 5 adds third-party Abyss/Blood material and restores Illrigger to this
 * project's Paladin lineage as an infernal oath. Its modern presentation is
 * MCDM-inspired, but it must not be mistaken for an official Wizards Sacred Oath.
 *
 * Mechanics remain intentionally inactive until the independent Paladin rules/runtime pass.
 */
export const paladinReferenceComplete = {
  ...paladinReferenceBase,
  description: "Литературный перевод базового Паладина, девяти официальных клятв и шести дополнительных клятв готов. Дополнительный ростер хранит происхождение отдельно: Предательство — UA, Мор и Рвение — Grim Hollow, Бездна и Кровь — сторонний Midgard/Kobold Press-слой, Иллриггер оформлен в проекте как Клятва Аду с MCDM-вдохновением. Точные правила, выдача способностей и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: [
    ...paladinReferenceBase.subclasses.filter((subclass) => firstWaveIds.has(subclass.id)),
    ...paladinSubclassReferenceDraftWave2.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave3.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave4.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave5.map(literarySubclass),
  ],
}
