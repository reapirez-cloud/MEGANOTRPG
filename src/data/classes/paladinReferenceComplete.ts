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
    summary: "Русский литературный слой и справочные правила сохранены; рабочие способности этой клятвы загружаются из сертифицированного Character Engine.",
    explanation: subclass.authorDescription,
    voss: subclass.authorComment,
    features: completeSubclassFeatures(subclass.id, subclass.features),
  }
}

/**
 * Complete player-facing Paladin reference.
 *
 * The literary/Voss layer remains the authored fallback, while the class and all
 * fifteen oaths are runtime-backed by the campaign rule templates. ReferenceGuide
 * must therefore resolve their executable mechanics from rule_template_levels.
 */
export const paladinReferenceComplete = {
  ...paladinReferenceBase,
  description: "Паладин и все пятнадцать клятв подключены к Character Engine. Русский перевод и авторский слой Восса сохранены, а рабочие способности, ресурсы, восстановление и клятвенные заклинания берутся из сертифицированного runtime-пакета кампании.",
  mechanics: "Рабочий класс: уровневые способности и механика всех пятнадцати клятв читаются из Character Engine. Карточки справочника показывают реальные действия, ресурсы, цены, восстановление и заклинания; литературный текст используется как авторское сопровождение и резервное представление.",
  referenceOnly: false,
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
