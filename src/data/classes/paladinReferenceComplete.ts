import { paladinReferenceCurrent as paladinReferenceBase } from "./paladinReferenceWave2Base.ts"
import { paladinSubclassReferenceDraftWave2 } from "./paladinSubclassReferenceDraftWave2.ts"
import { paladinSubclassReferenceDraftWave3 } from "./paladinSubclassReferenceDraftWave3.ts"
import { paladinSubclassReferenceDraftWave4 } from "./paladinSubclassReferenceDraftWave4.ts"
import { paladinSubclassReferenceDraftWave5 } from "./paladinSubclassReferenceDraftWave5.ts"
import { completeSubclassFeatures } from "./referenceMechanics.ts"

const firstWaveIds = new Set(["devotion", "vengeance", "ancients"])

function literarySubclass(subclass: (typeof paladinSubclassReferenceDraftWave2)[number]) {
  return {
    id: subclass.id,
    name: subclass.name,
    summary: "Литературный перевод и справочные правила клятвы готовы. Character Engine будет подключён отдельным механическим пакетом.",
    explanation: subclass.authorDescription,
    voss: subclass.authorComment,
    features: completeSubclassFeatures(subclass.id, subclass.features),
  }
}

/**
 * Complete player-facing Paladin literary reference.
 *
 * The first nine oaths are the official/DMG roster already authored for this project.
 * Wave 4 deliberately extends the literary roster with UA Treachery and the
 * third-party Grim Hollow Pestilence/Zeal oaths.
 * Wave 5 adds third-party Abyss/Blood material and restores Illrigger to this
 * project's Paladin lineage as an infernal oath. Historically the Illrigger name
 * began as an evil-paladin archetype; the modern seal-driven presentation here is
 * MCDM-inspired and must not be mistaken for an official Wizards Sacred Oath.
 *
 * Exact reference rules are visible; runtime mechanics remain intentionally inactive.
 */
export const paladinReferenceComplete = {
  ...paladinReferenceBase,
  description: "Литературный перевод базового Паладина, девяти официальных клятв и шести дополнительных клятв готов; карточки содержат справочные правила. Дополнительный ростер хранит происхождение отдельно: Предательство — UA, Мор и Рвение — Grim Hollow, Бездна и Кровь — сторонний Midgard/Kobold Press-слой, Иллриггер возвращён к паладинской линии как Клятва Аду; современная версия образа вдохновлена MCDM. Выдача способностей и Character Engine будут подключены отдельным проверяемым механическим пакетом.",
  subclasses: [
    ...paladinReferenceBase.subclasses.filter(
      (subclass): subclass is Extract<(typeof paladinReferenceBase.subclasses)[number], { features: unknown }> =>
        firstWaveIds.has(subclass.id) && "features" in subclass,
    ),
    ...paladinSubclassReferenceDraftWave2.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave3.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave4.map(literarySubclass),
    ...paladinSubclassReferenceDraftWave5.map(literarySubclass),
  ],
}
